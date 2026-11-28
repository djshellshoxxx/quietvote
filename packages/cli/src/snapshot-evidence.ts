// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared evidence gates for claims about one complete, independently pinned snapshot.
import { witnessStatus } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { witnessAnchors, type CheckId, type CheckStatus, type ElectionBundle, type LogStructure, type NoticeRef } from '@quietvote/protocol';

// A protocol PASS can coexist with local ballot failures. Require the actual checks too.
// No sampled receipt is supplied: the entire unredacted board is bound to this snapshot.
export const SNAPSHOT_REQUIRED_CHECKS: readonly CheckId[] = [
  'chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees', 'chk.board.append_only', 'chk.board.witness',
  'chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules',
  'chk.benaloh.spoiled', 'chk.encoding.canonical', 'chk.time.window',
];

export interface SnapshotEvidence {
  content: Pick<ElectionBundle, 'manifest'>;
  checkpoints: LogStructure['checkpoints'];
  notices: readonly NoticeRef[];
  snapshot: { origin: string; tree_size: number; root_hash: string };
}

export function snapshotEvidenceVerdict(report: {
  verdict: 'PASS' | 'FAIL' | 'INCOMPLETE';
  checks: Readonly<Record<string, CheckStatus>>;
  findings: readonly { cls: string }[];
}): 'PASS' | 'FAIL' | 'INCOMPLETE' {
  if (report.verdict === 'FAIL' || Object.values(report.checks).includes('fail') ||
      report.findings.some((f) => f.cls === 'F' || f.cls === 'ALARM')) return 'FAIL';
  if (report.verdict !== 'PASS' || SNAPSHOT_REQUIRED_CHECKS.some((id) => report.checks[id] !== 'pass')) return 'INCOMPLETE';
  return 'PASS';
}

/** Only call with a verified manifest and authenticated, prefix-consistent checkpoints. */
export function hasSnapshotWitness({ content, checkpoints, snapshot }: SnapshotEvidence): boolean {
  const policy = { witnesses: witnessAnchors(content.manifest.body).anchors,
    quorum: content.manifest.body.bb.witness_quorum, noneAcknowledged: false };
  // The protocol's phase witness gate alone can pass without a quorum on this final tally snapshot.
  return checkpoints.some((cp) => cp.origin === snapshot.origin && cp.size === snapshot.tree_size &&
    bytesToHex(cp.root) === snapshot.root_hash && witnessStatus(cp, policy).witnessed);
}

export function uninterpretedSnapshotControls(notices: readonly NoticeRef[]): NoticeRef[] {
  // These authenticated controls have no adopted interpretation of their outcome effects yet.
  return notices.filter((n) => n.kind !== 'audit-close' && n.kind !== 'security-notice');
}
