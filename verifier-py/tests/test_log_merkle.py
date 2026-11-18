"""Independent recursive proof generators test the iterative RFC 9162 verifiers.

The oracle uses RFC 9162 §2.1.1/§2.1.3.1/§2.1.4.1 directly; it does not
use the implementation's tree/hash helpers or its bit-walking algorithms.
"""

import hashlib
import unittest
from functools import lru_cache

from qv_verifier.merkle import verify_consistency, verify_inclusion


def digest(data):
    return hashlib.sha256(data).digest()


def split(size):
    return 1 << ((size - 1).bit_length() - 1)


def tree(leaves):
    if not leaves:
        return digest(b"")
    if len(leaves) == 1:
        return digest(b"\x00" + leaves[0])
    k = split(len(leaves))
    return digest(b"\x01" + tree(leaves[:k]) + tree(leaves[k:]))


def inclusion(index, leaves):
    if len(leaves) == 1:
        return []
    k = split(len(leaves))
    if index < k:
        return inclusion(index, leaves[:k]) + [tree(leaves[k:])]
    return inclusion(index - k, leaves[k:]) + [tree(leaves[:k])]


def consistency(old_size, leaves, known=True):
    if old_size == 0:
        return []
    if old_size == len(leaves):
        return [] if known else [tree(leaves)]
    k = split(len(leaves))
    if old_size <= k:
        return consistency(old_size, leaves[:k], known) + [tree(leaves[k:])]
    return consistency(old_size - k, leaves[k:], False) + [tree(leaves[:k])]


@lru_cache(maxsize=None)
def repeated_tree(size):
    """Huge conceptual all-equal-leaf trees need only O(log(size)) hashes."""
    if size == 0:
        return digest(b"")
    if size == 1:
        return digest(b"\x00large-tree-leaf")
    k = split(size)
    return digest(b"\x01" + repeated_tree(k) + repeated_tree(size - k))


def repeated_inclusion(index, size):
    if size == 1:
        return []
    k = split(size)
    if index < k:
        return repeated_inclusion(index, k) + [repeated_tree(size - k)]
    return repeated_inclusion(index - k, size - k) + [repeated_tree(k)]


def repeated_consistency(old_size, size, known=True):
    if old_size == 0:
        return []
    if old_size == size:
        return [] if known else [repeated_tree(size)]
    k = split(size)
    if old_size <= k:
        return repeated_consistency(old_size, k, known) + [repeated_tree(size - k)]
    return repeated_consistency(old_size - k, size - k, False) + [repeated_tree(k)]


class TestLogMerkle(unittest.TestCase):
    def test_all_small_inclusions_and_every_prefix_pair(self):
        leaves = [b"independent leaf " + str(i).encode() for i in range(65)]
        for size in range(1, 66):
            current = leaves[:size]
            root = tree(current)
            for index in range(size):
                path = inclusion(index, current)
                before = path.copy()
                with self.subTest(size=size, index=index):
                    self.assertTrue(verify_inclusion(tree([leaves[index]]), index, size, path, root))
                    self.assertEqual(path, before)
                    self.assertFalse(verify_inclusion(digest(b"wrong leaf"), index, size, path, root))
                    self.assertFalse(verify_inclusion(tree([leaves[index]]), index, size,
                                                      path + [digest(b"extra")], root))
                    if path:
                        self.assertFalse(verify_inclusion(tree([leaves[index]]), index, size, path[:-1], root))
            for old_size in range(size + 1):
                path = consistency(old_size, current)
                before = path.copy()
                with self.subTest(old_size=old_size, size=size):
                    self.assertTrue(verify_consistency(old_size, size, tree(current[:old_size]), root, path))
                    self.assertEqual(path, before)
                    self.assertFalse(verify_consistency(old_size, size, digest(b"wrong root"), root, path))
                    self.assertFalse(verify_consistency(old_size, size, tree(current[:old_size]), root,
                                                        path + [digest(b"extra")]))
                    if path:
                        self.assertFalse(verify_consistency(old_size, size, tree(current[:old_size]), root,
                                                            path[:-1]))

    def test_each_proof_node_and_both_roots_are_authenticated(self):
        leaves = [str(i).encode() for i in range(33)]
        root = tree(leaves)
        for index in range(len(leaves)):
            path = inclusion(index, leaves)
            for node in range(len(path)):
                mutated = path.copy()
                mutated[node] = bytes([path[node][0] ^ 1]) + path[node][1:]
                self.assertFalse(verify_inclusion(tree([leaves[index]]), index, len(leaves), mutated, root))
            self.assertFalse(verify_inclusion(tree([leaves[index]]), index, len(leaves), path, digest(b"bad")))
        for old_size in range(1, len(leaves)):
            path = consistency(old_size, leaves)
            for node in range(len(path)):
                mutated = path.copy()
                mutated[node] = bytes([path[node][0] ^ 1]) + path[node][1:]
                self.assertFalse(verify_consistency(old_size, len(leaves), tree(leaves[:old_size]), root, mutated))
            self.assertFalse(verify_consistency(old_size, len(leaves), tree(leaves[:old_size]), digest(b"bad"), path))

    def test_spec_seven_leaf_examples(self):
        leaves = [b"d" + str(i).encode() for i in range(7)]
        a, b, c, d, e, f, g = [tree([x]) for x in leaves]
        ab = digest(b"\x01" + a + b)
        cd = digest(b"\x01" + c + d)
        ef = digest(b"\x01" + e + f)
        abcd = digest(b"\x01" + ab + cd)
        efg = digest(b"\x01" + ef + g)
        self.assertTrue(verify_inclusion(a, 0, 7, [b, cd, efg], tree(leaves)))
        self.assertTrue(verify_inclusion(d, 3, 7, [c, ab, efg], tree(leaves)))
        self.assertTrue(verify_inclusion(g, 6, 7, [ef, abcd], tree(leaves)))
        self.assertTrue(verify_consistency(3, 7, tree(leaves[:3]), tree(leaves), [c, d, ab, efg]))
        self.assertTrue(verify_consistency(4, 7, abcd, tree(leaves), [efg]))
        self.assertTrue(verify_consistency(6, 7, tree(leaves[:6]), tree(leaves), [ef, g, abcd]))

    def test_boundaries_zero_and_equal(self):
        empty, one = tree([]), tree([b"one"])
        self.assertTrue(verify_consistency(0, 0, empty, empty, []))
        self.assertTrue(verify_consistency(0, 1, empty, one, []))
        self.assertTrue(verify_consistency(1, 1, one, one, []))
        self.assertFalse(verify_consistency(0, 0, empty, one, []))
        self.assertFalse(verify_consistency(0, 1, one, one, []))
        self.assertFalse(verify_consistency(0, 1, empty, one, [one]))
        self.assertFalse(verify_consistency(1, 1, one, empty, []))
        self.assertFalse(verify_consistency(1, 1, one, one, [one]))
        self.assertFalse(verify_consistency(2, 1, one, one, []))
        self.assertTrue(verify_inclusion(one, 0, 1, [], one))
        self.assertFalse(verify_inclusion(one, 0, 0, [], empty))
        self.assertFalse(verify_inclusion(one, 1, 1, [], one))

    def test_sizes_through_1025_and_integer_precision_edges(self):
        # Every target size in QV-18 REQ-002, sampled at left/middle/right.
        # These equal-leaf trees exercise structure without allocating huge trees.
        sizes = [*range(1, 1026), (1 << 32) - 1, 1 << 32, (1 << 32) + 1,
                 (1 << 52) - 1, 1 << 52, (1 << 52) + 1, (1 << 53) - 1]
        for size in sizes:
            for index in {0, size // 2, size - 1}:
                with self.subTest(size=size, index=index):
                    self.assertTrue(verify_inclusion(repeated_tree(1), index, size,
                                                     repeated_inclusion(index, size), repeated_tree(size)))
            for old_size in {0, 1, size // 2, size - 1, size}:
                with self.subTest(old_size=old_size, size=size):
                    self.assertTrue(verify_consistency(old_size, size, repeated_tree(old_size),
                                                       repeated_tree(size), repeated_consistency(old_size, size)))

    def test_malformed_inputs_are_total_and_bounded(self):
        h = digest(b"h")
        bad_numbers = [None, True, False, -1, 1.0, "1", [], {}, 1 << 53, 1 << 10000]
        for value in bad_numbers:
            self.assertFalse(verify_inclusion(h, value, 1, [], h))
            self.assertFalse(verify_inclusion(h, 0, value, [], h))
            self.assertFalse(verify_consistency(value, 1, h, h, []))
            self.assertFalse(verify_consistency(1, value, h, h, []))
        bad_hashes = [None, True, "0" * 32, b"", b"0" * 31, b"0" * 33, bytearray(h), [0] * 32]
        for value in bad_hashes:
            self.assertFalse(verify_inclusion(value, 0, 1, [], h))
            self.assertFalse(verify_inclusion(h, 0, 1, [], value))
            self.assertFalse(verify_consistency(1, 1, value, h, []))
            self.assertFalse(verify_consistency(1, 1, h, value, []))
            self.assertFalse(verify_inclusion(h, 0, 2, [value], h))
            self.assertFalse(verify_consistency(1, 2, h, h, [value]))
        for value in [None, True, {}, (), (h,), h, "", [h] * 65]:
            self.assertFalse(verify_inclusion(h, 0, 1, value, h))
            self.assertFalse(verify_consistency(1, 1, h, h, value))


if __name__ == "__main__":
    unittest.main()
