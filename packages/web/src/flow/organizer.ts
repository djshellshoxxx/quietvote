// Organizer logic: election templates -> manifest, roll upload, signed records. DOM-free.
import { bytesToHex, ed25519IsStrictPoint, hexToBytes, sha256, utf8 } from '@quietvote/crypto';
import { PROTO_ID, recordDigest, rollRoot, validateManifest, type Manifest, type ManifestContest, type MultiSignedRecord } from '@quietvote/protocol';
import type { Signer } from '../key/signer.ts';

export type Template = 'yes-no' | 'single-choice' | 'approval' | 'k-of-n';
export const TEMPLATES: readonly Template[] = ['yes-no', 'single-choice', 'approval', 'k-of-n'];

export interface ContestForm {
  template: Template;
  question: string;
  /** One label per entry (ignored for yes-no). */
  options: string[];
  k?: number;
  pass?: 'majority' | 'two-thirds';
}

const slug = (s: string, i: number): string => {
  const x = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return /^[a-z0-9]/.test(x) ? `${x}-${i}` : `o-${i}`;
};

export function buildContest(f: ContestForm, index: number): ManifestContest {
  const id = `c${index + 1}`;
  if (f.template === 'yes-no') {
    const two = f.pass === 'two-thirds';
    return {
      id, title: f.question, method: 'yes-no', min_selections: 0, selection_limit: 1,
      options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      rule: { type: 'threshold', num: two ? 2 : 1, den: two ? 3 : 2, basis: 'counted', strict: !two },
      tie_break: { type: 'status-quo', option: 'no' },
    };
  }
  const options = f.options.map((l, i) => ({ id: slug(l, i + 1), label: l }));
  const c: ManifestContest = { id, title: f.question, method: f.template, min_selections: 0, options, tie_break: { type: 'declare-tie' } };
  if (f.template === 'single-choice') c.selection_limit = 1;
  if (f.template === 'k-of-n') {
    c.selection_limit = f.k ?? 1;
    c.winners = f.k ?? 1;
  }
  return c;
}

export interface ManifestForm {
  title: string;
  contests: ContestForm[];
  opensIso: string;
  closesIso: string;
  maxBallots: number;
  quorumCount: number;
  trustees: { name: string; signPkHex: string }[];
  t: number;
  coordinatorPkHex: string;
  logPkHex: string;
  origin: string;
  rollHex: string[];
  electionIdHex: string;
}

/** `datetime-local` value (or any date string) -> UTC ISO seconds, or undefined when it is not a valid date (never throws). */
export function isoUtc(v: string): string | undefined {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().replace('.000Z', 'Z');
}

export type OrgProblem = 'E-ORG-QUORUM' | 'E-ORG-TRUSTEES' | 'E-ORG-MANIFEST';
export type BuildResult = { ok: true; manifest: Manifest; warnings: string[] } | { ok: false; code: OrgProblem; detail: string };

export function buildManifest(f: ManifestForm): BuildResult {
  const rr = rollRoot(f.rollHex);
  if (!rr.ok) return { ok: false, code: 'E-ORG-MANIFEST', detail: rr.detail ?? 'roll invalid' };
  if (f.quorumCount > f.rollHex.length) return { ok: false, code: 'E-ORG-QUORUM', detail: 'quorum exceeds roll size' };
  const n = f.trustees.length;
  const keys = new Set(f.trustees.map((x) => x.signPkHex));
  if (n < 1 || f.t < 1 || f.t > n || keys.size !== n) return { ok: false, code: 'E-ORG-TRUSTEES', detail: 'bad trustee set' };
  const m: Manifest = {
    proto: PROTO_ID, type: 'manifest', election_id: f.electionIdHex, title: f.title, created: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    voting_open: f.opensIso, voting_close: f.closesIso, clock_skew_s: 300, contests: f.contests.map(buildContest),
    roll: { scheme: 'ed25519-roll-v1', weights: 'uniform', root: bytesToHex(rr.value), size: f.rollHex.length },
    trustees: f.trustees.map((x, i) => ({ index: i + 1, name: x.name, sign_pk: x.signPkHex })), n, t: f.t,
    coordinator: { keys: [f.coordinatorPkHex], m: 1 }, ballots: { max_per_voter: f.maxBallots, max_spoils_per_voter: 16 },
    bb: { log_id: bytesToHex(sha256(utf8(f.origin))), log_pk: f.logPkHex, witness_quorum: 0 }, privacy_ack: true,
  };
  if (f.quorumCount > 0) m.quorum = { type: 'count', value: f.quorumCount };
  const v = validateManifest(m, f.rollHex.length);
  if (!v.ok) return { ok: false, code: 'E-ORG-MANIFEST', detail: `${v.error}${v.detail ? `: ${v.detail}` : ''}` };
  return { ok: true, manifest: v.value.manifest, warnings: v.value.warnings };
}

export interface RollParse {
  keys: string[];
  errors: { row: number; problem: 'badHex' | 'badKey' | 'dup' }[];
  rootHex?: string;
}

/** One key per line, optional ", label". Reports row numbers (QV-10 O4), sorts bytewise, computes the Merkle root. */
export function parseRoll(text: string): RollParse {
  const errors: RollParse['errors'] = [];
  const seen = new Set<string>();
  const rows = text.split(/\r?\n/);
  rows.forEach((line, i) => {
    const raw = line.split(',')[0]!.trim().toLowerCase();
    if (raw === '') return;
    if (!/^[0-9a-f]{64}$/.test(raw)) return void errors.push({ row: i + 1, problem: 'badHex' });
    if (!ed25519IsStrictPoint(hexToBytes(raw, 32))) return void errors.push({ row: i + 1, problem: 'badKey' });
    if (seen.has(raw)) return void errors.push({ row: i + 1, problem: 'dup' });
    seen.add(raw);
  });
  const keys = [...seen].sort();
  const out: RollParse = { keys, errors };
  if (errors.length === 0 && keys.length > 0) {
    const r = rollRoot(keys);
    if (r.ok) out.rootHex = bytesToHex(r.value);
  }
  return out;
}

/** Coordinator-signed record (manifest, roll-commit, markers) using the async session signer. */
export async function signMulti<B extends { type: string }>(signer: Signer, scope: Uint8Array, body: B): Promise<MultiSignedRecord<B>> {
  const sig = await signer.sign(recordDigest(scope, body.type, body));
  return { body, sigs: [{ key: bytesToHex(signer.publicKey), sig: bytesToHex(sig) }] };
}
