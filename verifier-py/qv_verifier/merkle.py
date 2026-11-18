"""RFC 9162 §2.1.1 Merkle Tree Hash and the QV-16 §5.6.2 voter-roll leaves."""

from __future__ import annotations

import hashlib

from . import ed25519
from .errors import QVError
from .framed_hash import u32


def leaf_hash(data: bytes) -> bytes:
    return hashlib.sha256(b"\x00" + data).digest()


def node_hash(left: bytes, right: bytes) -> bytes:
    return hashlib.sha256(b"\x01" + left + right).digest()


def _largest_pow2_lt(n: int) -> int:
    k = 1
    while k * 2 < n:
        k *= 2
    return k


def mth_from_leaf_hashes(hashes: list[bytes]) -> bytes:
    n = len(hashes)
    if n == 0:
        return hashlib.sha256(b"").digest()
    if n == 1:
        return hashes[0]
    k = _largest_pow2_lt(n)
    return node_hash(mth_from_leaf_hashes(hashes[:k]), mth_from_leaf_hashes(hashes[k:]))


def mth(leaves: list[bytes]) -> bytes:
    return mth_from_leaf_hashes([leaf_hash(d) for d in leaves])


_MAX_TREE_SIZE = (1 << 53) - 1
_MAX_PROOF_NODES = 64


def _tree_integer(value: object) -> bool:
    # Keep the JSON transport's exact-integer range; bool is not an index/size.
    return type(value) is int and 0 <= value <= _MAX_TREE_SIZE


def _hash(value: object) -> bool:
    return type(value) is bytes and len(value) == 32


def _proof(path: object) -> bool:
    return (type(path) is list and len(path) <= _MAX_PROOF_NODES
            and all(_hash(h) for h in path))


def verify_inclusion(leaf: bytes, index: int, size: int, path: list[bytes], root: bytes) -> bool:
    """Check a SHA-256 leaf hash against an authenticated (size, root) pair.

    RFC 9162 §2.1.3.2; ``leaf`` is already ``H(0x00 || LeafBytes)``.
    Malformed inputs, truncated paths and unused proof nodes fail closed. The
    caller must authenticate *both* size and root: the proof establishes a tree
    path, not a checkpoint signature or the semantics of its leaf.
    """
    if not (_hash(leaf) and _hash(root) and _tree_integer(index)
            and _tree_integer(size) and index < size and _proof(path)):
        return False
    position, last = index, size - 1
    accumulated = leaf
    for sibling in path:
        if last == 0:
            return False
        if position & 1 or position == last:
            accumulated = node_hash(sibling, accumulated)
            while position != 0 and not position & 1:
                position >>= 1
                last >>= 1
        else:
            accumulated = node_hash(accumulated, sibling)
        position >>= 1
        last >>= 1
    return last == 0 and accumulated == root


def verify_consistency(old_size: int, new_size: int, old_root: bytes,
                       new_root: bytes, path: list[bytes]) -> bool:
    """Check append-only consistency of authenticated checkpoint roots.

    RFC 9162 §2.1.4.2 with the QV-18 §7.3 boundary rules: an empty old
    tree needs its empty-tree root and an empty proof; equal-size trees need
    equal roots and an empty proof. No supplied input is mutated.
    """
    if not (_tree_integer(old_size) and _tree_integer(new_size)
            and old_size <= new_size and _hash(old_root)
            and _hash(new_root) and _proof(path)):
        return False
    if old_size == 0:
        empty = hashlib.sha256(b"").digest()
        return not path and old_root == empty and (new_size != 0 or new_root == empty)
    if old_size == new_size:
        return not path and old_root == new_root
    if not path:
        return False

    old_position, new_position = old_size - 1, new_size - 1
    while old_position & 1:
        old_position >>= 1
        new_position >>= 1
    # The power-of-two old tree is an already authenticated complete subtree.
    if old_size & (old_size - 1) == 0:
        old_accumulated = new_accumulated = old_root
        siblings = path
    else:
        old_accumulated = new_accumulated = path[0]
        siblings = path[1:]
    for sibling in siblings:
        if new_position == 0:
            return False
        if old_position & 1 or old_position == new_position:
            old_accumulated = node_hash(sibling, old_accumulated)
            new_accumulated = node_hash(sibling, new_accumulated)
            while old_position != 0 and not old_position & 1:
                old_position >>= 1
                new_position >>= 1
        else:
            new_accumulated = node_hash(new_accumulated, sibling)
        old_position >>= 1
        new_position >>= 1
    return (new_position == 0 and old_accumulated == old_root
            and new_accumulated == new_root)


def roll_leaf_data(voter_pk: bytes, weight: int = 1) -> bytes:
    return voter_pk + u32(weight)


def roll_root(voter_pks: list[bytes]) -> tuple[bytes, list[bytes]]:
    """Validate a Phase-1 roll (QV-16 §5.6.2) and return (root, leaf_hashes).

    Rejects (E_ROLL): wrong key length, invalid / non-canonical / small-order Ed25519 key
    (QV-16 §5.14.4 check 3, QV-ADR-P16-9), duplicates, and input not sorted ascending.
    """
    prev = None
    for pk in voter_pks:
        if len(pk) != 32 or not ed25519.valid_public_key(pk):
            raise QVError("E_ROLL", "invalid voter key")
        if prev is not None:
            if pk == prev:
                raise QVError("E_ROLL", "duplicate voter key")
            if pk < prev:
                raise QVError("E_ROLL", "roll not sorted ascending by voter_pk")
        prev = pk
    hashes = [leaf_hash(roll_leaf_data(pk)) for pk in voter_pks]
    return mth_from_leaf_hashes(hashes), hashes
