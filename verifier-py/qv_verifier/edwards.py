"""edwards25519 field and group arithmetic (RFC 8032 §5.1, RFC 9496 §4).

Points are kept in extended twisted-Edwards coordinates (X, Y, Z, T) with x = X/Z, y = Y/Z,
x*y = T/Z, on the curve -x^2 + y^2 = 1 + d*x^2*y^2 over GF(p), p = 2^255 - 19.

Variable-time big-integer arithmetic: adequate for verifying public data only.
"""

from __future__ import annotations

P = 2**255 - 19
# Prime order of the base point subgroup (RFC 8032 §5.1 "L"; RFC 9496 / QV-16 §5.1 "ℓ").
L = 2**252 + 27742317777372353535851937790883648493


def inv(x: int) -> int:
    return pow(x, P - 2, P)


D = (-121665 * inv(121666)) % P
D2 = (2 * D) % P
SQRT_M1 = pow(2, (P - 1) // 4, P)
assert (SQRT_M1 * SQRT_M1) % P == P - 1


def is_negative(x: int) -> bool:
    """RFC 9496 §4.1 IS_NEGATIVE: least significant bit of the canonical encoding."""
    return (x % P) & 1 == 1


def ct_abs(x: int) -> int:
    x %= P
    return (P - x) % P if is_negative(x) else x


def sqrt_ratio_m1(u: int, v: int) -> tuple[bool, int]:
    """RFC 9496 §4.2 SQRT_RATIO_M1(u, v): returns (was_square, non-negative r)."""
    u %= P
    v %= P
    v3 = (v * v * v) % P
    v7 = (v3 * v3 * v) % P
    r = (u * v3 * pow(u * v7, (P - 5) // 8, P)) % P
    check = (v * r * r) % P
    correct_sign = check == u
    flipped_sign = check == (-u) % P
    flipped_sign_i = check == (-u * SQRT_M1) % P
    if flipped_sign or flipped_sign_i:
        r = (r * SQRT_M1) % P
    r = ct_abs(r)
    return (correct_sign or flipped_sign), r


class Point:
    """Extended-coordinate point on edwards25519."""

    __slots__ = ("X", "Y", "Z", "T")

    def __init__(self, X: int, Y: int, Z: int, T: int):
        self.X, self.Y, self.Z, self.T = X % P, Y % P, Z % P, T % P

    # -- group law (RFC 8032 §5.1.4; complete for a = -1, d non-square) --
    def __add__(self, other: "Point") -> "Point":
        A = ((self.Y - self.X) * (other.Y - other.X)) % P
        B = ((self.Y + self.X) * (other.Y + other.X)) % P
        C = (self.T * D2 * other.T) % P
        Dd = (self.Z * 2 * other.Z) % P
        E, F, G, H = B - A, Dd - C, Dd + C, B + A
        return Point(E * F, G * H, F * G, E * H)

    def double(self) -> "Point":
        A = (self.X * self.X) % P
        B = (self.Y * self.Y) % P
        C = (2 * self.Z * self.Z) % P
        H = A + B
        E = H - (self.X + self.Y) ** 2
        G = A - B
        F = C + G
        return Point(E * F, G * H, F * G, E * H)

    def __neg__(self) -> "Point":
        return Point(-self.X, self.Y, self.Z, -self.T)

    def __sub__(self, other: "Point") -> "Point":
        return self + (-other)

    def mul(self, k: int) -> "Point":
        """Scalar multiplication [k]P (double-and-add, variable time)."""
        if k < 0:
            return (-self).mul(-k)
        result = IDENTITY
        addend = self
        while k:
            if k & 1:
                result = result + addend
            addend = addend.double()
            k >>= 1
        return result

    def __rmul__(self, k: int) -> "Point":
        return self.mul(k)

    def affine(self) -> tuple[int, int]:
        zi = inv(self.Z)
        return (self.X * zi) % P, (self.Y * zi) % P

    def edwards_equal(self, other: "Point") -> bool:
        """Equality of the underlying edwards25519 points (NOT ristretto equality)."""
        return (self.X * other.Z - other.X * self.Z) % P == 0 and (
            self.Y * other.Z - other.Y * self.Z
        ) % P == 0


IDENTITY = Point(0, 1, 1, 0)


def _recover_x(y: int, sign: int) -> int | None:
    """RFC 8032 §5.1.3 steps 2-4: x from y and the sign bit; None if impossible."""
    if y >= P:
        return None
    u = (y * y - 1) % P
    v = (D * y * y + 1) % P
    x = (u * pow(v, 3, P) * pow(u * pow(v, 7, P), (P - 5) // 8, P)) % P
    vx2 = (v * x * x) % P
    if vx2 == u:
        pass
    elif vx2 == (-u) % P:
        x = (x * SQRT_M1) % P
    else:
        return None
    if x == 0 and sign == 1:
        return None
    if (x & 1) != sign:
        x = P - x
    return x


_BY = (4 * inv(5)) % P
_BX = _recover_x(_BY, 0)
assert _BX is not None
BASE = Point(_BX, _BY, 1, _BX * _BY)


def ed_decode(b: bytes) -> Point | None:
    """RFC 8032 §5.1.3 point decoding; rejects y >= p (non-canonical) and x=0 with sign 1."""
    if len(b) != 32:
        return None
    n = int.from_bytes(b, "little")
    sign = n >> 255
    y = n & ((1 << 255) - 1)
    x = _recover_x(y, sign)
    if x is None:
        return None
    return Point(x, y, 1, x * y)


def ed_encode(pt: Point) -> bytes:
    x, y = pt.affine()
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def is_small_order(pt: Point) -> bool:
    """True if [8]pt is the identity (pt lies in the torsion subgroup)."""
    return pt.double().double().double().edwards_equal(IDENTITY)
