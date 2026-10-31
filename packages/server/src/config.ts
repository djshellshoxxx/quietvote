import { parseTargetUrl, TargetRejected, type WebhookResolver, type WebhookTransport } from './ssrf.ts';
// Server configuration with compiled-in hard bounds (QV-29 §5): a misconfiguration refuses start.

export interface RateSpec {
  /** Sustained requests per window. */
  limit: number;
  windowSec: number;
  /** Bucket capacity; defaults to `limit`. */
  burst?: number;
}

export interface RateConfig {
  read: RateSpec;
  proof: RateSpec;
  /** POST log/entries per author key (checked after signature verification). */
  writeKey: RateSpec;
  /** POST log/entries per network bucket (checked before any parsing). */
  writePre: RateSpec;
  auth: RateSpec;
  manage: RateSpec;
  export: RateSpec;
  gossip: RateSpec;
  /** Failed registrations per invite hash / bucket. */
  inviteFail: RateSpec;
}

export interface ServerOptions {
  dataDir: string;
  /** Audience bound into signed requests, e.g. "https://vote.example". */
  publicUrl?: string;
  host?: string;
  port?: number;
  /** Milliseconds since epoch. Injectable for tests. */
  now?: () => number;
  registrationMode?: 'open' | 'token' | 'closed';
  registrationTokens?: string[];
  /** Hex Ed25519 public keys seeded as instance admins. */
  adminKeys?: string[];
  /** Origins allowed for credentialed (non-public) CORS. */
  allowedOrigins?: string[];
  staticDir?: string;
  /** Hex 32-byte seed for the optional release-manifest signature. */
  releaseSeedHex?: string;
  /** Receives one JSON line per event. Default: stderr. */
  logSink?: (line: string) => void;
  /** Request header carrying a proxy-supplied bucket id (never a raw IP). */
  bucketHeader?: string;
  /** Trusted cosigners for checkpoints. */
  witnesses?: { name: string; publicKey: string }[];
  rate?: Partial<RateConfig>;
  maxBallotBytes?: number;
  maxControlEntryBytes?: number;
  maxRequestBytes?: number;
  maxJsonBytes?: number;
  maxHeaderBytes?: number;
  headersTimeoutMs?: number;
  requestTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
  maxConnections?: number;
  maxRequestsPerSocket?: number;
  maxVerifyQueue?: number;
  /** Minimum seconds between accepted ballots/audits from one voter key (hard floor 2). */
  minBallotIntervalSec?: number;
  /** Attempts per voter key per hour, counted after signature verification. */
  maxBallotAttemptsPerHour?: number;
  maxLogBytes?: number;
  /** Soft cap on the entry bytes (headers + bodies) in one GET log/entries page; a page always holds at least one entry. */
  maxPageBytes?: number;
  minFreeBytes?: number;
  maxOpenElections?: number;
  maxElectionsPerOrg?: number;
  maxVotersPerElection?: number;
  maxHalts?: number;
  stalledMaxSec?: number;
  auditWindowSec?: number;
  /** SSE streams per network bucket (QV-09 §5: 4). */
  maxSseStreams?: number;
  /** SSE streams per process. */
  maxSseTotal?: number;
  /** Heartbeat comment interval (hard max 20 s, QV-09-REQ-010). */
  sseHeartbeatMs?: number;
  /** A stream with no event for this long is closed; clients reconnect with Last-Event-ID (QV-09 §9: 10 min). */
  sseIdleCloseMs?: number;
  /** A client whose socket stays backpressured this long is dropped. */
  sseSlowClientMs?: number;
  /** Bytes a client may have queued in its socket before writes stop (the per-client buffer bound). */
  sseMaxBufferBytes?: number;
  /** Events written per pump step (bounds per-client memory and event-loop time). */
  sseBatch?: number;
  /** Webhooks per organization. */
  maxWebhooksPerOrg?: number;
  /** Per-attempt connect+response deadline. */
  webhookTimeoutMs?: number;
  /** Delivery attempts including the first. */
  webhookMaxAttempts?: number;
  /** First retry delay; doubles per attempt up to webhookMaxBackoffMs. */
  webhookBackoffBaseMs?: number;
  webhookMaxBackoffMs?: number;
  /** Response bytes read before the connection is dropped. */
  webhookMaxResponseBytes?: number;
  /** Largest request body a delivery may carry. */
  webhookMaxBodyBytes?: number;
  /** Queued + waiting-for-retry deliveries; the oldest is dropped beyond this. */
  webhookMaxQueue?: number;
  /** Concurrent outbound deliveries. */
  webhookMaxInflight?: number;
  /** Consecutive failed deliveries after which a webhook is disabled. */
  webhookDisableAfter?: number;
  /** Test seams: DNS resolution and the HTTPS transport used for deliveries. */
  webhookResolver?: WebhookResolver;
  webhookTransport?: WebhookTransport;
  /** Largest accepted `POST /imports` body (`limits.max_import_bytes`). */
  maxImportBytes?: number;
  /** Largest number of log entries (and of checkpoint files) in an imported bundle. */
  maxImportEntries?: number;
  /** Import uploads being received at the same moment (each holds its body in memory). */
  maxImportUploads?: number;
  /** Import jobs queued or running; further submissions get 503 BUSY. */
  importQueueMax?: number;
  /** Jobs (imports, backups, audits) are dropped this long after they finished. */
  jobRetentionMs?: number;
  /** HTTPS base URLs of gossip peers (mirrors, witnesses, other boards). Checked with the SSRF policy at start. */
  gossipPeers?: string[];
  /** Outbound gossip period; 0 disables the timer (exchanges can still be run on demand). */
  gossipIntervalMs?: number;
  /** Per-request deadline of an outbound gossip exchange. */
  gossipTimeoutMs?: number;
  /** `gossip_seen` rows kept per election. */
  gossipSeenMax?: number;
  /** Test seams for outbound gossip. */
  gossipResolver?: WebhookResolver;
  gossipTransport?: WebhookTransport;
}

export interface ServerConfig extends Required<Omit<ServerOptions, 'staticDir' | 'releaseSeedHex' | 'bucketHeader' | 'rate' | 'webhookResolver' | 'webhookTransport' | 'gossipResolver' | 'gossipTransport'>> {
  staticDir: string | undefined;
  releaseSeedHex: string | undefined;
  bucketHeader: string | undefined;
  rate: RateConfig;
  webhookResolver: WebhookResolver | undefined;
  webhookTransport: WebhookTransport | undefined;
  gossipResolver: WebhookResolver | undefined;
  gossipTransport: WebhookTransport | undefined;
}

const MIN = 60;
const DEFAULT_RATE: RateConfig = {
  read: { limit: 120, windowSec: MIN },
  proof: { limit: 600, windowSec: MIN },
  writeKey: { limit: 10, windowSec: MIN, burst: 5 },
  writePre: { limit: 30, windowSec: MIN },
  auth: { limit: 10, windowSec: MIN },
  manage: { limit: 60, windowSec: MIN },
  export: { limit: 2, windowSec: 3600 },
  gossip: { limit: 30, windowSec: MIN },
  inviteFail: { limit: 5, windowSec: 600 },
};

/** Hard upper bounds compiled into the binary (QV-29-REQ-002). */
export const HARD = {
  maxBallotBytes: 256 * 1024,
  maxControlEntryBytes: 32 * 1024,
  maxRequestBytes: 1_153_434, // 1.1 MiB
  maxJsonBytes: 1024 * 1024,
  maxHeaderBytes: 32 * 1024,
  headersTimeoutMs: 30_000,
  requestTimeoutMs: 120_000,
  keepAliveTimeoutMs: 30_000,
  maxConnections: 65_536,
  maxVerifyQueue: 10_000,
  minBallotIntervalSec: 2,
  sseHeartbeatMs: 20_000,
  webhookTimeoutMs: 30_000,
  maxImportBytes: 1024 ** 3,
} as const;

function bound(name: string, v: number, hi: number, lo = 1): number {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`config ${name}=${v} outside hard bound ${lo}..${hi}`);
  return v;
}

export function resolveConfig(o: ServerOptions): ServerConfig {
  const rate: RateConfig = { ...DEFAULT_RATE, ...(o.rate ?? {}) };
  for (const [k, r] of Object.entries(rate) as [string, RateSpec][]) {
    if (!(r.limit >= 1) || !(r.windowSec >= 1) || (r.burst !== undefined && !(r.burst >= 1))) throw new Error(`config rate.${k} invalid`);
  }
  const peers = (o.gossipPeers ?? []).slice();
  if (peers.length > 16) throw new Error('config gossipPeers: at most 16 peers');
  for (const p of peers) {
    try {
      parseTargetUrl(p); // static SSRF policy at start: a bad peer refuses start (fail closed); DNS is checked again before every send
    } catch (e) {
      throw new Error(`config gossipPeers: ${e instanceof TargetRejected ? `${e.code}: ${e.message}` : 'invalid url'}`);
    }
  }
  return {
    dataDir: o.dataDir,
    publicUrl: o.publicUrl ?? 'http://localhost',
    host: o.host ?? '127.0.0.1',
    port: o.port ?? 0,
    now: o.now ?? Date.now,
    registrationMode: o.registrationMode ?? 'open',
    registrationTokens: o.registrationTokens ?? [],
    adminKeys: o.adminKeys ?? [],
    allowedOrigins: o.allowedOrigins ?? [],
    staticDir: o.staticDir,
    releaseSeedHex: o.releaseSeedHex,
    logSink: o.logSink ?? ((l) => void process.stderr.write(l + '\n')),
    bucketHeader: o.bucketHeader,
    witnesses: o.witnesses ?? [],
    rate,
    maxBallotBytes: bound('maxBallotBytes', o.maxBallotBytes ?? 128 * 1024, HARD.maxBallotBytes),
    maxControlEntryBytes: bound('maxControlEntryBytes', o.maxControlEntryBytes ?? 16 * 1024, HARD.maxControlEntryBytes),
    maxRequestBytes: bound('maxRequestBytes', o.maxRequestBytes ?? HARD.maxRequestBytes, HARD.maxRequestBytes),
    maxJsonBytes: bound('maxJsonBytes', o.maxJsonBytes ?? 256 * 1024, HARD.maxJsonBytes),
    maxHeaderBytes: bound('maxHeaderBytes', o.maxHeaderBytes ?? 16 * 1024, HARD.maxHeaderBytes),
    headersTimeoutMs: bound('headersTimeoutMs', o.headersTimeoutMs ?? 10_000, HARD.headersTimeoutMs),
    requestTimeoutMs: bound('requestTimeoutMs', o.requestTimeoutMs ?? 15_000, HARD.requestTimeoutMs),
    keepAliveTimeoutMs: bound('keepAliveTimeoutMs', o.keepAliveTimeoutMs ?? 5_000, HARD.keepAliveTimeoutMs),
    maxConnections: bound('maxConnections', o.maxConnections ?? 4096, HARD.maxConnections),
    maxRequestsPerSocket: bound('maxRequestsPerSocket', o.maxRequestsPerSocket ?? 1000, 1_000_000),
    maxVerifyQueue: bound('maxVerifyQueue', o.maxVerifyQueue ?? 1000, HARD.maxVerifyQueue),
    minBallotIntervalSec: bound('minBallotIntervalSec', o.minBallotIntervalSec ?? 10, 3600, HARD.minBallotIntervalSec),
    maxBallotAttemptsPerHour: bound('maxBallotAttemptsPerHour', o.maxBallotAttemptsPerHour ?? 30, 120),
    maxLogBytes: bound('maxLogBytes', o.maxLogBytes ?? 1024 ** 3, 4 * 1024 ** 3),
    maxPageBytes: bound('maxPageBytes', o.maxPageBytes ?? 4 * 1024 * 1024, 16 * 1024 * 1024, 1),
    minFreeBytes: bound('minFreeBytes', o.minFreeBytes ?? 500 * 1024 * 1024, 1024 ** 4, 0),
    maxOpenElections: bound('maxOpenElections', o.maxOpenElections ?? 64, 4096),
    maxElectionsPerOrg: bound('maxElectionsPerOrg', o.maxElectionsPerOrg ?? 100, 100_000),
    maxVotersPerElection: bound('maxVotersPerElection', o.maxVotersPerElection ?? 10_000, 100_000),
    maxHalts: bound('maxHalts', o.maxHalts ?? 3, 100),
    stalledMaxSec: bound('stalledMaxSec', o.stalledMaxSec ?? 30 * 86400, 365 * 86400),
    auditWindowSec: bound('auditWindowSec', o.auditWindowSec ?? 7 * 86400, 365 * 86400, 0),
    maxSseStreams: bound('maxSseStreams', o.maxSseStreams ?? 4, 64),
    maxSseTotal: bound('maxSseTotal', o.maxSseTotal ?? 1024, 10_000),
    sseHeartbeatMs: bound('sseHeartbeatMs', o.sseHeartbeatMs ?? 15_000, HARD.sseHeartbeatMs, 5),
    sseIdleCloseMs: bound('sseIdleCloseMs', o.sseIdleCloseMs ?? 600_000, 3_600_000, 10),
    sseSlowClientMs: bound('sseSlowClientMs', o.sseSlowClientMs ?? 10_000, 60_000, 5),
    sseMaxBufferBytes: bound('sseMaxBufferBytes', o.sseMaxBufferBytes ?? 64 * 1024, 1024 * 1024, 256),
    sseBatch: bound('sseBatch', o.sseBatch ?? 100, 1000),
    maxWebhooksPerOrg: bound('maxWebhooksPerOrg', o.maxWebhooksPerOrg ?? 10, 100),
    webhookTimeoutMs: bound('webhookTimeoutMs', o.webhookTimeoutMs ?? 5_000, HARD.webhookTimeoutMs, 10),
    webhookMaxAttempts: bound('webhookMaxAttempts', o.webhookMaxAttempts ?? 6, 12),
    webhookBackoffBaseMs: bound('webhookBackoffBaseMs', o.webhookBackoffBaseMs ?? 2_000, 600_000, 1),
    webhookMaxBackoffMs: bound('webhookMaxBackoffMs', o.webhookMaxBackoffMs ?? 300_000, 3_600_000, 1),
    webhookMaxResponseBytes: bound('webhookMaxResponseBytes', o.webhookMaxResponseBytes ?? 16 * 1024, 1024 * 1024, 0),
    webhookMaxBodyBytes: bound('webhookMaxBodyBytes', o.webhookMaxBodyBytes ?? 8 * 1024, 64 * 1024),
    webhookMaxQueue: bound('webhookMaxQueue', o.webhookMaxQueue ?? 1000, 100_000),
    webhookMaxInflight: bound('webhookMaxInflight', o.webhookMaxInflight ?? 8, 64),
    webhookDisableAfter: bound('webhookDisableAfter', o.webhookDisableAfter ?? 5, 1000),
    webhookResolver: o.webhookResolver,
    webhookTransport: o.webhookTransport,
    maxImportBytes: bound('maxImportBytes', o.maxImportBytes ?? 64 * 1024 * 1024, HARD.maxImportBytes),
    maxImportEntries: bound('maxImportEntries', o.maxImportEntries ?? 250_000, 2_000_000),
    maxImportUploads: bound('maxImportUploads', o.maxImportUploads ?? 2, 16),
    importQueueMax: bound('importQueueMax', o.importQueueMax ?? 2, 16),
    jobRetentionMs: bound('jobRetentionMs', o.jobRetentionMs ?? 7 * 86_400_000, 90 * 86_400_000, 1000),
    gossipPeers: peers,
    gossipIntervalMs: bound('gossipIntervalMs', o.gossipIntervalMs ?? 0, 86_400_000, 0),
    gossipTimeoutMs: bound('gossipTimeoutMs', o.gossipTimeoutMs ?? 5_000, 30_000, 10),
    gossipSeenMax: bound('gossipSeenMax', o.gossipSeenMax ?? 5000, 100_000),
    gossipResolver: o.gossipResolver,
    gossipTransport: o.gossipTransport,
  };
}
