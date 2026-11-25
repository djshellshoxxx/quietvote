// Receipt standing: is a saved receipt still the voter's newest ballot, or did a later ballot replace it (a revote)?
// Pure and derived only from the public log (QV-16 §5.14: a voter's ballots form a `supersedes` chain; the newest admissible
// one is counted). Nothing here needs the voter's key or any secret: the receipt names an entry and a ballot code, and the
// envelopes in the log carry the voter's public key and signature.
import { bytesToHex, ed25519Verify, hexToBytes } from '@quietvote/crypto';
import { NO_SUPERSEDES, ballotCode, castDigest, spoilDigest, type BallotBody } from '@quietvote/protocol';

export type ReceiptStanding =
  | { state: 'current' }
  | { state: 'superseded'; bySeq: number; byCode: string }
  /** The entry is not in the records we hold (yet), so nothing can be said. */
  | { state: 'unknown' }
  /** The entry exists but is not the ballot the receipt names (or its signature fails): never show "current" for it. */
  | { state: 'mismatch' };

type Rec = { seq: number; record: unknown };

interface CastRow {
  seq: number;
  voter: string;
  supersedes: string;
  code: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const isBody = (b: unknown): b is BallotBody => {
  const o = b as Partial<BallotBody> | null;
  return typeof o === 'object' && o !== null && typeof o.voter === 'string' && HEX64.test(o.voter) && typeof o.supersedes === 'string' && HEX64.test(o.supersedes) && typeof o.ctx === 'string';
};

function sigOk(pkHex: string, sigHex: unknown, digest: Uint8Array): boolean {
  try {
    return typeof sigHex === 'string' && /^[0-9a-f]{128}$/.test(sigHex) && ed25519Verify(hexToBytes(pkHex, 32), hexToBytes(sigHex, 64), digest);
  } catch {
    return false;
  }
}

/** What decides which ballots can count. Read at query time, so a close marker that arrives later is honoured. */
export interface StandingWindow {
  /** Voting window: only entries strictly between the open and close markers can count. */
  openSeq?: number | undefined;
  closeSeq?: number | undefined;
  /** Manifest `ballots.max_per_voter`; a ballot beyond it is not admissible and replaces nothing. */
  maxPerVoter?: number | undefined;
}

/**
 * Incremental index of the signature-checked cast and spoil envelopes in the log. `update` verifies only records it has not seen,
 * so a live page that grows the log entry by entry never re-verifies old ballots.
 */
export class BallotIndex {
  private readonly ctx: Uint8Array;
  private readonly ctxHex: string;
  private casts: CastRow[] = [];
  private spoiled = new Set<string>();
  private upTo = -1;

  constructor(ctx: Uint8Array) {
    this.ctx = ctx;
    this.ctxHex = bytesToHex(ctx);
  }

  /** Highest entry number indexed so far (-1 when none). */
  get indexedUpTo(): number {
    return this.upTo;
  }

  update(records: readonly Rec[]): void {
    const fresh = records.filter((r) => r.seq > this.upTo).sort((a, b) => a.seq - b.seq);
    for (const { seq, record } of fresh) {
      this.upTo = seq;
      const r = record as { intent?: unknown; body?: unknown; sig?: unknown; reveal_digest?: unknown } | undefined | null;
      if (r === undefined || r === null || typeof r !== 'object' || (r.intent !== 'cast' && r.intent !== 'spoil') || !isBody(r.body) || r.body.ctx !== this.ctxHex) continue;
      let code: Uint8Array;
      try {
        code = ballotCode(this.ctx, r.body);
      } catch {
        continue;
      }
      if (r.intent === 'cast') {
        if (sigOk(r.body.voter, r.sig, castDigest(this.ctx, code))) this.casts.push({ seq, voter: r.body.voter, supersedes: r.body.supersedes, code: bytesToHex(code) });
      } else if (typeof r.reveal_digest === 'string' && HEX64.test(r.reveal_digest) && sigOk(r.body.voter, r.sig, spoilDigest(this.ctx, code, hexToBytes(r.reveal_digest, 32)))) {
        this.spoiled.add(bytesToHex(code));
      }
    }
  }

  /**
   * @param seq     entry number named by the receipt
   * @param codeHex ballot code (hex) named by the receipt
   */
  standing(seq: number, codeHex: string, w: StandingWindow = {}): ReceiptStanding {
    if (seq > this.upTo) return { state: 'unknown' };
    const inWindow = (x: CastRow): boolean => (w.openSeq === undefined || x.seq > w.openSeq) && (w.closeSeq === undefined || x.seq < w.closeSeq);
    const mine = this.casts.find((x) => x.seq === seq);
    if (mine === undefined || mine.code !== codeHex) return { state: 'mismatch' };
    // Walk the voter's chain exactly as the verifier does: the first admissible ballot that names the previous code is the next link.
    const chain: CastRow[] = [];
    let prev = NO_SUPERSEDES;
    for (const x of this.casts) {
      if (x.voter !== mine.voter || !inWindow(x) || x.supersedes !== prev || this.spoiled.has(x.code)) continue;
      if (w.maxPerVoter !== undefined && chain.length + 1 > w.maxPerVoter) break;
      chain.push(x);
      prev = x.code;
    }
    const pos = chain.findIndex((x) => x.seq === mine.seq);
    if (pos < 0) return { state: 'mismatch' }; // the receipt's ballot never joined the voter's chain
    const next = chain[pos + 1];
    return next === undefined ? { state: 'current' } : { state: 'superseded', bySeq: next.seq, byCode: next.code };
  }
}

/** One-shot convenience: index `records` and answer for one receipt. */
export function receiptStanding(records: readonly Rec[], ctx: Uint8Array, seq: number, codeHex: string, w: StandingWindow = {}): ReceiptStanding {
  const idx = new BallotIndex(ctx);
  idx.update(records);
  return idx.standing(seq, codeHex, w);
}
