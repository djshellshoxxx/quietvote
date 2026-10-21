import { bytesToHex, jcs, parseQvJson, pointToBytes, type Point } from '@quietvote/crypto';
import { aggregate, analyzeBallotLog, countedRoot, type Finding, type FindingClass } from './ballotlog.ts';
import type { ElectionParams } from './ballot.ts';
import { adjudicateDkg, verifyKeyconf, type DkgOutcome, type MarkerSeqs } from './dkg.ts';
import { effectiveMinCounted, manifestHash, rollRoot, validateManifest } from './manifest.ts';
import { verifyMultiSig, verifySig } from './records.ts';
import { evaluateAll } from './rules.ts';
import { S, check, tallySchema, type Schema } from './schema.ts';
import { decryptAggregates, decryptSpoiled, shareFromHex, shareKey, type ShareSet } from './tally.ts';
import type {
  CommitBody, ComplaintBody, DealingBody, ErrorCode, KeyconfBody, Manifest, MarkerBody, MultiSignedRecord, RollCommitBody,
  SharesBody, SignedRecord, TallyBody,
} from './types.ts';

export type CheckId =
  | 'chk.manifest.hash' | 'chk.manifest.sig' | 'chk.keys.trustees' | 'chk.board.append_only' | 'chk.board.witness'
  | 'chk.ballots.valid' | 'chk.ballots.latest' | 'chk.tally.aggregate' | 'chk.tally.decrypt' | 'chk.result.rules'
  | 'chk.benaloh.spoiled' | 'chk.receipts.sample' | 'chk.encoding.canonical' | 'chk.time.window';
export type CheckStatus = 'pass' | 'fail' | 'not_run';

export interface VerificationReport {
  verdict: 'PASS' | 'FAIL' | 'INCOMPLETE';
  checks: Record<CheckId, CheckStatus>;
  findings: Finding[];
  warnings: string[];
  caveats: string[];
  counts: { cast: number; spoiled: number; counted: number; ignored: Record<string, number> };
  ctxPrefix?: string;
  /** Joint election public key K and full ctx (hex), once the DKG verified. Lets a voter client build ballots (QV-ADR-020 audit device). */
  jointKey?: string;
  ctx?: string;
  /** Public (voter key, ballot code) pairs counted: lets a voter check that their final receipt code was counted. */
  countedBallots?: { voter: string; code: string }[];
  results?: TallyBody['results'];
  verifier: string;
}

export const VERIFIER_ID = 'quietvote-protocol-verify/0.1.0';
const H = bytesToHex;
const ALL_CHECKS: CheckId[] = [
  'chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees', 'chk.board.append_only', 'chk.board.witness',
  'chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules',
  'chk.benaloh.spoiled', 'chk.receipts.sample', 'chk.encoding.canonical', 'chk.time.window',
];

type Entry = { seq: number; entry: unknown };

/** Verifies a strictly parsed JSON text (QV-JSON profile) end to end. */
export async function verifyElectionText(text: string | Uint8Array): Promise<VerificationReport> {
  let v: unknown;
  try {
    v = parseQvJson(text);
  } catch {
    const r = blank();
    r.findings.push({ code: 'E_PARSE', cls: 'F', detail: 'bundle is not valid QV-JSON' });
    r.checks['chk.encoding.canonical'] = 'fail';
    r.verdict = 'FAIL';
    return r;
  }
  return verifyElection(v);
}

function blank(): VerificationReport {
  const checks = {} as Record<CheckId, CheckStatus>;
  for (const c of ALL_CHECKS) checks[c] = 'not_run';
  return {
    verdict: 'FAIL', checks, findings: [], warnings: [], caveats: [],
    counts: { cast: 0, spoiled: 0, counted: 0, ignored: {} }, verifier: VERIFIER_ID,
  };
}


/**
 * Appendix C verifier. Pure with respect to its input: no I/O, no clock, no randomness. Never throws on hostile input.
 * Board-level checks (tree heads, inclusion/consistency, witness cosignatures: C3) belong to @quietvote/board and are
 * reported as `not_run` here.
 */
export async function verifyElection(input: unknown): Promise<VerificationReport> {
  try {
    return await run(input);
  } catch (e) {
    const r = blank();
    r.findings.push({ code: 'E_SCHEMA', cls: 'F', detail: `verifier internal rejection: ${e instanceof Error ? e.message : 'unknown'}` });
    return r;
  }
}

async function run(input: unknown): Promise<VerificationReport> {
  const R = blank();
  const F = (code: ErrorCode, detail: string, seq?: number, cls: FindingClass = 'F'): void => {
    R.findings.push(seq === undefined ? { code, cls, detail } : { code, cls, seq, detail });
  };
  const fatal = (): boolean => R.findings.some((f) => f.cls === 'F');
  const done = (): VerificationReport => {
    for (const f of R.findings) if (f.cls === 'L' || f.cls === 'ALARM') R.counts.ignored[f.code] = (R.counts.ignored[f.code] ?? 0) + 1;
    R.verdict = fatal() ? 'FAIL' : R.checks['chk.tally.decrypt'] === 'not_run' ? 'INCOMPLETE' : 'PASS';
    return R;
  };
  R.checks['chk.board.append_only'] = 'not_run';
  R.checks['chk.board.witness'] = 'not_run';
  R.caveats.push('log integrity (tree heads, inclusion/consistency, witness cosignatures) not verified by this component');

  // ---- C1: bundle shape, manifest
  const b = input as { manifest?: unknown; manifest_hash?: unknown; roll?: unknown; log?: unknown } | null;
  if (typeof b !== 'object' || b === null || !Array.isArray(b.roll) || !Array.isArray(b.log) || typeof b.manifest_hash !== 'string' || typeof b.manifest !== 'object' || b.manifest === null) {
    F('E_SCHEMA', 'bundle must be {manifest, manifest_hash, roll[], log[]}');
    R.checks['chk.encoding.canonical'] = 'fail';
    return done();
  }
  const roll = b.roll as unknown[];
  if (!roll.every((x) => typeof x === 'string')) {
    F('E_SCHEMA', 'roll must be hex strings');
    R.checks['chk.encoding.canonical'] = 'fail';
    return done();
  }
  const rollHex = roll as string[];
  const mrec = b.manifest as MultiSignedRecord<Manifest>;
  const mv = validateManifest(mrec.body, rollHex.length);
  if (!mv.ok) {
    F(mv.error, `manifest: ${mv.detail ?? ''}`);
    if (mv.error === 'E_SCHEMA' || mv.error === 'E_PARSE') R.checks['chk.encoding.canonical'] = 'fail';
    return done();
  }
  const m = mv.value.manifest;
  R.warnings.push(...mv.value.warnings);
  const mhb = manifestHash(m);
  if (H(mhb) !== b.manifest_hash) {
    R.checks['chk.manifest.hash'] = 'fail';
    F('E_MANIFEST_HASH', 'manifest hash differs from the out-of-band value');
    return done();
  }
  R.checks['chk.manifest.hash'] = 'pass';
  const sigsOk = Array.isArray(mrec.sigs) && verifyMultiSig(mhb, { body: m, sigs: mrec.sigs }, m.coordinator.keys, m.coordinator.m);
  if (!sigsOk) {
    R.checks['chk.manifest.sig'] = 'fail';
    F('E_MANIFEST_SIG', 'fewer than m valid coordinator signatures');
    return done();
  }
  R.checks['chk.manifest.sig'] = 'pass';
  R.checks['chk.encoding.canonical'] = 'pass';

  // ---- roll
  const rr = rollRoot(rollHex);
  if (!rr.ok) {
    F('E_ROLL', rr.detail ?? 'roll invalid');
    return done();
  }
  const rootHex = H(rr.value);
  if (m.roll.root !== undefined && (m.roll.root !== rootHex || m.roll.size !== rollHex.length)) {
    F('E_ROLL', 'roll does not match manifest roll.root/size');
    return done();
  }

  // ---- log classification
  const log: Entry[] = [];
  let prevSeq = -1;
  for (const e of b.log as unknown[]) {
    const x = e as { seq?: unknown; entry?: unknown } | null;
    if (typeof x !== 'object' || x === null || typeof x.seq !== 'number' || !Number.isSafeInteger(x.seq) || x.seq <= prevSeq || x.seq < 0) {
      F('E_LOG_ORDER', 'log sequence numbers must be strictly increasing non-negative integers');
      return done();
    }
    prevSeq = x.seq;
    log.push({ seq: x.seq, entry: x.entry });
  }

  const trusteeKey = (idx: number): string | undefined => m.trustees[idx - 1]?.sign_pk;
  const noteBad = (code: ErrorCode, seq: number, d: string): void => {
    R.checks['chk.encoding.canonical'] = 'fail';
    F(code, d, seq, 'L');
  };

  const markers = new Map<string, { seq: number; body: MarkerBody; rec: MultiSignedRecord<MarkerBody> }>();
  const rollCommits: { seq: number; body: RollCommitBody }[] = [];
  const commits: { seq: number; body: CommitBody }[] = [];
  const dealings: { seq: number; body: DealingBody }[] = [];
  const shares: { seq: number; body: SharesBody }[] = [];
  const complaints: { seq: number; body: ComplaintBody }[] = [];
  const keyconfs: { seq: number; body: KeyconfBody }[] = [];
  const tallies: { seq: number; rec: SignedRecord<TallyBody> }[] = [];
  const voterEntries: { seq: number; raw: unknown }[] = [];
  const pendingCtxMarkers: { seq: number; rec: MultiSignedRecord<MarkerBody> }[] = [];

  const sigOk = (seq: number, scope: Uint8Array, body: { type: string }, sig: { key: string; sig: string }, key: string | undefined): boolean => {
    if (!verifySig(scope, body.type, body, sig, key)) {
      F('E_SIG', `record signature invalid for ${body.type}`, seq, 'L');
      return false;
    }
    return true;
  };

  for (const { seq, entry } of log) {
    const o = entry as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null) {
      noteBad('E_SCHEMA', seq, 'entry is not an object');
      continue;
    }
    if ('intent' in o) {
      voterEntries.push({ seq, raw: entry });
      continue;
    }
    const body = o.body as { type?: unknown; proto?: unknown } | undefined;
    const type = body?.type;
    if (typeof body !== 'object' || body === null || typeof type !== 'string') {
      noteBad('E_SCHEMA', seq, 'unrecognised entry');
      continue;
    }
    if (body.proto !== 'qv1-r255-sha2') {
      F('E_VERSION', 'unknown proto', seq, 'L');
      R.checks['chk.encoding.canonical'] = 'fail';
      continue;
    }
    const bad = (sch: Schema): boolean => {
      const e = check(sch, entry);
      if (e !== null) {
        noteBad('E_SCHEMA', seq, e);
        return true;
      }
      return false;
    };
    switch (type) {
      case 'marker': {
        if (bad(S.multiSigned(S.marker))) break;
        const rec = entry as MultiSignedRecord<MarkerBody>;
        if (rec.body.name === 'election-open' || rec.body.name === 'election-close') {
          pendingCtxMarkers.push({ seq, rec });
        } else if (verifyMultiSig(mhb, rec, m.coordinator.keys, m.coordinator.m)) {
          if (markers.has(rec.body.name)) F('E_MARKERS', `duplicate marker ${rec.body.name}`, seq, 'L');
          else markers.set(rec.body.name, { seq, body: rec.body, rec });
        } else F('E_SIG', 'marker lacks m valid coordinator signatures', seq, 'L');
        break;
      }
      case 'roll-commit': {
        if (bad(S.multiSigned(S.rollCommit))) break;
        const rec = entry as MultiSignedRecord<RollCommitBody>;
        if (verifyMultiSig(mhb, rec, m.coordinator.keys, m.coordinator.m)) rollCommits.push({ seq, body: rec.body });
        else F('E_SIG', 'roll-commit lacks coordinator signatures', seq, 'L');
        break;
      }
      case 'dkg-commit':
        if (bad(S.signed(S.dkgCommit))) break;
        {
          const r = entry as SignedRecord<CommitBody>;
          if (r.body.i <= m.n && sigOk(seq, mhb, r.body, r.sig, trusteeKey(r.body.i))) commits.push({ seq, body: r.body });
        }
        break;
      case 'dkg-dealing':
        if (bad(S.signed(S.dkgDealing(m.t)))) break;
        {
          const r = entry as SignedRecord<DealingBody>;
          if (r.body.i <= m.n && sigOk(seq, mhb, r.body, r.sig, trusteeKey(r.body.i))) dealings.push({ seq, body: r.body });
        }
        break;
      case 'dkg-shares':
        if (bad(S.signed(S.dkgShares))) break;
        {
          const r = entry as SignedRecord<SharesBody>;
          if (r.body.i <= m.n && sigOk(seq, mhb, r.body, r.sig, trusteeKey(r.body.i))) shares.push({ seq, body: r.body });
        }
        break;
      case 'dkg-complaint':
        if (bad(S.signed(S.dkgComplaint))) break;
        {
          const r = entry as SignedRecord<ComplaintBody>;
          if (r.body.accuser <= m.n && sigOk(seq, mhb, r.body, r.sig, trusteeKey(r.body.accuser))) complaints.push({ seq, body: r.body });
        }
        break;
      case 'dkg-keyconf':
        if (bad(S.signed(S.dkgKeyconf))) break;
        {
          const r = entry as SignedRecord<KeyconfBody>;
          if (r.body.j <= m.n && sigOk(seq, mhb, r.body, r.sig, trusteeKey(r.body.j))) keyconfs.push({ seq, body: r.body });
        }
        break;
      case 'tally': {
        // signature is a convenience (QV-16 §5.19.1); it is checked after ctx is known. Schema is checked now.
        const e = check(S.signed(tallySchema()), entry);
        if (e !== null) {
          F('E_SCHEMA', `tally record: ${e}`, seq);
          R.checks['chk.encoding.canonical'] = 'fail';
        } else tallies.push({ seq, rec: entry as SignedRecord<TallyBody> });
        break;
      }
      default:
        F('E_VERSION', `unknown record type ${type}`, seq, 'L');
        R.checks['chk.encoding.canonical'] = 'fail';
    }
  }

  // ---- roll commitment when the manifest carries none (QV-ADR-015)
  if (m.roll.root === undefined) {
    const rc = rollCommits[0];
    if (rc === undefined) {
      F('E_ROLL', 'manifest has no roll.root and the log has no roll-commit');
      return done();
    }
    if (rc.body.root !== rootHex || rc.body.size !== rollHex.length) {
      F('E_ROLL', 'roll-commit does not match the supplied roll');
      return done();
    }
  } else if (rollCommits.some((c) => c.body.root !== rootHex)) {
    F('E_ROLL', 'roll-commit differs from manifest roll.root');
    return done();
  }

  // ---- C2: DKG
  const need = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final'] as const;
  const mk = {} as MarkerSeqs;
  for (const n of need) {
    const x = markers.get(n);
    if (x === undefined) {
      R.checks['chk.keys.trustees'] = 'fail';
      F('E_DKG_MARKERS', `missing phase marker ${n}`);
      return done();
    }
    mk[n] = x.seq;
  }
  const adj = await adjudicateDkg({ mh: mhb, n: m.n, t: m.t, markers: mk, commits, dealings, shares, complaints });
  if (!adj.ok) {
    R.checks['chk.keys.trustees'] = 'fail';
    F(adj.error, adj.detail ?? 'DKG failed');
    return done();
  }
  const dkg: DkgOutcome = adj.value;
  for (const ev of dkg.events) F(ev.code, `trustee ${ev.who}: ${ev.detail}`, undefined, 'I');
  const fin = markers.get('dkg-final')!.body;
  if (fin.qmask !== undefined && (fin.qmask !== dkg.qmask || fin.K !== H(pointToBytes(dkg.K)))) {
    F('E_DKG_FINAL', 'coordinator dkg-final differs from recomputed Q/K', undefined, 'L');
    R.checks['chk.keys.trustees'] = 'fail';
  }
  const decrypters = new Set<number>();
  const seenKc = new Set<number>();
  for (const k of keyconfs) {
    if (!(k.seq > mk['dkg-r3-close'] && k.seq < mk['dkg-final'])) continue;
    const Yj = dkg.Y.get(k.body.j);
    if (Yj === undefined || seenKc.has(k.body.j)) continue;
    seenKc.add(k.body.j);
    if (verifyKeyconf(dkg.ctx, Yj, k.body)) decrypters.add(k.body.j);
    else F('E_DKG_KEYCONF', `trustee ${k.body.j}: key confirmation proof invalid`, k.seq, 'L');
  }
  if (decrypters.size < m.t) {
    R.checks['chk.keys.trustees'] = 'fail';
    F('E_DKG_KEYCONF', `|T|=${decrypters.size} < t=${m.t}`);
    return done();
  }
  if (R.checks['chk.keys.trustees'] !== 'fail') R.checks['chk.keys.trustees'] = 'pass';
  R.ctxPrefix = H(dkg.ctx).slice(0, 16);
  R.ctx = H(dkg.ctx);
  R.jointKey = H(pointToBytes(dkg.K));
  const p: ElectionParams = { manifest: m, mh: mhb, K: dkg.K, ctx: dkg.ctx };

  // ---- election markers (scope = ctx)
  for (const { seq, rec } of pendingCtxMarkers) {
    if (verifyMultiSig(dkg.ctx, rec, m.coordinator.keys, m.coordinator.m)) {
      if (markers.has(rec.body.name)) F('E_MARKERS', `duplicate marker ${rec.body.name}`, seq, 'L');
      else markers.set(rec.body.name, { seq, body: rec.body, rec });
    } else F('E_SIG', 'election marker lacks m valid coordinator signatures', seq, 'L');
  }
  const open = markers.get('election-open');
  const close = markers.get('election-close');
  if (open === undefined || close === undefined) {
    F('E_MARKERS', 'election-open/close marker missing; ballots cannot be windowed', undefined, 'I');
    R.checks['chk.time.window'] = 'not_run';
    return done();
  }
  if (!(mk['dkg-final'] < open.seq && open.seq < close.seq)) {
    F('E_MARKERS', 'marker order violated (dkg-final < election-open < election-close)');
    return done();
  }
  R.caveats.push('election times are unwitnessed (no witness cosignatures checked)');

  // ---- C4: ballots
  const rollSet = new Set(rollHex);
  const an = analyzeBallotLog(p, rollSet, voterEntries, open.seq, close.seq);
  R.findings.push(...an.findings);
  R.counts.cast = an.castSeen;
  R.counts.spoiled = an.spoilSeen;
  R.counts.counted = an.counted.length;
  R.checks['chk.ballots.valid'] = an.checkFailures.ballotsValid ? 'pass' : 'fail';
  R.checks['chk.ballots.latest'] = an.checkFailures.ballotsLatest ? 'pass' : 'fail';
  R.checks['chk.time.window'] = an.checkFailures.window ? 'pass' : 'fail';
  R.checks['chk.benaloh.spoiled'] = an.checkFailures.benaloh ? 'pass' : 'fail';
  if (!an.checkFailures.encoding) R.checks['chk.encoding.canonical'] = 'fail';
  const V = an.counted.length;
  R.countedBallots = an.counted.map((c) => ({ voter: c.voter, code: c.code }));

  // ---- C6/C7: tally
  if (tallies.length === 0) return done();
  const tr = tallies[0]!;
  if (tallies.length > 1) F('E_SCHEMA', 'multiple tally records; only the first is examined', tallies[1]!.seq, 'L');
  const tb = tr.rec.body;
  R.checks['chk.tally.aggregate'] = 'pass';
  R.checks['chk.tally.decrypt'] = 'pass';
  R.checks['chk.result.rules'] = 'pass';
  const failCheck = (c: CheckId, code: ErrorCode, d: string): void => {
    R.checks[c] = 'fail';
    F(code, d);
  };
  if (tb.ctx !== H(dkg.ctx)) {
    failCheck('chk.tally.aggregate', 'E_CTX', 'tally record ctx mismatch');
    return done();
  }
  if (!verifySig(dkg.ctx, 'tally', tb, tr.rec.sig) || !m.coordinator.keys.includes(tr.rec.sig.key)) {
    F('E_SIG', 'tally convenience signature invalid or not a coordinator key', tr.seq, 'I');
  }
  const floor = effectiveMinCounted(m, rollHex.length);
  if (V < floor) failCheck('chk.result.rules', 'E_BELOW_FLOOR', `${V} counted < floor ${floor}`);
  if (tb.n_counted !== V || tb.counted_root !== H(countedRoot(an.counted))) {
    failCheck('chk.tally.aggregate', 'E_COUNTED_ROOT', 'n_counted/counted_root differ from recomputation');
  }
  const aggs = V > 0 ? aggregate(p, an.counted) : new Map<string, Map<string, { A: Point; B: Point }>>();
  const shareSets = new Map<number, ShareSet>();
  let structural = tb.contests.length === m.contests.length;
  for (let ci = 0; structural && ci < m.contests.length; ci++) {
    const mc = m.contests[ci]!;
    const tc = tb.contests[ci]!;
    if (tc.id !== mc.id || tc.options.length !== mc.options.length) structural = false;
    for (let k = 0; structural && k < mc.options.length; k++) {
      const to = tc.options[k]!;
      if (to.id !== mc.options[k]!.id) {
        structural = false;
        break;
      }
      const a = aggs.get(mc.id)?.get(to.id);
      if (V > 0 && a !== undefined && (a.A.is0() || a.B.is0())) failCheck('chk.tally.aggregate', 'E_AGG_IDENTITY', `${mc.id}/${to.id}`);
      if (a === undefined || to.A !== H(pointToBytes(a.A)) || to.B !== H(pointToBytes(a.B))) {
        failCheck('chk.tally.aggregate', 'E_AGG_MISMATCH', `${mc.id}/${to.id}`);
      }
      for (const sh of to.shares) {
        const parsed = shareFromHex(sh);
        let set = shareSets.get(sh.j);
        if (set === undefined) {
          set = new Map();
          shareSets.set(sh.j, set);
        }
        if (!parsed.ok) {
          F(parsed.error, `share of trustee ${sh.j} undecodable`, undefined, 'I');
        } else if (set.has(shareKey(mc.id, to.id))) F('E_DEC_PROOF', `duplicate share from ${sh.j}`, undefined, 'I');
        else set.set(shareKey(mc.id, to.id), parsed.value);
      }
    }
  }
  if (!structural) failCheck('chk.tally.aggregate', 'E_AGG_MISMATCH', 'tally contest/option structure differs from manifest');

  let counts: Map<string, Map<string, number>> | undefined;
  if (R.checks['chk.tally.aggregate'] === 'pass' && V >= floor && V > 0) {
    const dec = decryptAggregates(p, dkg.Y, decrypters, aggs, V, shareSets);
    if (!dec.ok) failCheck('chk.tally.decrypt', dec.error, dec.detail ?? '');
    else {
      for (const j of dec.value.invalid) F('E_DEC_PROOF', `trustee ${j}: share set invalid, ignored`, undefined, 'I');
      counts = dec.value.counts;
      for (const mc of m.contests) {
        for (const o of mc.options) {
          const published = tb.contests.find((c) => c.id === mc.id)!.options.find((x) => x.id === o.id)!.T;
          if (published !== counts.get(mc.id)!.get(o.id)) failCheck('chk.tally.decrypt', 'E_DLOG_RANGE', `published T differs for ${mc.id}/${o.id}`);
        }
      }
    }
  } else if (R.checks['chk.tally.aggregate'] === 'pass' && V === 0) {
    counts = new Map(m.contests.map((c) => [c.id, new Map(c.options.map((o) => [o.id, 0]))]));
  }
  if (counts !== undefined && R.checks['chk.tally.decrypt'] === 'pass') {
    const expected = evaluateAll(m, counts, V, rollHex.length);
    if (H(jcs(expected)) !== H(jcs(tb.results))) failCheck('chk.result.rules', 'E_RESULT', 'published results differ from exact evaluation');
    else R.results = expected;
  } else if (R.checks['chk.tally.decrypt'] === 'pass') {
    R.checks['chk.result.rules'] = 'not_run';
  }

  // ---- C5: spoiled ballots listed in the tally record
  for (const sp of tb.spoiled) {
    const rec = an.spoiled.get(sp.code);
    if (rec === undefined) {
      R.checks['chk.benaloh.spoiled'] = 'fail';
      F('E_SPOIL_MISMATCH', 'tally lists a spoiled code that is not a valid spoil record', undefined, 'ALARM');
      continue;
    }
    if (sp.mode === 'reveal') {
      const rv = rec.env.reveal;
      if (rv === undefined || H(jcs(rv.selections)) !== H(jcs(sp.selections))) {
        R.checks['chk.benaloh.spoiled'] = 'fail';
        F('E_SPOIL_MISMATCH', 'published selections differ from the reveal', undefined, 'ALARM');
      }
    } else {
      const sets = new Map<number, ShareSet>();
      for (const s of sp.shares ?? []) {
        const pr = shareFromHex(s);
        if (!pr.ok) continue;
        let set = sets.get(s.j);
        if (set === undefined) sets.set(s.j, (set = new Map()));
        set.set(shareKey(s.contest, s.opt), pr.value);
      }
      const ok = m.spoil_trustee_decrypt === true && rec.env.reveal_digest === '00'.repeat(32);
      const dr = ok ? decryptSpoiled(p, dkg.Y, decrypters, { code: sp.code, body: rec.env.body }, sets) : null;
      if (dr === null || !dr.ok || H(jcs(dr.value.selections)) !== H(jcs(normalise(sp.selections, m)))) {
        R.checks['chk.benaloh.spoiled'] = 'fail';
        F('E_SPOIL_MISMATCH', 'trustee-mode spoil does not verify', undefined, 'ALARM');
      }
    }
  }
  return done();
}

function normalise(sel: Record<string, string[]>, m: Manifest): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const c of m.contests) o[c.id] = sel[c.id] ?? [];
  return o;
}
