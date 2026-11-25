import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@quietvote/crypto';
import { ballotCode, collectSpoilShares, decryptSpoiled, type BallotBody, type SignedRecord, type SpoilShareBody } from '@quietvote/protocol';
import { Ceremony, electionFixture } from './helpers/harness.ts';

const H = bytesToHex;
let c: Ceremony;
let code: string;
let recs: SignedRecord<SpoilShareBody>[];
let ctx: Uint8Array;
let body: BallotBody;
let outcomeY: Parameters<typeof decryptSpoiled>[1];
let Q: Set<number>;
let params: ReturnType<Ceremony['params']>;

before(async () => {
  const fx = await electionFixture({ n: 4, t: 3, seed: 'spoil-collect', spoilDecrypt: true, close: false });
  c = fx.c;
  const o = fx.outcome;
  const b = c.build(o, 0, { budget: ['yes'] }, 1);
  code = c.spoil(o, 0, b);
  c.marker('election-close');
  await c.syncAll();
  params = c.params(o);
  ctx = params.ctx;
  outcomeY = o.Y;
  Q = new Set(o.Q);
  body = (c.log.map((e) => e.entry as { intent?: string; body: BallotBody }).find((e) => e.intent === 'spoil'))!.body;
  assert.equal(H(ballotCode(ctx, body)), code);
  recs = [];
  for (const i of [1, 2, 3]) recs.push((await c.act(i, (t) => t.releaseSpoil(c.bundle(), [code]))).obj.records[0] as SignedRecord<SpoilShareBody>);
});
after(() => c.cleanup());

test('collectSpoilShares + decryptSpoiled round-trip', () => {
  const r = collectSpoilShares(c.manifest, ctx, code, recs);
  assert.equal(r.rejected.length, 0);
  assert.equal(r.sets.size, 3);
  const out = decryptSpoiled(params, outcomeY, Q, { code, body }, r.sets);
  assert.ok(out.ok);
  assert.deepEqual(out.value.selections, { budget: ['yes'] });
});

test('collectSpoilShares rejects tamper, wrong code/ctx, duplicates, forged index, schema junk', () => {
  const clone = (): SignedRecord<SpoilShareBody> => structuredClone(recs[0]!);
  const flip = (h: string): string => (h[0] === '0' ? '1' : '0') + h.slice(1);
  const badSig = clone();
  badSig.sig.sig = flip(badSig.sig.sig);
  const badBody = clone();
  badBody.body.spoil_seq += 1;
  const badShare = clone();
  badShare.body.shares[0]!.M = flip(badShare.body.shares[0]!.M);
  const forged = clone();
  forged.body.j = 2; // signed by trustee 1's key, claims slot 2
  const badCtx = clone();
  badCtx.body.ctx = flip(badCtx.body.ctx);
  const r = collectSpoilShares(c.manifest, ctx, code, [badSig, badBody, badShare, forged, badCtx, recs[0], recs[0], 'x', null]);
  assert.equal(r.sets.size, 1);
  assert.ok(r.sets.has(1));
  assert.equal(r.rejected.length, 8);
  assert.equal(collectSpoilShares(c.manifest, ctx, '00'.repeat(32), recs).sets.size, 0);
});

test('a tampered share (valid signature, bad proof) is rejected by decryptSpoiled, not silently combined', () => {
  const r = collectSpoilShares(c.manifest, ctx, code, recs);
  const one = r.sets.get(1)!;
  const k = [...one.keys()][0]!;
  const other = r.sets.get(2)!.get(k)!;
  one.set(k, { ...one.get(k)!, M: other.M }); // swap in another trustee's M
  const out = decryptSpoiled(params, outcomeY, Q, { code, body }, r.sets);
  assert.equal(out.ok, false);
});
