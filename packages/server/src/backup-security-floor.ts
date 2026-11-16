// SPDX-License-Identifier: AGPL-3.0-or-later
// Private recovery evidence. Never serialize these rows into the public backup report.
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

type Row = Record<string, SQLOutputValue>;
export interface BackupSecurityFloor {
  keys: Map<string, Row>;
  orgs: Map<string, Row>;
  hooks: Map<string, Row>;
  deletedHooks: Set<string>;
  nonces: Map<string, Row>;
  requests: Map<string, Row>;
  eventCursors: Map<string, Row>;
  invites: Map<string, Map<string, Row>>;
  operationReceipts: Map<string, Map<string, Row>>;
}
function rows(db: DatabaseSync, sql: string, keys: string[]): Map<string, Row> {
  return new Map(db.prepare(sql).all().map((row) => [JSON.stringify(keys.map((key) => row[key])), row]));
}
function same(a: SQLOutputValue | undefined, b: SQLOutputValue | undefined): boolean {
  return a instanceof Uint8Array && b instanceof Uint8Array ? Buffer.from(a).equals(b) : a === b;
}
function fields(a: Row, b: Row, names: string[]): boolean {
  return names.every((name) => same(a[name], b[name]));
}
export function controlSecurityFloor(db: DatabaseSync): BackupSecurityFloor {
  return {
    keys: rows(db, 'SELECT key_id,org_id,pk,alg,role,revoked_at FROM account_key', ['key_id']),
    orgs: rows(db, 'SELECT org_id,status FROM org', ['org_id']),
    hooks: rows(db, 'SELECT webhook_id,disabled_at FROM webhook', ['webhook_id']),
    deletedHooks: new Set(db.prepare("SELECT target FROM operator_audit WHERE action='webhook.delete' AND target IS NOT NULL").all().map((r) => JSON.stringify([r['target']]))),
    nonces: rows(db, 'SELECT key_id,nonce,expires_at FROM replay_nonce', ['key_id', 'nonce']),
    requests: rows(db, 'SELECT principal,idem_key,method,path,req_sha256,status,response,expires_at FROM idempotency', ['principal', 'idem_key']),
    eventCursors: rows(db, 'SELECT election_id,event_id FROM webhook_event_cursor', ['election_id']),
    invites: new Map(),
    operationReceipts: new Map(),
  };
}
export function inviteSecurityFloor(db: DatabaseSync): Map<string, Row> {
  // Only keep presence markers for erased data, never decrypted or encrypted contact values.
  return rows(db, 'SELECT invite_id,code_hash,state,created_at,expires_at,closed_at,label_enc IS NULL AS label_erased,contact_enc IS NULL AS contact_erased FROM voter_invite', ['invite_id']);
}
export function operationReceiptSecurityFloor(db: DatabaseSync): Map<string, Row> {
  return rows(db, 'SELECT principal,idem_key,method,path,req_sha256,expires_at,status,response,audit_action,audit_detail FROM operation_receipt', ['principal', 'idem_key']);
}
function pendingReceipt(request: Row | undefined, receipt: Row): boolean {
  return request !== undefined && (request['status'] === 0 || request['status'] === -1) &&
    fields(request, receipt, ['method', 'path', 'req_sha256', 'expires_at']);
}
function completedReceipt(request: Row | undefined, receipt: Row): boolean {
  if (!request || !fields(request, receipt, ['method', 'path', 'req_sha256', 'status']) ||
      Number(request['expires_at']) < Number(receipt['expires_at'])) return false;
  const body = request['response'];
  return receipt['response'] === null ? body === null : body instanceof Uint8Array && Buffer.from(body).toString() === receipt['response'];
}
/** Reject rollback of security state that does not advance the public Merkle tree. */
export function preservesSecurityFloor(candidate: BackupSecurityFloor, floor: BackupSecurityFloor, now: number): boolean {
  for (const [id, old] of floor.keys) {
    const next = candidate.keys.get(id);
    if (!next || !fields(next, old, ['key_id', 'org_id', 'pk', 'alg', 'role']) ||
        (old['revoked_at'] !== null && next['revoked_at'] === null)) return false;
  }
  for (const [id, old] of floor.orgs) {
    const next = candidate.orgs.get(id);
    if (!next || (old['status'] !== 'active' && next['status'] === 'active') ||
        (old['status'] === 'deleted' && next['status'] !== 'deleted')) return false;
  }
  for (const [id, old] of floor.hooks) {
    const next = candidate.hooks.get(id);
    if (old['disabled_at'] !== null && (next ? next['disabled_at'] === null : !candidate.deletedHooks.has(id))) return false;
  }
  // Preserve deletion evidence as well, so the next recovery floor cannot forget it.
  for (const id of floor.deletedHooks) if (candidate.hooks.has(id) || !candidate.deletedHooks.has(id)) return false;
  for (const [id, old] of floor.nonces) {
    if (Number(old['expires_at']) < now) continue;
    const next = candidate.nonces.get(id);
    if (!next || Number(next['expires_at']) < Number(old['expires_at'])) return false;
  }
  for (const [id, old] of floor.requests) {
    if (Number(old['expires_at']) < now) continue;
    const next = candidate.requests.get(id);
    if (!next || !fields(next, old, ['method', 'path', 'req_sha256']) || Number(next['expires_at']) < Number(old['expires_at']) ||
        (Number(old['status']) !== 0 && Number(next['status']) === 0) ||
        (Number(old['status']) > 0 && !fields(next, old, ['status', 'response']))) return false;
  }
  for (const [id, old] of floor.eventCursors) {
    const next = candidate.eventCursors.get(id);
    if (!next || Number(next['event_id']) < Number(old['event_id'])) return false;
  }
  for (const [election, receipts] of floor.operationReceipts) {
    for (const [id, old] of receipts) {
      if (Number(old['expires_at']) <= now) continue;
      const next = candidate.operationReceipts.get(election)?.get(id);
      const response = candidate.requests.get(id);
      const before = floor.requests.get(id);
      const pending = pendingReceipt(before, old);
      const completed = completedReceipt(response, old);
      if (next && fields(next, old, ['method', 'path', 'req_sha256', 'expires_at', 'status', 'response', 'audit_action', 'audit_detail'])) {
        // A retained receipt is usable only with its exact pending generation or an equivalent completed result.
        if (pending && !pendingReceipt(response, old) && !completed) return false;
        continue;
      }
      // Completion may extend the cache expiry. Already completed floors may also discard redundant receipts.
      if ((!pending && !completedReceipt(before, old)) || !completed) return false;
    }
  }
  for (const [election, invites] of floor.invites) {
    const nextInvites = candidate.invites.get(election);
    if (!nextInvites) return false;
    for (const [id, old] of invites) {
      const next = nextInvites.get(id);
      if (!next || !fields(next, old, ['code_hash', 'created_at', 'expires_at']) ||
          (old['state'] !== 'issued' && old['state'] !== 'sent' && (next['state'] === 'issued' || next['state'] === 'sent')) ||
          (old['closed_at'] !== null && (next['closed_at'] === null || Number(next['closed_at']) > Number(old['closed_at']))) ||
          (old['label_erased'] === 1 && next['label_erased'] !== 1) ||
          (old['contact_erased'] === 1 && next['contact_erased'] !== 1)) return false;
    }
  }
  return true;
}
