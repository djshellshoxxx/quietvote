// Test-only: builds the QV-18 log export for a simulated election (entry bodies = JCS of the protocol records),
// signs tree heads, cosigns them, and issues receipts. Mirrors what packages/server does, but in memory.
import { bytesToHex, jcs, sha256, utf8, type Ed25519Keypair } from '@quietvote/crypto';
import {
  MerkleTree, buildEntry, bundleToJson, cosignLine, receiptToJson, signCheckpoint, signPromise,
  type EntryType, type LogBundle, type ReceiptJson,
} from '@quietvote/board';
import { logOrigin, type ElectionBundle } from '../../src/index.ts';
import { kp, type Sim } from './sim.ts';

const H = bytesToHex;
export const CREATED_AT = 1_793_000_000;

export interface Cosig {
  name: string;
  key: Ed25519Keypair;
  ts: number;
}
export interface Head {
  size: number;
  cosigs?: Cosig[];
}
export interface BoardView {
  origin: string;
  json: unknown;
  bundle: LogBundle;
  tree: MerkleTree;
  headers: Uint8Array[];
  notes: Map<number, string>;
  logKey: Ed25519Keypair;
  /** Receipt for `seq` whose inclusion proof is against the head of `headSize`. */
  receipt: (seq: number, headSize: number) => ReceiptJson;
}

const MARKER: Record<string, EntryType> = {
  'dkg-open': 'ceremony_start', 'dkg-final': 'joint_key', 'election-open': 'election_open', 'election-close': 'election_close',
};

export function typeAndAuthor(sim: Sim, rec: Record<string, any>, isManifest: boolean): [EntryType, Ed25519Keypair] {
  const coord = sim.coord[0]!;
  if (isManifest) return ['manifest', coord];
  if ('intent' in rec) {
    const v = sim.voters.find((x) => H(x.publicKey) === rec.body.voter)!;
    return [rec.intent === 'cast' ? 'ballot' : 'ballot_audit', v];
  }
  const b = rec.body;
  switch (b.type) {
    case 'marker': return [MARKER[b.name] ?? 'notice', coord];
    case 'roll-commit': return ['roll_commit', coord];
    case 'dkg-commit': case 'dkg-dealing': return ['dkg_round1', sim.trusteeKeys[b.i - 1]!];
    case 'dkg-shares': return ['dkg_round2', sim.trusteeKeys[b.i - 1]!];
    case 'dkg-complaint': return ['dkg_complaint', sim.trusteeKeys[b.accuser - 1]!];
    case 'dkg-keyconf': return ['key_confirm', sim.trusteeKeys[b.j - 1]!];
    case 'tally': return ['tally_result', coord];
    default: throw new Error(`unmapped ${b.type}`);
  }
}

export function witnessKeys(seed: string): Ed25519Keypair[] {
  return [kp(seed, 'w1'), kp(seed, 'w2'), kp(seed, 'w3')];
}

/** Log export for `b` (manifest at seq 0, protocol log entries at their seq). */
export function buildBoard(sim: Sim, b: ElectionBundle, heads: Head[], o: { logKey?: Ed25519Keypair; seed?: string } = {}): BoardView {
  const origin = logOrigin(b.manifest.body);
  const logKey = o.logKey ?? kp(o.seed ?? 'x', 'log');
  const recs: [number, unknown][] = [[0, b.manifest], ...b.log.map((e): [number, unknown] => [e.seq, e.entry])];
  const tree = new MerkleTree();
  const headers: Uint8Array[] = [];
  const entries: LogBundle['entries'] = [];
  for (const [seq, rec] of recs) {
    const [type, who] = typeAndAuthor(sim, rec as Record<string, any>, seq === 0);
    const body = jcs(rec);
    const e = buildEntry({
      origin, type, secretKey: who.secretKey, publicKey: who.publicKey, nonce: sha256(utf8(`nonce-${seq}`)).slice(0, 16),
      createdAt: CREATED_AT, body,
    });
    tree.appendLeaf(e.headerBytes);
    headers.push(e.headerBytes);
    entries.push({ seq, headerBytes: e.headerBytes, body });
  }
  const notes = new Map<number, string>();
  for (const h of heads) {
    let note = signCheckpoint(origin, h.size, tree.root(h.size), logKey.secretKey, logKey.publicKey);
    const text = note.slice(0, note.indexOf('\n\n') + 1);
    for (const c of h.cosigs ?? []) note += cosignLine(c.name, c.key.secretKey, c.key.publicKey, text, c.ts);
    notes.set(h.size, note);
  }
  const bundle: LogBundle = {
    format: 'qv-bundle/v1', origin, createdAt: CREATED_AT, treeSize: tree.size, root: tree.root(), generator: 'protocol-test', spec: 'QV-18',
    entries, checkpoints: [...notes.values()], receipts: [],
    policy: { logPublicKey: logKey.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } },
    redactions: [],
  };
  const receipt = (seq: number, headSize: number): ReceiptJson => {
    const r = signPromise(logKey.secretKey, origin, seq, tree.leafHash(seq)!, CREATED_AT + seq);
    r.inclusion = { treeSize: headSize, path: tree.inclusionProof(seq, headSize), checkpointNote: notes.get(headSize)! };
    return receiptToJson(r);
  };
  return { origin, json: bundleToJson(bundle), bundle, tree, headers, notes, logKey, receipt };
}

export const isoSec = (iso: string): number => Date.parse(iso) / 1000;
