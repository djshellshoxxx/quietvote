// DOM-free verification job for the standalone offline verifier (QV-19 §7, audit B3-26). The same function runs inside the
// dedicated verify Worker (src/worker/verify-worker.ts) and, when no Worker can be started, on the page's main thread, so
// both paths produce the same report. Reports are produced only by the shared protocol verifier; nothing here changes a verdict.
import { hexToBytes, parseQvJson } from '@quietvote/crypto';
import { verifyElection, verifyElectionText, type VerificationReport } from '@quietvote/protocol';
import { electionIdOf, sameElectionId } from '../util/crockford.ts';

/**
 * Coarse progress phases. packages/protocol's verifier exposes no progress callback, so only these are reported:
 * `parsing` (strict QV-JSON parse), `verifying` (the shared verifier runs), `done` (a report exists; emitted by the controller).
 */
export type Phase = 'parsing' | 'verifying' | 'done';

export interface VerifyJob {
  text: string;
  /** Election ID the user was told out of band; '' when not supplied. */
  anchor: string;
}

export interface BundleResult {
  report: VerificationReport;
  /** The outside Election ID was supplied and did not match (or the bundle's manifest hash could not be read). */
  anchorBad: boolean;
  /** Why the anchor failed: the IDs differ, or the bundle's manifest hash was unreadable. */
  anchorProblem?: 'mismatch' | 'unreadable';
}

/**
 * Equivalent to `verifyElectionText(text)` (strict parse, then `verifyElection`), split so the phase can be reported. On a
 * parse failure it delegates to `verifyElectionText` itself, so the canonical E_PARSE report is the protocol's own.
 */
export async function verifyBundle(job: VerifyJob, onPhase: (p: Exclude<Phase, 'done'>) => void = () => {}): Promise<BundleResult> {
  onPhase('parsing');
  let parsed: { v: unknown } | undefined;
  try {
    parsed = { v: parseQvJson(job.text) };
  } catch {
    parsed = undefined;
  }
  onPhase('verifying');
  const report = parsed ? await verifyElection(parsed.v) : await verifyElectionText(job.text);
  const anchor = job.anchor.trim();
  if (anchor === '') return { report, anchorBad: false };
  try {
    const mh = (JSON.parse(job.text) as { manifest_hash: string }).manifest_hash;
    return sameElectionId(anchor, electionIdOf(hexToBytes(mh, 32))) ? { report, anchorBad: false } : { report, anchorBad: true, anchorProblem: 'mismatch' };
  } catch {
    return { report, anchorBad: true, anchorProblem: 'unreadable' };
  }
}

/** Messages the verify Worker sends to the page. */
export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'progress'; phase: 'parsing' | 'verifying' }
  | { type: 'result'; result: BundleResult }
  | { type: 'error'; detail: string };

const VERDICTS = new Set(['PASS', 'FAIL', 'INCOMPLETE']);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Structural check of a result received from the Worker. Anything else is treated as a failure, never rendered as a verdict. */
export function isBundleResult(x: unknown): x is BundleResult {
  if (!isObj(x) || typeof x.anchorBad !== 'boolean' || !isObj(x.report)) return false;
  const r = x.report;
  if (typeof r.verdict !== 'string' || !VERDICTS.has(r.verdict) || !isObj(r.checks) || !Object.values(r.checks).every((v) => typeof v === 'string')) return false;
  if (!Array.isArray(r.caveats) || !r.caveats.every((c) => typeof c === 'string') || !Array.isArray(r.findings) || !r.findings.every(isObj)) return false;
  const c = r.counts;
  return isObj(c) && typeof c.cast === 'number' && typeof c.counted === 'number' && typeof c.spoiled === 'number';
}
