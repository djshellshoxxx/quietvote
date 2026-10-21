import { exitCodeFor, formatReport, runSelfTest, verifyWithSelfTest } from '@quietvote/verifier';
import { needPositional, parseArgs } from './args.ts';
import { isHex, printJson, readFile } from './common.ts';
import { EXIT, type Io } from './io.ts';
import { UsageError } from './args.ts';

export async function cmdVerify(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { json: 'bool', 'skip-selftest': 'bool', 'manifest-hash': 'value' });
  const [file] = needPositional(p, 1, 'verify <bundle>');
  const pin = p.get('manifest-hash');
  if (pin !== undefined && !isHex(pin, 32)) throw new UsageError('--manifest-hash must be 64 lower-case hex digits');
  const r = await verifyWithSelfTest(readFile(file!), { ...(pin === undefined ? {} : { pinnedManifestHash: pin }), skipSelfTest: p.has('skip-selftest') });
  if (p.has('json')) printJson(io, r);
  else io.out(formatReport(r));
  return exitCodeFor(r);
}

export async function cmdSelftest(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { json: 'bool' });
  needPositional(p, 0, 'selftest (no arguments)');
  const st = await runSelfTest();
  if (p.has('json')) printJson(io, st);
  else io.out(st.cases.map((c) => `${c.ok ? 'ok  ' : 'FAIL'} ${c.kind.padEnd(9)} ${c.id}: ${c.detail}`).join('\n') + `\nself-test: ${st.ok ? 'ok' : 'FAILED'} (${st.rejected}/${st.total} known-bad inputs rejected, control ${st.control ? 'accepted' : 'REJECTED'})\n`);
  return st.ok ? EXIT.ok : EXIT.fail;
}
