// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapt the existing archive and verifier pipelines to the exact bytes saved by election-export.
import { bytesToHex, sha256 } from '@quietvote/crypto';
import { verifyLogStructure, type CheckStatus, type ElectionBundle } from '@quietvote/protocol';
import { loadBundle, verifyWithSelfTest, type VerifierReport, type Verdict } from '@quietvote/verifier';
import { prepareElectionArchiveBytes } from './cmd-prepare.ts';
import { hasSnapshotWitness, snapshotEvidenceVerdict, uninterpretedSnapshotControls, type SnapshotEvidence } from './snapshot-evidence.ts';

const EXPLANATION: Record<Verdict, string> = {
  PASS: 'The saved download passed the required checks for this independently pinned snapshot.',
  FAIL: 'The saved download failed verification; it is retained for inspection and is not verified.',
  INCOMPLETE: 'Required snapshot evidence is incomplete; the saved download is retained and is not verified.',
};
type AdapterFailure = 'E_EXPORT_ARCHIVE' | 'E_EXPORT_STRUCTURE' | 'E_EXPORT_ELECTION_ID' | 'E_EXPORT_VERIFIER';

export interface ExportVerification {
  format: 'qv-export-verification/v1';
  scope: 'downloaded-snapshot';
  verdict: Verdict;
  manifest_hash: string;
  requested_election_id: string;
  election_id_binding: CheckStatus;
  download_sha256: string;
  snapshot: SnapshotEvidence['snapshot'] | null;
  snapshot_witness: CheckStatus;
  controls: CheckStatus;
  notices: SnapshotEvidence['notices'];
  uninterpreted_controls: SnapshotEvidence['notices'];
  self_test: CheckStatus;
  verifier_verdict: Verdict | 'not_run';
  report: VerifierReport | null;
  /** Adapter failures only; the full verifier's findings and failed checks remain in report. */
  adapter_failures: AdapterFailure[];
  freshnessVerified: false;
  finalityVerified: false;
  explanation: string;
}

/** No content-only mode, self-test opt-out or API trust-anchor discovery is accepted here. */
export async function verifyElectionDownload(bytes: Uint8Array, options: {
  format: 'qvb' | 'json'; pin: string; electionId: string; extraAuthorKeys: string[];
}): Promise<ExportVerification> {
  const result: ExportVerification = {
    format: 'qv-export-verification/v1', scope: 'downloaded-snapshot', verdict: 'FAIL',
    manifest_hash: options.pin, requested_election_id: options.electionId, election_id_binding: 'not_run',
    download_sha256: bytesToHex(sha256(bytes)), snapshot: null, snapshot_witness: 'not_run', controls: 'not_run',
    notices: [], uninterpreted_controls: [], self_test: 'not_run', verifier_verdict: 'not_run', report: null,
    adapter_failures: [], freshnessVerified: false, finalityVerified: false, explanation: EXPLANATION.FAIL,
  };
  let input: string | Uint8Array = bytes;
  let content: ElectionBundle | undefined;
  let evidence: SnapshotEvidence | undefined;
  let extraAuthorKeys = options.extraAuthorKeys;
  if (options.format === 'qvb') {
    try {
      const prepared = prepareElectionArchiveBytes(bytes, options.pin);
      evidence = prepared; content = prepared.content;
      // Reuse the archive preparer's current role checks; do not expand its authority policy.
      extraAuthorKeys = [prepared.serverKey];
      input = JSON.stringify({ ...prepared.content, board: prepared.board });
    } catch {
      result.adapter_failures.push('E_EXPORT_ARCHIVE');
      return result;
    }
  }
  try {
    const report = await verifyWithSelfTest(input, { pinnedManifestHash: options.pin, extraAuthorKeys });
    result.report = report; result.verifier_verdict = report.verdict;
    result.self_test = report.selfTest === undefined ? 'not_run' : report.selfTest.ok ? 'pass' : 'fail';
    let verdict = snapshotEvidenceVerdict({ verdict: report.verdict, checks: report.chk, findings: report.findings });
    const manifestVerified = report.chk['chk.manifest.hash'] === 'pass' && report.chk['chk.manifest.sig'] === 'pass' &&
      report.manifestHashSource === 'caller' && report.manifestHash === options.pin;
    if (options.format === 'json' && manifestVerified) {
      const loaded = loadBundle(bytes);
      if (!loaded.ok) throw new Error('inconsistent bundle load');
      content = loaded.value.election;
      if (loaded.value.boardJson !== undefined) {
        // The verifier has authenticated this manifest. Reuse its structure checker to get
        // authenticated checkpoints and notices, never the board's self-attested witness policy.
        const structure = verifyLogStructure(content.manifest.body, content.manifest, content.roll, content.log,
          { board: loaded.value.boardJson, extraAuthorKeys });
        if (!structure.ok) result.adapter_failures.push('E_EXPORT_STRUCTURE');
        else evidence = { content, checkpoints: structure.checkpoints, notices: structure.notices,
          snapshot: { origin: structure.origin, tree_size: structure.tree.size, root_hash: bytesToHex(structure.tree.root()) } };
      }
    }
    if (manifestVerified && content !== undefined) {
      result.election_id_binding = content.manifest.body.election_id === options.electionId ? 'pass' : 'fail';
      if (result.election_id_binding === 'fail') result.adapter_failures.push('E_EXPORT_ELECTION_ID');
    }
    if (evidence !== undefined) {
      result.snapshot = evidence.snapshot;
      result.snapshot_witness = hasSnapshotWitness(evidence) ? 'pass' : 'not_run';
      result.notices = evidence.notices;
      result.uninterpreted_controls = uninterpretedSnapshotControls(evidence.notices);
      result.controls = result.uninterpreted_controls.length === 0 ? 'pass' : 'not_run';
    }
    if (result.adapter_failures.length > 0 || result.self_test === 'fail') verdict = 'FAIL';
    if (verdict === 'PASS' && (result.election_id_binding !== 'pass' || result.self_test !== 'pass' ||
        result.snapshot_witness !== 'pass' || result.controls !== 'pass')) verdict = 'INCOMPLETE';
    result.verdict = verdict; result.explanation = EXPLANATION[verdict];
  } catch {
    // Failure to complete verification cannot turn a saved download into a successful claim.
    result.adapter_failures.push('E_EXPORT_VERIFIER');
  }
  return result;
}
