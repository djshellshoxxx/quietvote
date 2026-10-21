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
  minFreeBytes?: number;
  maxOpenElections?: number;
  maxElectionsPerOrg?: number;
  maxVotersPerElection?: number;
  maxHalts?: number;
  stalledMaxSec?: number;
  auditWindowSec?: number;
  maxSseStreams?: number;
}

export interface ServerConfig extends Required<Omit<ServerOptions, 'staticDir' | 'releaseSeedHex' | 'bucketHeader' | 'rate'>> {
  staticDir: string | undefined;
  releaseSeedHex: string | undefined;
  bucketHeader: string | undefined;
  rate: RateConfig;
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
    minFreeBytes: bound('minFreeBytes', o.minFreeBytes ?? 500 * 1024 * 1024, 1024 ** 4, 0),
    maxOpenElections: bound('maxOpenElections', o.maxOpenElections ?? 64, 4096),
    maxElectionsPerOrg: bound('maxElectionsPerOrg', o.maxElectionsPerOrg ?? 100, 100_000),
    maxVotersPerElection: bound('maxVotersPerElection', o.maxVotersPerElection ?? 10_000, 100_000),
    maxHalts: bound('maxHalts', o.maxHalts ?? 3, 100),
    stalledMaxSec: bound('stalledMaxSec', o.stalledMaxSec ?? 30 * 86400, 365 * 86400),
    auditWindowSec: bound('auditWindowSec', o.auditWindowSec ?? 7 * 86400, 365 * 86400, 0),
    maxSseStreams: bound('maxSseStreams', o.maxSseStreams ?? 4, 64),
  };
}
