// Instance administration (QV-09 §10 `/admin/*`): status, listing, backups, self-audit, quarantine clearing, deletion.
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { MerkleTree, bodyDigest, decodeHeader, hashLeaf, parseCheckpoint, verifyLogSignature, witnessStatus } from '@quietvote/board';
import { ctEq } from './util.ts';
import { utf8 } from '@quietvote/crypto';
import type { AuthInfo } from './auth.ts';
import type { Ctx } from './http.ts';
import type { ElectionRuntime } from './election.ts';
import type { Env } from './env.ts';
import { JobError, type JobCtl, type JobOutcome } from './jobs.ts';
import type { ElectionPool } from './pool.ts';
import { ApiError, forbidden } from './problem.ts';

/**
 * THE admin authorization decision (owner decision D-84 is pending).
 * Today (QV-08 as recommended): the request already carried a valid `QV-Sig` signature (checked by the HTTP layer for every
 * `auth: 'sig'` route) and the key must be registered with role `instance_admin` (seeded from `adminKeys`; no API creates admin keys).
 * If the owner picks QV-09's session bearer instead, only this function and the token check in http.ts change; every /admin handler
 * calls nothing else.
 */
export function authorizeAdmin(c: Ctx): AuthInfo {
  const a = c.auth;
  if (a === undefined || a.role !== 'instance_admin' || a.orgId !== null) throw forbidden('instance administrator key required');
  return a;
}

export const DELETABLE_STATES: readonly string[] = ['DRAFT', 'ARCHIVED', 'CANCELLED', 'ABORTED', 'IMPORTED'];

// ------------------------------------------------------------------------------------------------------------ status

export function adminStatus(env: Env, pool: ElectionPool): Record<string, unknown> {
  const c = env.control;
  let free: number | null = null;
  try {
    const s = statfsSync(env.cfg.dataDir);
    free = Number(s.bavail) * Number(s.bsize);
  } catch {
    /* statfs unsupported */
  }
  const q = c.quarantinedElections().map((r) => {
    let info: { code?: string; incident?: string } = {};
    try {
      info = JSON.parse(r.quarantine) as typeof info;
    } catch {
      info = { code: 'LOG_INCONSISTENT' };
    }
    return { election_id: r.election_id, code: info.code ?? 'LOG_INCONSISTENT', ...(info.incident ? { incident: info.incident } : {}) };
  });
  const last = c.meta('last_backup_at');
  return {
    instance_id: c.instanceId(),
    db: { elections: c.countAllElections(), by_state: c.electionsByState(), open_runtimes: pool.openCount() },
    backups: { last_at: last ?? null },
    quarantined: q.map((x) => x.election_id),
    quarantine_incidents: q,
    disk: { free_bytes: free },
    migrations: { control: c.migrationVersion(), version: c.migrationVersion() },
  };
}

// ------------------------------------------------------------------------------------------------------------ backup

const sha256File = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Consistent online snapshot of control.sqlite and the election databases (node:sqlite `backup`, QV-28 §12). Never contains the KEK. */
export async function backupWork(env: Env, pool: ElectionPool, jobId: string, scope: 'all' | 'election', electionId: string | undefined, ctl: JobCtl): Promise<JobOutcome> {
  const dir = join(env.cfg.dataDir, 'backups', jobId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files: { name: string; bytes: number; sha256: string }[] = [];
  const done = async (db: DatabaseSync, name: string): Promise<void> => {
    const dest = join(dir, name);
    await backup(db, dest);
    chmodSync(dest, 0o600);
    // the copy must open and pass a structural check before it is reported
    const t = new DatabaseSync(dest, { readOnly: true });
    try {
      const r = t.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
      if (r?.quick_check !== 'ok') throw new JobError('BACKUP_VERIFY', `backup of ${name} failed its integrity check`);
    } finally {
      t.close();
    }
    files.push({ name, bytes: statSync(dest).size, sha256: sha256File(dest) });
  };
  try {
    const targets: string[] = [];
    if (scope === 'election') {
      if (electionId === undefined || env.control.election(electionId) === undefined) throw new JobError('NOT_FOUND', 'no such election');
      targets.push(electionId);
    } else {
      await done(env.control.db, 'control.sqlite');
      let after: string | undefined;
      for (;;) {
        const rows = env.control.listAllElections(undefined, after, 200);
        if (rows.length === 0) break;
        for (const r of rows) targets.push(r.election_id);
        after = rows.at(-1)!.election_id;
      }
    }
    let i = 0;
    for (const id of targets) {
      await ctl.tick();
      const rt = await pool.get(id);
      if (!rt) continue;
      rt.inUse++;
      try {
        await done(rt.edb.db, `elections/${id}.sqlite`.replace('/', '-'));
      } finally {
        rt.inUse--;
      }
      ctl.progress(++i / Math.max(1, targets.length));
    }
    const manifest = { format: 'qv-backup/v1', job_id: jobId, created_at: new Date(env.nowMs()).toISOString(), scope, files, note: 'Sealed fields stay sealed under the instance KEK, which is NOT part of this backup.' };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1), { mode: 0o600 });
    env.control.setMeta('last_backup_at', manifest.created_at);
    env.control.audit('system', 'backup.create', jobId, { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) });
    return { result: { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }, result_ref: `backups/${jobId}` };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // no half-written backups
    throw e;
  }
}

// ------------------------------------------------------------------------------------------------------------ self-audit

export interface AuditFailure {
  seq?: number;
  rule: string;
  detail: string;
}

/** Full recomputation (QV-18 REQ-054): leaf hashes, body digests, the Merkle root, every stored checkpoint. Read-only. */
export async function auditLog(rt: ElectionRuntime, ctl?: JobCtl): Promise<{ ok: boolean; tree_size: number; checkpoints_checked: number; failures: AuditFailure[] }> {
  const store = rt.edb.store;
  const n = rt.log.size;
  const failures: AuditFailure[] = [];
  const fail = (rule: string, detail: string, seq?: number): void => {
    if (failures.length < 20) failures.push(seq === undefined ? { rule, detail } : { seq, rule, detail });
  };
  const tree = new MerkleTree();
  let bad = false;
  for (let i = 0; i < n; i++) {
    const e = store.getEntry(i);
    if (!e) {
      fail('MISSING_ENTRY', 'entry is missing from storage', i);
      bad = true;
      break;
    }
    const lh = hashLeaf(e.headerBytes);
    if (Buffer.compare(Buffer.from(lh), Buffer.from(e.leafHash)) !== 0) {
      fail('LEAF_HASH', 'stored leaf hash is not the hash of the stored header', i);
      bad = true;
    }
    const h = decodeHeader(e.headerBytes);
    if (!h.ok) {
      fail('HEADER', 'stored header does not parse', i);
      bad = true;
    } else if (e.body !== null && Buffer.compare(Buffer.from(bodyDigest(e.body)), Buffer.from(h.value.bodyDigest)) !== 0) {
      fail('BODY_DIGEST', 'stored body does not match the header digest', i);
      bad = true;
    }
    tree.appendLeafHash(lh);
    if (ctl && (i & 511) === 511) {
      ctl.progress((i / n) * 0.9);
      await ctl.tick();
    }
  }
  // The job yields (ctl.tick) while a live log keeps appending: compare against the in-memory tree AT THE AUDITED SIZE n, never
  // its current root, or every busy election would be falsely quarantined (security review 2026-10-21, SR-3).
  if (!bad && tree.size === n && Buffer.compare(Buffer.from(tree.root()), Buffer.from(rt.log.root(n))) !== 0) {
    fail('ROOT', 'recomputed root differs from the in-memory tree');
    bad = true;
  }
  let cps = 0;
  for (const cp of store.listCheckpoints()) {
    if (cp.size > n && cp.size <= rt.log.size) {
      // signed after the audit snapshot: not covered by the recomputation; check its signature and the in-memory tree only
      cps++;
      const p = parseCheckpoint(cp.note);
      if (!p.ok || p.value.origin !== rt.origin || p.value.size !== cp.size || !verifyLogSignature(p.value, rt.logPk)) {
        fail('CHECKPOINT_SIGNATURE', `checkpoint ${cp.size} is not a valid note signed by the log key`);
        bad = true;
      } else if (Buffer.compare(Buffer.from(rt.log.root(cp.size)), Buffer.from(cp.root)) !== 0) {
        fail('CHECKPOINT_ROOT', `checkpoint ${cp.size} does not match the in-memory tree`);
        bad = true;
      }
      continue;
    }
    cps++;
    const p = parseCheckpoint(cp.note);
    if (!p.ok || p.value.origin !== rt.origin || p.value.size !== cp.size) {
      fail('CHECKPOINT', `stored checkpoint ${cp.size} does not parse`);
      bad = true;
      continue;
    }
    if (!verifyLogSignature(p.value, rt.logPk)) {
      fail('CHECKPOINT_SIGNATURE', `checkpoint ${cp.size} is not signed by the log key`);
      bad = true;
    }
    if (cp.size > tree.size || (tree.size === n && Buffer.compare(Buffer.from(tree.root(cp.size)), Buffer.from(cp.root)) !== 0)) {
      fail('CHECKPOINT_ROOT', `checkpoint ${cp.size} does not match the recomputed tree`);
      bad = true;
    }
  }
  return { ok: !bad, tree_size: n, checkpoints_checked: cps, failures };
}

/** Self-audit job (REQ-054): quarantines a live log on mismatch. */
export async function selfAuditWork(env: Env, rt: ElectionRuntime, ctl: JobCtl): Promise<JobOutcome> {
  rt.inUse++;
  try {
    const r = await auditLog(rt, ctl);
    let incident: string | undefined;
    if (!r.ok && !rt.imported) incident = rt.markQuarantine('SELF_AUDIT_MISMATCH', 0, 'quarantine');
    env.control.audit('system', 'election.self_audit', rt.id, { ok: r.ok });
    return { result: { ...r, ...(incident ? { quarantined: true, incident } : {}) } };
  } finally {
    rt.inUse--;
  }
}

// ------------------------------------------------------------------------------------------------------------ quarantine clear

export async function clearQuarantine(env: Env, pool: ElectionPool, id: string, ack: string, verifiedAgainst: string[], actor: string): Promise<Record<string, unknown>> {
  const rt0 = await pool.get(id);
  if (!rt0) throw new ApiError(404, 'NOT_FOUND', 'no such election');
  const forced = rt0.forcedQuarantine === undefined ? undefined : (JSON.parse(rt0.forcedQuarantine) as { code: string; incident: string; min_size: number });
  const boardReason = rt0.quarantineReason();
  if (boardReason === undefined) throw new ApiError(409, 'STATE_CONFLICT', 'the election is not quarantined');
  if (rt0.edb.hasPermanentEvidence()) throw new ApiError(409, 'COMPROMISED', 'the log key signed contradictory histories (fork evidence); this quarantine cannot be cleared, retire the election instead');
  const incident = forced?.incident ?? `inc_${createHash('sha256').update(boardReason).digest('base64url').slice(0, 12)}`;
  if (!ctEq(utf8(ack), utf8(incident))) throw new ApiError(409, 'STATE_CONFLICT', 'ack does not match the current incident id');
  const known = new Set(env.cfg.witnesses.map((w) => w.name));
  const names = new Set<string>();
  for (const v of verifiedAgainst) {
    const m = /^witness:([^\s+]{1,64})$/.exec(v);
    if (!m || !known.has(m[1]!)) throw new ApiError(422, 'VALIDATION_FAILED', `verified_against entry ${JSON.stringify(v.slice(0, 40))} is not a configured witness`);
    names.add(m[1]!);
  }
  if (names.size === 0) throw new ApiError(422, 'VALIDATION_FAILED', 'verified_against must name at least one configured witness');
  // 1. re-open from disk: a fresh replay recomputes tree, grammar and every stored checkpoint (QV-18 REQ-053/054)
  const minSize = Math.max(forced?.min_size ?? 0, rt0.edb.maxEvidenceSize());
  await pool.evict(id);
  let rt: ElectionRuntime | undefined;
  try {
    rt = await pool.get(id);
  } catch {
    throw new ApiError(409, 'STATE_CONFLICT', 'the stored log cannot be re-opened (it does not replay); restore it from a verified backup first');
  }
  if (!rt) throw new ApiError(404, 'NOT_FOUND', 'no such election');
  if (rt.log.status.state === 'quarantine') throw new ApiError(409, 'STATE_CONFLICT', 'the stored log is still inconsistent after a fresh replay');
  const audit = await auditLog(rt);
  if (!audit.ok) throw new ApiError(409, 'STATE_CONFLICT', `a full self-audit still fails (${audit.failures[0]?.rule ?? 'unknown'}${audit.failures[0]?.seq !== undefined ? ` at seq ${audit.failures[0].seq}` : ''})`);
  if (rt.log.size < minSize) throw new ApiError(409, 'STATE_CONFLICT', `the log holds ${rt.log.size} entries but a checkpoint signed by this log covers ${minSize}: restore the newer database first`);
  // 2. every named witness must hold a valid cosignature over a stored checkpoint that this (re-verified) log reproduces, at least as large as the incident
  const policy = rt.witnessPolicy();
  const best = new Map<string, number>();
  for (const cp of rt.edb.store.listCheckpoints()) {
    const p = parseCheckpoint(cp.note);
    if (!p.ok) continue;
    for (const w of witnessStatus(p.value, { ...policy, quorum: Math.max(1, policy.quorum) }).valid.keys()) best.set(w, Math.max(best.get(w) ?? 0, cp.size));
  }
  for (const w of names) {
    const sz = best.get(w);
    if (sz === undefined || sz < minSize || sz === 0) throw new ApiError(409, 'STATE_CONFLICT', `witness ${w} has not cosigned a stored checkpoint of size >= ${Math.max(1, minSize)}`);
  }
  rt.clearForcedQuarantine();
  env.control.audit(actor, 'quarantine.clear', id, { incident, witnesses: [...names].join(',') });
  return { election_id: id, quarantined: false, incident, verified_against: [...names].map((n) => `witness:${n}`) };
}
