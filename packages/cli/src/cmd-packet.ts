// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline adapters over existing protocol signatures and board framing. Admission remains the server's responsibility.
import { closeSync, constants as fsc, fstatSync, openSync, readSync, writeFileSync } from 'node:fs';
import { MAX_BODY, b64u, buildEntry, isEntryType, isValidOrigin } from '@quietvote/board';
import { bytesToHex, jcs, parseQvJson, wipe } from '@quietvote/crypto';
import { PROTO_ID, S, check, lit, obj, oneOf, str, manifestHash, manifestSchema, signRecordRaw, tallySchema, verifySig, type Manifest, type Sig } from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag, needPositional, parseArgs } from './args.ts';
import { PASSPHRASE_FLAGS, electionContext, pinnedHash, printJson } from './common.ts';
import { loadVoterKey } from './cmd-keygen.ts';
import { EXIT, type Io } from './io.ts';

// Existing server control actions (QV-18); no witness-waiver or extension authority is introduced.
const controlBody = obj({ proto: lit(PROTO_ID), type: lit('control'), action: oneOf('pause', 'resume', 'invalidate', 'security-notice', 'audit-close', 'cancel', 'abort') }, { reason: str(256) });

function objectFile(path: string): Record<string, unknown> {
  let fd: number | undefined;
  let bytes: Uint8Array;
  try {
    fd = openSync(path, fsc.O_RDONLY | fsc.O_NONBLOCK);
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > 1 << 20) throw new InputError('packet input must be a regular file of at most 1 MiB');
    const buffer = Buffer.alloc((1 << 20) + 1);
    let size = 0;
    while (size < buffer.length) {
      const n = readSync(fd, buffer, size, buffer.length - size, null);
      if (n === 0) break;
      size += n;
    }
    if (size > 1 << 20) throw new InputError('packet input exceeds 1 MiB');
    bytes = buffer.subarray(0, size);
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError('cannot read packet input');
  } finally { if (fd !== undefined) closeSync(fd); }
  let v: unknown;
  try { v = parseQvJson(bytes); } catch { throw new InputError('packet input is not valid QV-JSON'); }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new InputError('packet input must be an object');
  return v as Record<string, unknown>;
}
function output(path: string, value: unknown): void {
  try { writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch { throw new InputError('cannot create output; existing files are never overwritten'); }
}

/** Each coordinator adds their own signature; private keys need never be collected on one machine. */
export async function cmdElectionSignRecord(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { manifest: 'value', election: 'value', 'manifest-hash': 'value', body: 'value', record: 'value', key: 'value', out: 'value', json: 'bool', ...PASSPHRASE_FLAGS });
  needPositional(p, 0, 'election sign-record (options only)');
  const out = needFlag(p, 'out');
  const pin = pinnedHash(p);
  if (pin === undefined) throw new UsageError('--manifest-hash is required');
  if (p.has('body') === p.has('record')) throw new UsageError('supply exactly one of --body or --record');
  const raw = objectFile(needFlag(p, 'manifest'));
  const candidate = raw['body'] ?? raw;
  if (check(manifestSchema(), candidate) !== null) throw new InputError('manifest schema is invalid');
  const m = candidate as Manifest;
  const mh = manifestHash(m);
  if (bytesToHex(mh) !== pin) throw new FailError('manifest differs from --manifest-hash');
  const prior = p.has('record') ? objectFile(needFlag(p, 'record')) : undefined;
  const body = prior?.['body'] ?? (p.has('body') ? objectFile(needFlag(p, 'body')) : undefined);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new InputError('record body must be an object');
  const b = body as Record<string, unknown> & { type: string };
  // Keep scopes exactly as implemented by the protocol verifier. No caller-supplied scope bytes.
  const schema = b.type === 'manifest' ? manifestSchema() : b.type === 'marker' ? S.marker : b.type === 'roll-commit' ? S.rollCommit : b.type === 'tally' ? tallySchema() : b.type === 'control' ? controlBody : undefined;
  if (schema === undefined || check(schema, b) !== null) throw new InputError('unsupported or malformed coordinator body (manifest, marker, roll-commit, control or tally required)');
  if (b.type === 'manifest' && bytesToHex(manifestHash(b as unknown as Manifest)) !== pin) throw new FailError('manifest body differs from the pinned manifest');
  const contextScope = b.type === 'tally' || (b.type === 'marker' && (b['name'] === 'election-open' || b['name'] === 'election-close'));
  let scope = mh;
  if (contextScope) {
    const ec = await electionContext(needFlag(p, 'election'), pin);
    scope = ec.params.ctx;
  } else if (p.has('election')) throw new UsageError('--election applies only to context-scoped open, close and tally records');
  const single = b.type === 'tally';
  const sigs: Sig[] = [];
  if (prior !== undefined) {
    if (single || Object.keys(prior).sort().join(',') !== 'body,sigs' || !Array.isArray(prior['sigs'])) throw new InputError('--record requires a coordinator multi-signature record');
    for (const s of prior['sigs']) {
      if (s === null || typeof s !== 'object' || typeof s.key !== 'string' || typeof s.sig !== 'string' || Object.keys(s).sort().join(',') !== 'key,sig' ||
          !m.coordinator.keys.includes(s.key) || sigs.some((v) => v.key === s.key) || !verifySig(scope, b.type, b, s)) throw new FailError('prior coordinator signature is invalid, duplicated or unauthorized');
      sigs.push(s as Sig);
    }
  }
  const key = await loadVoterKey(needFlag(p, 'key'), p, io);
  try {
    const pk = bytesToHex(key.publicKey);
    if (!m.coordinator.keys.includes(pk)) throw new FailError('key is not a coordinator in the pinned manifest');
    if (sigs.some((s) => s.key === pk)) throw new FailError('coordinator already signed this record');
    sigs.push(signRecordRaw(key.seed, key.publicKey, scope, b.type, b));
  } finally { wipe(key.seed); }
  const quorum = single || sigs.length >= m.coordinator.m;
  output(out, single ? { body: b, sig: sigs[0] } : { body: b, sigs });
  printJson(io, { file: out, signatures: sigs.length, quorum, manifest_hash: pin, scope: contextScope ? 'context' : 'manifest', admitted: false });
  return EXIT.ok;
}

/** Wrap an already signed voter/coordinator record; the outer author is explicitly separate from record signers. */
export async function cmdElectionExportEntry(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { origin: 'value', type: 'value', file: 'value', key: 'value', out: 'value', json: 'bool', ...PASSPHRASE_FLAGS });
  needPositional(p, 0, 'election export-entry (options only)');
  const origin = needFlag(p, 'origin'), type = needFlag(p, 'type'), out = needFlag(p, 'out');
  if (!isValidOrigin(origin)) throw new UsageError('--origin must be the election quietvote/v1 origin');
  if (!isEntryType(type)) throw new UsageError('--type must be an existing board entry type');
  const body = jcs(objectFile(needFlag(p, 'file')));
  if (body.length > MAX_BODY[type]) throw new InputError('record exceeds the board entry type size limit');
  const key = await loadVoterKey(needFlag(p, 'key'), p, io);
  try {
    const entry = buildEntry({ origin, type, body, secretKey: key.seed, publicKey: key.publicKey, nonce: io.rng.bytes(16), createdAt: Math.floor(Date.now() / 1000) });
    output(out, { header: b64u(entry.headerBytes), body: b64u(entry.body) });
  } finally { wipe(key.seed); }
  printJson(io, { file: out, type, origin, admitted: false });
  return EXIT.ok;
}
