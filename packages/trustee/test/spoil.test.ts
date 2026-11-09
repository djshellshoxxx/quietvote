import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@quietvote/crypto';
import { ballotCode, check, decryptSpoiled, shareFromHex, type BallotBody, type SignedRecord } from '@quietvote/protocol';
import { Trustee, TrusteeError, MAX_SPOIL_REQUEST, spoilShareRecordSchema, type SpoilShareBody } from '../src/index.ts';
import { Ceremony, PASS, electionFixture, mkDeps, type Fixture } from './helpers/harness.ts';

const H = bytesToHex;
let f: Fixture;
let c: Ceremony;
let spoilCode: string; // trustee-mode spoil of a ballot that was never cast
let privCode: string; // private-audit spoil (reveal_digest != 0)
let unposted: string; // well-formed code of a ballot that was never posted
let both: string; // spoiled in trustee mode AND cast with the same ciphertexts
let spoilSel: string;

before(async () => {
  const fx = await electionFixture({ n: 4, t: 3, seed: 'spoil-main', spoilDecrypt: true, close: false });
  f = fx;
  c = fx.c;
  const o = fx.outcome;
  const a = c.build(o, 0, { budget: ['yes'] }, 1);
  spoilSel = 'yes';
  spoilCode = c.spoil(o, 0, a);
  const b = c.build(o, 1, { budget: ['no'] }, 1);
  privCode = c.spoil(o, 1, b, 'private');
  const d = c.build(o, 2, { budget: ['yes'] }, 1);
  both = c.spoil(o, 2, d);
  c.castBuilt(o, 2, d);
  unposted = H(c.build(o, 3, { budget: ['no'] }, 2).code);
  c.marker('election-close');
  await c.syncAll();
});
after(() => c.cleanup());

const rejects = async (p: Promise<unknown>, code: string): Promise<void> => {
  await assert.rejects(p, (e: unknown) => e instanceof TrusteeError && e.code === code, code);
};
const rel = (i: number, codes: string[]) => c.act(i, (t) => t.releaseSpoil(c.bundle(), codes));

test('t honest trustees release spoil shares that decrypt the spoiled ballot, with valid proofs', async () => {
  const recs: SignedRecord<SpoilShareBody>[] = [];
  for (const i of [1, 2, 3]) {
    const pk = await rel(i, [spoilCode]);
    assert.equal(pk.round, 'spoil-share');
    const r = pk.obj.records[0] as SignedRecord<SpoilShareBody>;
    assert.equal(check(spoilShareRecordSchema, r), null);
    assert.equal(r.body.j, i);
    assert.equal(r.body.code, spoilCode);
    recs.push(r);
  }
  const shares = new Map(recs.map((r) => [r.body.j, new Map(r.body.shares.map((s) => {
    const sp = shareFromHex(s);
    assert.ok(sp.ok);
    return [`${s.contest}/${s.opt}`, sp.value];
  }))]));
  const target = envelopes('spoil').find((e) => H(codeOf(e.body)) === spoilCode)!;
  const out = decryptSpoiled(c.params(f.outcome), f.outcome.Y, new Set(f.outcome.Q), { code: spoilCode, body: target.body }, shares);
  assert.ok(out.ok, out.ok ? '' : out.error);
  assert.deepEqual(out.value.selections, { budget: [spoilSel] });
});

const envelopes = (intent: 'cast' | 'spoil') => c.log.map((e) => e.entry as { intent?: string; body: BallotBody }).filter((e) => e.intent === intent);
const codeOf = (b: BallotBody): Uint8Array => ballotCode(c.params(f.outcome).ctx, b);

test('replay: a second request for the same code is refused by that share, others unaffected', async () => {
  await rejects(rel(1, [spoilCode]), 'SPOIL_REPLAY');
  await rejects(rel(1, [privCode, spoilCode]), 'SPOIL_REPLAY'); // nothing partially released
  assert.ok((await rel(4, [spoilCode])).obj.records.length === 1);
});

test('replay guard survives restart (persisted in the sealed bundle)', async () => {
  const t = await Trustee.open(c.path(2), PASS, mkDeps('x'));
  await rejects(t.releaseSpoil(c.bundle(), [spoilCode]), 'SPOIL_REPLAY');
});

test('wrong ballot id: unknown code is refused', async () => {
  await rejects(rel(2, ['ab'.repeat(32)]), 'NOT_SPOILED');
  await rejects(rel(2, [unposted]), 'NOT_SPOILED');
});

test('private-audit spoil (reveal_digest != 0) is not decryptable by trustees', async () => {
  await rejects(rel(2, [privCode]), 'NOT_TRUSTEE_MODE');
});

test('a cast ballot is never decryptable, including one whose code was also spoiled', async () => {
  const casts = envelopes('cast');
  assert.ok(casts.length >= 2);
  for (const e of casts) await rejects(rel(2, [H(codeOf(e.body))]), 'BALLOT_WAS_CAST');
  await rejects(rel(2, [both]), 'BALLOT_WAS_CAST');
});

test('malformed or abusive requests are refused before any work', async () => {
  await rejects(rel(2, []), 'BAD_SPOIL_REQUEST');
  await rejects(rel(2, ['zz']), 'BAD_SPOIL_REQUEST');
  await rejects(rel(2, [spoilCode.toUpperCase()]), 'BAD_SPOIL_REQUEST');
  await rejects(rel(2, [spoilCode, spoilCode]), 'BAD_SPOIL_REQUEST');
  const many = Array.from({ length: MAX_SPOIL_REQUEST + 1 }, (_, k) => k.toString(16).padStart(64, '0'));
  await rejects(rel(2, many), 'BAD_SPOIL_REQUEST');
});

test('bundle from another election or tampered log is refused', async () => {
  const b = c.bundle();
  const tampered = { ...b, log: b.log.slice(0, -1) }; // drops election-close
  await rejects(c.act(2, (t) => t.releaseSpoil(tampered, [privCode])), 'ELECTION_NOT_CLOSED');
  await rejects(c.act(2, (t) => t.releaseSpoil({ ...b, manifest_hash: '00'.repeat(32) }, [privCode])), 'WRONG_ELECTION');
});

test('manifest without spoil_trustee_decrypt: refuses everything', async () => {
  const g = await electionFixture({ n: 4, t: 3, seed: 'spoil-off' });
  try {
    await assert.rejects(
      g.c.act(1, (t) => t.releaseSpoil(g.c.bundle(), ['ab'.repeat(32)])),
      (e: unknown) => e instanceof TrusteeError && e.code === 'SPOIL_MODE_OFF',
    );
  } finally {
    g.c.cleanup();
  }
});

test('spoil release does not need or alter tally state, and tally still releases afterwards', async () => {
  const pk = await c.act(3, (t) => t.releaseTally(c.bundle()));
  assert.equal(pk.round, 'tally-share');
});
