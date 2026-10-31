// Built-in known-bad corpus and self-test (QV-34 section 9.4, QV-10-REQ-014, QV-ADR-P34-3).
// A verifier that accepts any canary, or rejects the known-good control, is broken and must say so.
import { readFileSync } from 'node:fs';
import { verifyBundle } from './verify.ts';
import type { SelfTestSummary, VerifierReport } from './report.ts';

export interface CorpusCase {
  id: string;
  source?: string;
  expect: { verdict?: string; failed_checks?: string[]; codes?: string[] };
  bundle: unknown;
}
export interface Corpus {
  format: 'qv-canary-corpus/v1';
  protocol_version: string;
  control: CorpusCase;
  canaries: CorpusCase[];
}

export const CORPUS_URL = new URL('../canary/corpus.json', import.meta.url);

export function loadCorpus(text?: string): Corpus {
  const c = JSON.parse(text ?? readFileSync(CORPUS_URL, 'utf8')) as Corpus;
  if (c.format !== 'qv-canary-corpus/v1' || !Array.isArray(c.canaries) || c.canaries.length === 0) throw new Error('canary corpus malformed');
  return c;
}

/** Hostile inputs derived deterministically from the control bundle. Each must simply be rejected (never PASS, never throw). */
export function syntheticCanaries(control: unknown): { id: string; input: string | object | null }[] {
  const clone = (): any => JSON.parse(JSON.stringify(control));
  const text = JSON.stringify(control);
  const out: { id: string; input: string | object | null }[] = [
    { id: 'synthetic/null', input: 'null' },
    { id: 'synthetic/empty-object', input: {} },
    { id: 'synthetic/array', input: [] },
    { id: 'synthetic/trailing-garbage', input: `${text}x` },
    { id: 'synthetic/duplicate-key', input: '{"manifest":1,"manifest":2}' },
    { id: 'synthetic/unknown-top-level-member', input: { ...clone(), extra: 1 } },
  ];
  const a = clone();
  a.roll = [];
  out.push({ id: 'synthetic/roll-emptied', input: a });
  const b = clone();
  b.log = [];
  out.push({ id: 'synthetic/log-emptied', input: b });
  const c = clone();
  c.manifest_hash = c.manifest_hash.slice(0, -1) + (c.manifest_hash.endsWith('0') ? '1' : '0');
  out.push({ id: 'synthetic/manifest-hash-flipped', input: c });
  const d = clone();
  d.log = d.log.slice(1);
  out.push({ id: 'synthetic/first-log-entry-dropped', input: d });
  const e = clone();
  e.log = e.log.reverse();
  out.push({ id: 'synthetic/log-reversed', input: e });
  const f = clone();
  f.log = f.log.slice(0, -1);
  out.push({ id: 'synthetic/last-log-entry-dropped', input: f });
  return out;
}

const failedChecks = (r: VerifierReport): string[] =>
  Object.entries(r.chk).filter(([k, s]) => s === 'fail' && !k.startsWith('chk.board.')).map(([k]) => k).sort();

export interface SelfTestCase {
  id: string;
  kind: 'control' | 'canary' | 'synthetic';
  ok: boolean;
  verdict: string;
  detail: string;
}
export interface SelfTestResult extends SelfTestSummary {
  cases: SelfTestCase[];
}

/** Runs the control (must PASS) and every canary (must be rejected, and fail exactly the named checks). */
export async function runSelfTest(corpus: Corpus = loadCorpus()): Promise<SelfTestResult> {
  const cases: SelfTestCase[] = [];
  const ctl = await verifyBundle(corpus.control.bundle as object);
  const ctlOk = ctl.verdict === 'PASS';
  cases.push({ id: corpus.control.id, kind: 'control', ok: ctlOk, verdict: ctl.verdict, detail: ctlOk ? 'known-good election accepted' : 'known-good election NOT accepted: verifier rejects valid input' });
  for (const k of corpus.canaries) {
    const r = await verifyBundle(k.bundle as object);
    // QV-34 section 9.3: a mutant is rejected if the verdict is not PASS or at least one named check fails (ignored-ballot
    // and alarm classes legitimately keep the verdict PASS, protocol NOTES X-10/X-11).
    const rejectedOk = r.verdict !== 'PASS' || failedChecks(r).length > 0;
    const want = [...(k.expect.failed_checks ?? [])].sort();
    const got = failedChecks(r);
    const exact = want.length === 0 || (want.length === got.length && want.every((x, i) => x === got[i]));
    const codesOk = (k.expect.codes ?? []).every((c) => r.findings.some((f) => f.code === c));
    const verdictOk = k.expect.verdict === undefined || r.verdict === k.expect.verdict;
    const ok = rejectedOk && exact && codesOk && verdictOk;
    cases.push({
      id: k.id, kind: 'canary', ok, verdict: r.verdict,
      detail: !rejectedOk ? 'ACCEPTED a known-bad bundle' : !verdictOk ? `verdict ${r.verdict}, expected ${k.expect.verdict}` : !exact ? `failed checks [${got.join(', ')}], expected [${want.join(', ')}]` : !codesOk ? `missing expected finding codes [${(k.expect.codes ?? []).join(', ')}]` : `rejected as expected (${got.join(', ') || r.verdict})`,
    });
  }
  for (const s of syntheticCanaries(corpus.control.bundle)) {
    let r: VerifierReport | undefined;
    let threw = false;
    try {
      r = await verifyBundle(s.input as string | object);
    } catch {
      threw = true;
    }
    const ok = !threw && r !== undefined && r.verdict !== 'PASS';
    cases.push({ id: s.id, kind: 'synthetic', ok, verdict: r?.verdict ?? 'THROW', detail: ok ? 'rejected' : threw ? 'verifier threw' : 'NOT rejected' });
  }
  const bad = cases.filter((c) => !c.ok);
  const canaries = cases.filter((c) => c.kind !== 'control');
  return {
    ok: bad.length === 0,
    control: ctlOk,
    total: canaries.length,
    rejected: canaries.filter((c) => c.ok).length,
    failures: bad.map((c) => `${c.id}: ${c.detail}`),
    cases,
  };
}
