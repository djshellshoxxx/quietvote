import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { ballotCode, shareToHex, signRecord, trusteeDecryptSpoiled, PROTO_ID, type SpoilShareBody } from '@quietvote/protocol';
import { bundleOf, castBallot, closeElection, push, setup, spoilBallot, trusteeKeyFor, type Sim } from '../../protocol/test/helpers/sim.ts';
import { analyzeBallotLog, makeSpoil, type ManifestContest } from '@quietvote/protocol';
import { qv, tmp, writeJson } from './helpers.ts';

const H = bytesToHex;
const contest: ManifestContest = {
  id: 'budget', title: 'Adopt?', method: 'yes-no', options: [{ id: 'yes', label: 'Y' }, { id: 'no', label: 'N' }], selection_limit: 1, min_selections: 0,
  rule: { type: 'threshold', num: 1, den: 2, basis: 'yes+no', strict: true }, tie_break: { type: 'status-quo', option: 'no' },
};

let dir: string;
let sim: Sim;
let election: string;
let code: string;
let castCode: string;
let rewrapCode: string;
const analysis = (s: Sim): unknown => analyzeBallotLog(s.params!, new Set(s.rollHex), s.log.filter((e) => 'intent' in (e.entry as object)).map((e) => ({ seq: e.seq, raw: e.entry })), s.openSeq!, s.closeSeq!).spoiled;

/** What `qv-trustee spoil-release` emits for one trustee and one code (same body, same signature scope). */
function release(s: Sim, j: number, c: string): unknown {
  const rec = [...(s as unknown as { __an: Map<string, never> }).__an.values()].find((r) => (r as { code: string }).code === c) as never;
  const r = trusteeDecryptSpoiled(s.params!, trusteeKeyFor(s, j), rec, streamRng(`rel${j}${c}`));
  if (!r.ok) throw new Error(r.error);
  const shares: SpoilShareBody['shares'] = [];
  for (const [k, sp] of r.value) {
    const [contestId, opt] = k.split('/') as [string, string];
    const x = shareToHex(j, sp);
    shares.push({ contest: contestId, opt, M: x.M, c: x.c, s: x.s });
  }
  const kp = s.trusteeKeys[j - 1]!;
  return signRecord(kp.secretKey, kp.publicKey, s.params!.ctx, { proto: PROTO_ID, type: 'spoil-share', ctx: H(s.params!.ctx), j, code: c, spoil_seq: (rec as { seq: number }).seq, shares });
}
const packet = (dirp: string, name: string, records: unknown[], round = 'spoil-share'): string => writeJson(dirp, name, { format: 'qv-ceremony-packet/v1', round, from: 1, records });
const base = (extra: string[]): string[] => ['election', 'spoil-collect', '--election', election, ...extra];

before(async () => {
  dir = tmp();
  sim = await setup({ seed: 'cli-spoil', n: 4, t: 3, voters: 6, contests: [contest], spoilTrustees: true });
  const sp = spoilBallot(sim, 0, { budget: ['yes'] }, 'trustees');
  code = H(ballotCode(sim.params!.ctx, sp.env.body));
  castCode = H(castBallot(sim, 1, { budget: ['no'] }).built.code);
  // TR-01 re-wrap: voter 2 casts, then spoils (trustees mode) the very same ciphertexts
  const { built } = castBallot(sim, 2, { budget: ['yes'] });
  const body = structuredClone(built.body);
  body.supersedes = '11'.repeat(32);
  const rewrapped = { ...built, body, code: ballotCode(sim.params!.ctx, body) };
  push(sim, makeSpoil(sim.params!, sim.voters[2]!.secretKey, rewrapped, 'trustees'));
  rewrapCode = H(rewrapped.code);
  closeElection(sim);
  election = writeJson(dir, 'election.json', bundleOf(sim));
  (sim as unknown as { __an: unknown }).__an = analysis(sim);
});

test('happy path: t honest packets decode the spoiled selections; post bodies written', async () => {
  const out = join(dir, 'post');
  const pk = [1, 2, 3].map((j) => packet(dir, `p${j}.json`, [release(sim, j, code)]));
  const r = await qv(base(['--code', code, ...pk.flatMap((f) => ['--packet', f]), '--post-body-out', out, '--json']));
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.deepEqual(j.selections, { budget: ['yes'] });
  assert.deepEqual(j.valid_shares, [1, 2, 3]);
  assert.deepEqual(readdirSync(out).sort(), [1, 2, 3].map((x) => `${code.slice(0, 8)}-${x}.json`));
  const body = JSON.parse(readFileSync(join(out, `${code.slice(0, 8)}-2.json`), 'utf8'));
  assert.equal(body.body.type, 'spoil-share');
  assert.equal(body.body.j, 2);
  assert.match((await qv(base(['--code', code, ...pk.flatMap((f) => ['--packet', f])]))).out, /budget: yes/);
});

test('other codes and rounds in the packets are ignored; extra valid share is fine', async () => {
  const f1 = packet(dir, 'm1.json', [release(sim, 1, code)]);
  const f2 = packet(dir, 'm2.json', [release(sim, 2, code), release(sim, 2, code)], 'spoil-share');
  const f3 = packet(dir, 'm3.json', [release(sim, 3, code)]);
  const f4 = packet(dir, 'm4.json', [release(sim, 4, code)]);
  const junk = packet(dir, 'm5.json', [{ nonsense: true }], 'tally-share');
  const r = await qv(base(['--code', code, ...[f1, f2, f3, f4, junk].flatMap((f) => ['--packet', f]), '--json']));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out).selections, { budget: ['yes'] });
});

test('fewer than t valid shares: exit 1, writes nothing', async () => {
  const out = join(dir, 'post-few');
  const r = await qv(base(['--code', code, '--packet', packet(dir, 'f1.json', [release(sim, 1, code)]), '--packet', packet(dir, 'f2.json', [release(sim, 2, code)]), '--post-body-out', out]));
  assert.equal(r.code, 1);
  assert.match(r.err, /2 valid share\(s\), fewer than t=3/);
  assert.ok(!existsSync(out));
});

test('tampered share (valid signature path broken or bad proof) is reported and not counted', async () => {
  const flip = (h: string): string => (h[0] === '0' ? '1' : '0') + h.slice(1);
  const t1 = structuredClone(release(sim, 3, code)) as { body: SpoilShareBody };
  t1.body.shares[0]!.s = flip(t1.body.shares[0]!.s); // breaks the signature
  const r = await qv(base(['--code', code, '--packet', packet(dir, 't1.json', [release(sim, 1, code)]), '--packet', packet(dir, 't2.json', [release(sim, 2, code)]), '--packet', packet(dir, 't3.json', [t1])]));
  assert.equal(r.code, 1);
  assert.match(r.err, /bad signature/);
  // valid signature, bad proof: trustee 3 re-signs a body carrying trustee 2's M values
  const a = release(sim, 2, code) as { body: SpoilShareBody };
  const forged = structuredClone(release(sim, 3, code)) as { body: SpoilShareBody; sig: unknown };
  forged.body.shares = forged.body.shares.map((x, i) => ({ ...x, M: a.body.shares[i]!.M }));
  const kp = sim.trusteeKeys[2]!;
  const resigned = signRecord(kp.secretKey, kp.publicKey, sim.params!.ctx, forged.body);
  const r2 = await qv(base(['--code', code, '--packet', packet(dir, 'u1.json', [release(sim, 1, code)]), '--packet', packet(dir, 'u2.json', [a]), '--packet', packet(dir, 'u3.json', [resigned]), '--json']));
  assert.equal(r2.code, 1);
  assert.match(JSON.parse(r2.out).error, /trustee 3: share proof invalid/);
});

test('wrong code, cast code, unknown code are refused (exit 1)', async () => {
  const pk = packet(dir, 'w1.json', [release(sim, 1, code), release(sim, 2, code), release(sim, 3, code)]);
  const bogus = 'ab'.repeat(32);
  const w = await qv(base(['--code', bogus, '--packet', pk]));
  assert.equal(w.code, 1);
  assert.match(w.err, /no verified spoil record/);
  const c = await qv(base(['--code', castCode, '--packet', pk]));
  assert.equal(c.code, 1);
  assert.match(c.err, /was cast/);
});

test('re-wrapped spoil (ciphertexts of a cast ballot) is refused even with t valid shares', async () => {
  const pk = [1, 2, 3].map((j) => packet(dir, `rw${j}.json`, [release(sim, j, rewrapCode)]));
  const r = await qv(base(['--code', rewrapCode, ...pk.flatMap((f) => ['--packet', f])]));
  assert.equal(r.code, 1);
  assert.match(r.err, /re-wraps/);
});

test('input and usage errors: bad code, no packet, junk packet, missing election', async () => {
  assert.equal((await qv(base(['--code', 'zz', '--packet', 'x']))).code, 2);
  assert.equal((await qv(base(['--code', code]))).code, 2);
  const junk = writeJson(dir, 'junk.json', { hello: 1 });
  assert.equal((await qv(base(['--code', code, '--packet', junk]))).code, 4);
  assert.equal((await qv(['election', 'spoil-collect', '--election', join(dir, 'nope.json'), '--code', code, '--packet', junk])).code, 4);
});

test('packet for another election: records are rejected, exit 1', async () => {
  const other = await setup({ seed: 'cli-spoil-other', n: 4, t: 3, voters: 6, contests: [contest], spoilTrustees: true });
  const sp = spoilBallot(other, 0, { budget: ['yes'] }, 'trustees');
  const oc = H(ballotCode(other.params!.ctx, sp.env.body));
  closeElection(other);
  (other as unknown as { __an: unknown }).__an = analysis(other);
  const recs = [1, 2, 3].map((j) => release(other, j, oc));
  // same code field forced onto our election's code cannot be signed by our trustees; use the foreign records as-is and with our code
  const asIs = await qv(base(['--code', code, ...recs.flatMap((r, i) => ['--packet', packet(dir, `o${i}.json`, [r])])]));
  assert.equal(asIs.code, 1);
  const relabelled = recs.map((r) => ({ ...(r as object), body: { ...(r as { body: object }).body, code } }));
  const r2 = await qv(base(['--code', code, ...relabelled.flatMap((r, i) => ['--packet', packet(dir, `r${i}.json`, [r])])]));
  assert.equal(r2.code, 1);
  assert.match(r2.err, /wrong ctx, code or index|bad signature/);
});
