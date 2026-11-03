import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BoardLog, buildEntry, nonceKey, verifyLog, exportBundle, type StoredEntry } from '@quietvote/board';
import { ed25519Keypair, sha256, utf8 } from '@quietvote/crypto';
import { ElectionDb, readTar, writeTar } from '../src/index.ts';
import { resolveConfig } from '../src/config.ts';
import { effectiveState, transition, typeAllowed } from '../src/lifecycle.ts';
import { RateLimiter } from '../src/ratelimit.ts';
import { base32, originOf } from '../src/util.ts';

const kpn = (l: string) => ed25519Keypair(sha256(utf8(l)));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'qv-u-'));
  const id = 'ab'.repeat(16);
  const edb = new ElectionDb(join(dir, 'e.sqlite'), 'test');
  const log = kpn('log');
  edb.init({ election_id: id, origin: originOf(id), state: 'DRAFT', log_pk: log.publicKey, log_sk_enc: null, srv_pk: log.publicKey, srv_sk_enc: null, access: 'public', read_key_hash: null, title: 't', org_id: 'o'.repeat(26), created_at: 1 });
  return { dir, edb, id, origin: originOf(id), log, done: () => { edb.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('origin derivation is 26 base32 chars', () => {
  assert.match(originOf('00'.repeat(16)), /^quietvote\/v1\/[a-z2-7]{26}$/);
  assert.equal(base32(new Uint8Array([0xff, 0xff])), '777q');
});

test('SqliteBoardStore: BoardLog works over it; gapless, nonce uniqueness, checkpoint immutability, triggers', () => {
  const t = tmpDb();
  try {
    const org = kpn('org');
    const resolve = () => org.publicKey;
    const log = new BoardLog({ origin: t.origin, store: t.edb.store, secretKey: t.log.secretKey, publicKey: t.log.publicKey, clock: () => 1000, resolveAuthorKey: resolve });
    const mk = (type: 'manifest' | 'ceremony_start', n: number) => buildEntry({ origin: t.origin, type, secretKey: org.secretKey, publicKey: org.publicKey, nonce: sha256(utf8(`n${n}`)).slice(0, 16), createdAt: 1000, body: utf8(`b${n}`) });
    const a = mk('manifest', 1);
    const r = log.append(a.headerBytes, a.body);
    assert.ok(r.ok);
    assert.equal(log.append(a.headerBytes, a.body).ok && (log.append(a.headerBytes, a.body) as { value: { duplicate: boolean } }).value.duplicate, true);
    const b = mk('ceremony_start', 2);
    assert.ok(log.append(b.headerBytes, b.body).ok);
    assert.ok(log.checkpoint().ok);
    assert.equal(t.edb.store.size(), 2);
    // reload from disk: same tree
    const log2 = new BoardLog({ origin: t.origin, store: t.edb.store, secretKey: t.log.secretKey, publicKey: t.log.publicKey, clock: () => 1000, resolveAuthorKey: resolve });
    assert.deepEqual(log2.root(), log.root());
    assert.equal(log2.status.state, 'ok');
    // store contract
    const e = t.edb.store.getEntry(1)!;
    assert.throws(() => t.edb.store.appendEntry({ ...e, seq: 5, nonceKey: 'x' } as StoredEntry), /seq must be max\+1|constraint|abort/i);
    assert.throws(() => t.edb.store.appendEntry({ ...e, seq: 2 } as StoredEntry), /UNIQUE|constraint/i);
    assert.throws(() => t.edb.store.putCheckpoint({ size: 2, root: new Uint8Array(32), note: 'x' }), /conflicting/);
    assert.equal(t.edb.store.findByNonce(nonceKey(Buffer.from(e.headerBytes.slice(0, 0)).toString('hex'), 'x', 'y')), undefined);
    // DB-level append-only triggers
    assert.throws(() => t.edb.db.exec('DELETE FROM log_entry WHERE seq=0'), /append-only/);
    assert.throws(() => t.edb.db.exec("UPDATE log_entry SET type='ballot' WHERE seq=0"), /immutable/);
    assert.throws(() => t.edb.db.exec("INSERT INTO log_entry(seq,type,author,author_nonce,nonce_key,header,leaf_hash,body_digest,body,body_len,received_at) VALUES (9,'a','b',zeroblob(16),'k',X'00',zeroblob(32),zeroblob(32),NULL,0,0)"), /max\+1|constraint/);
    // redaction leaves the leaf hash and tree intact
    t.edb.store.redactBody(0);
    assert.equal(t.edb.store.getEntry(0)!.body, null);
    const bundle = exportBundle(t.edb.store, { origin: t.origin, createdAt: 1, generator: 'x', policy: { logPublicKey: t.log.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } }, redactions: t.edb.redactions() });
    const v = verifyLog(bundle, { resolveAuthorKey: resolve });
    assert.equal(v.failures.length, 0, JSON.stringify(v.failures));
    // all tables are STRICT
    const tables = t.edb.db.prepare("SELECT name, strict FROM pragma_table_list WHERE schema='main' AND type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string; strict: number }[];
    assert.ok(tables.length > 5 && tables.every((x) => x.strict === 1), JSON.stringify(tables));
  } finally {
    t.done();
  }
});

test('lifecycle state machine', () => {
  assert.equal(transition('DRAFT', 'manifest'), 'SETUP');
  assert.equal(transition('OPEN', 'pause'), 'PAUSED');
  assert.equal(transition('PAUSED', 'resume'), 'OPEN');
  assert.equal(transition('PAUSED', 'invalidate'), 'INVALIDATED');
  assert.equal(transition('CLOSED', 'pause'), undefined);
  assert.equal(transition('READY', 'election_close'), undefined);
  assert.equal(transition('STALLED', 'invalidate'), 'INVALIDATED');
  assert.equal(effectiveState('TALLYING', 0, 100, 50), 'STALLED');
  assert.equal(effectiveState('TALLYING', 80, 100, 50), 'TALLYING');
  assert.ok(typeAllowed('OPEN', 'ballot') && !typeAllowed('PAUSED', 'ballot') && !typeAllowed('INVALIDATED', 'notice') && !typeAllowed('CLOSED', 'ballot'));
});

test('rate limiter refills and evicts', () => {
  let t = 0;
  const rl = new RateLimiter(() => t, 3);
  const spec = { limit: 6, windowSec: 60, burst: 2 };
  assert.ok(rl.take('a', spec).ok && rl.take('a', spec).ok);
  const x = rl.take('a', spec);
  assert.ok(!x.ok && x.retryAfterSec >= 1);
  t += 10_000;
  assert.ok(rl.take('a', spec).ok);
  for (const k of 'bcde') rl.take(k, spec);
  assert.ok(rl.size <= 3);
});

test('tar round trip is deterministic', () => {
  const files = [{ name: 'b.txt', data: utf8('hello') }, { name: 'a/x.bin', data: new Uint8Array(1000).fill(7) }];
  const t1 = writeTar(files);
  assert.deepEqual(t1, writeTar([...files].reverse()));
  const m = readTar(t1);
  assert.deepEqual([...m.keys()].sort(), ['a/x.bin', 'b.txt']);
  assert.equal(m.get('a/x.bin')!.length, 1000);
});

test('config above a hard bound refuses to start', () => {
  assert.throws(() => resolveConfig({ dataDir: '/x', maxBallotBytes: 10_000_000 }), /hard bound/);
  assert.throws(() => resolveConfig({ dataDir: '/x', minBallotIntervalSec: 1 }), /hard bound/);
  assert.throws(() => resolveConfig({ dataDir: '/x', maxVerifyQueue: 1_000_000 }), /hard bound/);
});
