// `qv-verify`: the standalone independent entry point (QV-08 D5). Exit codes: 0 PASS, 1 FAIL / self-test failed,
// 2 usage, 3 INCOMPLETE, 4 unreadable input.
import { readFileSync } from 'node:fs';
import { formatReport } from './format.ts';
import { runSelfTest, type Corpus } from './canary.ts';
import { verifyBundle } from './verify.ts';
import type { VerifierReport } from './report.ts';

export const EXIT = { ok: 0, fail: 1, usage: 2, incomplete: 3, input: 4 } as const;

export interface VerifierIo {
  out(s: string): void;
  err(s: string): void;
}

/** Runs the self-test and attaches it; a failing self-test forces FAIL (a broken verifier must not report PASS). */
export async function verifyWithSelfTest(bundleText: string | Uint8Array, opts: { pinnedManifestHash?: string; skipSelfTest?: boolean; corpus?: Corpus } = {}): Promise<VerifierReport> {
  const r = await verifyBundle(bundleText, opts.pinnedManifestHash === undefined ? {} : { pinnedManifestHash: opts.pinnedManifestHash });
  if (opts.skipSelfTest !== true) {
    const st = await runSelfTest(opts.corpus);
    r.selfTest = { ok: st.ok, control: st.control, total: st.total, rejected: st.rejected, failures: st.failures };
    if (!st.ok) r.verdict = 'FAIL';
  } else r.caveats.push('canary self-test skipped by request');
  return r;
}

export const exitCodeFor = (r: VerifierReport): number => (r.verdict === 'PASS' ? EXIT.ok : r.verdict === 'FAIL' ? EXIT.fail : EXIT.incomplete);

export async function verifierMain(argv: string[], io: VerifierIo): Promise<number> {
  const usage = 'usage: qv-verify <bundle.json> [--json] [--skip-selftest] [--manifest-hash <hex>]\n       qv-verify --selftest\n';
  let json = false;
  let skip = false;
  let selftest = false;
  let pinned: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') json = true;
    else if (a === '--skip-selftest') skip = true;
    else if (a === '--selftest') selftest = true;
    else if (a === '--manifest-hash') pinned = argv[++i];
    else if (a.startsWith('-')) {
      io.err(`unknown option ${a}\n${usage}`);
      return EXIT.usage;
    } else files.push(a);
  }
  if (selftest) {
    const st = await runSelfTest();
    io.out(json ? JSON.stringify(st, null, 2) + '\n' : st.cases.map((c) => `${c.ok ? 'ok  ' : 'FAIL'} ${c.id}: ${c.detail}`).join('\n') + `\nself-test: ${st.ok ? 'ok' : 'FAILED'}\n`);
    return st.ok ? EXIT.ok : EXIT.fail;
  }
  if (files.length !== 1 || (pinned === undefined && argv.includes('--manifest-hash'))) {
    io.err(usage);
    return EXIT.usage;
  }
  let data: Uint8Array;
  try {
    data = readFileSync(files[0]!);
  } catch (e) {
    io.err(`cannot read ${files[0]}: ${e instanceof Error ? e.message : 'error'}\n`);
    return EXIT.input;
  }
  const r = await verifyWithSelfTest(data, { ...(pinned === undefined ? {} : { pinnedManifestHash: pinned }), skipSelfTest: skip });
  io.out(json ? JSON.stringify(r, null, 2) + '\n' : formatReport(r));
  return exitCodeFor(r);
}
