// RFC 9162 §2.1 Merkle tree over SHA-256 with 0x00 / 0x01 domain separation.
import { sha256 } from '@quietvote/crypto';
import { bytesEqual, concat } from './bytes.ts';

const LEAF = new Uint8Array([0x00]);
const NODE = new Uint8Array([0x01]);

export const HASH_LEN = 32;

/** MTH({}) = SHA-256(""). */
export function emptyRoot(): Uint8Array {
  return sha256(new Uint8Array(0));
}

/** leaf hash = SHA-256(0x00 || LeafBytes) */
export function hashLeaf(leafBytes: Uint8Array): Uint8Array {
  return sha256(concat(LEAF, leafBytes));
}

/** node hash = SHA-256(0x01 || L || R) */
export function hashChildren(l: Uint8Array, r: Uint8Array): Uint8Array {
  return sha256(concat(NODE, l, r));
}

/** Largest power of two strictly less than n (n >= 2). */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function isPow2(n: number): boolean {
  return n >= 1 && Number.isInteger(Math.log2(n));
}

const odd = (n: number): boolean => n % 2 === 1;
const half = (n: number): number => Math.floor(n / 2);

function validSize(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/** Append-only in-memory tree over leaf hashes, memoising complete subtrees. */
export class MerkleTree {
  private readonly leaves: Uint8Array[] = [];
  private readonly memo = new Map<string, Uint8Array>();

  get size(): number {
    return this.leaves.length;
  }

  static fromLeafHashes(hashes: readonly Uint8Array[]): MerkleTree {
    const t = new MerkleTree();
    for (const h of hashes) t.appendLeafHash(h);
    return t;
  }

  appendLeafHash(h: Uint8Array): number {
    if (h.length !== HASH_LEN) throw new Error('leaf hash must be 32 bytes');
    this.leaves.push(h.slice());
    return this.leaves.length - 1;
  }

  appendLeaf(leafBytes: Uint8Array): number {
    return this.appendLeafHash(hashLeaf(leafBytes));
  }

  leafHash(i: number): Uint8Array | undefined {
    return this.leaves[i]?.slice();
  }

  /** MTH over leaves [a, b). */
  private mth(a: number, b: number): Uint8Array {
    const n = b - a;
    if (n === 0) return emptyRoot();
    if (n === 1) return this.leaves[a] as Uint8Array;
    const cacheable = isPow2(n) && a % n === 0;
    const key = `${a}:${n}`;
    if (cacheable) {
      const hit = this.memo.get(key);
      if (hit) return hit;
    }
    const k = split(n);
    const h = hashChildren(this.mth(a, a + k), this.mth(a + k, b));
    if (cacheable) this.memo.set(key, h);
    return h;
  }

  /** Root of the first `size` leaves (default: all). */
  root(size: number = this.leaves.length): Uint8Array {
    if (!validSize(size) || size > this.leaves.length) throw new RangeError('size out of range');
    return this.mth(0, size).slice();
  }

  /** RFC 9162 §2.1.3.1 inclusion path for leaf `index` in the tree of the first `size` leaves. */
  inclusionProof(index: number, size: number = this.leaves.length): Uint8Array[] {
    if (!validSize(size) || size > this.leaves.length || !validSize(index) || index >= size) {
      throw new RangeError('index/size out of range');
    }
    const path = (m: number, a: number, b: number): Uint8Array[] => {
      const n = b - a;
      if (n === 1) return [];
      const k = split(n);
      if (m < k) return [...path(m, a, a + k), this.mth(a + k, b).slice()];
      return [...path(m - k, a + k, b), this.mth(a, a + k).slice()];
    };
    return path(index, 0, size);
  }

  /** RFC 9162 §2.1.4.1 consistency proof between first `first` and first `second` leaves. */
  consistencyProof(first: number, second: number = this.leaves.length): Uint8Array[] {
    if (!validSize(first) || !validSize(second) || second > this.leaves.length || first > second) {
      throw new RangeError('sizes out of range');
    }
    if (first === 0 || first === second) return [];
    const sub = (m: number, a: number, b: number, complete: boolean): Uint8Array[] => {
      const n = b - a;
      if (m === n) return complete ? [] : [this.mth(a, b).slice()];
      const k = split(n);
      if (m <= k) return [...sub(m, a, a + k, complete), this.mth(a + k, b).slice()];
      return [...sub(m - k, a + k, b, false), this.mth(a, a + k).slice()];
    };
    return sub(first, 0, second, true);
  }
}

function allHashes(p: readonly Uint8Array[]): boolean {
  return p.every((h) => h instanceof Uint8Array && h.length === HASH_LEN);
}

/** RFC 9162 §2.1.3.2. Total: returns false on any malformed input. */
export function verifyInclusion(
  leafHash: Uint8Array,
  index: number,
  size: number,
  path: readonly Uint8Array[],
  root: Uint8Array,
): boolean {
  if (!validSize(index) || !validSize(size) || index >= size) return false;
  if (leafHash.length !== HASH_LEN || root.length !== HASH_LEN || !allHashes(path)) return false;
  let fn = index;
  let sn = size - 1;
  let r = leafHash;
  for (const p of path) {
    if (sn === 0) return false;
    if (odd(fn) || fn === sn) {
      r = hashChildren(p, r);
      if (!odd(fn)) {
        while (!odd(fn) && fn !== 0) {
          fn = half(fn);
          sn = half(sn);
        }
      }
    } else {
      r = hashChildren(r, p);
    }
    fn = half(fn);
    sn = half(sn);
  }
  return sn === 0 && bytesEqual(r, root);
}

/**
 * RFC 9162 §2.1.4.2, extended per QV-18 §7.3: from size 0 the proof is empty and the
 * old root must be the empty-tree root; equal sizes require an empty proof and equal roots.
 */
export function verifyConsistency(
  first: number,
  second: number,
  firstRoot: Uint8Array,
  secondRoot: Uint8Array,
  proof: readonly Uint8Array[],
): boolean {
  if (!validSize(first) || !validSize(second) || first > second) return false;
  if (firstRoot.length !== HASH_LEN || secondRoot.length !== HASH_LEN || !allHashes(proof)) return false;
  if (first === 0) return proof.length === 0 && bytesEqual(firstRoot, emptyRoot());
  if (first === second) return proof.length === 0 && bytesEqual(firstRoot, secondRoot);
  const path = isPow2(first) ? [firstRoot, ...proof] : [...proof];
  if (path.length === 0) return false;
  let fn = first - 1;
  let sn = second - 1;
  while (odd(fn)) {
    fn = half(fn);
    sn = half(sn);
  }
  let fr = path[0] as Uint8Array;
  let sr = fr;
  for (const c of path.slice(1)) {
    if (sn === 0) return false;
    if (odd(fn) || fn === sn) {
      fr = hashChildren(c, fr);
      sr = hashChildren(c, sr);
      if (!odd(fn)) {
        while (!odd(fn) && fn !== 0) {
          fn = half(fn);
          sn = half(sn);
        }
      }
    } else {
      sr = hashChildren(sr, c);
    }
    fn = half(fn);
    sn = half(sn);
  }
  return sn === 0 && bytesEqual(fr, firstRoot) && bytesEqual(sr, secondRoot);
}

/** Root of a list of leaf byte strings (convenience for verifiers). */
export function rootOfLeaves(leafBytes: readonly Uint8Array[]): Uint8Array {
  const t = new MerkleTree();
  for (const l of leafBytes) t.appendLeaf(l);
  return t.root();
}
