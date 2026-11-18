import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '@quietvote/crypto';
import {
  MerkleTree, emptyRoot, hashChildren, hashLeaf, toHex, fromHex, utf8, verifyConsistency, verifyInclusion,
} from '../src/index.ts';
import { rng } from './helpers.ts';

// RFC 6962 / Certificate Transparency reference leaves and roots.
const CT_LEAVES = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'].map(fromHex);
const CT_ROOTS = [
  '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
];

// Independent, deliberately naive RFC 9162 §2.1.1-2.1.4 implementation (recursive on arrays).
function naiveMth(d: Uint8Array[]): Uint8Array {
  if (d.length === 0) return sha256(new Uint8Array(0));
  if (d.length === 1) return sha256(new Uint8Array([0, ...(d[0] as Uint8Array)]));
  let k = 1;
  while (k * 2 < d.length) k *= 2;
  return sha256(new Uint8Array([1, ...naiveMth(d.slice(0, k)), ...naiveMth(d.slice(k))]));
}
function naivePath(m: number, d: Uint8Array[]): Uint8Array[] {
  if (d.length === 1) return [];
  let k = 1;
  while (k * 2 < d.length) k *= 2;
  return m < k ? [...naivePath(m, d.slice(0, k)), naiveMth(d.slice(k))] : [...naivePath(m - k, d.slice(k)), naiveMth(d.slice(0, k))];
}
function naiveSub(m: number, d: Uint8Array[], b: boolean): Uint8Array[] {
  if (m === d.length) return b ? [] : [naiveMth(d)];
  let k = 1;
  while (k * 2 < d.length) k *= 2;
  return m <= k ? [...naiveSub(m, d.slice(0, k), b), naiveMth(d.slice(k))] : [...naiveSub(m - k, d.slice(k), false), naiveMth(d.slice(0, k))];
}

function treeOf(n: number): { t: MerkleTree; leaves: Uint8Array[] } {
  const leaves = Array.from({ length: n }, (_, i) => utf8(`leaf-${i}`));
  const t = new MerkleTree();
  for (const l of leaves) t.appendLeaf(l);
  return { t, leaves };
}

test('empty root is SHA-256 of empty string', () => {
  assert.equal(toHex(emptyRoot()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(toHex(new MerkleTree().root()), toHex(emptyRoot()));
});

test('leaf/node domain separation', () => {
  const a = utf8('x');
  assert.notEqual(toHex(hashLeaf(a)), toHex(sha256(a)));
  const l = hashLeaf(a);
  assert.notEqual(toHex(hashChildren(l, l)), toHex(hashLeaf(new Uint8Array([...l, ...l]))));
});

test('RFC 6962 / CT reference roots n=1..8', () => {
  const t = new MerkleTree();
  CT_LEAVES.forEach((l, i) => {
    t.appendLeaf(l);
    assert.equal(toHex(t.root()), CT_ROOTS[i], `root n=${i + 1}`);
  });
  // Historic roots are stable after growth.
  assert.equal(toHex(t.root(3)), CT_ROOTS[2]);
});

test('roots, inclusion and consistency proofs match independent implementation, sizes 1..200', () => {
  const { t, leaves } = treeOf(200);
  for (let n = 1; n <= 200; n++) {
    const prefix = leaves.slice(0, n);
    assert.equal(toHex(t.root(n)), toHex(naiveMth(prefix)), `root ${n}`);
    for (const i of n <= 40 ? Array.from({ length: n }, (_, k) => k) : [0, 1, n >> 1, n - 2, n - 1].filter((x) => x >= 0 && x < n)) {
      const p = t.inclusionProof(i, n);
      assert.deepEqual(p.map(toHex), naivePath(i, prefix).map(toHex), `incl path ${i}/${n}`);
      assert.ok(verifyInclusion(hashLeaf(leaves[i] as Uint8Array), i, n, p, t.root(n)));
    }
  }
});

test('consistency proofs for all (m,n) pairs up to 200 verify and equal naive', () => {
  const { t, leaves } = treeOf(200);
  for (let n = 1; n <= 200; n++) {
    for (let m = 1; m <= n; m++) {
      const p = t.consistencyProof(m, n);
      if (n <= 40) assert.deepEqual(p.map(toHex), naiveSub(m, leaves.slice(0, n), true).map(toHex), `cons ${m}->${n}`);
      assert.ok(verifyConsistency(m, n, t.root(m), t.root(n), p), `verify ${m}->${n}`);
    }
  }
});

test('randomized: any single-bit corruption of a proof is rejected', () => {
  const r = rng(7);
  const { t, leaves } = treeOf(130);
  for (let iter = 0; iter < 300; iter++) {
    const n = 2 + Math.floor(r() * 128);
    const i = Math.floor(r() * n);
    const p = t.inclusionProof(i, n);
    if (p.length === 0) continue;
    const bad = p.map((h) => h.slice());
    const which = Math.floor(r() * bad.length);
    (bad[which] as Uint8Array)[Math.floor(r() * 32)]! ^= 1 << Math.floor(r() * 8);
    assert.equal(verifyInclusion(hashLeaf(leaves[i] as Uint8Array), i, n, bad, t.root(n)), false);
    const m = 1 + Math.floor(r() * (n - 1));
    const c = t.consistencyProof(m, n).map((h) => h.slice());
    if (c.length > 0) {
      (c[Math.floor(r() * c.length)] as Uint8Array)[Math.floor(r() * 32)]! ^= 1;
      assert.equal(verifyConsistency(m, n, t.root(m), t.root(n), c), false);
    }
  }
});

test('malformed inclusion proofs are rejected', () => {
  const { t, leaves } = treeOf(13);
  const lh = hashLeaf(leaves[5] as Uint8Array);
  const root = t.root();
  const p = t.inclusionProof(5);
  assert.ok(verifyInclusion(lh, 5, 13, p, root));
  assert.equal(verifyInclusion(lh, 5, 13, p.slice(1), root), false, 'truncated');
  assert.equal(verifyInclusion(lh, 5, 13, p.slice(0, -1), root), false, 'truncated tail');
  assert.equal(verifyInclusion(lh, 5, 13, [...p, p[0] as Uint8Array], root), false, 'extended');
  assert.equal(verifyInclusion(lh, 5, 13, [...p].reverse(), root), false, 'reordered');
  assert.equal(verifyInclusion(lh, 4, 13, p, root), false, 'wrong index');
  assert.equal(verifyInclusion(lh, 5, 8, p, root), false, 'wrong size');
  assert.equal(verifyInclusion(lh, 13, 13, p, root), false, 'index == size');
  assert.equal(verifyInclusion(lh, -1, 13, p, root), false, 'negative');
  assert.equal(verifyInclusion(lh, 1.5, 13, p, root), false, 'fractional');
  assert.equal(verifyInclusion(lh, 5, Number.NaN, p, root), false, 'NaN');
  assert.equal(verifyInclusion(lh, 5, 13, [new Uint8Array(31), ...p.slice(1)], root), false, 'short hash');
  assert.equal(verifyInclusion(lh.slice(0, 31), 5, 13, p, root), false, 'short leaf');
  assert.equal(verifyInclusion(lh, 0, 1, [], hashLeaf(leaves[5] as Uint8Array)), true, 'single-leaf tree');
  assert.equal(verifyInclusion(lh, 0, 1, [p[0] as Uint8Array], lh), false, 'single-leaf with junk path');
  // second-preimage style: an interior node presented as a leaf must not verify at a leaf position.
  const interior = hashChildren(t.leafHash(0) as Uint8Array, t.leafHash(1) as Uint8Array);
  assert.equal(verifyInclusion(interior, 0, 13, t.inclusionProof(0).slice(1), root), false);
});

test('malformed consistency proofs are rejected', () => {
  const { t } = treeOf(20);
  const p = t.consistencyProof(6, 20);
  const r6 = t.root(6), r20 = t.root(20);
  assert.ok(verifyConsistency(6, 20, r6, r20, p));
  assert.equal(verifyConsistency(6, 20, r6, r20, p.slice(1)), false);
  assert.equal(verifyConsistency(6, 20, r6, r20, p.slice(0, -1)), false);
  assert.equal(verifyConsistency(6, 20, r6, r20, [...p, p[0] as Uint8Array]), false);
  assert.equal(verifyConsistency(6, 20, r20, r6, p), false, 'swapped roots');
  assert.equal(verifyConsistency(7, 20, r6, r20, p), false, 'wrong first size');
  assert.equal(verifyConsistency(6, 12, r6, r20, p), false, 'wrong second size');
  assert.equal(verifyConsistency(20, 6, r20, r6, p), false, 'first > second');
  assert.equal(verifyConsistency(6, 20, r6, r20, []), false, 'empty proof');
  assert.equal(verifyConsistency(0, 20, emptyRoot(), r20, []), true, 'from empty: empty proof');
  assert.equal(verifyConsistency(0, 20, emptyRoot(), r20, p), false, 'from empty: non-empty proof');
  assert.equal(verifyConsistency(0, 20, r6, r20, []), false, 'from empty: wrong old root');
  assert.equal(verifyConsistency(20, 20, r20, r20, []), true);
  assert.equal(verifyConsistency(20, 20, r20, r20, p), false, 'equal sizes with proof');
  assert.equal(verifyConsistency(20, 20, r20, r6, []), false, 'equal sizes different roots');
  assert.equal(verifyConsistency(4, 8, treeOf(4).t.root(), treeOf(8).t.root(), treeOf(8).t.consistencyProof(4, 8)), true, 'power-of-two first');
  assert.equal(verifyConsistency(-1, 20, r6, r20, p), false);
  assert.equal(verifyConsistency(6, Number.POSITIVE_INFINITY, r6, r20, p), false);
});

test('a different history of the same size is not consistent', () => {
  const a = treeOf(10).t;
  const b = new MerkleTree();
  for (let i = 0; i < 10; i++) b.appendLeaf(utf8(i === 3 ? 'evil' : `leaf-${i}`));
  for (let i = 10; i < 20; i++) { a.appendLeaf(utf8(`leaf-${i}`)); b.appendLeaf(utf8(`leaf-${i}`)); }
  // Proof produced by b's tree cannot link a's old root to b's new root.
  assert.equal(verifyConsistency(10, 20, a.root(10), b.root(20), b.consistencyProof(10, 20)), false);
  assert.equal(verifyConsistency(10, 20, b.root(10), b.root(20), a.consistencyProof(10, 20)), false);
});

test('generator input validation', () => {
  const { t } = treeOf(5);
  assert.throws(() => t.inclusionProof(5, 5));
  assert.throws(() => t.consistencyProof(6, 5));
  assert.throws(() => t.root(6));
  assert.throws(() => t.appendLeafHash(new Uint8Array(31)));
});
