// Offline signed-rule preparation. This profile never authorizes a suite-v1 election.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { bytesToHex, ed25519Keypair, ed25519Verify, hexToBytes, jcs, parseQvJson, wipe } from '@quietvote/crypto';
import {
  GOVERNANCE_EXPORT, GOVERNANCE_MAX_BYTES, GOVERNANCE_PROFILE, governanceGroupId,
  groupRulesAmendmentClass, groupRulesHash, groupRulesSignatureDigest, signGroupRules,
  validateGroupPolicyDraft, verifyGroupRulesExport,
  type GovernanceTrust, type GroupPolicyDraft, type GroupRulesBody, type GroupRulesEnvelope,
  type GroupRulesExport, type GroupRulesReport,
} from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag, needPositional, parseArgs, type Parsed } from './args.ts';
import { PASSPHRASE_FLAGS, printJson } from './common.ts';
import { EXIT, type Io } from './io.ts';
import { PLAIN_FORMAT, parseContainer, unwrapSeed } from './keyfile.ts';
import { readPrivateFile, writePrivateFileSync } from './private-files.ts';

const TRUST_FLAGS = { 'identity-key': 'value', 'genesis-hash': 'value' } as const;
const HEX32 = /^[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{128}$/;

/** Read exactly one bounded regular-file snapshot; pipes, links and growth fail. */
function fileBytes(path: string, max: number): Uint8Array {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > max) throw new Error();
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (n === 0) break;
      size += n;
    }
    if (size !== stat.size) throw new Error();
    return bytes.subarray(0, size);
  } catch { throw new InputError('governance input must be a bounded regular file'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

async function signingBytes(path: string): Promise<Uint8Array> {
  try { return await readPrivateFile(path, 64 * 1024); }
  catch { throw new InputError('signing input must be a bounded private regular file'); }
}

function objectFile(path: string, max = GOVERNANCE_MAX_BYTES): Record<string, unknown> {
  let value: unknown;
  try { value = parseQvJson(fileBytes(path, max)); }
  catch (e) { if (e instanceof InputError) throw e; throw new InputError('governance input is not strict QV-JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('governance input must be an object');
  return value as Record<string, unknown>;
}

function output(path: string, value: unknown): void {
  const bytes = new Uint8Array([...jcs(value), 10]);
  if (bytes.length > GOVERNANCE_MAX_BYTES) throw new InputError('governance output exceeds 4 MiB');
  try { writePrivateFileSync(path, bytes); }
  catch { throw new InputError('cannot create governance output; existing files are never overwritten'); }
}

function pin(p: Parsed, name: string): string {
  const value = needFlag(p, name);
  if (!HEX32.test(value)) throw new UsageError(`--${name} must be 64 lowercase hexadecimal characters`);
  return value;
}
function identity(p: Parsed): string {
  const key = pin(p, 'identity-key');
  try { governanceGroupId(key); } catch { throw new UsageError('--identity-key must be a strict Ed25519 public key'); }
  return key;
}
function trustOptions(p: Parsed): GovernanceTrust { return { identityKey: identity(p), genesisRulesHash: pin(p, 'genesis-hash') }; }
function bodyHash(body: unknown): string {
  try { return groupRulesHash(body); } catch { throw new InputError('invalid signed-rule body'); }
}
function policy(p: Parsed): GroupPolicyDraft['policy'] {
  const value = objectFile(needFlag(p, 'policy'), 128 * 1024);
  if (!validateGroupPolicyDraft(value).valid) throw new InputError('policy draft is invalid; run policy-draft validate');
  return (value as unknown as GroupPolicyDraft).policy;
}
function stewardKeys(p: Parsed, fallback?: readonly string[]): string[] {
  const supplied = p.all('steward-key');
  const keys = supplied.length ? supplied : [...(fallback ?? [])];
  if (keys.length < 1 || keys.length > 15 || new Set(keys).size !== keys.length || keys.some(k => !HEX32.test(k))) throw new UsageError('provide 1..15 distinct --steward-key public keys');
  for (const key of keys) { try { governanceGroupId(key); } catch { throw new UsageError('--steward-key must be a strict Ed25519 public key'); } }
  return [...keys].sort();
}

function verifiedHistory(path: string, trust: GovernanceTrust, active = false): { value: GroupRulesExport; report: GroupRulesReport } {
  const value = objectFile(path) as unknown as GroupRulesExport;
  const report = verifyGroupRulesExport(value, trust);
  if (report.status === 'INVALID') throw new FailError('rule history, signatures or independent pins did not verify');
  if (active && (report.status !== 'VERIFIED' || report.active_version !== report.versions)) throw new FailError('previous rule history has unverified ratification; cannot authorize the next amendment');
  return { value, report };
}

function previousBody(value: GroupRulesExport, report: GroupRulesReport): GroupRulesBody {
  return value.rules.find(r => r.body.version === report.active_version)!.body;
}

/** Validate signed-body identity and derive authority only from pinned active history. */
function authority(body: GroupRulesBody, hash: string, p: Parsed, trust: GovernanceTrust): GroupRulesBody {
  if (body.identity_key !== trust.identityKey) throw new FailError('rule identity differs from the independent pin');
  if (body.version === 1) {
    if (p.has('history')) throw new UsageError('genesis signing does not accept --history');
    if (hash !== trust.genesisRulesHash) throw new FailError('genesis body differs from the independent pin');
    return body;
  }
  const prior = verifiedHistory(needFlag(p, 'history'), trust, true);
  const previous = previousBody(prior.value, prior.report);
  if (body.version !== prior.report.versions + 1 || body.prev_rules_hash !== prior.report.active_rules_hash) throw new FailError('amendment does not extend the pinned active history');
  if (groupRulesAmendmentClass(previous, body) === 'entrenched' && body.decision_class !== 'entrenched') throw new FailError('protected amendment requires the entrenched decision class');
  return previous;
}

function partial(input: Record<string, unknown>, body: GroupRulesBody, allowed: ReadonlySet<string>): GroupRulesEnvelope {
  if (Object.keys(input).some(k => !['body', 'sigs', 'ratification'].includes(k)) || !Object.hasOwn(input, 'body') || !Array.isArray(input.sigs) || input.sigs.length < 1 || input.sigs.length > 16) throw new InputError('invalid partial rule envelope');
  if (Object.hasOwn(input, 'ratification')) {
    const r = input.ratification;
    if (body.version === 1 || !r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).join(',') !== 'manifest_hash' || typeof (r as { manifest_hash: unknown }).manifest_hash !== 'string' || !HEX32.test((r as { manifest_hash: string }).manifest_hash)) throw new InputError('invalid ratification reference');
  }
  const digest = groupRulesSignatureDigest(body);
  const sigs: GroupRulesEnvelope['sigs'] = [];
  for (const s of input.sigs) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).sort().join(',') !== 'key,sig' || typeof s.key !== 'string' || typeof s.sig !== 'string' || !HEX32.test(s.key) || !HEX64.test(s.sig)) throw new InputError('invalid rule signature encoding');
    if (!allowed.has(s.key) || (sigs.length > 0 && sigs.at(-1)!.key >= s.key) || !ed25519Verify(hexToBytes(s.key, 32), hexToBytes(s.sig, 64), digest)) throw new FailError('prior rule signature is invalid, duplicated, unsorted or unauthorized');
    sigs.push({ key: s.key, sig: s.sig });
  }
  return { body, sigs, ...(Object.hasOwn(input, 'ratification') ? { ratification: input.ratification as { manifest_hash: string } } : {}) };
}

async function signingKey(p: Parsed, io: Io): Promise<{ seed: Uint8Array; publicKey: Uint8Array }> {
  const bytes = await signingBytes(needFlag(p, 'key'));
  let value: Record<string, unknown>;
  try {
    const raw = parseQvJson(bytes);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error();
    value = raw as Record<string, unknown>;
  } catch { throw new InputError('invalid governance signing key'); }
  finally { wipe(bytes); }
  if (Object.hasOwn(value, 'kdf')) {
    let container: ReturnType<typeof parseContainer>;
    try { container = parseContainer(value); } catch { throw new InputError('invalid governance signing key'); }
    if (p.has('passphrase-file') && p.has('passphrase-stdin')) throw new UsageError('use either --passphrase-file or --passphrase-stdin');
    let pass: string | undefined;
    if (p.has('passphrase-file') || p.has('passphrase-stdin')) {
      const raw = p.has('passphrase-file') ? await signingBytes(needFlag(p, 'passphrase-file')) : await io.stdin();
      try {
        if (raw.length > 64 * 1024) throw new Error();
        pass = new TextDecoder('utf-8', { fatal: true }).decode(raw).split(/\r?\n/)[0];
      } catch { throw new InputError('invalid passphrase input'); }
      finally { wipe(raw); }
    } else pass = await io.prompt('passphrase for governance signing key: ');
    if (pass === undefined) throw new UsageError('a passphrase input or interactive prompt is required');
    if (new TextEncoder().encode(pass).length > 64 * 1024) throw new InputError('invalid passphrase input');
    try { return await unwrapSeed(container, pass); } catch { throw new InputError('cannot unlock governance signing key'); }
  }
  if (p.has('passphrase-file') || p.has('passphrase-stdin')) throw new UsageError('unprotected keys do not accept passphrase options');
  if (Object.keys(value).sort().join(',') !== 'format,public_key,seed' || value.format !== PLAIN_FORMAT || typeof value.seed !== 'string' || !HEX32.test(value.seed)) throw new InputError('invalid governance signing key');
  const seed = hexToBytes(value.seed, 32);
  const publicKey = ed25519Keypair(seed).publicKey;
  if (value.public_key !== bytesToHex(publicKey)) { wipe(seed); throw new InputError('inconsistent governance signing key'); }
  return { seed, publicKey };
}

export async function cmdGovernancePrepare(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { ...TRUST_FLAGS, policy: 'value', 'steward-key': 'multi', history: 'value', 'decision-class': 'value', out: 'value', json: 'bool' });
  const [kind] = needPositional(p, 1, 'governance prepare genesis|amendment (options)');
  if (kind !== 'genesis' && kind !== 'amendment') throw new UsageError('rule preparation kind must be genesis or amendment');
  const out = needFlag(p, 'out'), identityKey = identity(p), draftedPolicy = policy(p);
  let body: GroupRulesBody;
  if (kind === 'genesis') {
    if (p.has('history') || p.has('genesis-hash') || p.has('decision-class')) throw new UsageError('genesis preparation does not accept history, genesis-hash or decision-class');
    body = { proto: GOVERNANCE_PROFILE, kind: 'group-rules', group_id: governanceGroupId(identityKey), identity_key: identityKey, version: 1, steward_keys: stewardKeys(p), policy: draftedPolicy };
  } else {
    const trust = trustOptions(p), prior = verifiedHistory(needFlag(p, 'history'), trust, true);
    const previous = previousBody(prior.value, prior.report);
    const decisionClass = needFlag(p, 'decision-class');
    if (decisionClass !== 'rules' && decisionClass !== 'entrenched') throw new UsageError('--decision-class must be rules or entrenched');
    body = { proto: GOVERNANCE_PROFILE, kind: 'group-rules', group_id: previous.group_id, identity_key: identityKey,
      version: prior.report.versions + 1, prev_rules_hash: prior.report.active_rules_hash!, steward_keys: stewardKeys(p, previous.steward_keys), policy: draftedPolicy, decision_class: decisionClass };
    if (groupRulesAmendmentClass(previous, body) === 'entrenched' && decisionClass !== 'entrenched') throw new FailError('protected amendment requires the entrenched decision class');
  }
  const hash = bodyHash(body);
  output(out, body);
  printJson(io, { scope: 'signed-group-rules', file: out, version: body.version, rules_hash: hash, group_id: body.group_id, signed: false, election_authorized: false });
  return EXIT.ok;
}

export async function cmdGovernanceSign(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { ...TRUST_FLAGS, ...PASSPHRASE_FLAGS, body: 'value', record: 'value', history: 'value', 'rules-hash': 'value', key: 'value', out: 'value', json: 'bool' });
  needPositional(p, 0, 'governance sign (options only)');
  if (p.has('body') === p.has('record')) throw new UsageError('supply exactly one of --body or --record');
  const out = needFlag(p, 'out'), trust = trustOptions(p), candidatePin = pin(p, 'rules-hash');
  const raw = objectFile(needFlag(p, p.has('body') ? 'body' : 'record'), 128 * 1024);
  const body = (p.has('body') ? raw : raw.body) as GroupRulesBody;
  const hash = bodyHash(body);
  if (hash !== candidatePin) throw new FailError('candidate rules differ from --rules-hash');
  const prior = authority(body, hash, p, trust);
  const allowed = new Set(prior.steward_keys);
  if (body.version === 1) allowed.add(body.identity_key);
  const record = p.has('record') ? partial(raw, body, allowed) : { body, sigs: [] } as GroupRulesEnvelope;
  const key = await signingKey(p, io);
  try {
    const pk = bytesToHex(key.publicKey);
    if (!allowed.has(pk)) throw new FailError('signing key is not authorized by the pinned rule history');
    if (record.sigs.some(s => s.key === pk)) throw new FailError('this key already signed the rule body');
    record.sigs.push(signGroupRules(body, key.seed));
  } finally { wipe(key.seed); }
  record.sigs.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const count = record.sigs.filter(s => prior.steward_keys.includes(s.key)).length;
  const identitySigned = record.sigs.some(s => s.key === body.identity_key);
  const quorum = count >= prior.policy.stewards.approval.k && (body.version !== 1 || identitySigned);
  output(out, record);
  printJson(io, { scope: 'signed-group-rules', file: out, rules_hash: hash, signatures: record.sigs.length,
    steward_signatures: count, steward_threshold: prior.policy.stewards.approval.k, identity_signed: identitySigned, quorum, election_authorized: false });
  return EXIT.ok;
}

export async function cmdGovernanceExport(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { ...TRUST_FLAGS, record: 'multi', history: 'value', out: 'value', json: 'bool' });
  needPositional(p, 0, 'governance export (options only)');
  const out = needFlag(p, 'out'), trust = trustOptions(p), records = p.all('record');
  if (records.length < 1 || records.length > 128) throw new UsageError('provide 1..128 --record files');
  const previous = p.has('history') ? verifiedHistory(needFlag(p, 'history'), trust).value.rules : [];
  if (previous.length + records.length > 128) throw new InputError('rule history exceeds 128 envelopes');
  const value = { format: GOVERNANCE_EXPORT, rules: [...previous, ...records.map(path => objectFile(path, 128 * 1024))] };
  const report = verifyGroupRulesExport(value, trust);
  if (report.status === 'INVALID') { printJson(io, report); return EXIT.fail; }
  output(out, value);
  printJson(io, { ...report, file: out, election_authorized: false });
  return report.status === 'VERIFIED' ? EXIT.ok : EXIT.incomplete;
}

export async function cmdGovernanceVerify(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { ...TRUST_FLAGS, json: 'bool' });
  const [path] = needPositional(p, 1, 'governance verify <history.json> --identity-key <hex> --genesis-hash <hex>');
  const report = verifyGroupRulesExport(objectFile(path!), trustOptions(p));
  printJson(io, { ...report, election_authorized: false });
  return report.status === 'VERIFIED' ? EXIT.ok : report.status === 'INCOMPLETE' ? EXIT.incomplete : EXIT.fail;
}
