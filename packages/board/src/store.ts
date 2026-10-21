// BoardStore: persistence boundary (D3). Synchronous so SQLite (node:sqlite) can implement it
// with a single transaction per call. Implementations MUST make appendEntry atomic.

export interface StoredEntry {
  seq: number;
  headerBytes: Uint8Array;
  /** null once redacted (leaf hash unaffected). */
  body: Uint8Array | null;
  leafHash: Uint8Array;
  sequencedAt: number;
  /** Idempotency key, see nonceKey(). Unique across the store. */
  nonceKey: string;
}

export interface StoredCheckpoint {
  size: number;
  root: Uint8Array;
  /** Full signed note including all cosignature lines. */
  note: string;
}

export interface BoardStore {
  /** Number of entries. */
  size(): number;
  /** Must throw unless entry.seq === size() (gapless). Atomic. */
  appendEntry(entry: StoredEntry): void;
  getEntry(seq: number): StoredEntry | undefined;
  /** Leaf hashes for [start, end), in order. */
  leafHashes(start: number, end: number): Uint8Array[];
  /** seq of the entry with this idempotency key `hex(author)|type|hex(nonce)`. */
  findByNonce(key: string): number | undefined;
  /** Stores (or replaces the note of, e.g. to attach cosignatures) the checkpoint of a given size. Roots for an existing size must not change. */
  putCheckpoint(cp: StoredCheckpoint): void;
  getCheckpoint(size: number): StoredCheckpoint | undefined;
  latestCheckpoint(): StoredCheckpoint | undefined;
  /** All checkpoints ascending by size. */
  listCheckpoints(): StoredCheckpoint[];
  /** Sets body to null; leaf hash untouched. */
  redactBody(seq: number): void;
  isReadOnly(): boolean;
  setReadOnly(v: boolean): void;
}

export function nonceKey(authorHex: string, type: string, nonceHex: string): string {
  return `${authorHex}|${type}|${nonceHex}`;
}

export class MemoryBoardStore implements BoardStore {
  private readonly entries: StoredEntry[] = [];
  private readonly nonces = new Map<string, number>();
  private readonly cps = new Map<number, StoredCheckpoint>();
  private readOnly = false;
  size(): number {
    return this.entries.length;
  }
  appendEntry(e: StoredEntry): void {
    if (this.readOnly) throw new Error('store is read-only');
    if (e.seq !== this.entries.length) throw new Error('non-gapless append');
    const key = e.nonceKey;
    if (this.nonces.has(key)) throw new Error('duplicate nonce key');
    this.entries.push({ ...e });
    this.nonces.set(key, e.seq);
  }
  getEntry(seq: number): StoredEntry | undefined {
    const e = this.entries[seq];
    return e ? { ...e } : undefined;
  }
  leafHashes(start: number, end: number): Uint8Array[] {
    return this.entries.slice(start, end).map((e) => e.leafHash.slice());
  }
  findByNonce(key: string): number | undefined {
    return this.nonces.get(key);
  }
  putCheckpoint(cp: StoredCheckpoint): void {
    const old = this.cps.get(cp.size);
    if (old && old.root.some((b, i) => b !== cp.root[i])) throw new Error('conflicting checkpoint root');
    this.cps.set(cp.size, { ...cp });
  }
  getCheckpoint(size: number): StoredCheckpoint | undefined {
    return this.cps.get(size);
  }
  latestCheckpoint(): StoredCheckpoint | undefined {
    return this.listCheckpoints().at(-1);
  }
  listCheckpoints(): StoredCheckpoint[] {
    return [...this.cps.values()].sort((a, b) => a.size - b.size);
  }
  redactBody(seq: number): void {
    const e = this.entries[seq];
    if (e) e.body = null;
  }
  isReadOnly(): boolean {
    return this.readOnly;
  }
  setReadOnly(v: boolean): void {
    this.readOnly = v;
  }
}
