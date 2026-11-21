// Recorded PUBLIC export limits and persistent metadata (QV-ADR-027 N-32(b)).
export const EXPORT_DOWNLOAD_MS = 7 * 86_400_000;
export const EXPORT_DELETE_GRACE_MS = 30 * 86_400_000;
export const MAX_PUBLIC_EXPORTS = 32;
export const MAX_PUBLIC_EXPORT_BYTES = 128 * 1024 * 1024;

/** Public bytes only. Times are server-clock epoch milliseconds. */
export interface PublicExportRow {
  export_id: string;
  job_id: string;
  kind: 'public';
  tree_size: number;
  root_hash: Uint8Array;
  sha256: Uint8Array;
  byte_length: number;
  created_at: number;
  expires_at: number;
  acknowledged_at: number | null;
  notice_at: number | null;
}
