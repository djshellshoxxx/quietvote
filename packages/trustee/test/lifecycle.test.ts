import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, ed25519Keypair, hexToBytes, jcs, scalarFromBytes, scalarToBytes, sha256, utf8 } from '@quietvote/crypto';
import { PROTO_ID, signRecord, signRecordRaw, verifySig, type MultiSignedRecord } from '@quietvote/protocol';
import {
  Trustee, assertPassphraseStrength, estimateEntropyBits, generatePassphrase, signTranscript, verifyTranscript, tombstonePath,
  type AuditCloseBody, type Transcript,
} from '../src/index.ts';
import { PASS, electionFixture, kp, mkDeps, Ceremony, type Fixture } from './helpers/harness.ts';

const H = bytesToHex;
let f: Fixture;
const skI = new Map<number, string>();

const filesIn = (dir: string): string[] => readdirSync(dir).map((n) => join(dir, n)).filter((p) => statSync(p).isFile());
const anyFileContains = (dir: string, needle: Uint8Array | string): string[] => {
  const nb = typeof needle === 'string' ? Buffer.from(needle) : Buffer.from(needle);
  return filesIn(dir).filter((p) => readFileSync(p).includes(nb));
};

before(async () => {
  f = await electionFixture({ n: 3, t: 2, seed: 'lifecycle' });
  for (const i of f.c.honest()) {
    const t = await f.c.act(i, async (x) => x);
    skI.set(i, t.data.sk_i!);
    await f.c.act(i, (x) => x.releaseTally(f.c.bundle()));
  }
});
after(() => f.c.cleanup());

// Windows has no POSIX file modes; src/fsutil.ts skips the mode check there (bundle stays passphrase-sealed).
const POSIX = process.platform !== 'win32';

test('bundle at rest: mode 0600, no plaintext key material anywhere on disk, nothing secret in public output (QV-17-REQ-020/030)', async () => {
  for (const i of f.c.honest()) {
    const p = f.c.path(i);
    if (POSIX) assert.equal(statSync(p).mode & 0o777, 0o600);
    const t = await f.c.act(i, async (x) => x);
    const sk = skI.get(i)!;
    const canaries = [sk, hexToBytes(sk, 32), t.data.sk_sign, hexToBytes(t.data.sk_sign, 32), 'sk_i', 'sk_sign', PASS];
    for (const c of canaries) assert.deepEqual(anyFileContains(f.c.dir, c), [], `canary leaked on disk: ${typeof c === 'string' ? c.slice(0, 12) : 'bytes'}`);
    const pub = JSON.stringify(f.c.log);
    assert.ok(!pub.includes(sk) && !pub.includes(t.data.sk_sign), 'secret in public log');
  }
});

test('wrong passphrase -> exit 50; permissive mode -> refused (exit 60); tampered file -> locked; no wipe on failure', async () => {
  const p = f.c.path(1);
  const deps = f.c.deps.get(1)!;
  await assert.rejects(Trustee.open(p, 'not the passphrase', deps), (e: { code?: string; exitCode?: number }) => e.code === 'BAD_PASSPHRASE' && e.exitCode === 50);
  const raw = readFileSync(p);
  const g = Buffer.from(raw);
  g[g.length - 3] = g[g.length - 3]! ^ 1;
  writeFileSync(p, g, { mode: 0o600 });
  await assert.rejects(Trustee.open(p, PASS, deps), { code: 'BAD_PASSPHRASE' });
  writeFileSync(p, raw, { mode: 0o600 });
  if (POSIX) {
    chmodSync(p, 0o644);
    await assert.rejects(Trustee.open(p, PASS, deps), (e: { code?: string; exitCode?: number }) => e.code === 'BAD_PERMISSIONS' && e.exitCode === 60);
    chmodSync(p, 0o600);
  }
  assert.equal((await Trustee.open(p, PASS, deps)).state, 'RELEASED');
  await assert.rejects(Trustee.keygen(p, PASS, deps), { code: 'BUNDLE_EXISTS' });
});

test('passphrase policy: generated >= 100 bits, weak user passphrases refused (REQ-021/022)', () => {
  const g = generatePassphrase(mkDeps('pp').rng);
  assert.match(g, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  assert.notEqual(g, generatePassphrase(mkDeps('pp2').rng));
  for (const weak of ['password', 'Password1', 'abcdefgh', 'correct horse battery staple', '12345678901234', 'aaaaaaaaaaaaaaaa', '']) {
    assert.throws(() => assertPassphraseStrength(weak), { code: 'WEAK_PASSPHRASE' }, weak);
  }
  for (const ok of ['t7#Qm2$vL9x!pZ4k', 'N3b-4Rp-Y8w-Kd5-Hs6-A2']) assert.doesNotThrow(() => assertPassphraseStrength(ok), ok);
  assert.ok(estimateEntropyBits('xK9#mQ2$vL7!pR4z') > 80);
  assertPassphraseStrength('weak', true); // generated passphrases are exempt from the estimator
});

test('backup + restore: a restored bundle can release the same share; counted as backup_made', async () => {
  const dir = f.c.dir;
  const bk = join(dir, 'backup-T2.qvtb');
  const bpass = 'backup passphrase – different from the main one';
  const t = await Trustee.open(f.c.path(2), PASS, f.c.deps.get(2)!);
  await assert.rejects(t.backup(f.c.path(2), bpass), { code: 'BACKUP_SAME_FILE' });
  const { epoch } = await t.backup(bk, bpass);
  assert.equal(epoch, 1);
  if (POSIX) assert.equal(statSync(bk).mode & 0o777, 0o600);
  assert.deepEqual(anyFileContains(dir, hexToBytes(skI.get(2)!, 32)), []);
  assert.equal(t.status().backup_made, true);
  await assert.rejects(Trustee.restore(bk, 'wrong', join(dir, 'x.qvtb'), 'new pass', f.c.deps.get(2)!), { code: 'BAD_PASSPHRASE' });
  await assert.rejects(Trustee.restore(bk, bpass, f.c.path(2), 'new pass', f.c.deps.get(2)!), { code: 'BUNDLE_EXISTS' });
  const to = join(dir, 'restored-T2.qvtb');
  const r = await Trustee.restore(bk, bpass, to, 'a new passphrase for the restored bundle', f.c.deps.get(2)!);
  assert.equal(r.data.sk_i, skI.get(2));
  assert.equal(r.data.backup_epoch, 1);
  const again = await r.releaseTally(f.c.bundle());
  const orig = await (await Trustee.open(f.c.path(2), PASS, f.c.deps.get(2)!)).releaseTally(f.c.bundle());
  assert.equal(H(again.bytes), H(orig.bytes));
  // old passphrase does not open the restored file
  await assert.rejects(Trustee.open(to, PASS, f.c.deps.get(2)!), { code: 'BAD_PASSPHRASE' });
});

test('compromise report is signed, bound to the manifest, and does not change the state', async () => {
  const t = await Trustee.open(f.c.path(3), PASS, f.c.deps.get(3)!);
  const before = t.state;
  const p = await t.reportCompromise('suspected', ['bundle+passphrase']);
  const rec = p.obj.records[0] as { body: { type: string }; sig: { key: string; sig: string } };
  assert.ok(verifySig(f.c.mh, 'trustee-compromise-report', rec.body, rec.sig, f.c.manifest.trustees[2]!.sign_pk));
  assert.equal(t.state, before);
});

test('transcript: export, cosign, verify; any tampering or foreign view is detected', async () => {
  const c = f.c;
  let tr: Transcript = await (await c.act(1, async (x) => x)).exportTranscript('airgap-dkg', { network: 'offline' });
  for (const i of [2, 3]) tr = await (await c.act(i, async (x) => x)).cosignTranscript(JSON.parse(JSON.stringify(tr)) as Transcript);
  const rep = await verifyTranscript(JSON.parse(JSON.stringify(tr)));
  assert.deepEqual(rep.problems, []);
  assert.ok(rep.ok && rep.complete);
  assert.deepEqual(rep.trusteesSigned, [1, 2, 3]);
  assert.deepEqual(rep.keyconfirmed, [1, 2, 3]);
  assert.equal(tr.signatures.find((s) => s.body.signer === 'T1')!.body.self_reported!.backup_made, false);
  assert.deepEqual(tr.signatures.find((s) => s.body.signer === 'T1')!.body.sas, { compared_with: [2], result: 'match' });
  // transcript carries no secrets
  const txt = JSON.stringify(tr);
  for (const i of c.honest()) assert.ok(!txt.includes(skI.get(i)!));

  const mut = (f2: (t: Transcript) => void): Transcript => {
    const x = JSON.parse(JSON.stringify(tr)) as Transcript;
    f2(x);
    return x;
  };
  const cases: [string, Transcript][] = [
    ['qualified list edited', mut((x) => { x.qualified = [1, 2]; })],
    ['fingerprint edited', mut((x) => { x.joint_key_fingerprint_hex = '00'.repeat(8); })],
    ['log entry dropped', mut((x) => { x.log.splice(5, 1); })],
    ['log entry from the wrong signer', mut((x) => { const e = x.log.find((l) => (l.entry as { body: { type: string } }).body.type === 'dkg-commit')!.entry as { sig: { sig: string } }; e.sig.sig = '11'.repeat(64); })],
    ['summary hash swapped', mut((x) => { x.summary_hash = '22'.repeat(32); })],
    ['manifest edited', mut((x) => { x.manifest.body.title = 'Other'; })],
  ];
  for (const [name, bad] of cases) assert.equal((await verifyTranscript(bad)).ok, false, name);
  // missing signer => not complete; outsider signature => rejected
  const partial = mut((x) => { x.signatures = x.signatures.slice(0, 1); });
  const pr = await verifyTranscript(partial);
  assert.ok(pr.ok && !pr.complete);
  assert.equal(pr.trusteesMissing.length, 2);
  const outsider = ed25519Keypair(sha256(utf8('outsider')));
  const forged = signTranscript(partial, outsider.secretKey, outsider.publicKey, c.mh, { role: 'trustee', signer: 'T2' });
  assert.equal((await verifyTranscript(forged)).ok, false);
  // a witness/scribe signature verifies only with a known key
  const w = kp('lifecycle', 'witness');
  const withW = signTranscript(tr, w.secretKey, w.publicKey, c.mh, { role: 'witness', signer: 'witness1' });
  assert.equal((await verifyTranscript(withW)).ok, false);
  const wr = await verifyTranscript(withW, { witnessKeys: { witness1: H(w.publicKey) } });
  assert.ok(wr.ok && wr.complete && wr.otherSigners.includes('witness1'));
  // a trustee refuses to sign a transcript that differs from its own view
  const other = new Ceremony({ n: 3, t: 2, seed: 'lifecycle-other' });
  await other.setup();
  await other.runDkg();
  const foreign = await (await other.act(1, async (x) => x)).exportTranscript('airgap-dkg');
  await assert.rejects(c.act(2, (x) => x.cosignTranscript(foreign)), (e: { code?: string }) => e.code === 'TRANSCRIPT_MISMATCH' || e.code === 'NOT_JOINED');
  other.cleanup();
});

test('destroy: needs coordinator audit-close and the typed title; erases bundle + backups; leaves an attestation and a tombstone', async () => {
  const c = f.c;
  const i = 1;
  const dir = c.dir;
  const canary = hexToBytes(skI.get(i)!, 32);
  const bk = join(dir, 'backup-T1.qvtb');
  const bk2 = join(dir, 'backup-T1-lost.qvtb');
  const t0 = await c.act(i, async (x) => x);
  await t0.backup(bk, 'backup passphrase number one!');
  await t0.backup(bk2, 'backup passphrase number two!');
  writeFileSync(bk2, 'x'); // pretend it was lost already: file present but replaced; remove below
  (await import('node:fs')).unlinkSync(bk2);
  assert.ok(existsSync(bk));
  assert.equal(anyFileContains(dir, canary).length, 0);

  const ctx = c.ctx!;
  const body: AuditCloseBody = { proto: PROTO_ID, type: 'audit-close', ctx: H(ctx), closed_at: '2026-12-20T00:00:00Z' };
  const mk = (sk = c.coord.secretKey, pk = c.coord.publicKey, b = body): MultiSignedRecord<AuditCloseBody> => ({ body: b, sigs: [signRecordRaw(sk, pk, ctx, 'audit-close', b)] });
  const title = c.manifest.title;
  const t = await c.act(i, async (x) => x);
  // the election closes 2026-11-08 (manifest voting_close); this trustee's clock is 2026-12-02, so an audit-close dated 2026-12-20 is in the future
  for (const d of c.deps.values()) d.now = () => new Date('2026-12-02T00:00:00Z');
  await assert.rejects(t.destroy(mk(), title), { code: 'AUDIT_WINDOW_OPEN' });
  const okBody: AuditCloseBody = { ...body, closed_at: '2026-11-09T00:00:00Z' };
  const t2 = await c.act(i, async (x) => x);
  await assert.rejects(t2.destroy(mk(c.coord.secretKey, c.coord.publicKey, okBody), 'wrong title'), (e: { code?: string; exitCode?: number }) => e.code === 'CONFIRMATION_MISMATCH' && e.exitCode === 10);
  const rogue = ed25519Keypair(sha256(utf8('rogue')));
  await assert.rejects(t2.destroy(mk(rogue.secretKey, rogue.publicKey, okBody), title), { code: 'NO_AUDIT_CLOSE' });
  await assert.rejects(t2.destroy({ nonsense: 1 }, title), { code: 'NO_AUDIT_CLOSE' });
  assert.ok(existsSync(c.path(i)), 'failed attempts destroy nothing');

  const res = await t2.destroy(mk(c.coord.secretKey, c.coord.publicKey, okBody), title);
  assert.deepEqual(res.backupsRemoved, [bk]);
  assert.deepEqual(res.backupsMissing, [bk2]);
  assert.ok(res.reminders.length >= 3);
  assert.ok(!existsSync(c.path(i)) && !existsSync(bk));
  assert.ok(existsSync(tombstonePath(c.path(i))) && existsSync(res.attestationPath));
  assert.deepEqual(anyFileContains(dir, canary), [], 'no file on disk still holds the share');
  assert.deepEqual(anyFileContains(dir, skI.get(i)!), []);
  const att = JSON.parse(readFileSync(res.attestationPath, 'utf8')) as typeof res.attestation;
  assert.equal(att.body.j, i);
  assert.ok(verifySig(ctx, 'key-destruction', att.body, att.sig, c.manifest.trustees[i - 1]!.sign_pk));
  // terminal state: cannot reopen, cannot be resurrected over the tombstone
  await assert.rejects(Trustee.open(c.path(i), PASS, c.deps.get(i)!), { code: 'DESTROYED' });
  await assert.rejects(Trustee.keygen(c.path(i), PASS, c.deps.get(i)!), { code: 'BUNDLE_EXISTS' });
  await assert.rejects(Trustee.restore(join(dir, 'restored-T2.qvtb'), 'a new passphrase for the restored bundle', c.path(i), 'x', c.deps.get(i)!), { code: 'DESTROYED' });
  void scalarFromBytes; void scalarToBytes; void jcs; void signRecord;
});
