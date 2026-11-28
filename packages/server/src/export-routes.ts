// Recorded PUBLIC export management. Downloading never authorizes deletion.
import { toHex } from '@quietvote/board';
import type { ElectionRuntime } from './election.ts';
import type { ExtDeps } from './ext-routes.ts';
import { jobView } from './jobs.ts';
import { ApiError, conflict, notFound } from './problem.ts';
import { checkedPublicExport, createPublicExport, publicExportOf, publicExportView, recoverPublicExportJobs, requireExportBinding } from './public-exports.ts';
import { fBool, fEnum, fInt, fObj, fStr, opt, req } from './util.ts';

export function registerPublicExportRoutes(d: ExtDeps): void {
  const { env, pool, jobs, add } = d;
  const locked = async <T>(rt: ElectionRuntime, fn: () => T): Promise<T> => {
    rt.inUse++;
    try {
      return await rt.mutex.run(async () => {
        if (rt.poisoned || !env.control.election(rt.id)) throw new ApiError(503, 'LOG_UNAVAILABLE', 'election recovery is required');
        return fn();
      });
    } finally { rt.inUse--; }
  };
  add({
    method: 'POST', path: '/api/v1/elections/:id/exports', cls: 'X', auth: 'sig', body: 'json', maxBody: 1024,
    handler: async (c) => {
      const rt = await d.orgElection(c);
      const b = c.parse(fObj({ kind: req(fEnum('public', 'operator')), include_contacts: opt(fBool), encrypt_to: opt(fStr({ max: 200 })) }));
      if (b.kind !== 'public' || b.include_contacts !== undefined || b.encrypt_to !== undefined) {
        throw new ApiError(422, 'VALIDATION_FAILED', 'only kind "public" exports are implemented');
      }
      if (!rt.manifest) throw new ApiError(409, 'WRONG_PHASE', 'nothing to export before the manifest');
      return d.idem(c, c.auth!.keyId, async (save) => {
        const job = jobs.submit('export', 4, { kind: 'export', election_id: rt.id, params: { kind: 'public' }, created_by: c.auth!.keyId }, async (ctl) => {
          await ctl.tick();
          const current = await pool.get(rt.id);
          if (!current) throw notFound('election');
          const row = await locked(current, () => {
            const row = createPublicExport(current, ctl.jobId);
            recoverPublicExportJobs(env, current.edb, ctl.jobId);
            return row;
          });
          return { result: { export_id: row.export_id }, result_ref: `/api/v1/elections/${rt.id}/exports/${row.export_id}` };
        }, (row) => save({ status: 202, json: jobView(row) }));
        return { status: 202, headers: { Location: `/api/v1/jobs/${job.job_id}` }, json: jobView(job) };
      });
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/exports', cls: 'M', auth: 'sig',
    handler: async (c) => {
      const rt = await d.orgElection(c, 'read');
      return { status: 200, cache: 'no-store', json: { items: rt.edb.publicExports().map((r) => publicExportView(rt.id, r)), next_cursor: null } };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/exports/:export', cls: 'M', auth: 'sig',
    handler: async (c) => {
      const rt = await d.orgElection(c, 'read');
      return { status: 200, cache: 'no-store', json: publicExportView(rt.id, publicExportOf(rt.edb, c.params['export']!)) };
    },
  });
  add({
    method: 'GET', path: '/api/v1/elections/:id/exports/:export/download', cls: 'M', auth: 'sig',
    handler: async (c) => {
      const rt = await d.orgElection(c, 'read'), row = publicExportOf(rt.edb, c.params['export']!);
      if (env.nowMs() >= row.expires_at) throw new ApiError(410, 'EXPORT_EXPIRED', 'this download has expired; request a new public export');
      const bytes = checkedPublicExport(rt.edb, row);
      return { status: 200, bytes, ranges: true, contentType: 'application/x-tar', cache: 'no-store', etag: `"${toHex(row.sha256)}"`,
        headers: { 'Content-Disposition': `attachment; filename="${rt.id}-${row.export_id}.qvb"` } };
    },
  });
  for (const action of ['acknowledge', 'deletion-notice'] as const) add({
    method: 'POST', path: `/api/v1/elections/:id/exports/:export/${action}`, cls: 'M', auth: 'sig', body: 'json', maxBody: 1024,
    handler: async (c) => {
      const rt = await d.orgElection(c);
      const hex = fStr({ min: 64, max: 64, re: /^[0-9a-f]{64}$/ });
      const b = c.parse(fObj({ tree_size: req(fInt(1, Number.MAX_SAFE_INTEGER)), root_hash: req(hex), sha256: req(hex) }));
      return d.idem(c, c.auth!.keyId, async (save, journal) => {
        const reply = await locked(rt, () => rt.maintain('export', (db) => db.tx(() => {
          const row = publicExportOf(db, c.params['export']!);
          requireExportBinding(row, b);
          checkedPublicExport(db, row);
          if (env.nowMs() < row.created_at) throw conflict('the server clock is before this export; retry when its creation time has elapsed');
          if (action === 'acknowledge') db.acknowledgePublicExport(row.export_id, env.nowMs());
          else {
            if (rt.logState !== 'ARCHIVED' || rt.log.size !== row.tree_size || toHex(rt.log.root()) !== toHex(row.root_hash)) {
              throw conflict('a deletion notice must identify an ARCHIVED election\'s final public export');
            }
            db.noticePublicExport(row.export_id, env.nowMs());
          }
          const reply = { status: 200, json: publicExportView(rt.id, publicExportOf(db, row.export_id)) };
          journal(db, reply, { action: action === 'acknowledge' ? 'export.acknowledge' : 'export.notice', detail: { export_id: row.export_id, tree_size: row.tree_size } });
          return reply;
        })));
        env.control.tx(() => {
          env.control.audit(c.auth!.keyId, action === 'acknowledge' ? 'export.acknowledge' : 'export.notice', rt.id, { export_id: c.params['export']!, tree_size: b.tree_size });
          save(reply);
        });
        return reply;
      });
    },
  });
}
