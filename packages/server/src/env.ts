import type { WitnessPolicy } from '@quietvote/board';
import type { ServerConfig } from './config.ts';
import type { ControlDb } from './controldb.ts';
import type { ElectionDb, EventRow } from './electiondb.ts';
import type { Logger } from './logger.ts';
import type { FailureCounter, RateLimiter } from './ratelimit.ts';

/** Shared process-wide services handed to every component. */
export interface Env {
  cfg: ServerConfig;
  control: ControlDb;
  kek: Buffer;
  limiter: RateLimiter;
  failures: FailureCounter;
  logger: Logger;
  /** Counters exposed for tests (e.g. QV-29-REQ-001: no proof verification before cheap checks pass). */
  stats: { proofVerifications: number; requests: number; appended: number; importVerifications: number };
  inflight: { n: number };
  nowMs(): number;
  nowSec(): number;
  witnessPolicy(quorum: number): WitnessPolicy;
  /** Retry committed election events into durable webhook delivery rows. Returns false on storage failure. */
  recoverEvents?: (who: { electionId: string; orgId: string }, db: ElectionDb) => boolean;
  /** Committed outbox events; wired to the webhook dispatcher. */
  onEvent?: (who: { electionId: string; orgId: string }, ev: EventRow) => void;
}
