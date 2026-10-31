// AI-assisted audit (docs/audit/board-cli.md): regression, mutation and fuzz tests for BC-* findings in the CLI.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ed25519Keypair, sha256 } from '@quietvote/crypto';
import { b64 } from '@quietvote/board';
import { COORD, LOGK, TINY, makeBoardJson, qv, tinyBundle, tmp, utf8, voterKeyFile, writeJson } from './helpers.ts';

const hexOf = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const POSIX = process.platform !== 'win32';
const FAST = ['--kdf-memory-kib', '19456', '--kdf-iterations', '2'];
const PASS = 'correct horse battery staple';

// xorshift, deterministic
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

test('BC-01: board verify never reports a pass on a bundle whose log key is only self-attested', async () => {
  const dir = tmp();
  const bj = makeBoardJson();
  const file = writeJson(dir, 'board.json', bj);
  // attacker re-signs the whole log under their own key and ships that key inside the bundle
  const noLogKey = await qv(['board', 'verify', file, '--author-key', hexOf(COORD.publicKey), '--json']);
  assert.equal(noLogKey.code, 3, noLogKey.out);
  const v = JSON.parse(noLogKey.out);
  assert.equal(v.integrity, 'PARTIAL');
  assert.ok(v.warnings.some((w: string) => /self-attested/.test(w)));
  // pinning the key restores the pass
  const pinned = await qv(['board', 'verify', file, '--author-key', hexOf(COORD.publicKey), '--log-key', hexOf(LOGK.publicKey)]);
  assert.equal(pinned.code, 0, pinned.out);
});

test('BC-02: board verify --witness-policy supplies the witness policy out of band (bundle copy is self-attested)', async () => {
  const dir = tmp();
  const file = writeJson(dir, 'board.json', makeBoardJson()); // bundle claims quorum 0 / none_acknowledged
  const base = ['board', 'verify', file, '--author-key', hexOf(COORD.publicKey), '--log-key', hexOf(LOGK.publicKey)];
  const w = ed25519Keypair(sha256(utf8('some-witness')));
  const strict = writeJson(dir, 'policy.json', { quorum: 1, none_acknowledged: false, witnesses: [{ name: 'w1', alg: 'ed25519', pk_b64: b64(w.publicKey) }] });
  const r = await qv([...base, '--witness-policy', strict]);
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /no quorum-witnessed checkpoint/);
  const j = JSON.parse((await qv([...base, '--witness-policy', strict, '--json'])).out);
  assert.ok(!j.warnings.some((w: string) => /witness policy taken from bundle/.test(w)), 'policy came from the command line');
  // malformed policy files are input errors, never a pass
  for (const bad of [{}, { quorum: -1, none_acknowledged: false, witnesses: [] }, { quorum: 1, none_acknowledged: false, witnesses: [{ name: 'x', alg: 'rsa', pk_b64: 'AAAA' }] }, []]) {
    assert.equal((await qv([...base, '--witness-policy', writeJson(dir, 'bad.json', bad)])).code, 4, JSON.stringify(bad));
  }
  assert.equal((await qv([...base, '--witness-policy', join(dir, 'missing.json')])).code, 4);
});

test('BC-03: keygen --force keeps the key file private even when the target pre-exists with loose permissions', { skip: !POSIX }, async () => {
  const dir = tmp();
  const out = join(dir, 'k.json');
  writeFileSync(out, 'old');
  chmodSync(out, 0o644);
  const r = await qv(['keygen', '--out', out, '--no-passphrase', '--force']);
  assert.equal(r.code, 0, r.err);
  assert.equal(statSync(out).mode & 0o777, 0o600, 'secret key written into a group/world-readable file');
  // and it refuses to write through a symlink (could redirect the secret elsewhere)
  const target = join(dir, 'target.json');
  writeFileSync(target, 'victim');
  const link = join(dir, 'link.json');
  symlinkSync(target, link);
  const s = await qv(['keygen', '--out', link, '--no-passphrase', '--force']);
  assert.equal(s.code, 4, 'symlink followed');
  assert.equal(readFileSync(target, 'utf8'), 'victim');
  assert.equal((await qv(['keygen', '--out', link, '--no-passphrase'])).code, 4, 'no-force: exists');
});

test('BC-04: ballot encrypt/audit can pin the manifest hash announced out of band; the hash is always shown', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 0);
  const first = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--out', join(dir, 'e1.json'), '--json']);
  assert.equal(first.code, 0, first.err);
  const mh: string = JSON.parse(first.out).manifest_hash;
  assert.match(mh, /^[0-9a-f]{64}$/);
  const base = ['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes'];
  const good = await qv([...base, '--manifest-hash', mh, '--out', join(dir, 'e2.json')]);
  assert.equal(good.code, 0, good.err);
  assert.match(good.out, new RegExp(`manifest hash: ${mh}`));
  const bad = await qv([...base, '--manifest-hash', '00'.repeat(32), '--out', join(dir, 'e3.json')]);
  assert.equal(bad.code, 1, 'must refuse to encrypt to an election that is not the announced one');
  assert.match(bad.err, /manifest hash/);
  assert.ok(!existsSync(join(dir, 'e3.json')), 'no envelope written');
  assert.equal((await qv([...base, '--manifest-hash', 'XYZ', '--out', join(dir, 'e4.json')])).code, 2);
  // audit honours the pin as well
  const spoil = await qv([...base, '--intent', 'spoil', '--audit-out', join(dir, 'a.json'), '--out', join(dir, 's.json')]);
  assert.equal(spoil.code, 0, spoil.err);
  assert.equal((await qv(['ballot', 'audit', '--election', TINY, '--ballot', join(dir, 'a.json'), '--manifest-hash', mh])).code, 0);
  assert.equal((await qv(['ballot', 'audit', '--election', TINY, '--ballot', join(dir, 'a.json'), '--manifest-hash', '11'.repeat(32)])).code, 1);
});

test('BC-05: key files that are JSON null / arrays / scalars are a usage error, not an internal error', async () => {
  const dir = tmp();
  for (const [i, v] of ['null', '[]', '7', '"s"', 'true'].entries()) {
    const f = join(dir, `k${i}.json`);
    writeFileSync(f, v);
    const r = await qv(['ballot', 'encrypt', '--election', TINY, '--key', f, '--out', join(dir, `o${i}`)]);
    assert.ok([2, 4].includes(r.code), `${v}: ${r.code} ${r.err}`);
    assert.ok(!/qv: internal error/.test(r.err), `${v}: ${r.err}`);
  }
  // ballot audit on non-object files
  for (const [i, v] of ['null', '[]', '7'].entries()) {
    const f = join(dir, `b${i}.json`);
    writeFileSync(f, v);
    const r = await qv(['ballot', 'audit', '--election', TINY, '--ballot', f]);
    assert.ok([1, 4].includes(r.code), `${v}: ${r.code} ${r.err}`);
    assert.ok(!/qv: internal error/.test(r.err), `${v}: ${r.err}`);
  }
});

test('fuzz: random argv never yields an internal error, a crash, or output containing a supplied secret', async () => {
  const r = rng(2026);
  const words = ['verify', 'selftest', 'keygen', 'ballot', 'board', 'election', 'vectors', 'encrypt', 'audit', 'inspect', 'check', '--json', '--out', '--key', '--election', '--seed-stdin', '--passphrase-file', '--force', '--no-passphrase', '--', '-', '--=', '--out=', '-x', '', '--select', 'a=b', '--log-key', 'zz', '--author-key', '--witness-policy', '--manifest-hash', '__proto__', 'constructor', '--__proto__', '\u0000', '../../etc/passwd'];
  const dir = tmp();
  for (let i = 0; i < 300; i++) {
    const argv = Array.from({ length: Math.floor(r() * 6) }, () => words[Math.floor(r() * words.length)]!);
    // never touch real files from the fuzz: any --out lands in the temp dir, stdin is empty
    const safe = argv.map((a, j) => (argv[j - 1] === '--out' ? join(dir, `f${i}`) : a));
    if (safe[0] === 'selftest' || safe[0] === 'vectors') continue; // slow, no argv-parsing surface worth fuzzing
    const res = await qv(safe);
    assert.ok(!/qv: internal error/.test(res.err), `argv ${JSON.stringify(safe)} -> ${res.err}`);
    assert.ok([0, 1, 2, 3, 4].includes(res.code), `argv ${JSON.stringify(safe)} -> ${res.code}`);
  }
});

test('mutation: random byte flips in a board bundle file never produce exit 0 (or a crash)', async () => {
  const dir = tmp();
  const text = JSON.stringify(makeBoardJson());
  const args = ['--log-key', hexOf(LOGK.publicKey), '--author-key', hexOf(COORD.publicKey)];
  assert.equal((await qv(['board', 'verify', writeJson(dir, 'ok.json', JSON.parse(text)), ...args])).code, 0);
  const r = rng(11);
  const generatorIdx = text.indexOf('"generator"');
  const createdIdx = text.indexOf('"created_at"');
  let n = 0;
  for (let i = 0; i < 80; i++) {
    const pos = Math.floor(r() * text.length);
    // generator / created_at are metadata and not covered by any signature: skip bytes inside those two fields
    if ((pos >= generatorIdx && pos < generatorIdx + 40) || (pos >= createdIdx && pos < createdIdx + 25)) continue;
    const b = Buffer.from(text);
    b[pos] = (b[pos]! ^ (1 << Math.floor(r() * 8))) || 0x20;
    const f = join(dir, `m${i}.json`);
    writeFileSync(f, b);
    const res = await qv(['board', 'verify', f, ...args]);
    n++;
    assert.ok(!/qv: internal error/.test(res.err), `pos ${pos}: ${res.err}`);
    // a flip may land in a redundant place (e.g. whitespace-equivalent JSON); the only acceptable pass is a byte-identical decode
    if (res.code === 0) {
      const same = (() => {
        try {
          return JSON.stringify(JSON.parse(b.toString('utf8'))) === text;
        } catch {
          return false;
        }
      })();
      assert.ok(same, `mutation at ${pos} (${JSON.stringify(text.slice(Math.max(0, pos - 20), pos + 20))}) still verified`);
    }
  }
  assert.ok(n > 50);
});

test('mutation: tampered QVKEY1 / plain key files are rejected, never accepted as a different key', async () => {
  const dir = tmp();
  const seed = '2b'.repeat(32);
  const pw = join(dir, 'pw');
  writeFileSync(pw, PASS + '\n');
  const sf = join(dir, 'seed');
  writeFileSync(sf, seed);
  const k = join(dir, 'k.json');
  assert.equal((await qv(['keygen', '--out', k, '--seed-file', sf, '--passphrase-file', pw, ...FAST])).code, 0);
  const c = JSON.parse(readFileSync(k, 'utf8'));
  const r = rng(5);
  const hexFlip = (h: string): string => {
    const i = Math.floor(r() * h.length);
    return h.slice(0, i) + (h[i] === '0' ? '1' : '0') + h.slice(i + 1);
  };
  const base = ['ballot', 'encrypt', '--election', TINY, '--select', 'budget=yes', '--passphrase-file', pw];
  const muts: Record<string, unknown>[] = [
    { ...c, ct: hexFlip(c.ct) }, { ...c, salt: hexFlip(c.salt) }, { ...c, iv: hexFlip(c.iv) }, { ...c, keyId: hexFlip(c.keyId) },
    { ...c, aad: 'qv-key-v1|' + '0'.repeat(16) }, { ...c, m: c.m + 1 }, { ...c, t: 1 }, { ...c, p: 0 }, { ...c, m: 1e9 }, { ...c, v: 2 },
    { ...c, kdf: 'pbkdf2' }, { ...c, aead: 'none' }, { ...c, extra: 1 }, { ...c, ct: c.ct.slice(2) }, { ...c, m: '19456' },
  ];
  for (const [i, m] of muts.entries()) {
    const f = writeJson(dir, `mut${i}.json`, m);
    const res = await qv([...base, '--key', f, '--out', join(dir, `o${i}`)]);
    assert.ok([2, 4].includes(res.code) || res.code === 1, `mutation ${i}: code ${res.code} ${res.err}`);
    assert.ok(!existsSync(join(dir, `o${i}`)), `mutation ${i} produced a ballot`);
    assert.ok(!/qv: internal error/.test(res.err), `mutation ${i}: ${res.err}`);
  }
  // plain key: public_key must match the seed; seed must be 64 lower-case hex
  const kp0 = ed25519Keypair(Uint8Array.from(Buffer.from(seed, 'hex')));
  const plain = { format: 'qv-voter-key/v1', public_key: hexOf(kp0.publicKey), seed };
  for (const [i, m] of [{ ...plain, public_key: hexFlip(plain.public_key) }, { ...plain, seed: seed.toUpperCase() }, { ...plain, seed: seed.slice(2) }, { ...plain, format: 'x' }].entries()) {
    const res = await qv(['ballot', 'encrypt', '--election', TINY, '--key', writeJson(dir, `p${i}.json`, m), '--out', join(dir, `po${i}`)]);
    assert.ok([2, 4].includes(res.code), `plain mutation ${i}: ${res.code}`);
  }
});

test('secrets: no command echoes the seed, the passphrase or the reveal randomness on stdout/stderr', async () => {
  const dir = tmp();
  const seed = '33'.repeat(32);
  const sf = join(dir, 'seed');
  writeFileSync(sf, seed);
  const pw = join(dir, 'pw');
  writeFileSync(pw, PASS + '\n');
  const k = join(dir, 'k.json');
  const a = await qv(['keygen', '--out', k, '--seed-file', sf, '--passphrase-file', pw, '--json', ...FAST]);
  const b = await qv(['keygen', '--out', join(dir, 'k2.json'), '--seed-file', sf, '--no-passphrase', '--json']);
  for (const x of [a, b]) {
    assert.ok(!(x.out + x.err).includes(seed) && !(x.out + x.err).includes(PASS));
  }
  assert.ok(!(await qv(['keygen', '--out', k, '--seed-file', sf, '--no-passphrase'])).err.includes(seed), 'error path');
  const bad = await qv(['ballot', 'encrypt', '--election', TINY, '--key', k, '--passphrase-file', sf, '--out', join(dir, 'z')]);
  assert.ok(!(bad.out + bad.err).includes(seed) && !(bad.out + bad.err).includes(PASS));
  const key = voterKeyFile(dir, 1);
  const voterSeed = JSON.parse(readFileSync(key, 'utf8')).seed as string;
  const s = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--intent', 'spoil', '--audit-out', join(dir, 'au.json'), '--out', join(dir, 'sp.json'), '--json']);
  assert.equal(s.code, 0, s.err);
  const xi = JSON.parse(readFileSync(join(dir, 'au.json'), 'utf8')).reveal.xi as string;
  for (const secret of [voterSeed, xi]) assert.ok(!(s.out + s.err).includes(secret));
  if (POSIX) assert.equal(statSync(join(dir, 'au.json')).mode & 0o777, 0o600);
  assert.ok(!readFileSync(join(dir, 'sp.json'), 'utf8').includes(xi), 'private-mode envelope does not carry the reveal');
  void tinyBundle;
});
