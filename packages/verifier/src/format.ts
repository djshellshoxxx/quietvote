import { V_IDS, type VerifierReport, type VStatus } from './report.ts';

const MARK: Record<VStatus, string> = { pass: 'PASS   ', fail: 'FAIL   ', not_run: 'NOT RUN' };

/** Plain-text report. Deterministic; contains no timestamps. */
export function formatReport(r: VerifierReport): string {
  const L: string[] = [];
  L.push(`QuietVote verification report (${r.tool})`);
  L.push(`VERDICT: ${r.verdict}`);
  if (r.ctxPrefix !== undefined) L.push(`election ctx: ${r.ctxPrefix}...`);
  const flagged = V_IDS.filter((id) => r.checks[id].status === 'fail');
  if (r.verdict !== 'FAIL' && flagged.length > 0) L.push(`FLAGGED: ${flagged.join(', ')} failed without changing the verdict (ignored ballots or alarms, QV-16 App. C); read the notes below`);
  L.push(`ballots: cast ${r.counts.cast}, spoiled ${r.counts.spoiled}, counted ${r.counts.counted}`);
  if (r.log !== undefined) {
    const s = (x: VStatus): string => (x === 'not_run' ? 'not run' : x);
    const c = r.log.checks;
    L.push(`log layer (QV-16 C3): append-only ${s(c.append_only)}, witness ${s(c.witness)}, receipts ${s(c.receipts)}, `
      + `witnessed times ${s(c.time_window)}; witness keys from ${r.log.witness_keys}; `
      + `${r.log.receipt_claims} receipt claim(s), ${r.log.observed_heads} observed head(s)`);
  }
  L.push('');
  for (const id of V_IDS) {
    const c = r.checks[id];
    L.push(`${id.padEnd(3)} ${MARK[c.status]} ${c.title}`);
    for (const n of c.notes.slice(0, 5)) L.push(`      - ${n}`);
    if (c.notes.length > 5) L.push(`      - (${c.notes.length - 5} more)`);
  }
  const notRun = V_IDS.filter((id) => r.checks[id].status === 'not_run');
  L.push('');
  L.push(notRun.length === 0 ? 'All checks ran.' : `Checks NOT run: ${notRun.join(', ')}. A check that did not run is not a pass.`);
  for (const w of r.warnings) L.push(`warning: ${w}`);
  for (const c of r.caveats) L.push(`caveat: ${c}`);
  if (r.results !== undefined) L.push(`results: ${JSON.stringify(r.results)}`);
  if (r.selfTest !== undefined) {
    L.push(`self-test: ${r.selfTest.ok ? 'ok' : 'FAILED'} (control ${r.selfTest.control ? 'accepted' : 'REJECTED'}, ${r.selfTest.rejected}/${r.selfTest.total} known-bad bundles rejected)`);
    for (const f of r.selfTest.failures) L.push(`  self-test failure: ${f}`);
  }
  L.push(`report hash: ${r.reportHash}`);
  return L.join('\n') + '\n';
}
