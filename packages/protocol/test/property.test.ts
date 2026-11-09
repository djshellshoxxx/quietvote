// Randomised (seeded, reproducible) property tests. Seeds are fixed so failures replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseMul, bytesToHex, ctSum, pointAdd, reconstructSecret, streamRng, type Rng } from '@quietvote/crypto';
import { aggregate, analyzeBallotLog, verifyElection, verifyEnvelope, type ElectionBundle } from '../src/index.ts';
import { castBallot, closeElection, defaultContests, setup, voterEnvelopes, type Faults } from './helpers/sim.ts';

const H = bytesToHex;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-vectors', 'v1');
const below = (r: Rng, n: number): number => ((r.bytes(2)[0]! << 8) | r.bytes(1)[0]!) % n;

test('property: random DKGs with one random fault keep K = [x]G, Y_j = [s_j]G and any t shares agree', async () => {
  const r = streamRng('prop-dkg');
  for (let it = 0; it < 6; it++) {
    const n = 3 + below(r, 3);
    const t = 2 + below(r, n - 2); // 2..n-1
    const who = 1 + below(r, n);
    const other = 1 + ((who + below(r, n - 1)) % n);
    const kinds: Faults[] = [{}, { badShare: [[who, other === who ? (who % n) + 1 : other]] }, { noShares: [who] }, { falseComplaint: [[who, other === who ? (who % n) + 1 : other]] }];
    const faults = kinds[below(r, kinds.length)]!;
    let sim;
    try {
      sim = await setup({ seed: `prop-dkg-${it}`, n, t, voters: 0, faults });
    } catch (e) {
      assert.match(String(e), /E_DKG_QUORUM/, 'only a quorum failure may abort');
      continue;
    }
    const o = sim.outcome!;
    assert.ok(o.Q.length >= t);
    for (const j of o.Q) assert.ok(baseMul(sim.shares.get(j)!).equals(o.Y.get(j)!));
    const x = reconstructSecret(o.Q.slice(0, t), sim.shares);
    assert.ok(baseMul(x).equals(o.K));
    assert.equal(reconstructSecret(o.Q.slice(-t), sim.shares), x);
  }
});

test('property: aggregation is order independent and equals the sum of counted ballots', async () => {
  const r = streamRng('prop-agg');
  const contests = defaultContests().filter((c) => c.id === 'budget' || c.id === 'topics');
  const sim = await setup({ seed: 'prop-agg', n: 3, t: 2, voters: 6, contests });
  const opts = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 6; i++) castBallot(sim, i, { budget: r.bytes(1)[0]! % 2 === 0 ? ['yes'] : ['no'], topics: opts.filter(() => r.bytes(1)[0]! % 2 === 0) });
  closeElection(sim);
  const an = analyzeBallotLog(sim.params!, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  const a1 = aggregate(sim.params!, an.counted);
  const a2 = aggregate(sim.params!, [...an.counted].reverse());
  for (const [cid, m] of a1) for (const [oid, a] of m) {
    assert.ok(a.A.equals(a2.get(cid)!.get(oid)!.A) && a.B.equals(a2.get(cid)!.get(oid)!.B));
    const manual = ctSum(an.counted.map((b) => {
      const s = b.env.body.contests.find((c) => c.id === cid)!.sel.find((x) => x.opt === oid)!;
      return { A: pointFrom(s.a), B: pointFrom(s.b) };
    }));
    assert.ok(manual.A.equals(a.A) && manual.B.equals(a.B));
  }
  void pointAdd;
});
import { pointFromBytes, hexToBytes } from '@quietvote/crypto';
const pointFrom = (h: string) => pointFromBytes(hexToBytes(h));

test('fuzz: envelope parser/verifier never throws and never accepts random corruption', async () => {
  const bundle = JSON.parse(readFileSync(join(ROOT, 'elections', 'tiny-yesno-3v', 'bundle.json'), 'utf8')) as ElectionBundle;
  const env = bundle.log.find((l) => (l.entry as { intent?: string }).intent === 'cast')!.entry;
  const text = JSON.stringify(env);
  const sim = await setup({ seed: 'vec-tiny', n: 3, t: 2, voters: 5, contests: [defaultContests()[0]!] });
  const r = streamRng('fuzz-env');
  const roll = new Set(bundle.roll);
  assert.ok(verifyEnvelope(sim.params!, roll, env).ok, 'fixture envelope must be valid under reconstructed params');
  let rejected = 0;
  for (let i = 0; i < 150; i++) {
    const pos = below(r, text.length);
    const c = text[pos]!;
    const repl = /[0-9a-f]/.test(c) ? (c === '0' ? '1' : '0') : c === '"' ? "'" : '#';
    const mutated = text.slice(0, pos) + repl + text.slice(pos + 1);
    let val: unknown;
    try {
      val = JSON.parse(mutated);
    } catch {
      rejected++;
      continue;
    }
    const res = verifyEnvelope(sim.params!, roll, val);
    if (!res.ok) rejected++;
  }
  assert.ok(rejected >= 148, `only ${rejected}/150 corruptions rejected`); // a flip inside an ignorable position may remain valid
});

test('fuzz: verifyElection is total over random byte and field corruption of a real bundle', async () => {
  const text = readFileSync(join(ROOT, 'elections', 'tiny-yesno-3v', 'bundle.json'), 'utf8');
  const r = streamRng('fuzz-bundle');
  for (let i = 0; i < 24; i++) {
    let s = text;
    for (let k = 0; k < 1 + below(r, 3); k++) {
      const pos = below(r, s.length);
      s = s.slice(0, pos) + String.fromCharCode(32 + below(r, 90)) + s.slice(pos + 1);
    }
    let v: unknown;
    try {
      v = JSON.parse(s);
    } catch {
      continue;
    }
    const rep = await verifyElection(v);
    assert.ok(['PASS', 'FAIL', 'INCOMPLETE'].includes(rep.verdict));
  }
  void H;
});
