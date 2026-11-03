import {
  QvCryptoError, bytesToHex, cdsProve, cdsVerify, ctSum, ed25519IsStrictPoint, ed25519Sign, ed25519Verify,
  elgamalEncrypt, h256, h512, hexToBytes, hsNz, jcs, limitProve, limitVerify, pointFromBytes, pointToBytes,
  scalarAdd, scalarFromBytes, scalarToBytes, u64, utf8, type Ciphertext, type Point, type Rng, type Scalar,
} from '@quietvote/crypto';
import { check, castEnvelopeSchema, spoilEnvelopeSchema } from './schema.ts';
import {
  PROTO_ID, err, ok, type BallotBody, type BallotContest, type BallotSel, type CastEnvelope, type ErrorCode, type Manifest,
  type ManifestContest, type Result, type Reveal, type SpoilEnvelope,
} from './types.ts';

const H = bytesToHex;
const ZERO32 = '00'.repeat(32);

export interface ElectionParams {
  manifest: Manifest;
  mh: Uint8Array;
  K: Point;
  ctx: Uint8Array;
}

export type Selections = Record<string, string[]>;

/** Canonical ciphertext order within a contest: real options then placeholders ~ph1..~phL (§5.9.1). */
export function contestSlots(c: ManifestContest): { oid: string; ph: boolean }[] {
  const slots = c.options.map((o) => ({ oid: o.id, ph: false }));
  const L = c.selection_limit;
  if (L !== undefined) for (let k = 1; k <= L; k++) slots.push({ oid: `~ph${k}`, ph: true });
  return slots;
}

export function binderFor(ctx: Uint8Array, voterPk: Uint8Array): Uint8Array {
  return h256('binder-roll', ctx, voterPk);
}

/** Plaintext bits per contest in canonical order; validates the selection against the contest rules. */
export function selectionBits(c: ManifestContest, selected: readonly string[]): Result<(0 | 1)[]> {
  const real = new Set(c.options.map((o) => o.id));
  const set = new Set(selected);
  if (set.size !== selected.length) return err('E_STRUCTURE', 'duplicate selection');
  for (const s of set) if (!real.has(s)) return err('E_STRUCTURE', `unknown option ${s}`);
  const L = c.selection_limit;
  if (L !== undefined && set.size > L) return err('E_STRUCTURE', 'overvote');
  const bits: (0 | 1)[] = c.options.map((o) => (set.has(o.id) ? 1 : 0));
  if (L !== undefined) for (let k = 1; k <= L; k++) bits.push(k <= L - set.size ? 1 : 0);
  return ok(bits);
}

export function selvecDigest(m: Manifest, ctx: Uint8Array, sel: Selections): Result<Uint8Array> {
  const fields: Uint8Array[] = [];
  for (const c of m.contests) {
    const b = selectionBits(c, sel[c.id] ?? []);
    if (!b.ok) return b;
    for (const x of b.value) fields.push(Uint8Array.of(x));
  }
  return ok(h256('selvec', ctx, ...fields));
}

export const voterNonceKey = (seed: Uint8Array): Uint8Array => h256('voter-nonce-key', seed);

export function deriveXi(ctx: Uint8Array, vnk: Uint8Array, rho: Uint8Array, attempt: number | bigint, selvec: Uint8Array): Uint8Array {
  return h512('ballot-seed', ctx, vnk, rho, u64(attempt), selvec);
}

export function ballotCode(ctx: Uint8Array, body: BallotBody): Uint8Array {
  return h256('ballot-code', ctx, jcs(body));
}

const hx = (p: Point): string => H(pointToBytes(p));
const sx = (s: Scalar): string => H(scalarToBytes(s));

/** Pure deterministic function of its inputs (§5.13.2 step 2): the whole ballot body is recomputable from xi. */
export function encryptBallot(p: ElectionParams, voterPk: Uint8Array, supersedes: string, sel: Selections, xi: Uint8Array): Result<BallotBody> {
  const binder = binderFor(p.ctx, voterPk);
  const contests: BallotContest[] = [];
  for (const c of p.manifest.contests) {
    const bits = selectionBits(c, sel[c.id] ?? []);
    if (!bits.ok) return bits;
    const slots = contestSlots(c);
    const cts: Ciphertext[] = [];
    const rs: Scalar[] = [];
    const items: BallotSel[] = [];
    for (let k = 0; k < slots.length; k++) {
      const { oid } = slots[k]!;
      const m = bits.value[k]!;
      const r = hsNz('enc-nonce', xi, utf8(c.id), utf8(oid));
      const ct = elgamalEncrypt(p.K, m, r);
      const pr = cdsProve({ ctx: p.ctx, binder, cid: c.id, oid, K: p.K, ct }, m, r, xi);
      cts.push(ct);
      rs.push(r);
      items.push({ opt: oid, a: hx(ct.A), b: hx(ct.B), c0: sx(pr.c0), s0: sx(pr.s0), c1: sx(pr.c1), s1: sx(pr.s1) });
    }
    const N = c.options.length;
    const bc: BallotContest = { id: c.id, sel: items.slice(0, N) };
    const L = c.selection_limit;
    if (L !== undefined) {
      bc.ph = items.slice(N);
      const sum = ctSum(cts);
      const R = rs.reduce((a, b) => scalarAdd(a, b), 0n);
      const lp = limitProve({ ctx: p.ctx, binder, cid: c.id, L, K: p.K, Asum: sum.A, Bsum: sum.B }, R, xi);
      bc.lim = { c: sx(lp.c), s: sx(lp.s) };
    }
    contests.push(bc);
  }
  return ok({ proto: PROTO_ID, type: 'ballot', ctx: H(p.ctx), voter: H(voterPk), supersedes, contests });
}

export interface BuiltBallot {
  body: BallotBody;
  code: Uint8Array;
  xi: Uint8Array;
  selections: Selections;
  voterPk: Uint8Array;
}

/** Hedged construction (§5.11): xi mixes fresh CSPRNG bytes, the voter's nonce key and the plaintext vector. */
export function buildBallot(
  p: ElectionParams,
  voterSeed: Uint8Array,
  voterPk: Uint8Array,
  supersedes: string,
  sel: Selections,
  rng: Rng,
  attempt = 0,
): Result<BuiltBallot> {
  const sv = selvecDigest(p.manifest, p.ctx, sel);
  if (!sv.ok) return sv;
  const xi = deriveXi(p.ctx, voterNonceKey(voterSeed), rng.bytes(32), attempt, sv.value);
  const body = encryptBallot(p, voterPk, supersedes, sel, xi);
  if (!body.ok) return body;
  return ok({ body: body.value, code: ballotCode(p.ctx, body.value), xi, selections: sel, voterPk });
}

export const NO_SUPERSEDES = ZERO32;

export function castDigest(ctx: Uint8Array, code: Uint8Array): Uint8Array {
  return h256('sig-cast', ctx, code);
}
export function spoilDigest(ctx: Uint8Array, code: Uint8Array, revealDigest: Uint8Array): Uint8Array {
  return h256('sig-spoil', ctx, code, revealDigest);
}
export const revealDigest = (ctx: Uint8Array, r: Reveal): Uint8Array => h256('reveal', ctx, jcs(r));

export function makeCast(p: ElectionParams, voterSk: Uint8Array, b: BuiltBallot): CastEnvelope {
  return { intent: 'cast', body: b.body, sig: H(ed25519Sign(voterSk, castDigest(p.ctx, b.code))) };
}

export type SpoilMode = 'publish' | 'private' | 'trustees';
export function makeSpoil(p: ElectionParams, voterSk: Uint8Array, b: BuiltBallot, mode: SpoilMode): SpoilEnvelope {
  const reveal: Reveal = { xi: H(b.xi), selections: b.selections };
  const rd = mode === 'trustees' ? new Uint8Array(32) : revealDigest(p.ctx, reveal);
  const env: SpoilEnvelope = {
    intent: 'spoil',
    body: b.body,
    reveal_digest: H(rd),
    sig: H(ed25519Sign(voterSk, spoilDigest(p.ctx, b.code, rd))),
  };
  if (mode === 'publish') env.reveal = reveal;
  return env;
}

// ---------------------------------------------------------------- verification

function dec(fn: () => void): ErrorCode | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof QvCryptoError) return e.code === 'E_IDENTITY' ? 'E_IDENTITY' : e.code === 'E_POINT_DECODE' ? 'E_POINT_DECODE' : 'E_SCALAR_RANGE';
    throw e;
  }
}
const P = (h: string): Point => pointFromBytes(hexToBytes(h, 32), { nonIdentity: true });
const Sc = (h: string): Scalar => scalarFromBytes(hexToBytes(h, 32));

/** §5.14.4 checks 5-9 (context-free): structure, points, scalars, CDS, limit. */
export function verifyBallotContent(p: ElectionParams, body: BallotBody): Result<true> {
  const m = p.manifest;
  const voter = hexToBytes(body.voter, 32);
  // 5 structure
  if (body.contests.length !== m.contests.length) return err('E_STRUCTURE', 'contest count');
  for (let ci = 0; ci < m.contests.length; ci++) {
    const mc = m.contests[ci]!;
    const bc = body.contests[ci]!;
    if (bc.id !== mc.id) return err('E_STRUCTURE', 'contest order');
    if (bc.sel.length !== mc.options.length || bc.sel.some((s, k) => s.opt !== mc.options[k]!.id)) return err('E_STRUCTURE', 'options');
    const L = mc.selection_limit;
    if (L === undefined) {
      if (bc.ph !== undefined || bc.lim !== undefined) return err('E_STRUCTURE', 'unexpected placeholders/limit proof');
    } else if (bc.ph === undefined || bc.lim === undefined || bc.ph.length !== L || bc.ph.some((s, k) => s.opt !== `~ph${k + 1}`)) {
      return err('E_STRUCTURE', 'placeholders/limit proof');
    }
  }
  // 6 points, 7 scalars (all first, in order)
  const all = body.contests.flatMap((c) => [...c.sel, ...(c.ph ?? [])]);
  for (const s of all) {
    const e = dec(() => {
      P(s.a);
      P(s.b);
    });
    if (e !== null) return err(e);
  }
  for (const s of all) {
    const e = dec(() => [s.c0, s.s0, s.c1, s.s1].forEach(Sc));
    if (e !== null) return err('E_SCALAR_RANGE');
  }
  for (const c of body.contests) {
    if (c.lim !== undefined) {
      const e = dec(() => [c.lim!.c, c.lim!.s].forEach(Sc));
      if (e !== null) return err('E_SCALAR_RANGE');
    }
  }
  const binder = binderFor(p.ctx, voter);
  // 8 CDS
  for (const c of body.contests) {
    for (const s of [...c.sel, ...(c.ph ?? [])]) {
      const ok8 = cdsVerify(
        { ctx: p.ctx, binder, cid: c.id, oid: s.opt, K: p.K, ct: { A: P(s.a), B: P(s.b) } },
        { c0: Sc(s.c0), s0: Sc(s.s0), c1: Sc(s.c1), s1: Sc(s.s1) },
      );
      if (!ok8) return err('E_CDS', `${c.id}/${s.opt}`);
    }
  }
  // 9 limit
  for (let ci = 0; ci < m.contests.length; ci++) {
    const L = m.contests[ci]!.selection_limit;
    const c = body.contests[ci]!;
    if (L === undefined) continue;
    const sum = ctSum([...c.sel, ...c.ph!].map((s) => ({ A: P(s.a), B: P(s.b) })));
    const okL = limitVerify(
      { ctx: p.ctx, binder, cid: c.id, L, K: p.K, Asum: sum.A, Bsum: sum.B },
      { c: Sc(c.lim!.c), s: Sc(c.lim!.s) },
    );
    if (!okL) return err('E_LIMIT_PROOF', c.id);
  }
  return ok(true);
}

export interface VerifiedEnvelope {
  intent: 'cast' | 'spoil';
  voter: string;
  code: Uint8Array;
  env: CastEnvelope | SpoilEnvelope;
}

/** §5.14.4 checks 1-9 for a cast or spoil envelope. `roll` is the set of hex voter keys. */
export function verifyEnvelope(p: ElectionParams, roll: ReadonlySet<string>, raw: unknown): Result<VerifiedEnvelope> {
  const intent = (raw as { intent?: unknown } | null)?.intent;
  const proto = (raw as { body?: { proto?: unknown } } | null)?.body?.proto;
  if (typeof proto === 'string' && proto !== PROTO_ID) return err('E_VERSION');
  const schemaErr =
    intent === 'cast' ? check(castEnvelopeSchema(), raw) : intent === 'spoil' ? check(spoilEnvelopeSchema(), raw) : 'intent';
  if (schemaErr !== null) return err('E_SCHEMA', schemaErr);
  const env = raw as CastEnvelope | SpoilEnvelope;
  const body = env.body;
  if (body.ctx !== H(p.ctx)) return err('E_CTX');
  const voter = hexToBytes(body.voter, 32);
  if (!roll.has(body.voter) || !ed25519IsStrictPoint(voter)) return err('E_VOTER_NOT_ELIGIBLE');
  const code = ballotCode(p.ctx, body);
  const digest =
    env.intent === 'cast' ? castDigest(p.ctx, code) : spoilDigest(p.ctx, code, hexToBytes(env.reveal_digest, 32));
  if (!ed25519Verify(voter, hexToBytes(env.sig, 64), digest)) return err('E_SIG');
  if (env.intent === 'spoil' && env.reveal !== undefined && env.reveal_digest !== H(revealDigest(p.ctx, env.reveal))) {
    return err('E_SPOIL_MISMATCH', 'reveal_digest does not match reveal');
  }
  const c = verifyBallotContent(p, body);
  if (!c.ok) return c;
  return ok({ intent: env.intent, voter: body.voter, code, env });
}

/** §5.13.2: recompute a spoiled ballot from a revealed xi and compare byte for byte. */
export function verifySpoilReveal(p: ElectionParams, body: BallotBody, reveal: Reveal): Result<true> {
  try {
    const re = encryptBallot(p, hexToBytes(body.voter, 32), body.supersedes, reveal.selections, hexToBytes(reveal.xi, 64));
    if (!re.ok) return err('E_SPOIL_MISMATCH', re.detail ?? 'selections invalid');
    return H(jcs(re.value)) === H(jcs(body)) ? ok(true) : err('E_SPOIL_MISMATCH', 'recomputed ballot differs');
  } catch (e) {
    if (e instanceof QvCryptoError) return err('E_SPOIL_MISMATCH', e.code);
    throw e;
  }
}

