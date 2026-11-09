"""Ed25519 (RFC 8032 §5.1) with the strict verification policy of QV-16 §5.12.2 / QV-ADR-P16-9.

Strict policy implemented (QV-16 §5.12.2, QV-34 Q-34-1 proposed default):
  * signature exactly 64 bytes, public key exactly 32 bytes;
  * S must be < ℓ (no malleated S + ℓ);
  * A and R must be canonical encodings (y < p; x = 0 with sign bit set is rejected);
  * A and R must not be of small order;
  * cofactorless equation [S]B == R + [k]A.
"""

from __future__ import annotations

import hashlib

from .edwards import BASE, IDENTITY, L, ed_decode, ed_encode, is_small_order


def _sha512(*parts: bytes) -> bytes:
    h = hashlib.sha512()
    for p in parts:
        h.update(p)
    return h.digest()


def _expand_secret(secret: bytes) -> tuple[int, bytes]:
    if len(secret) != 32:
        raise ValueError("Ed25519 secret must be 32 bytes")
    h = _sha512(secret)
    a = bytearray(h[:32])
    a[0] &= 248
    a[31] &= 127
    a[31] |= 64
    return int.from_bytes(a, "little"), h[32:]


def public_key(secret: bytes) -> bytes:
    a, _ = _expand_secret(secret)
    return ed_encode(BASE.mul(a))


def sign(secret: bytes, msg: bytes) -> bytes:
    """RFC 8032 §5.1.6 (pure Ed25519, no context, no prehash)."""
    a, prefix = _expand_secret(secret)
    A = ed_encode(BASE.mul(a))
    r = int.from_bytes(_sha512(prefix, msg), "little") % L
    R = ed_encode(BASE.mul(r))
    k = int.from_bytes(_sha512(R, A, msg), "little") % L
    S = (r + k * a) % L
    return R + S.to_bytes(32, "little")


def valid_public_key(pk: bytes) -> bool:
    """Canonical, nonzero prime-order subgroup point (QV-ADR-018 / CP-04)."""
    if len(pk) != 32:
        return False
    A = ed_decode(pk)
    return A is not None and not is_small_order(A) and A.mul(L).edwards_equal(IDENTITY)


def verify(pk: bytes, msg: bytes, sig: bytes) -> bool:
    """Strict verification; returns False rather than raising."""
    if len(pk) != 32 or len(sig) != 64:
        return False
    A = ed_decode(pk)
    if A is None or is_small_order(A) or not A.mul(L).edwards_equal(IDENTITY):
        return False
    Rb = sig[:32]
    R = ed_decode(Rb)
    if R is None or is_small_order(R) or not R.mul(L).edwards_equal(IDENTITY):
        return False
    S = int.from_bytes(sig[32:], "little")
    if S >= L:
        return False
    k = int.from_bytes(_sha512(Rb, pk, msg), "little") % L
    return BASE.mul(S).edwards_equal(R + A.mul(k))
