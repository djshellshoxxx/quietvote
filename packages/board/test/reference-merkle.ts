// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent RFC 9162 oracle for bounded tests: native SHA-256, immutable input ranges,
// no production Merkle/hash helper. Memoize every range to avoid repeating naive O(n) hashing for each proof.
import { createHash } from 'node:crypto';

function digest(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
}
export const referenceLeafHash = (leaf: Uint8Array): Uint8Array => digest(Uint8Array.of(0), leaf);
// All callers in this fixture use exact integer sizes <= 1025.
const partition = (length: number): number => 2 ** Math.floor(Math.log2(length - 1));

export class ReferenceMerkle {
  private readonly leaves: Uint8Array[];
  private readonly hashes = new Map<string, Uint8Array>();
  constructor(leaves: readonly Uint8Array[]) {
    this.leaves = leaves.map((leaf) => leaf.slice());
  }
  private range(start: number, length: number): Uint8Array {
    const key = `${start}:${length}`;
    let result = this.hashes.get(key);
    if (result === undefined) {
      if (length === 0) result = digest();
      else if (length === 1) result = referenceLeafHash(this.leaves[start]!);
      else {
        const left = partition(length);
        result = digest(Uint8Array.of(1), this.range(start, left), this.range(start + left, length - left));
      }
      this.hashes.set(key, result);
    }
    return result;
  }
  root(size: number = this.leaves.length): Uint8Array {
    return this.range(0, size).slice();
  }
  inclusion(index: number, size: number): Uint8Array[] {
    const path: Uint8Array[] = [];
    const visit = (start: number, length: number, localIndex: number): void => {
      if (length === 1) return;
      const left = partition(length);
      if (localIndex < left) {
        visit(start, left, localIndex);
        path.push(this.range(start + left, length - left));
      } else {
        visit(start + left, length - left, localIndex - left);
        path.push(this.range(start, left));
      }
    };
    visit(0, size, index);
    return path.map((node) => node.slice());
  }
  consistency(first: number, second: number): Uint8Array[] {
    if (first === 0 || first === second) return [];
    const path: Uint8Array[] = [];
    const visit = (start: number, length: number, prefix: number, complete: boolean): void => {
      if (prefix === length) {
        if (!complete) path.push(this.range(start, length));
        return;
      }
      const left = partition(length);
      if (prefix <= left) {
        visit(start, left, prefix, complete);
        path.push(this.range(start + left, length - left));
      } else {
        visit(start + left, length - left, prefix - left, false);
        path.push(this.range(start, left));
      }
    };
    visit(0, second, first, true);
    return path.map((node) => node.slice());
  }
}
