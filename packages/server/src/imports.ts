// Election bundle import (QV-09 `POST /imports`, QV-18 §12 + REQ-033, QV-28 §11.4): a `.qvb` is verified completely - tar framing,
// checksums, every entry, tree, checkpoint, witness gate, author signature and authorisation, every protocol record and proof -
// BEFORE anything is exposed, and only then becomes a read-only election (state IMPORTED, no signing keys, no invites).
// Rejections carry the exact failing {seq, rule, detail}.
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  authorKeyId, b64u, bundleFromJson, bundleToJson, decodeHeader, hashLeaf, nonceKey, parseCheckpoint, toHex, unb64u, verifyLog,
  type EntryHeader, type LogBundle, type WitnessPolicy,
} from '@quietvote/board';
import { bytesToHex, ed25519IsStrictPoint, hexToBytes, jcs, parseQvJson, sha256, utf8 } from '@quietvote/crypto';
import { manifestHash, verifyElection, type ElectionBundle, type Manifest } from '@quietvote/protocol';
import { ElectionDb } from './electiondb.ts';
import { SERVER_VERSION } from './election.ts';
import type { Env } from './env.ts';
import type { ElectionPool } from './pool.ts';
import { readTarStrict, TarError } from './tar.ts';
import { originOf } from './util.ts';

export class ImportError extends Error {
  readonly rule: string;
  readonly seq: number | undefined;
  readonly status: number;
  constructor(rule: string, detail: string, seq?: number, status = 422) {
    super(detail);
    this.rule = rule;
    this.seq = seq;
    this.status = status;
  }
  toJSON(): Record<string, unknown> {
    return { code: 'IMPORT_REJECTED', status: this.status, rule: this.rule, detail: this.message, ...(this.seq !== undefined ? { seq: this.seq } : {}) };
  }
}

export interface Yield {
  (): Promise<void>;
}

const HEX32 = /^[0-9a-f]{64}$/;
const SUM_LINE = /^([0-9a-f]{64}) {2}([A-Za-z0-9._/-]{1,100})$/;
const CP_NAME = /^log\/checkpoints\/(0|[1-9][0-9]{0,15})\.txt$/;
const PROTOCOL_TYPES = new Set([
  'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close', 'dkg_round1', 'dkg_round2', 'dkg_complaint',
  'key_confirm', 'ballot', 'ballot_audit', 'tally_result',
]);

const text = (b: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(b);
const eqBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

function json(b: Uint8Array, what: string, max: number): unknown {
  if (b.length > max) throw new ImportError('BUNDLE_FORMAT', `${what} is larger than ${max} bytes`);
  try {
    return parseQvJson(b);
  } catch {
    throw new ImportError('BUNDLE_FORMAT', `${what} is not strict JSON`);
  }
}
const obj = (x: unknown, what: string): Record<string, unknown> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new ImportError('BUNDLE_FORMAT', `${what} must be an object`);
  return x as Record<string, unknown>;
};

export interface VerifiedBundle {
  electionId: string;
  origin: string;
  manifest: Manifest;
  manifestHashHex: string;
  logPk: Uint8Array;
  srvPk: Uint8Array;
  organizerPk: Uint8Array;
  roll: Uint8Array[];
  entries: { seq: number; header: Uint8Array; body: Uint8Array; h: EntryHeader }[];
  checkpoints: { size: number; note: string }[];
  verdict: 'PASS' | 'INCOMPLETE';
  warnings: string[];
  bodyBytes: number;
}

/**
 * Parses and verifies a `.qvb`. Pure with respect to the server (reads only configuration); throws ImportError.
 * `expectedManifestHash` is the out-of-band trust anchor (QV-18 §13 step 1) when the importer has one.
 */
export async function verifyBundle(env: Env, buf: Uint8Array, expectedManifestHash: string | undefined, tick: Yield, progress: (p: number) => void): Promise<VerifiedBundle> {
  const cfg = env.cfg;
  const warnings: string[] = [];
  // ---- 1. tar framing and checksums
  let files: Map<string, Uint8Array>;
  try {
    files = readTarStrict(buf, { maxFiles: cfg.maxImportEntries + 32 });
  } catch (e) {
    throw new ImportError('BUNDLE_TAR', e instanceof TarError ? e.message : 'archive cannot be read');
  }
  const sumsRaw = files.get('SHA256SUMS');
  if (!sumsRaw) throw new ImportError('BUNDLE_FORMAT', 'SHA256SUMS is missing');
  let sumsText: string;
  try {
    sumsText = text(sumsRaw);
  } catch {
    throw new ImportError('BUNDLE_FORMAT', 'SHA256SUMS is not UTF-8');
  }
  if (sumsText.length === 0 || !sumsText.endsWith('\n')) throw new ImportError('BUNDLE_FORMAT', 'SHA256SUMS must end with a newline');
  const sums = new Map<string, string>();
  for (const line of sumsText.slice(0, -1).split('\n')) {
    const m = SUM_LINE.exec(line);
    if (!m || sums.has(m[2]!)) throw new ImportError('BUNDLE_FORMAT', 'SHA256SUMS has a malformed or duplicate line');
    sums.set(m[2]!, m[1]!);
  }
  for (const [name, data] of files) {
    if (name === 'SHA256SUMS') continue;
    const want = sums.get(name);
    if (want === undefined) throw new ImportError('BUNDLE_CHECKSUM', `file ${name} is not listed in SHA256SUMS`);
    if (createHash('sha256').update(data).digest('hex') !== want) throw new ImportError('BUNDLE_CHECKSUM', `checksum mismatch for ${name}`);
  }
  for (const name of sums.keys()) if (!files.has(name)) throw new ImportError('BUNDLE_CHECKSUM', `${name} is listed in SHA256SUMS but missing`);
  await tick();
  progress(0.05);

  const need = (n: string): Uint8Array => {
    const f = files.get(n);
    if (!f) throw new ImportError('BUNDLE_FORMAT', `${n} is missing`);
    return f;
  };
  // ---- 2. descriptors
  const bj = obj(json(need('bundle.json'), 'bundle.json', 65536), 'bundle.json');
  const origin = bj['origin'];
  if (bj['format'] !== 'qv-bundle/v1' || bj['spec'] !== 'QV-18' || typeof origin !== 'string' || !/^quietvote\/v1\/[a-z2-7]{26}$/.test(origin)) {
    throw new ImportError('BUNDLE_FORMAT', 'bundle.json: unsupported format or origin');
  }
  const entriesRaw = need('log/entries.jsonl');
  if (bj['entries_sha256'] !== toHex(sha256(entriesRaw))) throw new ImportError('BUNDLE_CHECKSUM', 'bundle.json entries_sha256 does not match log/entries.jsonl');
  const key32 = (k: string): Uint8Array => {
    const v = typeof bj[k] === 'string' ? unb64u(bj[k] as string) : undefined;
    if (!v || v.length !== 32 || !ed25519IsStrictPoint(v)) throw new ImportError('BUNDLE_FORMAT', `bundle.json: ${k} is missing or not an Ed25519 key`);
    return v;
  };
  const logPk = key32('log_pk_b64u');
  const srvPk = key32('server_pk_b64u');
  const organizerPk = key32('organizer_pk_b64u');
  const policyJ = json(need('witness/policy.json'), 'witness/policy.json', 65536);
  const redactions = json(need('redactions.json'), 'redactions.json', 65536);
  if (!Array.isArray(redactions) || redactions.length !== 0) throw new ImportError('BUNDLE_REDACTED', 'bundles with redacted bodies cannot be imported (the election could not be replayed)');

  // ---- 3. entries.jsonl
  let entriesText: string;
  try {
    entriesText = text(entriesRaw);
  } catch {
    throw new ImportError('BUNDLE_FORMAT', 'log/entries.jsonl is not UTF-8');
  }
  if (!entriesText.endsWith('\n')) throw new ImportError('BUNDLE_FORMAT', 'log/entries.jsonl must end with a newline');
  const lines = entriesText.slice(0, -1).split('\n');
  if (lines.length > cfg.maxImportEntries) throw new ImportError('BUNDLE_LIMIT', `more than ${cfg.maxImportEntries} entries`, undefined, 413);
  const entryObjs: unknown[] = [];
  for (let i = 0; i < lines.length; i++) {
    let e: unknown;
    try {
      e = parseQvJson(lines[i]!);
    } catch {
      throw new ImportError('BUNDLE_FORMAT', 'entry line is not strict JSON', i);
    }
    const o = obj(e, 'entry');
    if (Object.keys(o).length !== 3 || o['seq'] !== i || typeof o['header_b64u'] !== 'string' || typeof o['body_b64u'] !== 'string') {
      throw new ImportError('BUNDLE_FORMAT', 'entry line must be exactly {seq, header_b64u, body_b64u} with a body and gapless seq', i);
    }
    entryObjs.push(o);
    if ((i & 1023) === 1023) await tick();
  }
  // ---- 4. checkpoints
  const cpNotes: string[] = [];
  for (const [name, data] of files) {
    const m = CP_NAME.exec(name);
    if (!m) continue;
    let note: string;
    try {
      note = text(data);
    } catch {
      throw new ImportError('BUNDLE_FORMAT', `${name} is not UTF-8`);
    }
    const p = parseCheckpoint(note);
    if (!p.ok || p.value.size !== Number(m[1])) throw new ImportError('BUNDLE_CHECKPOINT', `${name} is not a checkpoint of that size`);
    cpNotes.push(note);
  }
  const lbR = bundleFromJson({
    format: bj['format'], origin, created_at: bj['created_at'], tree_size: bj['tree_size'], root_b64: bj['root_b64'], generator: bj['generator'], spec: bj['spec'],
    entries: entryObjs, checkpoints: cpNotes, receipts: [], policy: policyJ, redactions: [],
  });
  if (!lbR.ok) throw new ImportError('BUNDLE_FORMAT', `bundle structure: ${lbR.error.message}`);
  const lb: LogBundle = lbR.value;
  if (lb.entries.length === 0) throw new ImportError('BUNDLE_FORMAT', 'bundle has no entries');
  progress(0.1);
  await tick();

  // ---- 5. protocol layer: every record, signature and proof (verifyElection never throws on hostile input)
  const electionJ = obj(json(need('election.json'), 'election.json', 1 << 30), 'election.json');
  const rep = await verifyElection(electionJ);
  if (rep.verdict === 'FAIL') {
    const f = rep.findings.find((x) => x.cls === 'F') ?? rep.findings[0];
    throw new ImportError(f?.code ?? 'PROTOCOL_VERIFY', f ? f.detail : 'the election record does not verify', f?.seq);
  }
  progress(0.55);
  await tick();
  const eb = electionJ as unknown as ElectionBundle;
  const manifest = eb.manifest.body;
  const mhHex = bytesToHex(manifestHash(manifest));
  if (eb.manifest_hash !== mhHex) throw new ImportError('MANIFEST_HASH', 'election.json manifest_hash is not the hash of its manifest');
  if (expectedManifestHash !== undefined && expectedManifestHash !== mhHex) throw new ImportError('MANIFEST_HASH', 'manifest hash differs from the expected value');
  if (!/^[0-9a-f]{32}$/.test(manifest.election_id) || originOf(manifest.election_id) !== origin) throw new ImportError('BUNDLE_BINDING', 'bundle origin is not the origin of the manifest election_id');
  if (manifest.bb.log_pk !== bytesToHex(logPk) || !eqBytes(lb.policy.logPublicKey, logPk)) throw new ImportError('BUNDLE_BINDING', 'the log key of the bundle is not manifest bb.log_pk');
  if (!eqBytes(lb.entries[0]!.body!, jcs(eb.manifest))) throw new ImportError('BUNDLE_BINDING', 'entry 0 is not the canonical manifest record', 0);
  const roll = eb.roll.map((h) => hexToBytes(h, 32));
  if (roll.length > cfg.maxVotersPerElection) throw new ImportError('BUNDLE_LIMIT', `roll has more than ${cfg.maxVotersPerElection} voters`, undefined, 413);

  // ---- 6. board layer: tree, checkpoints, witness gates, author authorisation + signature of EVERY entry
  const kid = (pk: Uint8Array): string => toHex(authorKeyId('ed25519', pk));
  const mapOf = (pks: Uint8Array[]): Map<string, Uint8Array> => new Map(pks.map((k) => [kid(k), k]));
  const coord = mapOf(manifest.coordinator.keys.map((k) => hexToBytes(k, 32)));
  const trustee = mapOf(manifest.trustees.map((t) => hexToBytes(t.sign_pk, 32)));
  const voters = mapOf(roll);
  const tallyKeys = new Map<number, Uint8Array>();
  const resolve = (h: EntryHeader, seq?: number): Uint8Array | undefined => {
    const k = toHex(h.author);
    switch (h.type) {
      case 'manifest': return kid(organizerPk) === k ? organizerPk : undefined;
      case 'ceremony_start': case 'joint_key': case 'roll_commit': case 'election_open': case 'election_close': case 'notice':
      case 'audit_close': case 'election_cancel': case 'ceremony_abort': return coord.get(k);
      case 'tally_result': return coord.get(k) ?? (seq !== undefined ? tallyKeys.get(seq) : undefined);
      case 'dkg_round1': case 'dkg_round2': case 'dkg_complaint': case 'key_confirm': case 'decryption_share': return trustee.get(k);
      case 'ballot': case 'ballot_audit': return voters.get(k);
      case 'tally_aggregate': return kid(srvPk) === k ? srvPk : undefined;
      default: return undefined;
    }
  };
  // tally_result may be posted by anyone; the author must be the key that signed the record (QV-18 §5.2)
  const parsedHeaders: EntryHeader[] = [];
  for (let i = 0; i < lb.entries.length; i++) {
    const e = lb.entries[i]!;
    const d = decodeHeader(e.headerBytes);
    if (!d.ok) throw new ImportError(d.error.code, d.error.message, i);
    parsedHeaders.push(d.value);
    if (d.value.type === 'tally_result' && e.body) {
      try {
        const k = (parseQvJson(e.body) as { sig?: { key?: unknown } }).sig?.key;
        if (typeof k === 'string' && HEX32.test(k)) tallyKeys.set(i, hexToBytes(k, 32));
      } catch {
        /* the entry will fail verification below */
      }
    }
    if ((i & 1023) === 1023) await tick();
  }
  const quorum = manifest.bb.witness_quorum;
  const mw = manifest.bb.witnesses;
  const anchors = mw !== undefined && mw.length > 0 ? mw.map((w) => ({ name: w.name, pk: w.pk })) : env.cfg.witnesses.map((w) => ({ name: w.name, pk: w.publicKey }));
  const policy: WitnessPolicy = {
    quorum, noneAcknowledged: quorum === 0,
    witnesses: anchors.map((w) => ({ name: w.name, alg: 'ed25519' as const, publicKey: hexToBytes(w.pk, 32) })),
  };
  const v = verifyLog(lb, { logPublicKey: logPk, witnessPolicy: policy, resolveAuthorKey: (h, seq) => resolve(h, seq) });
  if (v.integrity === 'FAILED' || v.failures.length > 0) {
    const f = v.failures[0]!;
    throw new ImportError(f.rule, f.detail, f.seq);
  }
  for (const w of v.warnings) if (!w.startsWith('log key taken') && !w.startsWith('witness policy taken')) warnings.push(w);
  progress(0.8);
  await tick();

  // ---- 7. the protocol records are exactly the bodies of the log entries (nothing hidden, nothing swapped)
  const bySeq = new Map<number, unknown>();
  for (const it of eb.log) {
    if (bySeq.has(it.seq)) throw new ImportError('BUNDLE_BINDING', 'duplicate protocol log entry', it.seq);
    bySeq.set(it.seq, it.entry);
  }
  for (let i = 1; i < lb.entries.length; i++) {
    const e = lb.entries[i]!;
    const h = parsedHeaders[i]!;
    let expected = PROTOCOL_TYPES.has(h.type);
    if (h.type === 'notice') {
      try {
        expected = (parseQvJson(e.body!) as { body?: { type?: string } }).body?.type === 'marker';
      } catch {
        throw new ImportError('BUNDLE_BINDING', 'notice body is not strict JSON', i);
      }
    }
    const rec = bySeq.get(i);
    if (expected) {
      if (rec === undefined) throw new ImportError('BUNDLE_BINDING', `${h.type} entry is missing from the election record`, i);
      if (!eqBytes(e.body!, jcs(rec))) throw new ImportError('BUNDLE_BINDING', 'entry body differs from the election record', i);
    } else if (rec !== undefined) throw new ImportError('BUNDLE_BINDING', `election record lists a ${h.type} entry`, i);
    bySeq.delete(i);
    if ((i & 1023) === 1023) await tick();
  }
  if (bySeq.size > 0) throw new ImportError('BUNDLE_BINDING', 'election record lists entries that are not in the log', [...bySeq.keys()][0]);

  let bodyBytes = 0;
  const entries = lb.entries.map((e, i) => {
    bodyBytes += e.body!.length;
    return { seq: i, header: e.headerBytes, body: e.body!, h: parsedHeaders[i]! };
  });
  if (bodyBytes > cfg.maxLogBytes) throw new ImportError('BUNDLE_LIMIT', 'bundle exceeds the per-election log size cap', undefined, 413);
  const checkpoints = cpNotes.map((note) => ({ size: (parseCheckpoint(note) as { ok: true; value: { size: number } }).value.size, note })).sort((a, b) => a.size - b.size);
  return {
    electionId: manifest.election_id, origin, manifest, manifestHashHex: mhHex, logPk, srvPk, organizerPk, roll, entries, checkpoints,
    verdict: rep.verdict === 'PASS' ? 'PASS' : 'INCOMPLETE', warnings: [...warnings, ...rep.warnings.slice(0, 5)], bodyBytes,
  };
}

export interface CommitResult {
  election_id: string;
  origin: string;
  tree_size: number;
  manifest_hash: string;
  verdict: string;
  warnings: string[];
}

/**
 * Creates the read-only election from a VERIFIED bundle. Everything is written to the election database first (inside one
 * transaction); the registry row is inserted last, then the runtime is opened once as a replay self-test. Any failure removes
 * the new files and leaves no trace.
 */
export async function commitImport(env: Env, pool: ElectionPool, vb: VerifiedBundle, orgId: string, access: 'public' | 'link', readKeyHash: Uint8Array | null, tick: Yield): Promise<CommitResult> {
  const { control, cfg } = env;
  if (control.electionAny(vb.electionId) !== undefined) throw new ImportError('ELECTION_EXISTS', 'an election with this id already exists on this instance', undefined, 409);
  if (control.countElections(orgId) >= cfg.maxElectionsPerOrg) throw new ImportError('QUOTA', 'election quota reached for this organization', undefined, 429);
  const rel = join('elections', vb.electionId.slice(0, 2), `${vb.electionId}.sqlite`);
  const abs = join(cfg.dataDir, rel);
  mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });
  const cleanup = (): void => {
    for (const sfx of ['', '-wal', '-shm']) rmSync(abs + sfx, { force: true });
  };
  cleanup(); // an orphan from an earlier crash (no registry row exists for this id)
  let edb: ElectionDb | undefined;
  try {
    edb = new ElectionDb(abs, SERVER_VERSION);
    const db = edb;
    const nowMs = env.nowMs();
    const hour = Math.floor(nowMs / 3_600_000) * 3_600_000;
    db.initImported({
      election_id: vb.electionId, origin: vb.origin, log_pk: vb.logPk, srv_pk: vb.srvPk, access, read_key_hash: readKeyHash, title: vb.manifest.title,
      org_id: orgId, created_at: nowMs,
    });
    db.tx(() => {
      db.setMeta('organizer_pk', bytesToHex(vb.organizerPk));
      db.setMeta('imported_from_generator', 'qvb');
      db.importVoters([...vb.roll].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))), (pk) => b64u(authorKeyId('ed25519', pk)), hour);
      for (const e of vb.entries) {
        db.store.appendEntry({
          seq: e.seq, headerBytes: e.header, body: e.body, leafHash: hashLeaf(e.header), sequencedAt: e.h.createdAt,
          nonceKey: nonceKey(toHex(e.h.author), e.h.type, toHex(e.h.authorNonce)),
        });
        if (e.h.type === 'ballot' || e.h.type === 'ballot_audit') {
          const intent = (parseQvJson(e.body) as { intent?: string }).intent;
          db.recordBallot(e.seq, b64u(e.h.author), intent === 'spoil' ? 'spoil' : 'cast', hashLeaf(e.header));
        }
      }
      for (const c of vb.checkpoints) {
        const p = parseCheckpoint(c.note);
        if (p.ok) db.store.putCheckpoint({ size: p.value.size, root: p.value.root, note: c.note });
      }
      db.store.setReadOnly(true);
    });
    await tick();
    const size = statSync(abs).size;
    edb.close();
    edb = undefined;
    control.tx(() => control.insertImported({ election_id: vb.electionId, org_id: orgId, db_path: rel, access, title: vb.manifest.title, bytes_used: size }));
    // replay self-test: the runtime must be able to rebuild its projection from what was stored
    let rt;
    try {
      rt = await pool.get(vb.electionId);
    } catch (e) {
      await pool.evict(vb.electionId).catch(() => undefined);
      control.markDeleted(vb.electionId);
      cleanup();
      throw new ImportError('REPLAY_FAILED', `the imported log could not be replayed: ${e instanceof Error ? e.message.slice(0, 160) : 'error'}`);
    }
    if (!rt || rt.quarantineReason() !== undefined) {
      await pool.evict(vb.electionId).catch(() => undefined);
      control.markDeleted(vb.electionId);
      cleanup();
      throw new ImportError('REPLAY_FAILED', 'the imported log is inconsistent after replay');
    }
    control.audit('system', 'election.import', vb.electionId);
    return { election_id: vb.electionId, origin: vb.origin, tree_size: rt.log.size, manifest_hash: vb.manifestHashHex, verdict: vb.verdict, warnings: vb.warnings };
  } catch (e) {
    edb?.close();
    if (!(e instanceof ImportError) && existsSync(abs) && control.electionAny(vb.electionId) === undefined) cleanup();
    throw e;
  }
}

void bundleToJson; void utf8;
