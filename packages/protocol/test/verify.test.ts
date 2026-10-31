import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, ed25519Keypair, ed25519Sign, hexToBytes, streamRng, scalarToBytes, scalarAdd, sha256, utf8 } from '@quietvote/crypto';
import {
  analyzeBallotLog, ballotCode, buildBallot, castDigest, makeCast, makeSpoil, verifyElection, verifyElectionText,
  NO_SUPERSEDES, type BallotBody, type CastEnvelope, type ElectionBundle, type ErrorCode, type VerificationReport,
} from '../src/index.ts';
import {
  bundleOf, castBallot, clone, closeElection, defaultContests, publishTally, setup, spoilBallot, voterEnvelopes, type Sim,
} from './helpers/sim.ts';

const H = bytesToHex;
const contests = defaultContests().filter((c) => c.id === 'budget' || c.id === 'board');
let sim: Sim;
let base: ElectionBundle;
let outsider: ReturnType<typeof ed25519Keypair>;

async function init(): Promise<void> {
  if (sim !== undefined) return;
  sim = await setup({
    seed: 'verify-suite', n: 3, t: 2, voters: 7, contests, quorum: { type: 'fraction', basis: 'roll', num: 1, den: 2 },
  });
  const sels = [
    { budget: ['yes'], board: ['p', 'q'] },
    { budget: ['yes'], board: ['q'] },
    { budget: ['no'], board: [] },
    { budget: ['yes'], board: ['r', 's'] },
    { budget: [], board: ['p'] },
    { budget: ['no'], board: ['p', 't'] },
  ];
  castBallot(sim, 0, { budget: ['no'], board: ['s'] }); // later superseded
  sels.forEach((s, i) => (i === 0 ? castBallot(sim, 0, s) : castBallot(sim, i, s)));
  spoilBallot(sim, 1, { budget: ['no'], board: ['p'] }, 'publish');
  spoilBallot(sim, 2, { budget: ['yes'], board: [] }, 'private');
  closeElection(sim);
  publishTally(sim, [1, 3]);
  base = JSON.parse(JSON.stringify(bundleOf(sim))) as ElectionBundle;
  outsider = ed25519Keypair(sha256(utf8('outsider')));
}

type Mut = (b: ElectionBundle) => void;
const entries = (b: ElectionBundle, pred: (e: Record<string, any>) => boolean): { seq: number; entry: Record<string, any> }[] =>
  b.log.filter((e) => pred(e.entry as Record<string, any>)) as { seq: number; entry: Record<string, any> }[];
const tallyOf = (b: ElectionBundle): Record<string, any> => entries(b, (e) => e.body?.type === 'tally')[0]!.entry.body;
const run = async (m: Mut): Promise<VerificationReport> => {
  const b = clone(base);
  m(b);
  return verifyElection(b);
};
const codes = (r: VerificationReport): string[] => r.findings.map((f) => f.code);
function expectFail(r: VerificationReport, code: ErrorCode | string, check?: string): void {
  assert.ok(codes(r).includes(code), `expected ${code}, got ${JSON.stringify(codes(r))}`);
  // no mutant passes all checks (QV-34 §9.3); benign L/ALARM anomalies keep the verdict but fail their named check
  if (check !== undefined) assert.equal(r.checks[check as keyof typeof r.checks], 'fail', check);
  else assert.notEqual(r.verdict, 'PASS', JSON.stringify(r.findings.slice(0, 5)));
  assert.ok(r.verdict !== 'PASS' || Object.values(r.checks).includes('fail'));
}

test('baseline election: PASS, exact counts, results, one missing trustee', async () => {
  await init();
  const r = await verifyElection(base);
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  assert.equal(r.counts.counted, 6);
  assert.equal(r.counts.cast, 7);
  assert.equal(r.counts.spoiled, 2);
  assert.equal(r.checks['chk.manifest.hash'], 'pass');
  assert.equal(r.checks['chk.tally.decrypt'], 'pass');
  assert.equal(r.checks['chk.board.append_only'], 'not_run');
  assert.equal(r.results![0]!.outcome.kind, 'passed'); // yes 3, no 2 (voter 4 blank)
  assert.deepEqual(tallyOf(base).decrypters, [1, 3]);
  assert.equal(r.ctxPrefix!.length, 16);
  const t = await verifyElectionText(JSON.stringify(base));
  assert.equal(t.verdict, 'PASS');
});

test('verifyElectionText rejects out-of-profile JSON', async () => {
  await init();
  assert.equal((await verifyElectionText('{"a":1,"a":2}')).verdict, 'FAIL');
  assert.equal((await verifyElectionText('null')).verdict, 'FAIL');
  assert.equal((await verifyElectionText(JSON.stringify(base).replace('"seq":1,', '"seq":1.0,'))).verdict, 'FAIL');
});

test('verifier is total on garbage input', async () => {
  for (const x of [null, undefined, 1, 'x', [], {}, { manifest: 1, manifest_hash: 'a', roll: [], log: [] }, { ...base, log: [1, 2, 3] }]) {
    const r = await verifyElection(x);
    assert.notEqual(r.verdict, 'PASS');
  }
});

const mutants: [string, Mut, string, string | undefined][] = [
  ['manifest field flip', (b) => (b.manifest.body.title += 'x'), 'E_MANIFEST_HASH', 'chk.manifest.hash'],
  ['wrong out-of-band hash', (b) => (b.manifest_hash = '00'.repeat(32)), 'E_MANIFEST_HASH', 'chk.manifest.hash'],
  ['manifest signatures removed', (b) => (b.manifest.sigs = []), 'E_MANIFEST_SIG', 'chk.manifest.sig'],
  ['manifest unknown field', (b) => ((b.manifest.body as any).extra = 1), 'E_SCHEMA', 'chk.encoding.canonical'],
  ['roll mismatch (voter removed)', (b) => b.roll.pop(), 'E_ROLL', undefined],
  ['log sequence not increasing', (b) => (b.log[3]!.seq = b.log[2]!.seq), 'E_LOG_ORDER', undefined],
  ['counted ballot dropped from log', (b) => {
    const e = entries(b, (x) => x.intent === 'cast')[3]!;
    b.log.splice(b.log.findIndex((l) => l.seq === e.seq), 1);
  }, 'E_COUNTED_ROOT', 'chk.tally.aggregate'],
  ['two ballots of one voter reordered', (b) => {
    const c = entries(b, (x) => x.intent === 'cast' && x.body.voter === voterHex(0));
    const [a, d] = [c[0]!, c[1]!];
    const tmp = a.entry; a.entry = d.entry; d.entry = tmp;
    for (const l of b.log) { if (l.seq === a.seq) l.entry = a.entry; if (l.seq === d.seq) l.entry = d.entry; }
  }, 'E_SUPERSEDES', 'chk.ballots.latest'],
  ['ciphertext bit flip (signature breaks)', (b) => {
    const e = entries(b, (x) => x.intent === 'cast')[2]!;
    e.entry.body.contests[0].sel[0].a = '0'.repeat(63) + '1';
  }, 'E_SIG', 'chk.ballots.valid'],
  ['counted ballot replaced by re-signed tampered proof', (b) => {
    const e = entries(b, (x) => x.intent === 'cast')[2]!;
    const body = e.entry.body as BallotBody;
    body.contests[0]!.sel[0]!.s0 = H(scalarToBytes(scalarAdd(1n, 1n)));
    const v = sim.voters.find((k) => H(k.publicKey) === body.voter)!;
    e.entry.sig = H(ed25519Sign(v.secretKey, castDigest(sim.params!.ctx, ballotCode(sim.params!.ctx, body))));
  }, 'E_CDS', 'chk.ballots.valid'],
  ['ballot replayed verbatim', (b) => {
    const e = entries(b, (x) => x.intent === 'cast')[3]!;
    const close = entries(b, (x) => x.body?.name === 'election-close')[0]!;
    b.log.splice(b.log.findIndex((l) => l.seq === close.seq), 0, { seq: close.seq - 0.5, entry: clone(e.entry) });
  }, 'E_SUPERSEDES', 'chk.ballots.latest'],
  ['tally: aggregate altered', (b) => { tallyOf(b).contests[0].options[0].A = H(hexToBytes(tallyOf(b).contests[0].options[0].B)); }, 'E_AGG_MISMATCH', 'chk.tally.aggregate'],
  ['tally: partial decryption wrong', (b) => { const s = tallyOf(b).contests[0].options[0].shares[0]; s.M = tallyOf(b).contests[0].options[0].B; }, 'E_TALLY_INSUFFICIENT', 'chk.tally.decrypt'],
  ['tally: fewer than t shares', (b) => { for (const c of tallyOf(b).contests) for (const o of c.options) o.shares = o.shares.slice(0, 1); }, 'E_TALLY_INSUFFICIENT', 'chk.tally.decrypt'],
  ['tally: count altered', (b) => { tallyOf(b).contests[0].options[0].T += 1; }, 'E_DLOG_RANGE', 'chk.tally.decrypt'],
  ['tally: result flipped', (b) => { tallyOf(b).results[0].outcome = { kind: 'rejected' }; }, 'E_RESULT', 'chk.result.rules'],
  ['tally: quorum flag flipped', (b) => { tallyOf(b).results[0].quorum_met = false; }, 'E_RESULT', 'chk.result.rules'],
  ['tally: n_counted altered', (b) => { tallyOf(b).n_counted = 7; }, 'E_COUNTED_ROOT', 'chk.tally.aggregate'],
  ['tally: wrong ctx (cross-election tally)', (b) => { tallyOf(b).ctx = '11'.repeat(32); }, 'E_CTX', undefined],
  ['tally: unknown field', (b) => { tallyOf(b).extra = true; }, 'E_SCHEMA', 'chk.encoding.canonical'],
  ['spoiled ballot also cast', (b) => {
    const s = entries(b, (x) => x.intent === 'spoil')[0]!.entry;
    const v = sim.voters.find((k) => H(k.publicKey) === s.body.voter)!;
    const code = ballotCode(sim.params!.ctx, s.body);
    const last = b.log[b.log.length - 1]!;
    const close = entries(b, (x) => x.body?.name === 'election-close')[0]!;
    // insert before the close marker so it is inside the window
    const idx = b.log.findIndex((l) => l.seq === close.seq);
    b.log.splice(idx, 0, { seq: close.seq - 0.5, entry: { intent: 'cast', body: clone(s.body), sig: H(ed25519Sign(v.secretKey, castDigest(sim.params!.ctx, code))) } });
    void last;
  }, 'E_SPOILED_CODE_CAST', 'chk.benaloh.spoiled'],
  ['spoil reveal with wrong plaintext', (b) => {
    const s = entries(b, (x) => x.intent === 'spoil' && x.reveal !== undefined)[0]!.entry;
    s.reveal.selections.budget = ['yes'];
  }, 'E_SPOIL_MISMATCH', 'chk.benaloh.spoiled'],
  ['non-canonical (upper-case) hex in a ballot', (b) => {
    const e = entries(b, (x) => x.intent === 'cast')[1]!;
    e.entry.body.contests[0].sel[0].a = e.entry.body.contests[0].sel[0].a.toUpperCase();
  }, 'E_SCHEMA', 'chk.encoding.canonical'],
  ['unknown record type', (b) => { b.log.push({ seq: 99999, entry: { body: { proto: 'qv1-r255-sha2', type: 'mystery' } } }); }, 'E_VERSION', 'chk.encoding.canonical'],
  ['DKG dealing tampered (signature breaks, ctx changes)', (b) => {
    const d = entries(b, (x) => x.body?.type === 'dkg-dealing')[1]!;
    d.entry.body.coeffs[0].A = d.entry.body.coeffs[1].A;
  }, 'E_SIG', undefined],
  ['DKG marker order broken', (b) => {
    const m1 = entries(b, (x) => x.body?.name === 'dkg-r1-open')[0]!;
    const m2 = entries(b, (x) => x.body?.name === 'dkg-r1-close')[0]!;
    const t = m1.entry.body.name; m1.entry.body.name = m2.entry.body.name; m2.entry.body.name = t;
  }, 'E_SIG', undefined],
  ['voter outside the roll', (b) => {
    const v = outsider;
    const r = buildBallot(sim.params!, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'], board: [] }, streamRng('out'));
    assert.ok(r.ok);
    const close = entries(b, (x) => x.body?.name === 'election-close')[0]!;
    b.log.splice(b.log.findIndex((l) => l.seq === close.seq), 0, { seq: close.seq - 0.5, entry: makeCast(sim.params!, v.secretKey, r.ok ? r.value : (undefined as never)) });
  }, 'E_VOTER_NOT_ELIGIBLE', 'chk.ballots.valid'],
  ['ballot after close', (b) => {
    const v = sim.voters[6]!;
    const r = buildBallot(sim.params!, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'], board: [] }, streamRng('late'));
    assert.ok(r.ok);
    b.log.push({ seq: b.log[b.log.length - 1]!.seq + 1, entry: makeCast(sim.params!, v.secretKey, r.ok ? r.value : (undefined as never)) });
  }, 'E_TIME_WINDOW', 'chk.time.window'],
  ['spoiled list names a code that was never spoiled', (b) => { tallyOf(b).spoiled.push({ code: '22'.repeat(32), mode: 'reveal', selections: {} }); }, 'E_SPOIL_MISMATCH', 'chk.benaloh.spoiled'],
];
const voterHex = (i: number): string => H(sim.voters[i]!.publicKey);

for (const [name, mut, code, check] of mutants) {
  test(`mutation: ${name}`, async () => {
    await init();
    // fractional seqs used for insertion are renumbered here, keeping order
    const r = await run((b) => {
      mut(b);
      b.log.sort((x, y) => x.seq - y.seq);
      if (!['log sequence not increasing'].includes(name)) { let n = 0; for (const l of b.log) l.seq = ++n; }
    });
    expectFail(r, code, check);
  });
}

test('mutation: dropping election-close marker is INCOMPLETE, never PASS', async () => {
  await init();
  const r = await run((b) => {
    b.log = b.log.filter((l) => (l.entry as any).body?.name !== 'election-close');
  });
  assert.notEqual(r.verdict, 'PASS');
});

test('no tally yet: INCOMPLETE', async () => {
  await init();
  const r = await run((b) => {
    b.log = b.log.filter((l) => (l.entry as any).body?.type !== 'tally');
  });
  assert.equal(r.verdict, 'INCOMPLETE');
  assert.equal(r.checks['chk.tally.decrypt'], 'not_run');
});

test('benign anomalies keep PASS but fail their check: late/unknown-voter ballots are ignored', async () => {
  await init();
  const r = await run((b) => {
    const v = sim.voters[6]!;
    const x = buildBallot(sim.params!, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'], board: [] }, streamRng('late2'));
    assert.ok(x.ok);
    b.log.push({ seq: b.log[b.log.length - 1]!.seq + 1, entry: makeCast(sim.params!, v.secretKey, x.ok ? x.value : (undefined as never)) });
  });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.checks['chk.time.window'], 'fail');
  assert.equal(r.counts.ignored['E_TIME_WINDOW'], 1);
});

test('private-audit spoil: signature checked, code excluded from counting', async () => {
  await init();
  const priv = entries(base, (x) => x.intent === 'spoil' && x.reveal === undefined)[0]!.entry;
  assert.notEqual(priv.reveal_digest, '00'.repeat(32));
  const codeHex = H(ballotCode(sim.params!.ctx, priv.body));
  const r = await verifyElection(base);
  assert.ok(codeHex.length === 64 && r.checks['chk.benaloh.spoiled'] === 'pass');
});

test('revote chain, limit and fork rules (ballot log analysis)', async () => {
  const s = await setup({ seed: 'chain', n: 3, t: 2, voters: 3, contests: [contests[0]!], maxPerVoter: 2 });
  const sel = (v: string) => ({ budget: [v] });
  const b1 = castBallot(s, 0, sel('yes'));
  const b2 = castBallot(s, 0, sel('no'));
  castBallot(s, 0, sel('yes')); // third admissible cast exceeds max_per_voter = 2
  const fork = castBallot(s, 1, sel('yes'));
  castBallot(s, 1, sel('no'), { supersedes: NO_SUPERSEDES }); // stale pointer after fork
  closeElection(s);
  const an = analyzeBallotLog(s.params!, new Set(s.rollHex), voterEnvelopes(s), s.openSeq!, s.closeSeq!);
  const c0 = an.counted.find((c) => c.voter === H(s.voters[0]!.publicKey))!;
  assert.equal(c0.code, H(b2.built.code), 'latest admissible ballot within the limit counts');
  assert.ok(an.findings.some((f) => f.code === 'E_REVOTE_LIMIT'));
  const c1 = an.counted.find((c) => c.voter === H(s.voters[1]!.publicKey))!;
  assert.equal(c1.code, H(fork.built.code));
  assert.ok(an.findings.some((f) => f.code === 'E_SUPERSEDES'));
  void b1;
});

test('a spoiled code that is later cast is excluded and the chain does not advance', async () => {
  const s = await setup({ seed: 'spoilcast', n: 3, t: 2, voters: 2, contests: [contests[0]!] });
  const sp = spoilBallot(s, 0, { budget: ['yes'] }, 'publish');
  const v = s.voters[0]!;
  const evil: CastEnvelope = { intent: 'cast', body: sp.env.body, sig: makeCast(s.params!, v.secretKey, sp.built).sig };
  s.seq += 1; s.log.push({ seq: s.seq, entry: evil });
  const good = castBallot(s, 0, { budget: ['no'] }, { supersedes: NO_SUPERSEDES });
  closeElection(s);
  const an = analyzeBallotLog(s.params!, new Set(s.rollHex), voterEnvelopes(s), s.openSeq!, s.closeSeq!);
  assert.ok(an.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST' && f.cls === 'ALARM'));
  assert.equal(an.counted.length, 1);
  assert.equal(an.counted[0]!.code, H(good.built.code));
  void makeSpoil;
});

test('CP-05: a validly signed roll-commit replayed after election-open is fatal', async () => {
  await init();
  const b = clone(base);
  const original = entries(b, (e) => e.body?.type === 'roll-commit')[0];
  assert.ok(original, 'baseline election must contain a roll-commit');
  const lastSeq = Math.max(...b.log.map((e) => e.seq));
  // Keep the original signed body unchanged: this is a valid coordinator signature,
  // not a malformed-record test. Only its log position is adversarial.
  b.log.push({ seq: lastSeq + 1, entry: clone(original.entry) });
  const r = await verifyElection(b);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.findings.some((f) => f.code === 'E_ROLL' && /precede election-open/.test(f.detail)), JSON.stringify(r.findings));
  assert.equal(r.checks['chk.time.window'], 'fail');
});
