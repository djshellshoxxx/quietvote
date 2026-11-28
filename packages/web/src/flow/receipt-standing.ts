// SPDX-License-Identifier: AGPL-3.0-or-later
// Qualified standing is about one independently pinned, complete tally snapshot. Inclusion remains a separate check.
import { parseCheckpoint, verifyLogSignature, witnessStatus } from '@quietvote/board';
import { bytesToHex, hexToBytes, parseQvJson, utf8 } from '@quietvote/crypto';
import {
  ballotCode, validateExtraAuthorKeys, verifyElection, verifyLogStructure, witnessAnchors,
  type CheckId, type CooperativeVerification, type ElectionBundle, type VerificationReport, type VoterEnvelope,
} from '@quietvote/protocol';
import { MAX_RECEIPT_BUNDLE_BYTES } from '../api/receipt-bundle.ts';
import type { PinnedHead } from '../key/storage.ts';

/** Same strict evidence profile as the accepted offline ballot-status command; sampled receipts are optional. */
export const RECEIPT_STANDING_CHECKS: readonly CheckId[] = [
  'chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees', 'chk.board.append_only', 'chk.board.witness',
  'chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules',
  'chk.benaloh.spoiled', 'chk.encoding.canonical', 'chk.time.window',
];

export type StandingReason = 'anchor' | 'anchor-mismatch' | 'unavailable' | 'failed' | 'incomplete' | 'snapshot' | 'witness' | 'controls' | 'ballot';
export interface StandingSnapshot { origin: string; size: number; root: string; manifestHash: string }
interface StandingScope { freshnessVerified: false; finalityVerified: false }
export type CheckedReceiptStanding = StandingScope & (
  | { state: 'unverified'; reason: StandingReason }
  | { state: 'counted' | 'excluded'; snapshot: StandingSnapshot; caveats: readonly string[] }
  | { state: 'superseded'; bySeq: number; byCode: string; snapshot: StandingSnapshot; caveats: readonly string[] }
);
export function unverifiedStanding(reason: StandingReason): CheckedReceiptStanding {
  return { state: 'unverified', reason, freshnessVerified: false, finalityVerified: false };
}

export function standingManifestHash(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(value) ? value : undefined;
}

/** A protocol PASS alone can coexist with failed checks or ALARM findings. */
export function receiptStandingEvidence(report: Pick<VerificationReport, 'verdict' | 'checks' | 'findings' | 'ctx' | 'countedBallots'>): 'pass' | 'failed' | 'incomplete' {
  if (report.verdict === 'FAIL' || Object.values(report.checks).includes('fail') || report.findings.some((f) => f.cls === 'F' || f.cls === 'ALARM')) return 'failed';
  if (report.verdict !== 'PASS' || RECEIPT_STANDING_CHECKS.some((id) => report.checks[id] !== 'pass') || report.ctx === undefined || report.countedBallots === undefined) return 'incomplete';
  return 'pass';
}

interface BallotRecord { seq: number; code: string; env: VoterEnvelope }

/** Only called after every evidence gate. A different final code alone never proves replacement. */
function classify(records: readonly BallotRecord[], report: VerificationReport, seq: number, code: string, snapshot: StandingSnapshot): CheckedReceiptStanding {
  const scope = { freshnessVerified: false, finalityVerified: false, snapshot, caveats: [...report.caveats] } as const;
  const ignored = new Set(report.findings.filter((f) => f.cls === 'L' && f.seq !== undefined).map((f) => f.seq));
  const target = records.find((record) => record.seq === seq && record.code === code && record.env.intent === 'cast');
  if (target === undefined) return unverifiedStanding('ballot');
  if (ignored.has(seq)) return { ...scope, state: 'excluded' };
  const final = report.countedBallots!.find((ballot) => ballot.voter === target.env.body.voter);
  if (final?.code === code) return { ...scope, state: 'counted' };
  const casts = new Map(records.filter((record) => record.env.intent === 'cast' && record.env.body.voter === target.env.body.voter && !ignored.has(record.seq)).map((record) => [record.code, record]));
  let current = final === undefined ? undefined : casts.get(final.code);
  while (current !== undefined && current.seq > target.seq) {
    const previous = casts.get(current.env.body.supersedes);
    if (previous === undefined || previous.seq >= current.seq) break;
    if (previous.seq === seq && previous.code === code) return { ...scope, state: 'superseded', bySeq: current.seq, byCode: current.code };
    current = previous;
  }
  return { ...scope, state: 'excluded' };
}

/** Never uses payload verifier options, caller witness keys, page confirmation flags, or bundle-provided code lists. */
export async function verifyReceiptStanding(text: string, input: {
  manifestHash: string; seq: number; code: string; head: Pick<PinnedHead, 'size' | 'note'>;
  extraAuthorKeys?: string[]; cooperative?: CooperativeVerification;
}): Promise<CheckedReceiptStanding> {
  const pin = standingManifestHash(input.manifestHash);
  if (pin === undefined) return unverifiedStanding('anchor');
  if (!Number.isSafeInteger(input.seq) || input.seq < 0 || !/^[0-9a-f]{64}$/.test(input.code)) return unverifiedStanding('ballot');
  try {
    input.cooperative?.signal?.throwIfAborted();
    if (text.length > MAX_RECEIPT_BUNDLE_BYTES || utf8(text).length > MAX_RECEIPT_BUNDLE_BYTES) return unverifiedStanding('unavailable');
    const raw = parseQvJson(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || raw['manifest_hash'] !== pin) return unverifiedStanding('anchor-mismatch');
    const board = raw['board'];
    const extraAuthorKeys = validateExtraAuthorKeys(input.extraAuthorKeys ?? []);
    const report = await verifyElection(raw, { log: { board, extraAuthorKeys }, ...(input.cooperative === undefined ? {} : { cooperative: input.cooperative }) });
    const evidence = receiptStandingEvidence(report);
    if (evidence !== 'pass') return unverifiedStanding(evidence);
    // The preceding verifier has authenticated the pinned manifest before this second structural extraction.
    const value = raw as unknown as ElectionBundle;
    const structure = verifyLogStructure(value.manifest.body, value.manifest, value.roll, value.log, { board, extraAuthorKeys });
    if (!structure.ok || structure.findings.some((f) => f.cls === 'F' || f.cls === 'ALARM')) return unverifiedStanding('failed');
    const snapshot: StandingSnapshot = { origin: structure.origin, size: structure.tree.size, root: bytesToHex(structure.tree.root()), manifestHash: pin };
    const included = parseCheckpoint(input.head.note);
    if (!included.ok || !verifyLogSignature(included.value, structure.logPk) || included.value.size !== input.head.size ||
        included.value.origin !== snapshot.origin || included.value.size !== snapshot.size || bytesToHex(included.value.root) !== snapshot.root) return unverifiedStanding('snapshot');
    const policy = { witnesses: witnessAnchors(value.manifest.body).anchors, quorum: value.manifest.body.bb.witness_quorum, noneAcknowledged: false };
    if (!structure.checkpoints.some((cp) => cp.origin === snapshot.origin && cp.size === snapshot.size && bytesToHex(cp.root) === snapshot.root && witnessStatus(cp, policy).witnessed)) return unverifiedStanding('witness');
    if (structure.notices.some((notice) => notice.kind !== 'audit-close' && notice.kind !== 'security-notice')) return unverifiedStanding('controls');
    input.cooperative?.signal?.throwIfAborted();
    const records: BallotRecord[] = [];
    const ctx = hexToBytes(report.ctx!, 32);
    for (const { seq, entry } of value.log) {
      if (typeof entry !== 'object' || entry === null || !('intent' in entry)) continue;
      const env = entry as VoterEnvelope;
      records.push({ seq, code: bytesToHex(ballotCode(ctx, env.body)), env });
    }
    return classify(records, report, input.seq, input.code, snapshot);
  } catch {
    // Parse/network/cancellation diagnostics can contain attacker-controlled text. Never surface them as status copy.
    return unverifiedStanding('unavailable');
  }
}
