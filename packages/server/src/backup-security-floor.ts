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
  invites: Map<string, Map<string, Row>>;
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
    invites: new Map(),
  };
}
export function inviteSecurityFloor(db: DatabaseSync): Map<string, Row> {
  // Only keep presence markers for erased data, never decrypted or encrypted contact values.
  return rows(db, 'SELECT invite_id,code_hash,state,label_enc IS NULL AS label_erased,contact_enc IS NULL AS contact_erased FROM voter_invite', ['invite_id']);
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
    if (old['disabled_at'] !== null && next?.['disabled_at'] === null) return false;
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
  for (const [election, invites] of floor.invites) {
    const nextInvites = candidate.invites.get(election);
    if (!nextInvites) return false;
    for (const [id, old] of invites) {
      const next = nextInvites.get(id);
      if (!next || !same(next['code_hash'], old['code_hash']) ||
          (old['state'] !== 'issued' && old['state'] !== 'sent' && (next['state'] === 'issued' || next['state'] === 'sent')) ||
          (old['label_erased'] === 1 && next['label_erased'] !== 1) ||
          (old['contact_erased'] === 1 && next['contact_erased'] !== 1)) return false;
    }
  }
  return true;
}
