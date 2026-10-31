// Presentation and result gating over the shared verifier. Skipped evidence remains explicit; no protocol verdict is changed.
import { verifyElection, type VerificationReport } from '@quietvote/protocol';
import type { ElectionContext } from './election.ts';

export function verificationSummary(report: VerificationReport, anchorMismatch = false): { verdict: VerificationReport['verdict']; partial: boolean; passed: number; skipped: number; total: number } {
  const statuses = Object.values(report.checks);
  return { verdict: anchorMismatch ? 'FAIL' : report.verdict, partial: report.verdict === 'PASS' && statuses.includes('not_run'),
    passed: statuses.filter((v) => v === 'pass').length, skipped: statuses.filter((v) => v === 'not_run').length, total: statuses.length };
}

/** Verify the exact loaded snapshot against its already derived manifest hash. The roll is checked against its signed commitment. */
export async function verifyLoadedElection(records: readonly { seq: number; record: unknown }[], ctx: ElectionContext, roll: readonly string[]): Promise<VerificationReport> {
  return verifyElection({ manifest: records.find((r) => r.seq === 0)?.record, manifest_hash: ctx.manifestHashHex,
    roll: [...roll].sort(), log: records.filter((r) => r.seq !== 0).map((r) => ({ seq: r.seq, entry: r.record })) });
}

export function canShowResults(report: VerificationReport): boolean {
  return report.verdict === 'PASS' && report.checks['chk.tally.aggregate'] === 'pass' && report.checks['chk.tally.decrypt'] === 'pass' && report.checks['chk.result.rules'] === 'pass' && report.results !== undefined;
}
