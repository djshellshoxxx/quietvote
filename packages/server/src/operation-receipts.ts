// Election-owned receipts bridge an already committed mutation into the control response cache.
// They contain replay-safe public results only; secrets are redacted before entering this table.
import type { ElectionDb } from './electiondb.ts';
import type { Env } from './env.ts';
import type { Reply } from './http.ts';

export interface OperationReceipt {
  principal: string;
  idem_key: string;
  method: string;
  path: string;
  req_sha256: Uint8Array;
  expires_at: number;
  status: number;
  response: string | null;
  audit_action: 'election.create' | 'quarantine.clear' | 'export.acknowledge' | 'export.notice' | null;
  audit_detail: string | null;
}
export type OperationJournal = (db: ElectionDb, reply: Reply, audit?: {
  action: NonNullable<OperationReceipt['audit_action']>;
  detail?: Record<string, string | number | boolean>;
}) => void;

/** Exact generation matching prevents an old receipt from reviving an expired/reused key. */
export function bridgeOperationReceipt(env: Env, db: ElectionDb, receipt: OperationReceipt): void {
  const control = env.control;
  const prev = control.idem(receipt.principal, receipt.idem_key);
  if (!prev || (prev.status !== 0 && prev.status !== -1) || prev.expires_at <= env.nowMs() || prev.expires_at !== receipt.expires_at ||
    prev.method !== receipt.method || prev.path !== receipt.path || !Buffer.from(prev.req_sha256).equals(Buffer.from(receipt.req_sha256))) return;
  control.tx(() => {
    const row = db.row();
    if (receipt.audit_action === 'quarantine.clear') control.setQuarantineFlag(row.election_id, row.quarantine);
    if (receipt.audit_action) control.audit(receipt.principal, receipt.audit_action, row.election_id,
      receipt.audit_detail ? JSON.parse(receipt.audit_detail) as Record<string, string | number | boolean> : {});
    control.storeIdem(receipt.principal, receipt.idem_key, receipt.method, receipt.path, receipt.req_sha256,
      receipt.status, receipt.response === null ? null : Buffer.from(receipt.response));
  });
}
