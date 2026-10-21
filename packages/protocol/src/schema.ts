import { isHex } from '@quietvote/crypto';

/** Minimal closed-schema validator (QV-16 §5.5 item 7: unknown fields are an error). */
export type Schema =
  | { t: 'hex'; len: number }
  | { t: 'int'; min: number; max: number }
  | { t: 'str'; max: number; re?: RegExp }
  | { t: 'bool' }
  | { t: 'lit'; v: string | number | boolean }
  | { t: 'enum'; vs: readonly string[] }
  | { t: 'arr'; item: Schema; min: number; max: number }
  | { t: 'obj'; req: Record<string, Schema>; opt?: Record<string, Schema> }
  | { t: 'map'; item: Schema; maxKeys: number; keyRe: RegExp };

export const hex = (len: number): Schema => ({ t: 'hex', len });
export const int = (min: number, max: number): Schema => ({ t: 'int', min, max });
export const str = (max: number, re?: RegExp): Schema => (re === undefined ? { t: 'str', max } : { t: 'str', max, re });
export const bool: Schema = { t: 'bool' };
export const lit = (v: string | number | boolean): Schema => ({ t: 'lit', v });
export const oneOf = (...vs: string[]): Schema => ({ t: 'enum', vs });
export const arr = (item: Schema, min: number, max: number): Schema => ({ t: 'arr', item, min, max });
export const obj = (req: Record<string, Schema>, opt: Record<string, Schema> = {}): Schema => ({ t: 'obj', req, opt });

export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const OPT_ID_RE = /^(?:[a-z0-9][a-z0-9_-]{0,63}|~ph[1-9][0-9]{0,2})$/;
export const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const PROTO = 'qv1-r255-sha2';

/** Returns null if valid, else a path string describing the first violation. */
export function check(s: Schema, v: unknown, path = '$'): string | null {
  switch (s.t) {
    case 'hex':
      return isHex(v, s.len) ? null : `${path}: expected ${s.len}-byte lowercase hex`;
    case 'int':
      return typeof v === 'number' && Number.isSafeInteger(v) && v >= s.min && v <= s.max ? null : `${path}: integer out of range`;
    case 'str':
      return typeof v === 'string' && v.length <= s.max && (s.re === undefined || s.re.test(v)) ? null : `${path}: bad string`;
    case 'bool':
      return typeof v === 'boolean' ? null : `${path}: expected boolean`;
    case 'lit':
      return v === s.v ? null : `${path}: expected literal ${String(s.v)}`;
    case 'enum':
      return typeof v === 'string' && s.vs.includes(v) ? null : `${path}: not in enum`;
    case 'arr': {
      if (!Array.isArray(v) || v.length < s.min || v.length > s.max) return `${path}: bad array`;
      for (let i = 0; i < v.length; i++) {
        const e = check(s.item, v[i], `${path}[${i}]`);
        if (e !== null) return e;
      }
      return null;
    }
    case 'map': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return `${path}: expected object`;
      const ks = Object.keys(v);
      if (ks.length > s.maxKeys) return `${path}: too many keys`;
      for (const k of ks) {
        if (!s.keyRe.test(k)) return `${path}.${k}: bad key`;
        const e = check(s.item, (v as Record<string, unknown>)[k], `${path}.${k}`);
        if (e !== null) return e;
      }
      return null;
    }
    case 'obj': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return `${path}: expected object`;
      const o = v as Record<string, unknown>;
      const opt = s.opt ?? {};
      for (const k of Object.keys(o)) if (!(k in s.req) && !(k in opt)) return `${path}.${k}: unknown field`;
      for (const [k, sub] of Object.entries(s.req)) {
        if (!(k in o)) return `${path}.${k}: missing`;
        const e = check(sub, o[k], `${path}.${k}`);
        if (e !== null) return e;
      }
      for (const [k, sub] of Object.entries(opt)) {
        if (k in o) {
          const e = check(sub, o[k], `${path}.${k}`);
          if (e !== null) return e;
        }
      }
      return null;
    }
  }
}

const proto = lit(PROTO);
const sigS = obj({ key: hex(32), sig: hex(64) });

export const recordBase = { proto, type: str(32) };

function rec(type: string, fields: Record<string, Schema>, opt: Record<string, Schema> = {}): Schema {
  return obj({ proto, type: lit(type), ...fields }, opt);
}

const compactProof = { c: hex(32), s: hex(32) };

export const S = {
  sig: sigS,
  signed: (body: Schema): Schema => obj({ body, sig: sigS }),
  multiSigned: (body: Schema): Schema => obj({ body, sigs: arr(sigS, 1, 8) }),
  marker: rec(
    'marker',
    { name: oneOf('dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final', 'election-open', 'election-close') },
    { qmask: int(1, 0xffffffff), K: hex(32) },
  ),
  rollCommit: rec('roll-commit', { root: hex(32), size: int(1, 1 << 20) }),
  dkgCommit: rec('dkg-commit', { i: int(1, 32), h: hex(32) }),
  dkgDealing: (t: number): Schema =>
    rec('dkg-dealing', {
      i: int(1, 32),
      enc: obj({ E: hex(32), ...compactProof }),
      coeffs: arr(obj({ A: hex(32), ...compactProof }), t, t),
    }),
  dkgShares: rec('dkg-shares', {
    i: int(1, 32),
    shares: arr(obj({ j: int(1, 32), R: hex(32), ct: hex(32), tag: hex(16) }), 0, 31),
  }),
  dkgComplaint: rec('dkg-complaint', { accuser: int(1, 32), accused: int(1, 32), S: hex(32), ...compactProof }),
  dkgKeyconf: rec('dkg-keyconf', { j: int(1, 32), ...compactProof }),
  cdsSel: obj({ opt: str(66, OPT_ID_RE), a: hex(32), b: hex(32), c0: hex(32), s0: hex(32), c1: hex(32), s1: hex(32) }),
  reveal: obj({ xi: hex(64), selections: { t: 'map', item: arr(str(64, ID_RE), 0, 255), maxKeys: 64, keyRe: ID_RE } }),
  spoilEnvelopeExtra: { reveal_digest: hex(32) },
};

export function ballotBodySchema(): Schema {
  const sel = S.cdsSel;
  return obj({
    proto,
    type: lit('ballot'),
    ctx: hex(32),
    voter: hex(32),
    supersedes: hex(32),
    contests: arr(
      obj({ id: str(64, ID_RE), sel: arr(sel, 1, 255) }, { ph: arr(sel, 1, 255), lim: obj(compactProof) }),
      1,
      64,
    ),
  });
}

export function castEnvelopeSchema(): Schema {
  return obj({ intent: lit('cast'), body: ballotBodySchema(), sig: hex(64) });
}
export function spoilEnvelopeSchema(): Schema {
  return obj({ intent: lit('spoil'), body: ballotBodySchema(), reveal_digest: hex(32), sig: hex(64) }, { reveal: S.reveal });
}

export function tallySchema(): Schema {
  const share = obj({ j: int(1, 32), M: hex(32), ...compactProof });
  const spoilShare = obj({ contest: str(64, ID_RE), opt: str(64, ID_RE), j: int(1, 32), M: hex(32), ...compactProof });
  const selections: Schema = { t: 'map', item: arr(str(64, ID_RE), 0, 255), maxKeys: 64, keyRe: ID_RE };
  const outcome = obj(
    { kind: oneOf('passed', 'rejected', 'no-quorum', 'tie', 'winners') },
    { winners: arr(str(64, ID_RE), 0, 255), tied: arr(str(64, ID_RE), 0, 255), reason: str(64) },
  );
  return rec('tally', {
    ctx: hex(32),
    n_counted: int(0, 1 << 20),
    counted_root: hex(32),
    decrypters: arr(int(1, 32), 0, 32),
    contests: arr(
      obj({
        id: str(64, ID_RE),
        options: arr(
          obj({ id: str(64, ID_RE), A: hex(32), B: hex(32), shares: arr(share, 0, 32), T: int(0, 1 << 20) }),
          1,
          255,
        ),
      }),
      1,
      64,
    ),
    spoiled: arr(
      obj({ code: hex(32), mode: oneOf('reveal', 'trustees'), selections }, { shares: arr(spoilShare, 0, 8192) }),
      0,
      4096,
    ),
    results: arr(
      obj({ contest: str(64, ID_RE), participation: int(0, 1 << 20), quorum_met: bool, outcome }),
      1,
      64,
    ),
  });
}

export function manifestSchema(): Schema {
  const opt = obj({ id: str(64, ID_RE), label: str(256) });
  const contest = obj(
    {
      id: str(64, ID_RE),
      title: str(256),
      method: oneOf('yes-no', 'single-choice', 'approval', 'k-of-n'),
      options: arr(opt, 1, 255),
      min_selections: int(0, 0),
      tie_break: obj(
        { type: oneOf('status-quo', 'declare-tie', 'lexicographic', 'beacon') },
        { option: str(64, ID_RE) },
      ),
    },
    {
      selection_limit: int(1, 254),
      winners: int(1, 254),
      rule: obj({ type: lit('threshold'), num: int(0, 1 << 30), den: int(1, 1 << 30), basis: oneOf('yes+no', 'counted'), strict: bool }),
    },
  );
  return obj(
    {
      proto,
      type: lit('manifest'),
      election_id: hex(16),
      title: str(256),
      created: str(20, TS_RE),
      voting_open: str(20, TS_RE),
      voting_close: str(20, TS_RE),
      clock_skew_s: int(0, 86400),
      contests: arr(contest, 1, 64),
      roll: obj({ scheme: lit('ed25519-roll-v1'), weights: lit('uniform') }, { root: hex(32), size: int(1, 1 << 20) }),
      trustees: arr(obj({ index: int(1, 32), name: str(64), sign_pk: hex(32) }), 1, 32),
      n: int(1, 32),
      t: int(1, 32),
      coordinator: obj({ keys: arr(hex(32), 1, 8), m: int(1, 8) }),
      ballots: obj({ max_per_voter: int(1, 1000), max_spoils_per_voter: int(0, 1000) }),
      bb: obj({ log_id: hex(32), log_pk: hex(32), witness_quorum: int(0, 32) }),
    },
    {
      quorum: obj(
        { type: oneOf('fraction', 'count') },
        { basis: oneOf('roll'), num: int(0, 1 << 30), den: int(1, 1 << 30), value: int(0, 1 << 20) },
      ),
      min_counted_ballots: int(3, 1 << 20),
      privacy_ack: bool,
      spoil_trustee_decrypt: bool,
    },
  );
}
