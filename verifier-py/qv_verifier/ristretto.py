"""ristretto255 (RFC 9496 §4) and QV-16 §5.2 scalar wire format.

Only what the v1 vectors need: decode, encode, equality, group operations via the
underlying edwards25519 representative, and strict scalar decoding.
"""

from __future__ import annotations

from .edwards import (
    BASE,
    D,
    IDENTITY,
    L,
    P,
    SQRT_M1,
    Point,
    ct_abs,
    is_negative,
    sqrt_ratio_m1,
)
from .errors import QVError

# RFC 9496 §4.1 constants, derived here from the curve parameters rather than transcribed.
# INVSQRT_A_MINUS_D = 1/sqrt(a - d) with a = -1, taking the non-negative root.
_ok, INVSQRT_A_MINUS_D = sqrt_ratio_m1(1, (-1 - D) % P)
assert _ok


class RPoint:
    """A ristretto255 group element, represented by an edwards25519 point."""

    __slots__ = ("p",)

    def __init__(self, p: Point):
        self.p = p

    def __add__(self, o: "RPoint") -> "RPoint":
        return RPoint(self.p + o.p)

    def __sub__(self, o: "RPoint") -> "RPoint":
        return RPoint(self.p - o.p)

    def __neg__(self) -> "RPoint":
        return RPoint(-self.p)

    def mul(self, k: int) -> "RPoint":
        return RPoint(self.p.mul(k % L))

    def __eq__(self, o: object) -> bool:  # RFC 9496 §4.3.3
        if not isinstance(o, RPoint):
            return NotImplemented
        a, b = self.p, o.p
        return (a.X * b.Y - a.Y * b.X) % P == 0 or (a.Y * b.Y - a.X * b.X) % P == 0

    def __hash__(self) -> int:
        return hash(self.encode())

    def is_identity(self) -> bool:
        return self == R_IDENTITY

    def encode(self) -> bytes:
        """RFC 9496 §4.3.2 ENCODE."""
        x0, y0, z0, t0 = self.p.X, self.p.Y, self.p.Z, self.p.T
        u1 = ((z0 + y0) * (z0 - y0)) % P
        u2 = (x0 * y0) % P
        _, invsqrt = sqrt_ratio_m1(1, u1 * u2 * u2)
        den1 = (invsqrt * u1) % P
        den2 = (invsqrt * u2) % P
        z_inv = (den1 * den2 * t0) % P
        ix0 = (x0 * SQRT_M1) % P
        iy0 = (y0 * SQRT_M1) % P
        enchanted_denominator = (den1 * INVSQRT_A_MINUS_D) % P
        rotate = is_negative(t0 * z_inv)
        if rotate:
            x, y, den_inv = iy0, ix0, enchanted_denominator
        else:
            x, y, den_inv = x0, y0, den2
        z = z0
        if is_negative(x * z_inv):
            y = (-y) % P
        s = ct_abs(den_inv * (z - y))
        return s.to_bytes(32, "little")

    def hex(self) -> str:
        return self.encode().hex()


R_IDENTITY = RPoint(IDENTITY)
G = RPoint(BASE)


def decode(b: bytes) -> RPoint:
    """RFC 9496 §4.3.1 DECODE. Raises QVError('E_POINT_DECODE') on any failure,
    including wrong length (QV-16 §5.2)."""
    if len(b) != 32:
        raise QVError("E_POINT_DECODE", f"point length {len(b)} != 32")
    s = int.from_bytes(b, "little")
    if s >= P or is_negative(s):
        raise QVError("E_POINT_DECODE", "non-canonical or negative s")
    ss = (s * s) % P
    u1 = (1 - ss) % P
    u2 = (1 + ss) % P
    u2_sqr = (u2 * u2) % P
    v = (-(D * u1 * u1) - u2_sqr) % P
    was_square, invsqrt = sqrt_ratio_m1(1, v * u2_sqr)
    den_x = (invsqrt * u2) % P
    den_y = (invsqrt * den_x * v) % P
    x = ct_abs(2 * s * den_x)
    y = (u1 * den_y) % P
    t = (x * y) % P
    if not was_square or is_negative(t) or y == 0:
        raise QVError("E_POINT_DECODE", "not a valid ristretto255 encoding")
    return RPoint(Point(x, y, 1, t))


def decode_hex(h: str, *, non_identity: bool = False) -> RPoint:
    try:
        b = bytes.fromhex(h)
    except (ValueError, TypeError):
        raise QVError("E_POINT_DECODE", "not hex")
    pt = decode(b)
    if non_identity and pt.is_identity():
        raise QVError("E_IDENTITY", "identity where non-identity is required")
    return pt


def base_mul(k: int) -> RPoint:
    return G.mul(k)


# ---------------------------------------------------------------- scalars (QV-16 §5.2)


def scalar_decode(b: bytes) -> int:
    """32-byte little-endian, strictly < ℓ; never reduced (QV-16-REQ-002)."""
    if len(b) != 32:
        raise QVError("E_LENGTH", f"scalar length {len(b)} != 32")
    v = int.from_bytes(b, "little")
    if v >= L:
        raise QVError("E_SCALAR_RANGE", "scalar >= ℓ")
    return v


def scalar_decode_hex(h: str) -> int:
    try:
        b = bytes.fromhex(h)
    except (ValueError, TypeError):
        raise QVError("E_SCALAR_RANGE", "not hex")
    return scalar_decode(b)


def sc(a: int) -> bytes:
    """sc(a): 32-byte little-endian encoding of a ∈ Z_ℓ."""
    return (a % L).to_bytes(32, "little")
