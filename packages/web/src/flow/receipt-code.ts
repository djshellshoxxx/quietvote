// SPDX-License-Identifier: AGPL-3.0-or-later
// QV-10-REQ-010: a public ballot code needs no key, choices or saved receipt file.
import { checkEntry, hashLeaf } from '@quietvote/board';
import { bytesToHex, ed25519Verify, hexToBytes } from '@quietvote/crypto';
import { ballotCode, castDigest, type BallotBody } from '@quietvote/protocol';
import type { ApiClient } from '../api/client.ts';
import type { PinnedHead } from '../key/storage.ts';
import { crockfordDecode, crockfordEncode, crockfordNormalize } from '../util/crockford.ts';
import { b64uDecode, b64uEncode } from '../util/hex.ts';
import { entryRecord } from './entries.ts';
import { BoardIntegrityError, checkInclusion, type InclusionState } from './receipt.ts';

type CodeQuery = { kind: 'hex' | 'prefix'; value: string };
export interface CodeCandidate { seq: number; code: string }
export type CodeMatch = { state: 'invalid-code' | 'not-found' | 'ambiguous' } | { state: 'matched'; match: CodeCandidate };

/** Full 256-bit hex/Crockford, or exactly the displayed 28-symbol (140-bit) prefix. */
export function parseBallotCodeInput(input: string): CodeQuery | undefined {
  if (input.length > 256) return undefined;
  const text = input.trim();
  if (/^[0-9a-f]{64}$/i.test(text)) return { kind: 'hex', value: text.toLowerCase() };
  const normalized = crockfordNormalize(text);
  if (normalized?.length === 28) return { kind: 'prefix', value: normalized };
  if (normalized?.length === 52) {
    const bytes = crockfordDecode(normalized, 32);
    if (bytes) return { kind: 'hex', value: bytesToHex(bytes) };
  }
  return undefined;
}

/** Separated from signature checking so ambiguity is testable without manufacturing a hash collision. */
export function matchBallotCode(input: string, candidates: readonly CodeCandidate[]): CodeMatch {
  const query = parseBallotCodeInput(input);
  if (!query) return { state: 'invalid-code' };
  const matches = candidates.filter((c) => query.kind === 'hex' ? c.code === query.value : crockfordEncode(hexToBytes(c.code, 32)).startsWith(query.value));
  if (matches.length === 0) return { state: 'not-found' };
  if (matches.length !== 1) return { state: 'ambiguous' };
  return { state: 'matched', match: matches[0]! };
}

/** Only voter-signed cast envelopes in this election's cryptographic context qualify. */
function castCode(record: unknown, ctx: Uint8Array): { code: string; voter: Uint8Array } | undefined {
  try {
    const r = record as { intent?: unknown; body?: BallotBody; sig?: unknown } | null;
    if (!r || r.intent !== 'cast' || !r.body || r.body.ctx !== bytesToHex(ctx)
      || !/^[0-9a-f]{64}$/.test(r.body.voter) || typeof r.sig !== 'string' || !/^[0-9a-f]{128}$/.test(r.sig)) return undefined;
    const code = ballotCode(ctx, r.body);
    const voter = hexToBytes(r.body.voter, 32);
    if (!ed25519Verify(voter, hexToBytes(r.sig, 64), castDigest(ctx, code))) return undefined;
    return { code: bytesToHex(code), voter };
  } catch {
    return undefined;
  }
}

export function findBallotCode(input: string, records: readonly { seq: number; record: unknown }[], ctx: Uint8Array): CodeMatch {
  if (!parseBallotCodeInput(input)) return { state: 'invalid-code' };
  const candidates: CodeCandidate[] = [];
  for (const row of records) {
    const cast = castCode(row.record, ctx);
    if (cast && Number.isSafeInteger(row.seq) && row.seq >= 0) candidates.push({ seq: row.seq, code: cast.code });
  }
  return matchBallotCode(input, candidates);
}

export type CodeLookup = Exclude<CodeMatch, { state: 'matched' }> | (Extract<InclusionState, { state: 'included' }> & { code: string });

interface ReceiptCodeEnvironment {
  api: ApiClient; apiElectionId: string; ctx: Uint8Array; logPk: Uint8Array;
  expectedOrigin: string; pinned: PinnedHead | undefined;
}

/** Bind a saved receipt or locally matched code to the exact fetched, voter-signed entry before inclusion. */
export async function checkBallotCodeEntry(a: ReceiptCodeEnvironment & {
  seq: number; code: string; expectedLeaf?: Uint8Array;
}): Promise<InclusionState> {
  if (!Number.isSafeInteger(a.seq) || a.seq < 0 || !/^[0-9a-f]{64}$/.test(a.code)) {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'ballot receipt metadata is malformed');
  }
  const entry = await a.api.entry(a.apiElectionId, a.seq);
  if (!entry || typeof entry !== 'object' || typeof entry.header_b64u !== 'string'
    || typeof entry.body_b64u !== 'string' || typeof entry.leaf_hash !== 'string') {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'matching ballot entry is malformed or redacted');
  }
  const cast = castCode(entryRecord(entry), a.ctx);
  const header = b64uDecode(entry.header_b64u);
  const body = b64uDecode(entry.body_b64u);
  if (entry.seq !== a.seq || !cast || cast.code !== a.code || !header || !body) {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'matching ballot entry changed or is malformed');
  }
  const checked = checkEntry(header, body, a.expectedOrigin, () => cast.voter, entry.seq);
  const leaf = hashLeaf(header);
  if (!checked.ok || checked.value.type !== 'ballot' || b64uEncode(leaf) !== entry.leaf_hash
    || (a.expectedLeaf !== undefined && b64uEncode(leaf) !== b64uEncode(a.expectedLeaf))) {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'ballot entry header does not authenticate its body and origin');
  }
  return checkInclusion({ ...a, leafHash: leaf });
}

/** Search signature-checked public records, then verify the matching exact entry and its Merkle proofs. */
export async function lookupBallotCode(a: ReceiptCodeEnvironment & { input: string }): Promise<CodeLookup> {
  if (!parseBallotCodeInput(a.input)) return { state: 'invalid-code' };
  const entries = await a.api.allEntries(a.apiElectionId);
  const found = findBallotCode(a.input, entries.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) })), a.ctx);
  if (found.state !== 'matched') return found;
  const inclusion = await checkBallotCodeEntry({ ...a, seq: found.match.seq, code: found.match.code });
  return inclusion.state === 'included' ? { ...inclusion, code: found.match.code } : inclusion;
}
