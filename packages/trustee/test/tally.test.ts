import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { baseMul, bytesToHex, hexToBytes, pointAdd, pointToBytes } from '@quietvote/crypto';
import { signRecord, type SignedRecord } from '@quietvote/protocol';
import { Trustee, OVERRIDE_UNWITNESSED, drillCiphertext, verifyKeycheck, type TallyShareBody, type KeycheckBody } from '../src/index.ts';
import { analysisOf, electionFixture, finishTally, verifyAll, type Fixture } from './helpers/harness.ts';

const H = bytesToHex;
let f: Fixture;
const rel = new Map<number, SignedRecord<TallyShareBody>>();

before(async () => {
  f = await electionFixture({ n: 5, t: 3, seed: 'tally-main' });
  for (const i of f.c.honest()) rel.set(i, (await f.c.act(i, (t) => t.releaseTally(f.c.bundle()))).obj.records[0] as SignedRecord<TallyShareBody>);
});
after(() => f.c.cleanup());

const recs = (...is: number[]): unknown[] => is.map((i) => rel.get(i)!);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

test('released shares are signed by the trustee, bound to ctx, and cover exactly the recomputed aggregate', () => {
  const { an } = analysisOf(f.c, f.outcome);
  for (const [i, r] of rel) {
    assert.equal(r.body.j, i);
    assert.equal(r.body.ctx, H(f.outcome.ctx));
    assert.equal(r.body.n_counted, an.counted.length);
    assert.deepEqual(r.body.shares.map((s) => `${s.contest}/${s.opt}`).sort(), ['budget/no', 'budget/yes']);
  }
});

test('any t of n honest shares decrypt; result verifies with the full verifier', async () => {
  for (const subset of [[1, 2, 3], [2, 4, 5], [1, 3, 5]]) {
    const r = finishTally(f.c, f.outcome, recs(...subset));
    assert.ok(r.counts, r.error);
    assert.equal(r.counts!.get('budget')!.get('yes'), f.expectedYes);
    f.c.log.pop(); // drop the tally record again; each subset publishes its own
    f.c.seq -= 1;
  }
  const r = finishTally(f.c, f.outcome, recs(1, 2, 3, 4, 5));
  assert.deepEqual(r.valid, [1, 2, 3, 4, 5]);
  assert.equal((await verifyAll(f.c)).verdict, 'PASS');
  f.c.log.pop();
  f.c.seq -= 1;
});

test('absent trustees: n-t absent still tallies, n-t+1 absent does not (QV-17-REQ-050)', () => {
  assert.ok(finishTally(f.c, f.outcome, recs(1, 4, 5)).counts);
  f.c.log.pop(); f.c.seq -= 1;
  const r = finishTally(f.c, f.outcome, recs(2, 5));
  assert.equal(r.counts, undefined);
  assert.match(r.error ?? '', /E_TALLY_INSUFFICIENT/);
});

test('wrong partial decryption: validly signed share with a wrong value is excluded by its proof', () => {
  const t2 = rel.get(2)!;
  const bad = clone(t2);
  bad.body.shares[0]!.M = H(pointToBytes(pointAdd(baseMul(1n), baseMul(2n))));
  // the malicious trustee signs its own forgery with its real key: signature OK, proof not
  const sk = hexToBytes(f.c.manifest.trustees[1]!.sign_pk, 32);
  void sk;
  return (async () => {
    const t = await f.c.act(2, async (x) => x);
    const forged = signRecord(hexToBytes(t.data.sk_sign, 32), hexToBytes(t.data.sign_pk, 32), f.outcome.ctx, bad.body);
    const r = finishTally(f.c, f.outcome, [rel.get(1)!, forged, rel.get(3)!, rel.get(4)!]);
    assert.ok(r.counts, r.error);
    assert.deepEqual(r.valid, [1, 3, 4]);
    assert.equal(r.counts!.get('budget')!.get('yes'), f.expectedYes);
    f.c.log.pop(); f.c.seq -= 1;
    // if the forger is needed to reach t the tally fails closed
    const r2 = finishTally(f.c, f.outcome, [rel.get(1)!, forged, rel.get(3)!]);
    assert.equal(r2.counts, undefined);
    assert.match(r2.error ?? '', /E_TALLY_INSUFFICIENT/);
  })();
});

test('tampered, replayed or mis-addressed share records are rejected at collection', () => {
  const t1 = clone(rel.get(1)!);
  t1.body.shares[0]!.M = H(pointToBytes(baseMul(9n)));
  const moved = clone(rel.get(2)!);
  moved.body.j = 3;
  const wrongCtx = clone(rel.get(4)!);
  wrongCtx.body.ctx = '11'.repeat(32);
  const dup = rel.get(5)!;
  const r = finishTally(f.c, f.outcome, [t1, moved, wrongCtx, dup, dup, rel.get(3)!]);
  assert.equal(r.counts, undefined);
  assert.deepEqual(r.rejected.map((x) => x.why).sort(), ['bad signature', 'bad signature', 'duplicate', 'wrong ctx or index']);
});

test('REQ-040: a coordinator-claimed aggregate that differs from the local recomputation is refused (AGGREGATE_MISMATCH)', async () => {
  const f2 = await electionFixture({ n: 3, t: 2, seed: 'tally-claimed' });
  try {
    const { aggs } = analysisOf(f2.c, f2.outcome);
    const claimed = new Map([...aggs].map(([cid, m]) => [cid, new Map(m)]));
    const a = claimed.get('budget')!.get('yes')!;
    claimed.get('budget')!.set('yes', { A: a.A, B: pointAdd(a.B, baseMul(1n)) }); // "one more yes"
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(f2.c.bundle(), { claimed })), (e: { code?: string; exitCode?: number }) => e.code === 'AGGREGATE_MISMATCH' && e.exitCode === 60);
    const t1 = await f2.c.act(1, async (x) => x);
    assert.equal(t1.state, 'STANDBY');
    assert.equal(t1.data.out.release, undefined);
    // the honest claim is accepted
    const ok = await f2.c.act(1, (t) => t.releaseTally(f2.c.bundle(), { claimed: aggs }));
    assert.equal(ok.round, 'tally-share');
  } finally {
    f2.c.cleanup();
  }
});

test('REQ-040: no API accepts a ciphertext; the only decryption entry points are the drill and the recomputed tally', () => {
  const names = Object.getOwnPropertyNames(Trustee.prototype).filter((n) => /decrypt|partial|share/i.test(n));
  assert.deepEqual(names.sort(), ['shares']); // 'shares' is the DKG round-2 command
  assert.equal(Trustee.prototype.releaseTally.length, 1 /* bundle */);
});

test('privacy floor: trustees refuse to release for fewer counted voters than the floor (ADR-021)', async () => {
  const f2 = await electionFixture({ n: 3, t: 2, seed: 'tally-floor', votes: ['yes', 'no'] });
  try {
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(f2.c.bundle())), (e: { code?: string; exitCode?: number }) => e.code === 'PRIVACY_MIN' && e.exitCode === 60);
    assert.equal((await f2.c.act(1, async (x) => x)).data.out.release, undefined);
  } finally {
    f2.c.cleanup();
  }
});

test('refuses before election-close, and for a different election bundle', async () => {
  const f2 = await electionFixture({ n: 3, t: 2, seed: 'tally-open', close: false });
  const f3 = await electionFixture({ n: 3, t: 2, seed: 'tally-other' });
  try {
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(f2.c.bundle())), { code: 'ELECTION_NOT_CLOSED' });
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(f3.c.bundle())), { code: 'WRONG_ELECTION' });
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally({ nonsense: true })), { code: 'BUNDLE_FORMAT' });
  } finally {
    f2.c.cleanup();
    f3.c.cleanup();
  }
});

test('a log that commits to a different key set is refused', async () => {
  const f2 = await electionFixture({ n: 3, t: 2, seed: 'tally-key' });
  try {
    const b = f2.c.bundle();
    const tampered = { ...b, log: b.log.filter((e) => (e.entry as { body?: { type?: string; i?: number } }).body?.type !== 'dkg-shares' || (e.entry as { body: { i: number } }).body.i !== 3) };
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(tampered)), (e: { kind?: string }) => e.kind === 'VERIFY' || e.kind === 'REFUSED');
  } finally {
    f2.c.cleanup();
  }
});

test('unwitnessed checkpoint: refused unless the typed override is given; the override is recorded (QV-17-REQ-041)', async () => {
  const f2 = await electionFixture({ n: 3, t: 2, seed: 'tally-witness', witnessQuorum: 1 });
  try {
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(f2.c.bundle())), { code: 'NOT_WITNESSED' });
    await assert.rejects(f2.c.act(1, (t) => t.releaseTally(f2.c.bundle(), { override: 'yes' })), { code: 'NOT_WITNESSED' });
    await f2.c.act(1, (t) => t.releaseTally(f2.c.bundle(), { override: OVERRIDE_UNWITNESSED }));
    assert.equal((await f2.c.act(1, async (x) => x)).data.overrides.length, 1);
    await f2.c.act(2, (t) => t.releaseTally(f2.c.bundle(), { witnessed: true }));
    assert.equal((await f2.c.act(2, async (x) => x)).data.overrides.length, 0);
  } finally {
    f2.c.cleanup();
  }
});

test('a bogus coordinator tally record in the log cannot block honest trustees', async () => {
  const f2 = await electionFixture({ n: 3, t: 2, seed: 'tally-bogus' });
  try {
    const b = f2.c.bundle();
    const junk = { body: { proto: 'qv1-r255-sha2', type: 'tally', garbage: true }, sig: { key: '00'.repeat(32), sig: '00'.repeat(64) } };
    const p = await f2.c.act(1, (t) => t.releaseTally({ ...b, log: [...b.log, { seq: 9999, entry: junk }] }));
    assert.equal(p.round, 'tally-share');
  } finally {
    f2.c.cleanup();
  }
});

test('fire drill: the test ciphertext is recomputed locally; keychecks verify and are bound to the share key', async () => {
  const outcome = f.outcome;
  const ct = drillCiphertext(outcome.K, outcome.ctx);
  assert.ok(ct.A.equals(drillCiphertext(outcome.K, outcome.ctx).A));
  const rec = f.c.log.map((e) => e.entry as SignedRecord<KeycheckBody>).filter((e) => e.body?.type === 'keycheck');
  assert.equal(rec.length, 5);
  for (const r of rec) assert.ok(verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(r.body.j)!, r.body));
  const bad = clone(rec[0]!.body);
  bad.M = H(pointToBytes(baseMul(3n)));
  assert.ok(!verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(bad.j)!, bad));
  assert.ok(!verifyKeycheck(outcome.ctx, outcome.K, outcome.Y.get(((bad.j % 5) + 1))!, rec[0]!.body), 'a keycheck does not verify under another trustee\'s share key');
});
