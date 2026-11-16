// Thin HTTP adapters: the server remains authoritative for validation, authorization and lifecycle transitions.
import { closeSync, constants, existsSync, fstatSync, openSync, readSync, writeFileSync } from 'node:fs';
import { authorKeyId, b64u, unb64u, signRequest } from '@quietvote/board';
import { ed25519Sign, parseQvJson, sha256, wipe } from '@quietvote/crypto';
import { logOrigin, registrationMessage } from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag, needPositional, parseArgs, type FlagSpec, type Parsed } from './args.ts';
import { PASSPHRASE_FLAGS, isHex, printJson } from './common.ts';
import { loadVoterKey } from './cmd-keygen.ts';
import { EXIT, type Io } from './io.ts';

const BASE = { server: 'value', json: 'bool', 'timeout-ms': 'value' } as const;
const AUTH = { key: 'value', audience: 'value', ...PASSPHRASE_FLAGS } as const;
const MAX_RESPONSE = 64 * 1024 * 1024;

function args(argv: string[], spec: FlagSpec): Parsed {
  const p = parseArgs(argv, { ...BASE, ...spec });
  needPositional(p, 0, 'online command (options only)');
  return p;
}
function serverUrl(p: Parsed): URL {
  let u: URL;
  try { u = new URL(needFlag(p, 'server')); } catch { throw new UsageError('--server must be an absolute HTTP(S) origin'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) || u.username || u.password || u.search || u.hash || u.pathname !== '/') {
    throw new UsageError('--server must be an HTTPS origin, or HTTP on loopback, without credentials, path, query or fragment');
  }
  return u;
}
function electionPath(p: Parsed): string {
  const id = needFlag(p, 'id');
  if (!isHex(id, 16)) throw new UsageError('--id must be 32 lower-case hex digits');
  return `/api/v1/elections/${id}`;
}

function readLimited(path: string, limit: number, regular = false): Uint8Array {
  let fd: number | undefined;
  try {
    fd = openSync(path, regular ? constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0) : 'r');
    if (regular) {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > limit) throw new InputError('invite input must be a bounded regular file');
    }
    const bytes = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (n === 0) return bytes.subarray(0, size);
      size += n;
    }
    throw new InputError('input file exceeds the command size limit');
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError('cannot read input file');
  } finally { if (fd !== undefined) closeSync(fd); }
}
function inputJson(path: string, limit: number): unknown {
  const bytes = readLimited(path, limit);
  try { return parseQvJson(bytes); } catch { throw new InputError('input is not valid QV-JSON'); }
}

async function request(p: Parsed, io: Io, method: string, path: string, body?: unknown, signed = false): Promise<Uint8Array> {
  const base = serverUrl(p);
  const timeout = p.get('timeout-ms') ?? '20000';
  if (!/^\d+$/.test(timeout) || !Number.isSafeInteger(Number(timeout)) || Number(timeout) < 1 || Number(timeout) > 120000) throw new UsageError('--timeout-ms must be an integer from 1 to 120000');
  const bytes = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (bytes.length) headers['content-type'] = 'application/json';
  if (p.has('read-key-file')) {
    const key = new TextDecoder().decode(readLimited(needFlag(p, 'read-key-file'), 128)).trim();
    if (!/^[A-Za-z0-9_-]{22}$/.test(key)) throw new InputError('read-key file must contain one base64url read key');
    headers['qv-read-key'] = key;
  }
  if (p.has('idempotency-key')) {
    const key = needFlag(p, 'idempotency-key');
    if (!/^[\x21-\x7e]{8,128}$/.test(key)) throw new UsageError('--idempotency-key must be 8..128 printable non-space characters');
    headers['idempotency-key'] = key;
  }
  if (signed) {
    const audience = needFlag(p, 'audience');
    if (!/^qv:[^\s@]+@https?:\/\/[^\s]+$/.test(audience)) throw new UsageError('--audience must be the configured qv:INSTANCE_ID@PUBLIC_URL');
    const key = await loadVoterKey(needFlag(p, 'key'), p, io);
    try {
      // Reuse the same pure signed-request framing as the server.
      headers['authorization'] = signRequest(key.seed, key.publicKey, method, path, audience, bytes, Math.floor(Date.now() / 1000), io.rng.bytes(16));
    } finally { wipe(key.seed); }
  }
  try {
    const response = await fetch(new URL(path, base), {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(Number(timeout)),
      ...(bytes.length ? { body: Buffer.from(bytes) } : {}),
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_RESPONSE) { await reader.cancel(); throw new FailError(method === 'GET' ? 'server response exceeds the 64 MiB limit' : 'server response exceeds the limit; submission may have been accepted; inspect server state'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const result = Buffer.concat(chunks);
    if (!response.ok) {
      let code = 'HTTP_ERROR';
      try {
        const j = JSON.parse(result.toString('utf8')) as { code?: unknown };
        if (typeof j.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(j.code)) code = j.code;
      } catch { /* no server-supplied text or secrets are echoed */ }
      throw new FailError(method !== 'GET' && response.status >= 500
        ? `submission outcome unknown: HTTP ${response.status} ${code}; inspect server state before retrying`
        : `server rejected request: HTTP ${response.status} ${code}`);
    }
    return result;
  } catch (e) {
    if (e instanceof FailError) throw e;
    // A network failure after sending is ambiguous: never automatically retry a mutation.
    throw new FailError(method === 'GET' ? 'server request failed or timed out' : 'submission outcome unknown after a network failure; inspect server state before retrying');
  }
}
async function jsonRequest(p: Parsed, io: Io, method: string, path: string, body?: unknown, signed = false): Promise<number> {
  const bytes = await request(p, io, method, path, body, signed);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
  } catch {
    throw new FailError(method === 'GET' ? 'server returned malformed JSON' : 'server returned HTTP success but malformed JSON; submission may have been accepted; inspect server state');
  }
  // These are server responses, never independent election-verification verdicts.
  printJson(io, value);
  return EXIT.ok;
}

export async function cmdOnlineInstance(argv: string[], io: Io): Promise<number> {
  return jsonRequest(args(argv, {}), io, 'GET', '/api/v1/instance');
}
export async function cmdOnlineAdminStatus(argv: string[], io: Io): Promise<number> {
  return jsonRequest(args(argv, AUTH), io, 'GET', '/api/v1/admin/status', undefined, true);
}
export async function cmdOnlineElectionInspect(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', 'read-key-file': 'value' });
  return jsonRequest(p, io, 'GET', electionPath(p));
}
export async function cmdOnlineEnroll(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', key: 'value', 'invite-file': 'value', 'read-key-file': 'value', ...PASSPHRASE_FLAGS });
  const path = electionPath(p), id = needFlag(p, 'id');
  // Refuse missing/unknown/legacy schemes before loading the invite or private key.
  let election: Record<string, unknown>;
  try { election = parseQvJson(await request(p, io, 'GET', path)) as Record<string, unknown>; }
  catch (e) { if (e instanceof FailError) throw e; throw new FailError('invalid election metadata'); }
  if (!election || election['election_id'] !== id || election['origin'] !== logOrigin({ election_id: id }) || election['registration_scheme'] !== 'hashed-pop-v1') {
    throw new FailError('election does not support hashed-pop-v1 enrollment; inspect registration migration status');
  }
  const inviteFile = needFlag(p, 'invite-file');
  let code: string;
  try { code = new TextDecoder('utf-8', { fatal: true }).decode(readLimited(inviteFile, 128, true)).trim(); }
  catch (e) { if (e instanceof InputError) throw e; throw new InputError('invite file must be UTF-8 text'); }
  const token = unb64u(code);
  if (!token || token.length !== 16 || b64u(token) !== code) throw new InputError('invite file must contain one canonical 16-byte base64url token');
  const hash = sha256(token);
  try {
    const key = await loadVoterKey(needFlag(p, 'key'), p, io);
    try {
      const body = { invite_code: b64u(hash), pk: b64u(key.publicKey), alg: 'ed25519',
        pop: b64u(ed25519Sign(key.seed, registrationMessage(id, hash, key.publicKey))) };
      const response = await request(p, io, 'POST', `${path}/registrations`, body);
      let result: Record<string, unknown>;
      try { result = parseQvJson(response) as Record<string, unknown>; }
      catch { throw new FailError('enrollment response is invalid; outcome unknown; inspect server state'); }
      if (!result || result['voter_kid'] !== b64u(authorKeyId('ed25519', key.publicKey)) || (result['status'] !== 'approved' && result['status'] !== 'pending')) {
        throw new FailError('enrollment response does not identify this voter; outcome unknown; inspect server state');
      }
      printJson(io, { voter_kid: result['voter_kid'], status: result['status'] });
      return EXIT.ok;
    } finally { wipe(key.seed); }
  } finally { wipe(token); wipe(hash); }
}
export async function cmdOnlineRegistrationPreview(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', ...AUTH });
  return jsonRequest(p, io, 'GET', `${electionPath(p)}/registration-migration`, undefined, true);
}
export async function cmdOnlineElectionCreate(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...AUTH, org: 'value', title: 'value', access: 'value', 'idempotency-key': 'value' });
  needFlag(p, 'idempotency-key');
  const org = needFlag(p, 'org');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(org)) throw new UsageError('--org contains invalid characters');
  const title = needFlag(p, 'title');
  if (title.length > 200) throw new UsageError('--title must contain at most 200 characters');
  const access = needFlag(p, 'access');
  if (access !== 'public' && access !== 'link') throw new UsageError('--access must be public or link');
  return jsonRequest(p, io, 'POST', `/api/v1/orgs/${org}/elections`, { title, access }, true);
}
export async function cmdOnlineElectionDraft(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...AUTH, id: 'value', file: 'value' });
  const path = electionPath(p);
  const draft = inputJson(needFlag(p, 'file'), 262144);
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) throw new InputError('draft must be a JSON object');
  return jsonRequest(p, io, 'PUT', `${path}/draft`, draft, true);
}
export async function cmdOnlineElectionSubmit(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', file: 'value' });
  const path = electionPath(p);
  // Wire packet already carries its protocol/board signatures; the server performs full admission checks.
  const packet = inputJson(needFlag(p, 'file'), 1153434);
  if (packet === null || typeof packet !== 'object' || Array.isArray(packet)) throw new InputError('entry packet must be an object');
  const v = packet as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || typeof v['header'] !== 'string' || typeof v['body'] !== 'string' ||
      !/^[A-Za-z0-9_-]{1,2800}$/.test(v['header']) || !/^[A-Za-z0-9_-]{0,1400000}$/.test(v['body'])) throw new InputError('entry packet must contain only base64url header and body');
  return jsonRequest(p, io, 'POST', `${path}/log/entries`, packet);
}
export async function cmdOnlineElectionExport(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', out: 'value', format: 'value', 'read-key-file': 'value' });
  const path = electionPath(p);
  const out = needFlag(p, 'out');
  if (existsSync(out)) throw new InputError('export file exists; existing files are never overwritten');
  const format = p.get('format') ?? 'qvb';
  if (format !== 'qvb' && format !== 'json') throw new UsageError('--format must be qvb or json');
  const bytes = await request(p, io, 'GET', `${path}/export.${format}`);
  try { writeFileSync(out, bytes, { flag: 'wx', mode: 0o600 }); }
  catch { throw new InputError('cannot create export file; existing files are never overwritten'); }
  printJson(io, { file: out, bytes: bytes.length, format, verified: false });
  return EXIT.ok;
}

/** Fetch the server's existing public tally proposal for offline coordinator signing. */
export async function cmdOnlineElectionTallyDraft(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', decrypters: 'value', out: 'value', 'read-key-file': 'value' });
  const path = electionPath(p), out = needFlag(p, 'out');
  const decrypters = needFlag(p, 'decrypters');
  const ids = decrypters.split(',').map(Number);
  if (!/^[1-9]\d?(,[1-9]\d?)*$/.test(decrypters) || ids.some((v) => v > 32) || new Set(ids).size !== ids.length) throw new UsageError('--decrypters must be distinct comma-separated trustee indices from 1 to 32');
  if (existsSync(out)) throw new InputError('draft file exists; existing files are never overwritten');
  const bytes = await request(p, io, 'GET', `${path}/tally/draft?decrypters=${decrypters}`);
  let body: unknown;
  try {
    const value = parseQvJson(bytes) as { body?: { type?: unknown } };
    if (value?.body?.type !== 'tally') throw new Error('missing tally body');
    body = value.body;
  } catch { throw new FailError('server returned a malformed tally draft'); }
  try { writeFileSync(out, JSON.stringify(body) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch { throw new InputError('cannot create draft file; existing files are never overwritten'); }
  printJson(io, { file: out, verified: false });
  return EXIT.ok;
}
