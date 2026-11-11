// Test/vecgen-only QV-18 log export builder that also understands control/notice records (logcheck X-31) and lets a
// scenario override the header type or author of single entries (adversarial notices). Same construction as
// test/helpers/board.ts (entry bodies = JCS of the protocol records, nonce from seq, fixed created_at), so a log without
// control records yields byte-identical exports.
import { jcs, sha256, utf8, type Ed25519Keypair } from '@quietvote/crypto';
import {
  MerkleTree, buildEntry, bundleToJson, cosignLine, receiptToJson, signCheckpoint, signPromise,
  type EntryType, type LogBundle, type ReceiptJson,
} from '@quietvote/board';
import { CONTROL_ENTRY, PROTO_ID, logOrigin, signRecordRaw, type ElectionBundle, type LogEntry } from '../../src/index.ts';
import { CREATED_AT, typeAndAuthor, type Cosig, type Head } from '../helpers/board.ts';
import type { Sim } from '../helpers/sim.ts';

export interface LogView {
  origin: string;
  json: Record<string, unknown>;
  tree: MerkleTree;
  headers: Uint8Array[];
  notes: Map<number, string>;
  logKey: Ed25519Keypair;
  /** Signs (and cosigns) tree heads of this view's tree; does not change `json`. */
  sign: (heads: Head[]) => string[];
  receipt: (seq: number, headSize: number) => ReceiptJson;
}

export interface EntryOverride {
  type?: EntryType;
  author?: Ed25519Keypair;
}

function authorOf(sim: Sim, rec: Record<string, any>, isManifest: boolean): [EntryType, Ed25519Keypair] {
  const b = rec?.body;
  if (!isManifest && b?.type === 'control') return [CONTROL_ENTRY[b.action] ?? 'notice', sim.coord[0]!];
  if (!isManifest && !('intent' in rec) && !['marker', 'roll-commit', 'dkg-commit', 'dkg-dealing', 'dkg-shares', 'dkg-complaint', 'dkg-keyconf', 'tally'].includes(b?.type)) {
    return ['notice', sim.coord[0]!];
  }
  return typeAndAuthor(sim, rec, isManifest);
}

export function signHeads(origin: string, tree: MerkleTree, logKey: Ed25519Keypair, heads: Head[]): Map<number, string> {
  const notes = new Map<number, string>();
  for (const h of heads) {
    let note = signCheckpoint(origin, h.size, tree.root(h.size), logKey.secretKey, logKey.publicKey);
    const text = note.slice(0, note.indexOf('\n\n') + 1);
    for (const c of h.cosigs ?? []) note += cosignLine(c.name, c.key.secretKey, c.key.publicKey, text, c.ts);
    notes.set(h.size, note);
  }
  return notes;
}

export function buildLogView(sim: Sim, b: ElectionBundle, heads: Head[], logKey: Ed25519Keypair, over: ReadonlyMap<number, EntryOverride> = new Map()): LogView {
  const origin = logOrigin(b.manifest.body);
  const recs: [number, unknown][] = [[0, b.manifest], ...b.log.map((e): [number, unknown] => [e.seq, e.entry])];
  const tree = new MerkleTree();
  const headers: Uint8Array[] = [];
  const entries: LogBundle['entries'] = [];
  for (const [seq, rec] of recs) {
    const [t0, a0] = authorOf(sim, rec as Record<string, any>, seq === 0);
    const o = over.get(seq);
    const type = o?.type ?? t0;
    const who = o?.author ?? a0;
    const body = jcs(rec);
    const e = buildEntry({
      origin, type, secretKey: who.secretKey, publicKey: who.publicKey, nonce: sha256(utf8(`nonce-${seq}`)).slice(0, 16), createdAt: CREATED_AT, body,
    });
    tree.appendLeaf(e.headerBytes);
    headers.push(e.headerBytes);
    entries.push({ seq, headerBytes: e.headerBytes, body });
  }
  const notes = signHeads(origin, tree, logKey, heads);
  const bundle: LogBundle = {
    format: 'qv-bundle/v1', origin, createdAt: CREATED_AT, treeSize: tree.size, root: tree.root(), generator: 'protocol-test', spec: 'QV-18',
    entries, checkpoints: [...notes.values()], receipts: [],
    policy: { logPublicKey: logKey.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } },
    redactions: [],
  };
  const receipt = (seq: number, headSize: number): ReceiptJson => {
    const r = signPromise(logKey.secretKey, origin, seq, tree.leafHash(seq)!, CREATED_AT + seq);
    const note = notes.get(headSize) ?? signHeads(origin, tree, logKey, [{ size: headSize }]).get(headSize)!;
    r.inclusion = { treeSize: headSize, path: tree.inclusionProof(seq, headSize), checkpointNote: note };
    return receiptToJson(r);
  };
  return {
    origin, json: bundleToJson(bundle) as Record<string, unknown>, tree, headers, notes, logKey, receipt,
    sign: (hs) => [...signHeads(origin, tree, logKey, hs).values()],
  };
}

/** A control/notice record `{body: {proto, type: "control", action, reason?, ...extra}, sigs}` (logcheck X-31). */
export function controlRecord(
  sim: Sim,
  action: string,
  o: { reason?: string; extra?: Record<string, unknown>; signer?: Ed25519Keypair; unsigned?: boolean } = {},
): { body: Record<string, unknown>; sigs: { key: string; sig: string }[] } {
  const body: Record<string, unknown> = { proto: PROTO_ID, type: 'control', action, ...(o.reason === undefined ? {} : { reason: o.reason }), ...(o.extra ?? {}) };
  const k = o.signer ?? sim.coord[0]!;
  return { body, sigs: [signRecordRaw(k.secretKey, k.publicKey, sim.mh, 'control', body)] };
}

/** Copy of `b` with `entry` inserted so that it gets seq `at` (later entries are renumbered; no record binds its seq). */
export function insertAt(b: ElectionBundle, at: number, entry: unknown): ElectionBundle {
  const log: LogEntry[] = [];
  for (const e of b.log) {
    if (e.seq === at) log.push({ seq: at, entry: JSON.parse(JSON.stringify(entry)) });
    log.push({ seq: e.seq >= at ? e.seq + 1 : e.seq, entry: JSON.parse(JSON.stringify(e.entry)) });
  }
  if (at > (b.log.at(-1)?.seq ?? 0)) log.push({ seq: at, entry: JSON.parse(JSON.stringify(entry)) });
  return { ...JSON.parse(JSON.stringify(b)), log } as ElectionBundle;
}

/** Seq of a coordinator marker in a bundle. */
export function markerSeq(b: ElectionBundle, name: string): number {
  const e = b.log.find((x) => (x.entry as { body?: { type?: string; name?: string } }).body?.type === 'marker' && (x.entry as { body: { name: string } }).body.name === name);
  if (e === undefined) throw new Error(`no marker ${name}`);
  return e.seq;
}

export const cosigs = (keys: Record<string, Ed25519Keypair>, ts: number, ...who: string[]): Cosig[] => who.map((n) => ({ name: n, key: keys[n]!, ts }));
