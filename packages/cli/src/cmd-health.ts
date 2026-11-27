// SPDX-License-Identifier: AGPL-3.0-or-later
// One explicit, read-only service check. No credentials or election data are needed.
import { FailError, needPositional, parseArgs } from './args.ts';
import { args, request } from './cmd-online.ts';
import { printJson } from './common.ts';
import { EXIT, type Io } from './io.ts';

const MAX_HEALTH_RESPONSE = 64 * 1024;
const ENDPOINTS = ['/healthz', '/readyz', '/api/v1/instance'] as const;

function validResponse(path: typeof ENDPOINTS[number], value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (path === '/healthz') return body['status'] === 'ok';
  if (path === '/readyz') return body['status'] === 'ready';
  const nonemptyString = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
  const strings = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every(nonemptyString);
  return nonemptyString(body['instance_id']) && nonemptyString(body['server_version']) &&
    strings(body['api_versions']) && strings(body['protocol_suites']);
}

export async function cmdHealth(argv: string[], io: Io): Promise<number> {
  const options = parseArgs(argv, { json: 'bool', 'timeout-ms': 'value' });
  const [server] = needPositional(options, 1, 'health <server-origin>');
  const timeout = options.get('timeout-ms');
  // Use the existing online transport's origin, redirect, deadline and error policy.
  const p = args(['--server', server!, ...(timeout === undefined ? [] : ['--timeout-ms', timeout])], {});
  const checks = await Promise.all(ENDPOINTS.map(async (path) => {
    try {
      const bytes = await request(p, io, 'GET', path, undefined, false, MAX_HEALTH_RESPONSE);
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { return { path, ok: false, detail: 'invalid health response' }; }
      return validResponse(path, value)
        ? { path, ok: true, detail: 'ok' }
        : { path, ok: false, detail: 'unexpected health response' };
    } catch (error) {
      // Only the transport's bounded diagnostics are printable, never raw server bodies.
      if (!(error instanceof FailError)) throw error;
      return { path, ok: false, detail: error.message };
    }
  }));
  const ready = checks.every((check) => check.ok);
  const result = { scope: 'service-health', ready, election_verified: false, checks };
  if (options.has('json')) printJson(io, result);
  else {
    io.out(`service health: ${ready ? 'READY' : 'NOT READY'}\n`);
    for (const check of checks) io.out(`${check.ok ? 'ok' : 'FAIL'} ${check.path}: ${check.detail}\n`);
    io.out('Service responses describe availability only; election integrity and release authenticity are unchecked.\n');
  }
  return ready ? EXIT.ok : EXIT.fail;
}
