// Exact PUBLIC export snapshots and the accepted ARCHIVED deletion condition (QV-ADR-027 N-32(b)).
import { b64, toHex } from '@quietvote/board';
import { sha256 } from '@quietvote/crypto';
import type { ElectionRuntime } from './election.ts';
import type { ElectionDb } from './electiondb.ts';
import type { Env } from './env.ts';
import { EXPORT_DELETE_GRACE_MS, EXPORT_DOWNLOAD_MS, MAX_PUBLIC_EXPORT_BYTES, type PublicExportRow } from './export-model.ts';
import { qvb } from './export.ts';
import { ApiError, conflict, notFound } from './problem.ts';
import { readTarStrict } from './tar.ts';
import { ctEq, randomId, toIso } from './util.ts';

export function publicExportView(id: string, row: PublicExportRow): Record<string, unknown> {
  const path = `/api/v1/elections/${id}/exports/${row.export_id}`;
  return {
    export_id: row.export_id, kind: row.kind, tree_size: row.tree_size, root_hash: toHex(row.root_hash), sha256: toHex(row.sha256),
    byte_length: row.byte_length, created_at: toIso(row.created_at / 1000), download_expires_at: toIso(row.expires_at / 1000),
    acknowledged_at: row.acknowledged_at === null ? null : toIso(row.acknowledged_at / 1000),
    deletion_notice_at: row.notice_at === null ? null : toIso(row.notice_at / 1000),
    deletion_eligible_at: row.notice_at === null ? null : toIso((row.notice_at + EXPORT_DELETE_GRACE_MS) / 1000),
    download_url: `${path}/download`, acknowledgement_url: `${path}/acknowledge`, deletion_notice_url: `${path}/deletion-notice`,
  };
}

/** Verify the exact persisted artifact, including its internal tree binding, before download or destructive authorization. */
export function checkedPublicExport(db: ElectionDb, row: PublicExportRow): Uint8Array {
  const bytes = db.publicExportBytes(row.export_id);
  if (!bytes || bytes.length !== row.byte_length || !ctEq(sha256(bytes), new Uint8Array(row.sha256))) {
    throw conflict('the recorded public export snapshot is missing or damaged; create and verify a new export');
  }
  try {
    const metaBytes = readTarStrict(bytes, { maxFiles: Math.floor(MAX_PUBLIC_EXPORT_BYTES / 512) }).get('bundle.json');
    if (!metaBytes) throw new Error('missing metadata');
    const meta = JSON.parse(Buffer.from(metaBytes).toString()) as Record<string, unknown>;
    if (meta['tree_size'] !== row.tree_size || meta['root_b64'] !== b64(row.root_hash) || meta['origin'] !== db.row().origin) {
      throw new Error('snapshot tree binding mismatch');
    }
  } catch {
    throw conflict('the recorded public export has an invalid snapshot binding; create and verify a new export');
  }
  return bytes;
}

/** Called under the runtime mutex. No asynchronous gap separates the snapshot from its atomic durable record. */
export function createPublicExport(rt: ElectionRuntime, jobId: string): PublicExportRow {
  const old = rt.edb.publicExportForJob(jobId);
  if (old) { checkedPublicExport(rt.edb, old); return old; }
  if (rt.poisoned || !rt.env.control.election(rt.id)) throw new ApiError(503, 'LOG_UNAVAILABLE', 'election recovery is required');
  if (!rt.manifest) throw new ApiError(409, 'WRONG_PHASE', 'nothing to export before the manifest');
  // Bound the source before qvb materializes multiple encodings of its entries. The final serialized cap is checked too.
  const source = rt.edb.db.prepare(`SELECT
    (SELECT COALESCE(SUM(length(header)+COALESCE(length(body),0)),0) FROM log_entry) +
    (SELECT COALESCE(SUM(length(note_text)),0) FROM checkpoint) +
    (SELECT COALESCE(SUM(length(keys_json)),0) FROM pinned_roll) AS bytes`).get()?.['bytes'];
  if (typeof source !== 'number' || source > MAX_PUBLIC_EXPORT_BYTES / 4) {
    throw new ApiError(413, 'EXPORT_TOO_LARGE', 'the recorded snapshot exceeds the bounded public-export source size');
  }
  return rt.edb.tx(() => {
    const created = rt.env.nowMs(), root = rt.log.root(), size = rt.log.size;
    const bytes = qvb(rt);
    if (bytes.length > MAX_PUBLIC_EXPORT_BYTES) throw new ApiError(413, 'EXPORT_TOO_LARGE', 'the recorded public export exceeds 128 MiB');
    const row: PublicExportRow = {
      export_id: randomId(), job_id: jobId, kind: 'public', tree_size: size, root_hash: root, sha256: sha256(bytes),
      byte_length: bytes.length, created_at: created, expires_at: created + EXPORT_DOWNLOAD_MS, acknowledged_at: null, notice_at: null,
    };
    const candidates = rt.edb.publicExports().filter((r) => r.tree_size === size && ctEq(new Uint8Array(r.root_hash), root) &&
      (r.acknowledged_at !== null || r.notice_at !== null)).sort((a, b) =>
      Number(b.acknowledged_at !== null) - Number(a.acknowledged_at !== null) || (a.notice_at ?? a.created_at) - (b.notice_at ?? b.created_at));
    let keep: string | undefined;
    for (const candidate of candidates) {
      try { checkedPublicExport(rt.edb, candidate); keep = candidate.export_id; break; }
      catch (error) { if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error; }
    }
    rt.edb.prunePublicExports(created, keep);
    rt.edb.addPublicExport(row, bytes);
    return row;
  });
}

/** A complete election-owned snapshot is the durable completion receipt for its control-database job. */
export function recoverPublicExportJobs(env: Env, db: ElectionDb, onlyJob?: string): void {
  for (const row of db.publicExports()) {
    if (onlyJob !== undefined && row.job_id !== onlyJob) continue;
    const job = env.control.job(row.job_id);
    if (!job || job.kind !== 'export' || job.election_id !== db.row().election_id || job.state === 'done' || job.state === 'expired') continue;
    if (job.expires_at !== null && job.expires_at <= env.nowMs()) continue;
    checkedPublicExport(db, row);
    const id = db.row().election_id;
    env.control.tx(() => {
      const now = env.nowMs();
      const result = { export_id: row.export_id }, ref = `/api/v1/elections/${id}/exports/${row.export_id}`;
      // Only this verified, job-keyed snapshot can recover an interrupted/failed export. Other job failures retain their state.
      env.control.db.prepare(`UPDATE job SET state='done',progress=1,result=?,result_ref=?,error=NULL,finished_at=?,expires_at=?
        WHERE job_id=? AND kind='export' AND election_id=? AND state IN ('queued','running','failed')`)
        .run(JSON.stringify(result), ref, now, now + env.cfg.jobRetentionMs, row.job_id, id);
      env.control.audit(job.created_by, 'export.create', row.export_id, { tree_size: row.tree_size });
    });
  }
}

export function requireExportBinding(row: PublicExportRow, request: { tree_size: number; root_hash: string; sha256: string }): void {
  if (row.tree_size !== request.tree_size || toHex(row.root_hash) !== request.root_hash || toHex(row.sha256) !== request.sha256) {
    throw new ApiError(422, 'EXPORT_BINDING_MISMATCH', 'acknowledge the exact tree size, root and SHA-256 of the downloaded export');
  }
}

/** This condition is deliberately limited to ARCHIVED; other terminal-state policy remains unchanged. */
export function assertArchiveExportReady(rt: ElectionRuntime): void {
  if (rt.logState !== 'ARCHIVED') return;
  const now = rt.env.nowMs(), size = rt.log.size, root = rt.log.root();
  for (const row of rt.edb.publicExports()) {
    if (row.tree_size !== size || !ctEq(new Uint8Array(row.root_hash), root)) continue;
    const acknowledged = row.acknowledged_at !== null && row.acknowledged_at <= now;
    const grace = row.notice_at !== null && row.notice_at + EXPORT_DELETE_GRACE_MS <= now;
    if (!acknowledged && !grace) continue;
    try { checkedPublicExport(rt.edb, row); return; }
    catch (error) { if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error; }
  }
  throw conflict('ARCHIVED deletion requires a recorded public export of the final tree and explicit acknowledgement, or 30 days after its signed deletion notice');
}

export function publicExportOf(db: ElectionDb, id: string): PublicExportRow {
  const row = db.publicExport(id);
  if (!row) throw notFound('export');
  return row;
}
