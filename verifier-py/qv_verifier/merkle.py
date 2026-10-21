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
