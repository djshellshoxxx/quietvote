// Sequencer: single-writer append-only log over a BoardStore (QV-18 §4.1, §4.2, §14).
// Pure core: time is injected via `clock`, no randomness, no I/O besides the store.
import { bytesEqual, toHex } from './bytes.ts';
import {
  addCosignatures, parseCheckpoint, signCheckpoint, verifyLogSignature, witnessStatus,
  type WitnessPolicy,
} from './checkpoint.ts';
import {
  checkEntry, decodeHeader, grammarStep, newGrammar,
  type AuthorKeyResolver, type EntryHeader, type GrammarState,
} from './entry.ts';
import { err, ok, type Result } from './errors.ts';
import { MerkleTree, hashLeaf, verifyConsistency } from './merkle.ts';
import { signPromise, type Receipt } from './receipt.ts';
import { nonceKey, type BoardStore, type StoredEntry } from './store.ts';

export interface BoardLogOptions {
  origin: string;
  store: BoardStore;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  /** Unix seconds. */
  clock: () => number;
  /** Authorization + signature key lookup (§5.3 steps 3-4). Required unless allowUnverifiedSignatures. */
  resolveAuthorKey?: AuthorKeyResolver;
  /** Test/mirror escape hatch; default false (fail closed). */
  allowUnverifiedSignatures?: boolean;
  /** Seconds of tolerated created_at skew (default 86400). */
  maxClockSkew?: number;
}

export type LogState = 'ok' | 'quarantine';

function copyGrammar(g: GrammarState): GrammarState {
  return { ...g, seen: new Set(g.seen) };
}

export class BoardLog {
  readonly origin: string;
  private readonly store: BoardStore;
  private readonly tree: MerkleTree;
  private grammar: GrammarState = newGrammar();
  private state: LogState = 'ok';
  private reason = '';
  private readonly o: BoardLogOptions;

  constructor(o: BoardLogOptions) {
    this.o = o;
    this.origin = o.origin;
    this.store = o.store;
    this.tree = MerkleTree.fromLeafHashes(o.store.leafHashes(0, o.store.size()));
    for (let i = 0; i < o.store.size(); i++) {
      const e = o.store.getEntry(i);
      const h = e ? decodeHeader(e.headerBytes) : undefined;
      if (!h?.ok || grammarStep(this.grammar, h.value.type, e?.body ?? null) !== undefined) {
        this.quarantine('stored log fails grammar/parse on load');
        break;
      }
    }
    // Rollback / corruption guard (REQ-012, REQ-053, REQ-054): every stored checkpoint must match the tree.
    for (const cp of o.store.listCheckpoints()) {
      if (cp.size > this.tree.size || !bytesEqual(this.tree.root(cp.size), cp.root)) {
        this.quarantine(`stored checkpoint at size ${cp.size} inconsistent with tree`);
        break;
      }
    }
  }

  get status(): { state: LogState; reason: string } {
    return { state: this.state, reason: this.reason };
  }
  get size(): number {
    return this.tree.size;
  }
  root(size?: number): Uint8Array {
    return this.tree.root(size);
  }

  private quarantine(why: string): void {
    this.state = 'quarantine';
    if (this.reason === '') this.reason = why;
  }

  /** Admission pipeline (§5.3). Idempotent for byte-identical resubmission. */
  append(headerBytes: Uint8Array, body: Uint8Array): Result<{ receipt: Receipt; duplicate: boolean }> {
    if (this.state !== 'ok') return err('QV_BOARD_QUARANTINE', 'log is quarantined');
    if (this.store.isReadOnly()) return err('QV_BOARD_READ_ONLY', 'log is read-only');
    const seq = this.tree.size;
    const resolve = this.o.resolveAuthorKey;
    if (!resolve && this.o.allowUnverifiedSignatures !== true) {
      return err('QV_BOARD_AUTHOR_UNRESOLVED', 'no author key resolver configured');
    }
    const d = decodeHeader(headerBytes);
    if (!d.ok) return d;
    const key = nonceKey(toHex(d.value.author), d.value.type, toHex(d.value.authorNonce));
    const prior = this.store.findByNonce(key);
    if (prior !== undefined) {
      const e = this.store.getEntry(prior);
      if (e && bytesEqual(e.headerBytes, headerBytes)) return ok({ receipt: this.receiptFor(e), duplicate: true });
      return err('QV_BOARD_NONCE_REUSE', 'nonce reused with different entry');
    }
    const c = checkEntry(headerBytes, body, this.origin, resolve, seq);
    if (!c.ok) return c;
    const h: EntryHeader = c.value;
    const now = this.o.clock();
    if (Math.abs(h.createdAt - now) > (this.o.maxClockSkew ?? 86400)) return err('QV_BOARD_CLOCK_SKEW', 'created_at outside tolerated skew');
    const g = copyGrammar(this.grammar);
    const gErr = grammarStep(g, h.type, body);
    if (gErr !== undefined) return err('QV_BOARD_GRAMMAR', gErr);
    const leafHash = hashLeaf(headerBytes);
    const stored: StoredEntry = { seq, headerBytes, body, leafHash, sequencedAt: now, nonceKey: key };
    this.store.appendEntry(stored); // atomic; throws leave tree/grammar untouched
    this.tree.appendLeafHash(leafHash);
    this.grammar = g;
    return ok({ receipt: this.receiptFor(stored), duplicate: false });
  }

  /** Promise receipt (deterministic: Ed25519 signatures are deterministic); inclusion attached when covered by a checkpoint. */
  private receiptFor(e: StoredEntry): Receipt {
    const r = signPromise(this.o.secretKey, this.origin, e.seq, e.leafHash, e.sequencedAt);
    const cp = this.store.latestCheckpoint();
    if (cp && cp.size > e.seq) r.inclusion = { treeSize: cp.size, path: this.tree.inclusionProof(e.seq, cp.size), checkpointNote: cp.note };
    return r;
  }

  getReceipt(seq: number): Result<Receipt> {
    const e = this.store.getEntry(seq);
    return e ? ok(this.receiptFor(e)) : err('QV_BOARD_NOT_FOUND', 'no such entry');
  }

  /** Signs a checkpoint for the current tree. Never signs a smaller size or a conflicting root. */
  checkpoint(): Result<string> {
    if (this.state !== 'ok') return err('QV_BOARD_QUARANTINE', 'log is quarantined');
    if (this.store.isReadOnly()) return err('QV_BOARD_READ_ONLY', 'log is read-only');
    const size = this.tree.size;
    const root = this.tree.root();
    const last = this.store.latestCheckpoint();
    if (last) {
      if (last.size > size) {
        this.quarantine('tree smaller than last signed checkpoint');
        return err('QV_BOARD_ROLLBACK', 'tree smaller than last signed checkpoint');
      }
      if (last.size === size) return bytesEqual(last.root, root) ? ok(last.note) : err('QV_BOARD_FORK', 'root differs from signed checkpoint');
    }
    const note = signCheckpoint(this.origin, size, root, this.o.secretKey, this.o.publicKey);
    this.store.putCheckpoint({ size, root, note });
    return ok(note);
  }

  /**
   * Attach cosignature lines (e.g. from a witness) to the stored checkpoint of `size`.
   * Only lines that verify against `policy` are kept.
   */
  attachCosignatures(size: number, lines: readonly string[], policy: WitnessPolicy): Result<{ witnessed: boolean; note: string }> {
    const stored = this.store.getCheckpoint(size);
    if (!stored) return err('QV_BOARD_NOT_FOUND', 'no checkpoint of that size');
    const cur = parseCheckpoint(stored.note);
    if (!cur.ok) return cur;
    const good: string[] = [];
    for (const line of lines) {
      const cand = parseCheckpoint(stored.note + (line.endsWith('\n') ? line : line + '\n'));
      if (!cand.ok) continue;
      const before = witnessStatus(cur.value, policy).valid;
      const after = witnessStatus(cand.value, policy);
      const name = cand.value.lines.at(-1)?.name ?? '';
      if (after.valid.has(name) && !before.has(name)) good.push(line.endsWith('\n') ? line : line + '\n');
    }
    const note = addCosignatures(stored.note, good);
    this.store.putCheckpoint({ size, root: stored.root, note });
    const p = parseCheckpoint(note);
    return p.ok ? ok({ witnessed: witnessStatus(p.value, policy).witnessed, note }) : p;
  }

  inclusionProof(seq: number, size: number = this.tree.size): Result<Uint8Array[]> {
    if (!Number.isSafeInteger(seq) || !Number.isSafeInteger(size) || seq < 0 || seq >= size || size > this.tree.size) {
      return err('QV_BOARD_NOT_FOUND', 'index/size out of range');
    }
    return ok(this.tree.inclusionProof(seq, size));
  }

  inclusionProofByLeaf(leafHash: Uint8Array, size: number = this.tree.size): Result<{ seq: number; path: Uint8Array[] }> {
    for (let i = 0; i < Math.min(size, this.tree.size); i++) {
      const lh = this.tree.leafHash(i);
      if (lh && bytesEqual(lh, leafHash)) return ok({ seq: i, path: this.tree.inclusionProof(i, size) });
    }
    return err('QV_BOARD_NOT_FOUND', 'leaf not in log');
  }

  consistencyProof(first: number, second: number = this.tree.size): Result<Uint8Array[]> {
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 0 || first > second || second > this.tree.size) {
      return err('QV_BOARD_NOT_FOUND', 'sizes out of range');
    }
    return ok(this.tree.consistencyProof(first, second));
  }

  /**
   * Rollback guard (REQ-053): feed a checkpoint reported by a witness/mirror. A validly log-signed
   * checkpoint that is larger than, or inconsistent with, the local tree puts the log in QUARANTINE.
   */
  observeExternalCheckpoint(note: string): Result<'consistent' | 'quarantined'> {
    const cp = parseCheckpoint(note);
    if (!cp.ok) return cp;
    if (cp.value.origin !== this.origin || !verifyLogSignature(cp.value, this.o.publicKey)) return err('QV_BOARD_BAD_CHECKPOINT', 'not signed by this log');
    if (cp.value.size > this.tree.size || !bytesEqual(this.tree.root(cp.value.size), cp.value.root)) {
      this.quarantine(`external checkpoint at size ${cp.value.size} is ahead of or inconsistent with local tree`);
      return ok('quarantined');
    }
    return ok('consistent');
  }

  /** Full root recomputation from stored leaf hashes (REQ-054). Quarantines on mismatch. */
  selfAudit(): boolean {
    const t = MerkleTree.fromLeafHashes(this.store.leafHashes(0, this.store.size()));
    const okRoot = t.size === this.tree.size && bytesEqual(t.root(), this.tree.root());
    const okCps = this.store.listCheckpoints().every((c) => c.size <= t.size && bytesEqual(c.root, t.root(c.size)));
    if (!okRoot || !okCps) this.quarantine('self-audit mismatch');
    return okRoot && okCps;
  }

  /** Redact a body (leaf unchanged). Caller (server) enforces retention policy. */
  redact(seq: number): Result<true> {
    if (!this.store.getEntry(seq)) return err('QV_BOARD_NOT_FOUND', 'no such entry');
    this.store.redactBody(seq);
    return ok(true);
  }
}

/** Client-side pin advance (REQ-026): old pinned note -> new note with server-provided proof. */
export function verifyPinAdvance(
  pinnedNote: string,
  newNote: string,
  proof: readonly Uint8Array[],
  logPublicKey: Uint8Array,
): Result<'unchanged' | 'advanced'> {
  const a = parseCheckpoint(pinnedNote);
  const b = parseCheckpoint(newNote);
  if (!a.ok || !b.ok) return err('QV_BOARD_BAD_CHECKPOINT', 'unparseable checkpoint');
  if (a.value.origin !== b.value.origin) return err('QV_BOARD_ORIGIN_MISMATCH', 'origin changed');
  if (!verifyLogSignature(b.value, logPublicKey)) return err('QV_BOARD_BAD_CHECKPOINT', 'new checkpoint not signed by log');
  if (b.value.size < a.value.size) return err('QV_BOARD_ROLLBACK', 'ROLLBACK_DETECTED: log shrank');
  if (!verifyConsistency(a.value.size, b.value.size, a.value.root, b.value.root, proof)) {
    return err('QV_BOARD_FORK', 'EQUIVOCATION_SUSPECTED: consistency proof failed');
  }
  return ok(a.value.size === b.value.size ? 'unchanged' : 'advanced');
}

