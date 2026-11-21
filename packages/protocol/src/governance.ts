// Isolated experimental governance profile. Never accepted as a suite-v1 record.
import {
  bytesToHex, concatBytes, ed25519IsStrictPoint, ed25519Keypair, ed25519Sign,
  ed25519Verify, hexToBytes, jcs, lp, parseQvJson, sha256, u32, utf8,
} from '@quietvote/crypto';
import { validateGroupPolicyDraft, type GroupPolicyDraft } from './group-policy-draft.ts';

export const GOVERNANCE_PROFILE = 'qv-governance/1';
export const GOVERNANCE_EXPORT = 'qv-governance-export/1';
export const GOVERNANCE_MAX_BYTES = 4 * 1024 * 1024;
export type GovernanceClass = 'rules' | 'entrenched';
export interface GroupRulesBody {
  proto: typeof GOVERNANCE_PROFILE;
  kind: 'group-rules';
  group_id: string;
  identity_key: string;
  version: number;
  prev_rules_hash?: string;
  steward_keys: string[];
  policy: GroupPolicyDraft['policy'];
  decision_class?: GovernanceClass;
}
export interface GroupRulesEnvelope { body: GroupRulesBody; sigs: { key: string; sig: string }[]; ratification?: { manifest_hash: string } }
export interface GroupRulesExport { format: typeof GOVERNANCE_EXPORT; rules: GroupRulesEnvelope[] }
export interface RatificationRequest {
  manifest_hash: string;
  previous_rules_hash: string;
  rules_hash: string;
  decision_class: GovernanceClass;
}
export type PendingRatification = Omit<RatificationRequest, 'manifest_hash'> & { manifest_hash?: string };
export interface GovernanceTrust {
  identityKey: string;
  genesisRulesHash: string;
  /** Trusted, synchronous, pure verification of FINAL passed governed-election evidence. */
  verifyRatification?: (request: Readonly<RatificationRequest>) => boolean;
}
export type GovernanceErrorCode = 'E_RULES_SCHEMA' | 'E_RULES_BOUND' | 'E_RULES_SIG' | 'E_RULES_CHAIN' | 'E_RULES_ANCHOR';
export interface GroupRulesReport {
  scope: 'signed-group-rules';
  status: 'VERIFIED' | 'INCOMPLETE' | 'INVALID';
  versions: number;
  active_version?: number;
  active_rules_hash?: string;
  candidate_rules_hash?: string;
  pending_ratifications: PendingRatification[];
  errors: { code: GovernanceErrorCode; message: string }[];
}
class GovernanceError extends Error {
  code: GovernanceErrorCode;
  constructor(code: GovernanceErrorCode, message: string) { super(message); this.code = code; }
}
function fail(code: GovernanceErrorCode, message: string): never { throw new GovernanceError(code, message); }
const hex = (v: unknown, n: number): v is string => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n * 2}}$`).test(v);
function closed(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('E_RULES_SCHEMA', 'expected closed object');
  const keys = Object.keys(value);
  if (required.some(k => !Object.hasOwn(value, k)) || keys.some(k => !required.includes(k) && !optional.includes(k))) fail('E_RULES_SCHEMA', 'unexpected or missing field');
}
function strictKey(value: unknown): asserts value is string {
  if (!hex(value, 32) || !ed25519IsStrictPoint(hexToBytes(value, 32))) fail('E_RULES_SCHEMA', 'invalid public key');
}
function snapshot(value: unknown, maximum: number): unknown {
  try {
    const bytes = jcs(value);
    if (bytes.length > maximum) fail('E_RULES_BOUND', 'document exceeds byte limit');
    return parseQvJson(bytes);
  } catch (error) {
    if (error instanceof GovernanceError) throw error;
    return fail('E_RULES_SCHEMA', 'invalid canonical JSON');
  }
}
/** New profile's domain-separated hash. It does not use or change suite-v1 frames. */
export function governanceHash(label: string, fields: readonly Uint8Array[]): Uint8Array {
  if (!/^[a-z-]{1,32}$/.test(label) || fields.length > 16 || fields.some(f => f.length > GOVERNANCE_MAX_BYTES)) throw new RangeError('governance frame bounds');
  return sha256(concatBytes(lp(utf8('QV-GOV-HASH')), lp(utf8(GOVERNANCE_PROFILE)), lp(utf8(label)), u32(fields.length), ...fields.map(lp)));
}
export function governanceGroupId(identityKey: string): string {
  strictKey(identityKey);
  return bytesToHex(governanceHash('group-id', [hexToBytes(identityKey, 32)]));
}
export function validateGroupRulesBody(input: unknown): GroupRulesBody {
  const value = snapshot(input, 64 * 1024);
  closed(value, ['proto', 'kind', 'group_id', 'identity_key', 'version', 'steward_keys', 'policy'], ['prev_rules_hash', 'decision_class']);
  if (value.proto !== GOVERNANCE_PROFILE || value.kind !== 'group-rules') fail('E_RULES_SCHEMA', 'unsupported governance profile or kind');
  strictKey(value.identity_key);
  if (!hex(value.group_id, 32) || value.group_id !== governanceGroupId(value.identity_key)) fail('E_RULES_SCHEMA', 'group identity mismatch');
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 1 || (value.version as number) > 64) fail('E_RULES_BOUND', 'version outside profile');
  if (!Array.isArray(value.steward_keys) || value.steward_keys.length < 1 || value.steward_keys.length > 15) fail('E_RULES_BOUND', 'steward count outside profile');
  const keys = value.steward_keys;
  for (let i = 0; i < keys.length; i++) {
    strictKey(keys[i]);
    if (i > 0 && !(keys[i - 1] < keys[i])) fail('E_RULES_SCHEMA', 'steward keys must be strictly sorted');
  }
  const p = value.policy as GroupPolicyDraft['policy'] | undefined;
  const min = Math.max(p?.elections?.min_voting_hours ?? 0, p?.decision_classes?.ordinary?.min_voting_hours ?? 0);
  const policy = validateGroupPolicyDraft({ format: 'qv-group-policy-draft/1', policy: p, suggested_election: { decision_class: 'ordinary', voting_hours: min } });
  if (!policy.valid) fail(policy.errors[0]?.code ?? 'E_RULES_SCHEMA', 'invalid group policy');
  if (p!.stewards.approval.n !== keys.length) fail('E_RULES_BOUND', 'steward count and approval disagree');
  if (value.version === 1) {
    if (Object.hasOwn(value, 'prev_rules_hash') || Object.hasOwn(value, 'decision_class')) fail('E_RULES_CHAIN', 'genesis cannot have predecessor or decision class');
  } else {
    if (!hex(value.prev_rules_hash, 32)) fail('E_RULES_CHAIN', 'amendment requires predecessor');
    if (!['rules', 'entrenched'].includes(value.decision_class as string)) fail('E_RULES_SCHEMA', 'invalid amendment decision class');
  }
  return value as unknown as GroupRulesBody;
}
const validateBody = validateGroupRulesBody;
function bodyRulesHash(body: GroupRulesBody): string {
  return bytesToHex(sha256(concatBytes(utf8('QV-rules/1'), jcs(body))));
}
export function groupRulesHash(body: unknown): string { return bodyRulesHash(validateBody(body)); }
function bodySignatureDigest(body: GroupRulesBody): Uint8Array {
  return governanceHash('signature', [hexToBytes(body.group_id, 32), utf8(body.kind), governanceHash('body', [jcs(body)])]);
}
export function groupRulesSignatureDigest(body: unknown): Uint8Array { return bodySignatureDigest(validateBody(body)); }
/** Offline signer; validates the body, never decides ratification or signer authority. */
export function signGroupRules(body: unknown, secretKey: Uint8Array): { key: string; sig: string } {
  const parsed = validateBody(body);
  return { key: bytesToHex(ed25519Keypair(secretKey).publicKey), sig: bytesToHex(ed25519Sign(secretKey, bodySignatureDigest(parsed))) };
}
function envelope(input: unknown): GroupRulesEnvelope {
  closed(input, ['body', 'sigs'], ['ratification']);
  const body = validateBody(input.body);
  if (!Array.isArray(input.sigs) || input.sigs.length < 1 || input.sigs.length > 16) fail('E_RULES_SIG', 'signature count outside profile');
  const sigs: GroupRulesEnvelope['sigs'] = [];
  for (const item of input.sigs) {
    closed(item, ['key', 'sig']); strictKey(item.key);
    if (!hex(item.sig, 64) || (sigs.length && !(sigs.at(-1)!.key < item.key))) fail('E_RULES_SIG', 'invalid signature encoding or order');
    sigs.push({ key: item.key, sig: item.sig });
  }
  if (Object.hasOwn(input, 'ratification')) {
    if (body.version === 1) fail('E_RULES_CHAIN', 'genesis cannot have ratification');
    closed(input.ratification, ['manifest_hash']);
    if (!hex(input.ratification.manifest_hash, 32)) fail('E_RULES_SCHEMA', 'invalid ratification reference');
    return { body, sigs, ratification: { manifest_hash: input.ratification.manifest_hash } };
  }
  return { body, sigs };
}
export function groupRulesAmendmentClass(previous: GroupRulesBody, next: GroupRulesBody): GovernanceClass {
  const p = previous.policy, n = next.policy;
  const same = (a: unknown, b: unknown) => bytesToHex(jcs(a)) === bytesToHex(jcs(b));
  const privacy = { hidden: 0, members: 1, public: 2 };
  if (!same(previous.steward_keys, next.steward_keys) || !same(p.stewards, n.stewards) ||
      !same(p.decision_classes.rules, n.decision_classes.rules) || !same(p.decision_classes.entrenched, n.decision_classes.entrenched) ||
      !same(p.disputes, n.disputes) || !same(p.halt, n.halt) || p.retention_profile !== n.retention_profile ||
      privacy[n.disclosure.roll_labels] > privacy[p.disclosure.roll_labels]) return 'entrenched';
  return 'rules';
}
function checkSignatures(record: GroupRulesEnvelope, previous?: GroupRulesBody): void {
  const body = record.body, authority = previous ?? body;
  const allowed = new Set(authority.steward_keys);
  if (!previous) allowed.add(body.identity_key);
  const digest = bodySignatureDigest(body);
  for (const item of record.sigs) {
    if (!allowed.has(item.key) || !ed25519Verify(hexToBytes(item.key, 32), hexToBytes(item.sig, 64), digest)) fail('E_RULES_SIG', 'unauthorized or invalid signature');
  }
  const signed = new Set(record.sigs.map(s => s.key));
  if ((!previous && !signed.has(body.identity_key)) || authority.steward_keys.filter(k => signed.has(k)).length < authority.policy.stewards.approval.k) fail('E_RULES_SIG', 'signature quorum not met');
}
/** Pure verification. Caller pins and ratification evidence are never read from the export. */
export function verifyGroupRulesExport(input: unknown, trust: GovernanceTrust): GroupRulesReport {
  const report: GroupRulesReport = { scope: 'signed-group-rules', status: 'INVALID', versions: 0, pending_ratifications: [], errors: [] };
  try {
    strictKey(trust?.identityKey);
    if (!hex(trust?.genesisRulesHash, 32)) fail('E_RULES_ANCHOR', 'missing genesis pin');
    const value = snapshot(input, GOVERNANCE_MAX_BYTES);
    closed(value, ['format', 'rules']);
    if (value.format !== GOVERNANCE_EXPORT) fail('E_RULES_SCHEMA', 'unsupported export profile');
    if (!Array.isArray(value.rules) || value.rules.length < 1 || value.rules.length > 128) fail('E_RULES_BOUND', 'history length outside profile');
    const history: { envelope: GroupRulesEnvelope; hash: string }[] = [];
    for (const raw of value.rules) {
      const record = envelope(raw), body = record.body, hash = bodyRulesHash(body);
      if (body.identity_key !== trust.identityKey) fail('E_RULES_ANCHOR', 'identity pin mismatch');
      if (body.version <= history.length) {
        const old = history[body.version - 1]!;
        if (old.hash !== hash) fail('E_RULES_CHAIN', 'competing rules at occupied version');
        checkSignatures(record, body.version > 1 ? history[body.version - 2]!.envelope.body : undefined);
        // A reference can be attached after the candidate was signed. It is not
        // part of its hash and grants nothing without independent evidence.
        if (record.ratification) {
          if (old.envelope.ratification && old.envelope.ratification.manifest_hash !== record.ratification.manifest_hash) fail('E_RULES_CHAIN', 'conflicting ratification references');
          old.envelope.ratification = record.ratification;
        }
        continue;
      }
      if (body.version !== history.length + 1) fail('E_RULES_CHAIN', 'nonconsecutive rule version');
      const previous = history.at(-1);
      if (!previous) {
        if (hash !== trust.genesisRulesHash) fail('E_RULES_ANCHOR', 'genesis pin mismatch');
      } else {
        if (body.prev_rules_hash !== previous.hash) fail('E_RULES_CHAIN', 'predecessor hash mismatch');
        if (groupRulesAmendmentClass(previous.envelope.body, body) === 'entrenched' && body.decision_class !== 'entrenched') fail('E_RULES_BOUND', 'protected amendment requires entrenched class');
      }
      checkSignatures(record, previous?.envelope.body);
      history.push({ envelope: record, hash });
    }
    // All schemas, pins, links and signatures pass before calling trusted evidence verifier.
    let active = history[0]!, blocked = false;
    for (let i = 1; i < history.length; i++) {
      const current = history[i]!, body = current.envelope.body;
      const request: PendingRatification = { previous_rules_hash: history[i - 1]!.hash, rules_hash: current.hash, decision_class: body.decision_class! };
      if (current.envelope.ratification) request.manifest_hash = current.envelope.ratification.manifest_hash;
      let verified = false;
      try {
        const answer: unknown = request.manifest_hash ? trust.verifyRatification?.(Object.freeze({ ...request }) as Readonly<RatificationRequest>) : false;
        verified = answer === true;
        // A mistaken async callback cannot grant authority or create an unhandled
        // rejection after this synchronous verifier returns. Use the intrinsic
        // Promise method: arbitrary thenables/getters are never assimilated.
        if (answer && typeof answer === 'object') {
          try { Promise.prototype.then.call(answer, () => {}, () => {}); } catch { /* not a native promise */ }
        }
      } catch { /* no evidence */ }
      if (!verified) report.pending_ratifications.push(request);
      blocked ||= !verified;
      if (!blocked) active = current;
    }
    report.versions = history.length;
    report.active_version = active.envelope.body.version;
    report.active_rules_hash = active.hash;
    report.candidate_rules_hash = history.at(-1)!.hash;
    report.status = report.pending_ratifications.length ? 'INCOMPLETE' : 'VERIFIED';
  } catch (error) {
    report.errors.push(error instanceof GovernanceError ? { code: error.code, message: error.message } : { code: 'E_RULES_SCHEMA', message: 'invalid governance input' });
  }
  return report;
}
/** Wire boundary: bounded bytes and duplicate-key detection precede object validation. */
export function verifyGroupRulesJson(input: string | Uint8Array, trust: GovernanceTrust): GroupRulesReport {
  try {
    const bytes = typeof input === 'string' ? utf8(input) : input;
    if (bytes.length > GOVERNANCE_MAX_BYTES) fail('E_RULES_BOUND', 'document exceeds byte limit');
    return verifyGroupRulesExport(parseQvJson(bytes), trust);
  } catch (error) {
    return { scope: 'signed-group-rules', status: 'INVALID', versions: 0, pending_ratifications: [], errors: [error instanceof GovernanceError ? { code: error.code, message: error.message } : { code: 'E_RULES_SCHEMA', message: 'invalid governance JSON' }] };
  }
}
