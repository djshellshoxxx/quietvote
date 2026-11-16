// JSON configuration boundary for the executable. Programmatic test seams are deliberately not accepted.
import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { ed25519IsStrictPoint, hexToBytes, parseQvJson } from '@quietvote/crypto';
import { resolveConfig, type ServerOptions } from './config.ts';

const STRINGS = ['dataDir', 'publicUrl', 'host', 'registrationMode', 'staticDir'] as const;
const ARRAYS = ['registrationTokens', 'adminKeys', 'allowedOrigins', 'gossipPeers'] as const;
const NUMBERS = [
  'port', 'maxBallotBytes', 'maxControlEntryBytes', 'maxRequestBytes', 'maxJsonBytes', 'maxHeaderBytes',
  'headersTimeoutMs', 'requestTimeoutMs', 'keepAliveTimeoutMs', 'maxConnections', 'maxRequestsPerSocket',
  'maxVerifyQueue', 'minBallotIntervalSec', 'maxBallotAttemptsPerHour', 'maxLogBytes', 'maxPageBytes',
  'minFreeBytes', 'maxOpenElections', 'maxElectionsPerOrg', 'maxVotersPerElection', 'maxHalts', 'stalledMaxSec',
  'auditWindowSec', 'maxSseStreams', 'maxSseTotal', 'sseHeartbeatMs', 'sseIdleCloseMs', 'sseSlowClientMs',
  'sseMaxBufferBytes', 'sseBatch', 'maxWebhooksPerOrg', 'webhookTimeoutMs', 'webhookMaxAttempts',
  'webhookBackoffBaseMs', 'webhookMaxBackoffMs', 'webhookMaxResponseBytes', 'webhookMaxBodyBytes',
  'webhookMaxQueue', 'webhookMaxInflight', 'webhookDisableAfter', 'maxImportBytes', 'maxImportEntries',
  'maxImportUploads', 'importQueueMax', 'inviteRetentionMs', 'retentionSweepMs', 'importVerifyTimeoutMs',
  'jobRetentionMs', 'gossipIntervalMs', 'gossipTimeoutMs', 'gossipSeenMax',
] as const;
const ALLOWED = new Set<string>([...STRINGS, ...ARRAYS, ...NUMBERS, 'witnesses', 'rate']);
function invalid(field: string): never { throw new Error(`invalid configuration field: ${field}`); }
function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}
function origin(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field);
  let u: URL;
  try { u = new URL(value); } catch { invalid(field); }
  // Do not normalize the signed-request audience behind the operator's back.
  if (!['http:', 'https:'].includes(u.protocol) || u.origin !== value) invalid(field);
  return value;
}
function publicKey(value: unknown, field: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value) || !ed25519IsStrictPoint(hexToBytes(value, 32))) invalid(field);
}

export function readLauncherConfig(path: string): ServerOptions {
  // Cap the input before allocation; regular files only. The configuration may contain registration tokens.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  let bytes: Buffer;
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > 65536) throw new Error('configuration must be a regular file of at most 65536 bytes');
    const buffer = Buffer.alloc(65537);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > 65536) throw new Error('configuration exceeds 65536 bytes');
    bytes = buffer.subarray(0, length);
  } finally { closeSync(fd); }
  let parsed: unknown;
  try { parsed = parseQvJson(bytes); } catch { throw new Error('configuration is not valid strict JSON'); }
  const cfg = object(parsed, 'root');
  for (const key of Object.keys(cfg)) if (!ALLOWED.has(key)) throw new Error('unknown configuration field');
  for (const key of STRINGS) {
    const value = cfg[key];
    if (value !== undefined && (typeof value !== 'string' || value.length === 0 || value.includes('\0'))) invalid(key);
  }
  if (typeof cfg['dataDir'] !== 'string' || !isAbsolute(cfg['dataDir'])) invalid('dataDir');
  origin(cfg['publicUrl'], 'publicUrl');
  if (!['open', 'token', 'closed'].includes(String(cfg['registrationMode']))) invalid('registrationMode');
  if (cfg['staticDir'] !== undefined && !isAbsolute(cfg['staticDir'] as string)) invalid('staticDir');
  for (const key of NUMBERS) {
    if (cfg[key] !== undefined && (typeof cfg[key] !== 'number' || !Number.isSafeInteger(cfg[key]))) invalid(key);
  }
  if (cfg['port'] !== undefined && ((cfg['port'] as number) < 0 || (cfg['port'] as number) > 65535)) invalid('port');
  for (const key of ARRAYS) {
    const values = cfg[key];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 2048 || v.includes('\0'))) invalid(key);
  }
  if (cfg['registrationMode'] === 'token' && !(cfg['registrationTokens'] as string[] | undefined)?.length) invalid('registrationTokens');
  for (const key of (cfg['adminKeys'] ?? []) as string[]) publicKey(key, 'adminKeys');
  for (const value of (cfg['allowedOrigins'] ?? []) as string[]) origin(value, 'allowedOrigins');
  if (cfg['witnesses'] !== undefined) {
    if (!Array.isArray(cfg['witnesses'])) invalid('witnesses');
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const value of cfg['witnesses']) {
      const w = object(value, 'witnesses');
      if (Object.keys(w).some((k) => k !== 'name' && k !== 'publicKey') || typeof w['name'] !== 'string' ||
          !/^[A-Za-z0-9._-]{1,128}$/.test(w['name'])) invalid('witnesses');
      publicKey(w['publicKey'], 'witnesses.publicKey');
      if (names.has(w['name']) || keys.has(w['publicKey'] as string)) invalid('witnesses');
      names.add(w['name']); keys.add(w['publicKey'] as string);
    }
  }
  if (cfg['rate'] !== undefined) {
    const rate = object(cfg['rate'], 'rate');
    const classes = new Set(['read', 'proof', 'writeKey', 'writePre', 'auth', 'manage', 'export', 'gossip', 'inviteFail']);
    for (const [key, value] of Object.entries(rate)) {
      if (!classes.has(key)) invalid('rate');
      const r = object(value, 'rate');
      if (Object.keys(r).some((k) => !['limit', 'windowSec', 'burst'].includes(k)) ||
          !Number.isSafeInteger(r['limit']) || !Number.isSafeInteger(r['windowSec']) ||
          (r['burst'] !== undefined && !Number.isSafeInteger(r['burst']))) invalid('rate');
    }
  }
  // All accepted JSON fields have been checked; run the service's existing hard-bound checks too.
  const options = cfg as unknown as ServerOptions;
  try { resolveConfig(options); } catch { throw new Error('configuration exceeds server bounds or has an invalid target'); }
  return options;
}
