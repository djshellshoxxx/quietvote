// control.sqlite (QV-28 §8.1): organizations, keys, election registry, idempotency, replay nonces, operator audit.
// It holds no election content beyond the registry row (QV-28-REQ-019).
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { all, closeDb, get, openDb, run, tx, type Migration } from './db.ts';
import { randomId } from './util.ts';

export const ELECTION_STATES = [
  'DRAFT', 'SETUP', 'CEREMONY', 'SETUP_KEYED', 'READY', 'OPEN', 'PAUSED', 'CLOSED', 'TALLYING', 'STALLED', 'TALLIED', 'CHALLENGED',
  'AUDIT', 'ARCHIVED', 'INVALIDATED', 'CANCELLED', 'ABORTED', 'DELETED', 'IMPORTED',
] as const;
export type ElectionStateName = (typeof ELECTION_STATES)[number];

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 BLOB NOT NULL CHECK (length(sha256)=32), applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT;
CREATE TABLE instance_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE org (
  org_id TEXT PRIMARY KEY CHECK (length(org_id)=26), name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  quota_bytes INTEGER NOT NULL DEFAULT 5368709120, deleted_at INTEGER) STRICT;
CREATE TABLE account_key (
  key_id TEXT PRIMARY KEY, org_id TEXT REFERENCES org(org_id) ON DELETE RESTRICT, pk BLOB NOT NULL, alg TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('org_owner','org_organizer','instance_admin')),
  label TEXT CHECK (label IS NULL OR length(label)<=80), created_at INTEGER NOT NULL, revoked_at INTEGER,
  CHECK ((role='instance_admin') = (org_id IS NULL))) STRICT;
CREATE INDEX account_key_org ON account_key(org_id) WHERE revoked_at IS NULL;
CREATE TABLE election_registry (
  election_id TEXT PRIMARY KEY CHECK (length(election_id)=32 AND election_id NOT GLOB '*[^0-9a-f]*'),
  org_id TEXT NOT NULL REFERENCES org(org_id) ON DELETE RESTRICT, db_path TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('DRAFT','SETUP','CEREMONY','SETUP_KEYED','READY','OPEN','PAUSED','CLOSED','TALLYING','STALLED','TALLIED','CHALLENGED','AUDIT','ARCHIVED','INVALIDATED','CANCELLED','ABORTED','DELETED','IMPORTED')),
  access TEXT NOT NULL DEFAULT 'public' CHECK (access IN ('public','link')), title TEXT NOT NULL,
  dek_wrapped BLOB, kek_id TEXT, created_at INTEGER NOT NULL, opened_at INTEGER, closed_at INTEGER, audit_close_at INTEGER,
  archived_at INTEGER, delete_after INTEGER, deleted_at INTEGER, imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
  bytes_used INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE INDEX election_registry_org ON election_registry(org_id, created_at DESC);
CREATE TABLE idempotency (
  principal TEXT NOT NULL, idem_key TEXT NOT NULL CHECK (length(idem_key) BETWEEN 8 AND 128), method TEXT NOT NULL, path TEXT NOT NULL,
  req_sha256 BLOB NOT NULL, status INTEGER NOT NULL, response BLOB, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY (principal, idem_key)) STRICT, WITHOUT ROWID;
CREATE INDEX idempotency_exp ON idempotency(expires_at);
CREATE TABLE replay_nonce (
  key_id TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (key_id, nonce)) STRICT, WITHOUT ROWID;
CREATE INDEX replay_nonce_exp ON replay_nonce(expires_at);
CREATE TABLE operator_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
  detail TEXT NOT NULL DEFAULT '{}') STRICT;
CREATE TRIGGER operator_audit_ro_u BEFORE UPDATE ON operator_audit BEGIN SELECT RAISE(ABORT,'append-only'); END;
`,
  },
  {
    version: 2,
    name: 'webhook',
    // QV-28 §8.1 `webhook`: target URL and signing secret are stored sealed under the instance KEK.
    sql: `
CREATE TABLE webhook (
  webhook_id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES org(org_id), election_id TEXT, url_enc BLOB NOT NULL, secret_enc BLOB NOT NULL,
  events TEXT NOT NULL, created_at INTEGER NOT NULL, disabled_at INTEGER) STRICT;
CREATE INDEX webhook_org ON webhook(org_id, election_id) WHERE disabled_at IS NULL;
`,
  },
  {
    version: 3,
    name: 'webhook_retry_state',
    // Persisted delivery state (QV-09 §6.3): consecutive terminal failures per hook, and the pending outbox of deliveries that
    // are queued, in flight or waiting for a retry. A row is removed when its delivery succeeds, fails for good, or is pruned.
    // `body` is the public P0 event payload only (the same bytes the receiver gets); no URL or secret is stored here.
    sql: `
ALTER TABLE webhook ADD COLUMN failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0);
CREATE TABLE webhook_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL UNIQUE,
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  body TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  next_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL) STRICT;
CREATE INDEX webhook_outbox_hook ON webhook_outbox(webhook_id);
`,
  },
  {
    version: 4,
    name: 'jobs_quarantine_flag',
    // QV-28 §8.1 `job` (imports, backups, self-audits, deletions; P4, no PII) plus a registry flag so /admin/status can list quarantined
    // elections without opening every election database.
    sql: `
CREATE TABLE job (
  job_id      TEXT PRIMARY KEY CHECK (length(job_id)=26),
  kind        TEXT NOT NULL CHECK (kind IN ('export','import','delete','backup','self_audit','redact','migrate')),
  election_id TEXT,
  state       TEXT NOT NULL CHECK (state IN ('queued','running','done','failed','expired')),
  params      TEXT NOT NULL DEFAULT '{}',
  progress    REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  result      TEXT,
  result_ref  TEXT,
  error       TEXT,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, expires_at INTEGER
) STRICT;
CREATE INDEX job_state ON job(state, created_at);
ALTER TABLE election_registry ADD COLUMN quarantine TEXT;
`,
  },
];

export interface OutboxRow {
  seq: number;
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  body: string;
  attempt: number;
  next_at: number;
  created_at: number;
}

export interface WebhookRow {
  webhook_id: string;
  org_id: string;
  election_id: string | null;
  url_enc: Uint8Array;
  secret_enc: Uint8Array;
  events: string;
  created_at: number;
  disabled_at: number | null;
  failures: number;
}

export interface AccountKey {
  key_id: string;
  org_id: string | null;
  pk: Uint8Array;
  alg: string;
  role: 'org_owner' | 'org_organizer' | 'instance_admin';
  label: string | null;
  created_at: number;
  revoked_at: number | null;
}
export interface Org {
  org_id: string;
  name: string;
  created_at: number;
  status: string;
}
export type JobKind = 'export' | 'import' | 'delete' | 'backup' | 'self_audit' | 'redact' | 'migrate';
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'expired';
export interface JobRow {
  job_id: string;
  kind: JobKind;
  election_id: string | null;
  state: JobState;
  params: string;
  progress: number;
  result: string | null;
  result_ref: string | null;
  error: string | null;
  created_by: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  expires_at: number | null;
}

export interface RegistryRow {
  election_id: string;
  org_id: string;
  db_path: string;
  state: ElectionStateName;
  access: 'public' | 'link';
  title: string;
  dek_wrapped: Uint8Array | null;
  created_at: number;
  opened_at: number | null;
  closed_at: number | null;
  audit_close_at: number | null;
  archived_at: number | null;
  bytes_used: number;
  imported?: number;
  quarantine?: string | null;
}

export class ControlDb {
  readonly db: DatabaseSync;
  private readonly now: () => number;
  constructor(dataDir: string, now: () => number, appVersion: string) {
    this.now = now;
    this.db = openDb({ path: join(dataDir, 'control.sqlite'), applicationId: 0x51564343, synchronous: 'NORMAL', migrations: MIGRATIONS, appVersion });
  }
  close(): void {
    closeDb(this.db);
  }
  tx<T>(fn: () => T): T {
    return tx(this.db, fn);
  }

  instanceId(): string {
    const r = get<{ value: string }>(this.db, "SELECT value FROM instance_meta WHERE key='instance_id'");
    if (r) return r.value;
    const id = randomId();
    run(this.db, "INSERT OR IGNORE INTO instance_meta(key,value) VALUES ('instance_id',?)", id);
    return get<{ value: string }>(this.db, "SELECT value FROM instance_meta WHERE key='instance_id'")!.value;
  }

  // ---- orgs and keys
  createOrg(name: string, keyId: string, pk: Uint8Array): Org {
    return this.tx(() => {
      const org_id = randomId();
      const t = this.now();
      run(this.db, 'INSERT INTO org(org_id,name,created_at) VALUES (?,?,?)', org_id, name, t);
      run(this.db, "INSERT INTO account_key(key_id,org_id,pk,alg,role,created_at) VALUES (?,?,?,?, 'org_owner', ?)", keyId, org_id, pk, 'ed25519', t);
      return { org_id, name, created_at: t, status: 'active' };
    });
  }
  getOrg(orgId: string): Org | undefined {
    return get<Org>(this.db, "SELECT org_id,name,created_at,status FROM org WHERE org_id=? AND status<>'deleted'", orgId);
  }
  keyById(keyId: string): AccountKey | undefined {
    return get<AccountKey>(this.db, 'SELECT * FROM account_key WHERE key_id=? AND revoked_at IS NULL', keyId);
  }
  keyAnyById(keyId: string): AccountKey | undefined {
    return get<AccountKey>(this.db, 'SELECT * FROM account_key WHERE key_id=?', keyId);
  }
  orgKeys(orgId: string): AccountKey[] {
    return all<AccountKey>(this.db, 'SELECT * FROM account_key WHERE org_id=? AND revoked_at IS NULL ORDER BY created_at, key_id', orgId);
  }
  addKey(orgId: string | null, keyId: string, pk: Uint8Array, role: AccountKey['role'], label: string | null): void {
    run(this.db, 'INSERT INTO account_key(key_id,org_id,pk,alg,role,label,created_at) VALUES (?,?,?,?,?,?,?)', keyId, orgId, pk, 'ed25519', role, label, this.now());
  }
  revokeKey(keyId: string): void {
    run(this.db, 'UPDATE account_key SET revoked_at=? WHERE key_id=?', this.now(), keyId);
  }
  seedAdmin(keyId: string, pk: Uint8Array): void {
    if (!this.keyAnyById(keyId)) this.addKey(null, keyId, pk, 'instance_admin', null);
  }

  // ---- registry
  insertElection(r: { election_id: string; org_id: string; db_path: string; access: 'public' | 'link'; title: string; dek_wrapped: Uint8Array }): void {
    run(this.db, "INSERT INTO election_registry(election_id,org_id,db_path,state,access,title,dek_wrapped,created_at) VALUES (?,?,?, 'DRAFT', ?,?,?,?)",
      r.election_id, r.org_id, r.db_path, r.access, r.title, r.dek_wrapped, this.now());
  }
  election(id: string): RegistryRow | undefined {
    return get<RegistryRow>(this.db, "SELECT * FROM election_registry WHERE election_id=? AND state<>'DELETED'", id);
  }
  countElections(orgId: string): number {
    return get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM election_registry WHERE org_id=? AND state<>'DELETED'", orgId)?.n ?? 0;
  }
  listElections(orgId: string, state: string | undefined, after: string | undefined, limit: number): RegistryRow[] {
    return all<RegistryRow>(this.db,
      `SELECT * FROM election_registry WHERE org_id=? AND state<>'DELETED' AND (? IS NULL OR state=?) AND (? IS NULL OR election_id>?) ORDER BY election_id LIMIT ?`,
      orgId, state ?? null, state ?? null, after ?? null, after ?? null, limit);
  }
  setState(id: string, state: ElectionStateName, title?: string): void {
    const t = this.now();
    run(this.db, 'UPDATE election_registry SET state=? WHERE election_id=?', state, id);
    if (title !== undefined) run(this.db, 'UPDATE election_registry SET title=? WHERE election_id=?', title, id);
    const col = state === 'OPEN' ? 'opened_at' : state === 'CLOSED' ? 'closed_at' : state === 'ARCHIVED' ? 'archived_at' : undefined;
    if (col) run(this.db, `UPDATE election_registry SET ${col}=? WHERE election_id=? AND ${col} IS NULL`, t, id);
  }
  setBytes(id: string, bytes: number): void {
    run(this.db, 'UPDATE election_registry SET bytes_used=? WHERE election_id=?', bytes, id);
  }
  markDeleted(id: string): void {
    run(this.db, "UPDATE election_registry SET state='DELETED', dek_wrapped=NULL, deleted_at=? WHERE election_id=?", this.now(), id);
  }

  /** Any registry row, deleted tombstones included (an id is never reused). */
  electionAny(id: string): { election_id: string; state: ElectionStateName } | undefined {
    return get(this.db, 'SELECT election_id,state FROM election_registry WHERE election_id=?', id) as never;
  }
  insertImported(r: { election_id: string; org_id: string; db_path: string; access: 'public' | 'link'; title: string; bytes_used: number }): void {
    run(this.db, "INSERT INTO election_registry(election_id,org_id,db_path,state,access,title,dek_wrapped,created_at,imported,bytes_used) VALUES (?,?,?, 'IMPORTED', ?,?, NULL, ?, 1, ?)",
      r.election_id, r.org_id, r.db_path, r.access, r.title, this.now(), r.bytes_used);
  }
  /** Instance-wide listing for /admin (never exposes P2 data: registry columns only). */
  listAllElections(state: string | undefined, after: string | undefined, limit: number): RegistryRow[] {
    return all<RegistryRow>(this.db,
      `SELECT * FROM election_registry WHERE state<>'DELETED' AND (? IS NULL OR state=?) AND (? IS NULL OR election_id>?) ORDER BY election_id LIMIT ?`,
      state ?? null, state ?? null, after ?? null, after ?? null, limit);
  }
  countAllElections(): number {
    return get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM election_registry WHERE state<>'DELETED'")?.n ?? 0;
  }
  electionsByState(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of all<{ state: string; n: number }>(this.db, "SELECT state, COUNT(*) AS n FROM election_registry WHERE state<>'DELETED' GROUP BY state")) out[r.state] = r.n;
    return out;
  }
  setQuarantineFlag(id: string, reason: string | null): void {
    run(this.db, 'UPDATE election_registry SET quarantine=? WHERE election_id=?', reason, id);
  }
  quarantinedElections(): { election_id: string; quarantine: string }[] {
    return all<{ election_id: string; quarantine: string }>(this.db, "SELECT election_id,quarantine FROM election_registry WHERE quarantine IS NOT NULL AND state<>'DELETED' ORDER BY election_id");
  }
  migrationVersion(): number {
    return get<{ user_version: number }>(this.db, 'PRAGMA user_version')?.user_version ?? 0;
  }

  // ---- jobs
  createJob(j: { job_id: string; kind: JobKind; election_id: string | null; params: string; created_by: string }): JobRow {
    const t = this.now();
    run(this.db, 'DELETE FROM job WHERE expires_at IS NOT NULL AND expires_at < ?', t);
    run(this.db, "INSERT INTO job(job_id,kind,election_id,state,params,created_by,created_at) VALUES (?,?,?, 'queued', ?,?,?)", j.job_id, j.kind, j.election_id, j.params, j.created_by, t);
    return this.job(j.job_id)!;
  }
  job(id: string): JobRow | undefined {
    return get<JobRow>(this.db, 'SELECT * FROM job WHERE job_id=?', id);
  }
  startJob(id: string): void {
    run(this.db, "UPDATE job SET state='running', started_at=? WHERE job_id=? AND state='queued'", this.now(), id);
  }
  setJobProgress(id: string, p: number): void {
    run(this.db, "UPDATE job SET progress=? WHERE job_id=? AND state='running'", Math.max(0, Math.min(1, p)), id);
  }
  finishJob(id: string, r: { state: 'done' | 'failed'; result?: unknown; result_ref?: string | null; error?: unknown }, retentionMs: number): void {
    const t = this.now();
    run(this.db, 'UPDATE job SET state=?, progress=?, result=?, result_ref=?, error=?, finished_at=?, expires_at=? WHERE job_id=? AND state IN (\'queued\',\'running\')',
      r.state, r.state === 'done' ? 1 : 0, r.result === undefined ? null : JSON.stringify(r.result), r.result_ref ?? null,
      r.error === undefined ? null : JSON.stringify(r.error), t, t + retentionMs, id);
  }
  /** Jobs that were queued or running when the process died cannot resume (their input lived in memory). */
  failInterruptedJobs(retentionMs: number): number {
    const t = this.now();
    const r = run(this.db, "UPDATE job SET state='failed', error=?, finished_at=?, expires_at=? WHERE state IN ('queued','running')",
      JSON.stringify({ code: 'INTERRUPTED', detail: 'the server restarted before the job finished; submit it again' }), t, t + retentionMs);
    return Number(r.changes);
  }
  meta(key: string): string | undefined {
    return get<{ value: string }>(this.db, 'SELECT value FROM instance_meta WHERE key=?', key)?.value;
  }
  setMeta(key: string, value: string): void {
    run(this.db, 'INSERT INTO instance_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
  }

  // ---- webhooks
  insertWebhook(r: { webhook_id: string; org_id: string; election_id: string | null; url_enc: Uint8Array; secret_enc: Uint8Array; events: string }): void {
    run(this.db, 'INSERT INTO webhook(webhook_id,org_id,election_id,url_enc,secret_enc,events,created_at) VALUES (?,?,?,?,?,?,?)',
      r.webhook_id, r.org_id, r.election_id, r.url_enc, r.secret_enc, r.events, this.now());
  }
  webhook(id: string): WebhookRow | undefined {
    return get<WebhookRow>(this.db, 'SELECT * FROM webhook WHERE webhook_id=?', id);
  }
  webhooksOf(orgId: string): WebhookRow[] {
    return all<WebhookRow>(this.db, 'SELECT * FROM webhook WHERE org_id=? ORDER BY created_at, webhook_id', orgId);
  }
  countWebhooks(orgId: string): number {
    return get<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM webhook WHERE org_id=?', orgId)?.n ?? 0;
  }
  /** Enabled webhooks of the organization that listen to this election (or to all of its elections). */
  webhooksFor(orgId: string, electionId: string): WebhookRow[] {
    return all<WebhookRow>(this.db, 'SELECT * FROM webhook WHERE org_id=? AND disabled_at IS NULL AND (election_id IS NULL OR election_id=?)', orgId, electionId);
  }
  deleteWebhook(id: string): void {
    this.tx(() => {
      run(this.db, 'DELETE FROM webhook_outbox WHERE webhook_id=?', id);
      run(this.db, 'DELETE FROM webhook WHERE webhook_id=?', id);
    });
  }
  disableWebhook(id: string): void {
    this.tx(() => {
      run(this.db, 'DELETE FROM webhook_outbox WHERE webhook_id=?', id);
      run(this.db, 'UPDATE webhook SET disabled_at=? WHERE webhook_id=? AND disabled_at IS NULL', this.now(), id);
    });
  }
  /** Sets the consecutive terminal-failure count and returns the stored value. */
  setWebhookFailures(id: string, n: number): number {
    run(this.db, 'UPDATE webhook SET failures=? WHERE webhook_id=?', n, id);
    return n;
  }

  // ---- webhook outbox (pending deliveries survive restarts; WebhookService is the only writer)
  outboxCount(): number {
    return get<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM webhook_outbox')?.n ?? 0;
  }
  outboxInsert(r: { delivery_id: string; webhook_id: string; event_type: string; body: string; attempt: number; next_at: number }): void {
    run(this.db, 'INSERT INTO webhook_outbox(delivery_id,webhook_id,event_type,body,attempt,next_at,created_at) VALUES (?,?,?,?,?,?,?)',
      r.delivery_id, r.webhook_id, r.event_type, r.body, r.attempt, r.next_at, this.now());
  }
  /**
   * Removes the oldest rows (by insertion order) whose ids are not in `skip` until at most `keep` such rows remain.
   * Returns the removed delivery ids. Rows are only scanned when the table is over `keep` in total.
   */
  outboxPruneTo(keep: number, skip: ReadonlySet<string> = new Set()): string[] {
    const limit = Math.max(0, keep);
    if (this.outboxCount() <= limit) return [];
    const candidates = all<{ delivery_id: string }>(this.db, 'SELECT delivery_id FROM webhook_outbox ORDER BY seq')
      .map((r) => r.delivery_id)
      .filter((id) => !skip.has(id));
    const ids = candidates.slice(0, Math.max(0, candidates.length - limit));
    for (const id of ids) run(this.db, 'DELETE FROM webhook_outbox WHERE delivery_id=?', id);
    return ids;
  }
  outboxAll(): OutboxRow[] {
    return all<OutboxRow>(this.db, 'SELECT * FROM webhook_outbox ORDER BY seq');
  }
  outboxDelete(deliveryId: string): void {
    run(this.db, 'DELETE FROM webhook_outbox WHERE delivery_id=?', deliveryId);
  }
  /** Schedules the next attempt. Returns false when the row is gone (pruned or its webhook was removed). */
  outboxReschedule(deliveryId: string, attempt: number, nextAt: number): boolean {
    return Number(run(this.db, 'UPDATE webhook_outbox SET attempt=?, next_at=? WHERE delivery_id=?', attempt, nextAt, deliveryId).changes) === 1;
  }

  // ---- idempotency (QV-09 §4.4)
  idem(principal: string, key: string): { req_sha256: Uint8Array; status: number; response: Uint8Array | null; expires_at: number } | undefined {
    return get(this.db, 'SELECT req_sha256,status,response,expires_at FROM idempotency WHERE principal=? AND idem_key=?', principal, key) as never;
  }
  storeIdem(principal: string, key: string, method: string, path: string, reqHash: Uint8Array, status: number, response: Uint8Array | null): void {
    const t = this.now();
    run(this.db, 'DELETE FROM idempotency WHERE expires_at < ?', t);
    run(this.db, 'INSERT OR REPLACE INTO idempotency(principal,idem_key,method,path,req_sha256,status,response,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      principal, key, method, path, reqHash, status, response, t, t + 24 * 3600_000);
  }

  /** Removes the in-progress marker of a request that failed, so the client may retry with the same key. */
  dropIdemInProgress(principal: string, key: string): void {
    run(this.db, 'DELETE FROM idempotency WHERE idem_key=? AND principal=? AND status=0', key, principal);
  }

  // ---- signed-request replay cache
  /** Returns false if (key, nonce) was already used inside its window. */
  recordNonce(keyId: string, nonce: string, expiresAtMs: number): boolean {
    const t = this.now();
    run(this.db, 'DELETE FROM replay_nonce WHERE expires_at < ?', t);
    const r = run(this.db, 'INSERT OR IGNORE INTO replay_nonce(key_id,nonce,expires_at) VALUES (?,?,?)', keyId, nonce, expiresAtMs);
    return Number(r.changes) === 1;
  }

  audit(actor: string, action: string, target: string | null, detail: Record<string, string | number | boolean> = {}): void {
    run(this.db, 'INSERT INTO operator_audit(ts,actor,action,target,detail) VALUES (?,?,?,?,?)', this.now(), actor, action, target, JSON.stringify(detail));
  }
  auditRows(): { ts: number; actor: string; action: string; target: string | null }[] {
    return all(this.db, 'SELECT ts,actor,action,target FROM operator_audit ORDER BY id') as never;
  }
}
