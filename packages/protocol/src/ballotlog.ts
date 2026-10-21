import { bytesToHex, concatBytes, hexToBytes, pointFromBytes, pointSum, type Point } from '@quietvote/crypto';
import { verifyEnvelope, verifySpoilReveal, NO_SUPERSEDES, type ElectionParams } from './ballot.ts';
import { leafHash, mth } from './merkle.ts';
import type { CastEnvelope, ErrorCode, SpoilEnvelope } from './types.ts';

export type FindingClass = 'F' | 'L' | 'ALARM' | 'I';
export interface Finding {
  code: ErrorCode;
  cls: FindingClass;
  seq?: number;
  detail: string;
}

export interface CountedBallot {
  seq: number;
  voter: string;
  code: string;
  env: CastEnvelope;
}
export interface SpoilRecord {
  seq: number;
  code: string;
  voter: string;
  env: SpoilEnvelope;
}

export interface BallotAnalysis {
  counted: CountedBallot[]; // sorted by voter key
  spoiled: Map<string, SpoilRecord>;
  findings: Finding[];
  castSeen: number;
  spoilSeen: number;
  checkFailures: { ballotsValid: boolean; ballotsLatest: boolean; window: boolean; benaloh: boolean; encoding: boolean };
}

const H = bytesToHex;

/** Applies §5.14.2 / §5.14.4 to every voter envelope in log order. Pure. */
export function analyzeBallotLog(
  p: ElectionParams,
  roll: ReadonlySet<string>,
  entries: readonly { seq: number; raw: unknown }[],
  open: number,
  close: number,
): BallotAnalysis {
  const findings: Finding[] = [];
  const cf = { ballotsValid: true, ballotsLatest: true, window: true, benaloh: true, encoding: true };
  const add = (code: ErrorCode, seq: number, detail: string, cls: FindingClass = 'L'): void => {
    findings.push({ code, cls, seq, detail });
  };
  const spoiled = new Map<string, SpoilRecord>();
  const casts: { seq: number; v: { voter: string; code: Uint8Array; env: CastEnvelope } }[] = [];
  const spoilsPerVoter = new Map<string, number>();
  let castSeen = 0;
  let spoilSeen = 0;

  for (const { seq, raw } of entries) {
    const r = verifyEnvelope(p, roll, raw);
    const intent = (raw as { intent?: string } | null)?.intent;
    if (intent === 'cast') castSeen++;
    else if (intent === 'spoil') spoilSeen++;
    if (!r.ok) {
      if (r.error === 'E_SCHEMA' || r.error === 'E_PARSE' || r.error === 'E_VERSION') cf.encoding = false;
      if (r.error === 'E_SPOIL_MISMATCH') cf.benaloh = false;
      else cf.ballotsValid = false;
      add(r.error, seq, r.detail ?? 'envelope invalid', r.error === 'E_SPOIL_MISMATCH' ? 'ALARM' : 'L');
      continue;
    }
    if (!(seq > open && seq < close)) {
      cf.window = false;
      add('E_TIME_WINDOW', seq, 'outside open/close markers');
      continue;
    }
    const code = H(r.value.code);
    if (r.value.env.intent === 'spoil') {
      const env = r.value.env;
      const n = (spoilsPerVoter.get(r.value.voter) ?? 0) + 1;
      spoilsPerVoter.set(r.value.voter, n);
      if (n > p.manifest.ballots.max_spoils_per_voter) {
        add('E_REVOTE_LIMIT', seq, 'max_spoils_per_voter exceeded');
        continue;
      }
      if (env.reveal !== undefined) {
        const v = verifySpoilReveal(p, env.body, env.reveal);
        if (!v.ok) {
          cf.benaloh = false;
          add('E_SPOIL_MISMATCH', seq, v.detail ?? 'reveal does not reproduce ballot', 'ALARM');
        }
      }
      if (!spoiled.has(code)) spoiled.set(code, { seq, code, voter: r.value.voter, env });
    } else {
      casts.push({ seq, v: { voter: r.value.voter, code: r.value.code, env: r.value.env } });
    }
  }

  const last = new Map<string, CountedBallot>();
  const admissibleCount = new Map<string, number>();
  const codeOwner = new Map<string, string>();
  for (const { seq, v } of casts) {
    const code = H(v.code);
    const prev = last.get(v.voter);
    const expected = prev?.code ?? NO_SUPERSEDES;
    if (v.env.body.supersedes !== expected) {
      cf.ballotsLatest = false;
      add('E_SUPERSEDES', seq, 'supersedes chain violated');
      continue;
    }
    if ((admissibleCount.get(v.voter) ?? 0) + 1 > p.manifest.ballots.max_per_voter) {
      cf.ballotsLatest = false;
      add('E_REVOTE_LIMIT', seq, 'max_per_voter exceeded');
      continue;
    }
    const owner = codeOwner.get(code);
    if (owner !== undefined && owner !== v.voter) {
      add('E_DUP_CODE', seq, 'ballot code already used by another voter');
      continue;
    }
    if (spoiled.has(code)) {
      cf.benaloh = false;
      add('E_SPOILED_CODE_CAST', seq, 'ballot code was spoiled; excluded', 'ALARM');
      continue;
    }
    codeOwner.set(code, v.voter);
    admissibleCount.set(v.voter, (admissibleCount.get(v.voter) ?? 0) + 1);
    last.set(v.voter, { seq, voter: v.voter, code, env: v.env });
  }
  const counted = [...last.values()].sort((a, b) => (a.voter < b.voter ? -1 : 1));
  return { counted, spoiled, findings, castSeen, spoilSeen, checkFailures: cf };
}

/** counted_root: RFC 9162 root over ballot_code(32) || voter_pk(32), sorted by voter_pk. */
export function countedRoot(counted: readonly CountedBallot[]): Uint8Array {
  const sorted = [...counted].sort((a, b) => (a.voter < b.voter ? -1 : 1));
  return mth(sorted.map((c) => leafHash(concatBytes(hexToBytes(c.code, 32), hexToBytes(c.voter, 32)))));
}

export interface Aggregate {
  A: Point;
  B: Point;
}

/** §5.15: per contest, per real option, sums of alpha and beta over the counted ballots (placeholders excluded). */
export function aggregate(p: ElectionParams, counted: readonly CountedBallot[]): Map<string, Map<string, Aggregate>> {
  const out = new Map<string, Map<string, Aggregate>>();
  for (const c of p.manifest.contests) {
    const m = new Map<string, Aggregate>();
    for (let k = 0; k < c.options.length; k++) {
      const As: Point[] = [];
      const Bs: Point[] = [];
      for (const b of counted) {
        const bc = b.env.body.contests.find((x) => x.id === c.id)!;
        const s = bc.sel[k]!;
        As.push(pointFromBytes(hexToBytes(s.a, 32)));
        Bs.push(pointFromBytes(hexToBytes(s.b, 32)));
      }
      m.set(c.options[k]!.id, { A: pointSum(As), B: pointSum(Bs) });
    }
    out.set(c.id, m);
  }
  return out;
}
