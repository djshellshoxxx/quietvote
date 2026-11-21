// SPDX-License-Identifier: AGPL-3.0-or-later
// QV-09 section 10: request a server-local backup using the existing signed admin API.
import { FailError, UsageError, needFlag } from './args.ts';
import { isHex, printJson } from './common.ts';
import { AUTH, args, request } from './cmd-online.ts';
import { EXIT, type Io } from './io.ts';

export async function cmdOnlineBackupCreate(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...AUTH, scope: 'value', id: 'value', 'idempotency-key': 'value' });
  const scope = needFlag(p, 'scope');
  if (scope !== 'all' && scope !== 'election') throw new UsageError('--scope must be all or election');
  const id = scope === 'election' ? needFlag(p, 'id') : undefined;
  if (scope === 'all' && p.has('id')) throw new UsageError('--id is only allowed with --scope election');
  if (id !== undefined && !isHex(id, 16)) throw new UsageError('--id must be 32 lower-case hex digits');
  needFlag(p, 'idempotency-key');
  const response = await request(p, io, 'POST', '/api/v1/admin/backups',
    { scope, ...(id === undefined ? {} : { election_id: id }) }, true, 64 * 1024);
  let job: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    job = value as Record<string, unknown>;
    if (typeof job['job_id'] !== 'string' || !/^[a-z2-7]{26}$/.test(job['job_id']) || job['kind'] !== 'backup' ||
        job['election_id'] !== id || typeof job['state'] !== 'string' || !['queued', 'running', 'done', 'failed'].includes(job['state']) ||
        typeof job['progress'] !== 'number' || !Number.isFinite(job['progress']) || job['progress'] < 0 || job['progress'] > 1 ||
        typeof job['created_at'] !== 'string' || !Number.isFinite(Date.parse(job['created_at']))) throw new Error('binding');
  } catch {
    throw new FailError('backup creation returned an invalid response; submission may have been accepted; inspect server state before retrying');
  }
  // A job receipt does not establish completion or retention. Do not follow server-supplied paths or links.
  printJson(io, { job_id: job['job_id'], kind: 'backup', scope, ...(id === undefined ? {} : { election_id: id }),
    state: job['state'], progress: job['progress'], created_at: job['created_at'] });
  return EXIT.ok;
}
