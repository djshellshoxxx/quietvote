// Presentation and result gating over the shared verifier. Skipped evidence remains explicit; no protocol verdict is changed.
import { parseQvJson } from '@quietvote/crypto';
import { verifyElection, verifyElectionText, type VerifyElectionOptions, type VerificationReport } from '@quietvote/protocol';
import type { ElectionContext } from './election.ts';

export function verificationSummary(report: VerificationReport, anchorMismatch = false): { verdict: VerificationReport['verdict']; partial: boolean; passed: number; skipped: number; total: number } {
  const statuses = Object.values(report.checks);
  return { verdict: anchorMismatch ? 'FAIL' : report.verdict, partial: report.verdict === 'PASS' && statuses.includes('not_run'),
    passed: statuses.filter((v) => v === 'pass').length, skipped: statuses.filter((v) => v === 'not_run').length, total: statuses.length };
}

/** Verify the exact loaded snapshot against its already derived manifest hash. The roll is checked against its signed commitment. */
export async function verifyLoadedElection(records: readonly { seq: number; record: unknown }[], ctx: ElectionContext, roll: readonly string[], board?: unknown): Promise<VerificationReport> {
  return verifyElection({ manifest: records.find((r) => r.seq === 0)?.record, manifest_hash: ctx.manifestHashHex,
    roll: [...roll].sort(), log: records.filter((r) => r.seq !== 0).map((r) => ({ seq: r.seq, entry: r.record })) },
    board === undefined ? {} : { log: { board } });
}

/** The optional board member is evidence, never verifier options. Payload flags
 * cannot opt out of missing evidence. Retain strict parsing/failure reports. */
export async function verifyPublicBundleText(text: string, opts: Pick<VerifyElectionOptions, 'cooperative'> = {}): Promise<VerificationReport> {
  const schedule = opts.cooperative === undefined ? {} : { cooperative: opts.cooperative };
  let value: unknown;
  try { value = parseQvJson(text); } catch { return verifyElectionText(text, schedule); }
  const board = value !== null && typeof value === 'object' && Object.hasOwn(value, 'board') ? (value as { board: unknown }).board : undefined;
  return verifyElection(value, { ...schedule, ...(board === undefined ? {} : { log: { board } }) });
}

export function canShowResults(report: VerificationReport): boolean {
  return report.verdict === 'PASS' && report.checks['chk.tally.aggregate'] === 'pass' && report.checks['chk.tally.decrypt'] === 'pass' && report.checks['chk.result.rules'] === 'pass' && report.results !== undefined;
}
