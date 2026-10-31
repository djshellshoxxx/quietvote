"""Sigma-protocol verifiers (QV-16 §5.7.2, §5.7.5, §5.10.1, §5.10.2, §5.16).

All verifiers recompute the prover commitments from (c, s) and re-derive the challenge with
the framed hash over the complete statement (strong Fiat-Shamir).
Each raises QVError with the code the v1 vectors assign to that proof type.
"""

from __future__ import annotations

from .edwards import L
from .errors import QVError
from .framed_hash import hs, u8, u16, u32
from .ristretto import G, RPoint, decode_hex, scalar_decode_hex

POK_ENC_KEY_INDEX = 0xFFFF


def _scalars(proof: dict, keys: tuple[str, ...], code: str | None = None) -> list[int]:
    out = []
    for k in keys:
        v = proof.get(k)
        if not isinstance(v, str):
            raise QVError(code or "E_SCHEMA", f"proof field {k} missing")
        try:
            out.append(scalar_decode_hex(v))
        except QVError as e:
            raise QVError(code or e.code, e.detail)
    return out


# --------------------------------------------------------------- §5.7.2 Schnorr PoK


def pok_check(mh: bytes, i: int, k: int, A: RPoint, c: int, s: int) -> bool:
    if A.is_identity():
        return False
    R = G.mul(s) - A.mul(c)
    return c == hs("pok", mh, u8(i), u16(k), A.encode(), R.encode())


def pok_verify(mh: bytes, i: int, k: int, A_hex: str, proof: dict) -> None:
    """Raises E_DKG_R1 on any failure (round-1 disqualification reason)."""
    try:
        A = decode_hex(A_hex, non_identity=True)
        c, s = _scalars(proof, ("c", "s"))
    except QVError as e:
        raise QVError("E_DKG_R1", e.detail or e.code)
    if not pok_check(mh, i, k, A, c, s):
        raise QVError("E_DKG_R1", "PoK challenge mismatch")


def pok_share_check(ctx: bytes, j: int, Y: RPoint, c: int, s: int) -> bool:
    """§5.7.8 key-confirmation PoK of s_j w.r.t. Y_j."""
    R = G.mul(s) - Y.mul(c)
    return c == hs("pok-share", ctx, u8(j), Y.encode(), R.encode())


# --------------------------------------------------------------- §5.7.5 DH-reveal DLEQ


def dh_check(mh: bytes, i: int, j: int, E: RPoint, R: RPoint, S: RPoint, c: int, s: int) -> bool:
    a1 = G.mul(s) - E.mul(c)
    a2 = R.mul(s) - S.mul(c)
    return c == hs(
        "cp-dh", mh, u8(i), u8(j), E.encode(), R.encode(), S.encode(), a1.encode(), a2.encode()
    )


def dh_verify(mh: bytes, i: int, j: int, E_hex: str, R_hex: str, S_hex: str, proof: dict) -> None:
    try:
        E = decode_hex(E_hex)
        R = decode_hex(R_hex)
        S = decode_hex(S_hex)
        c, s = _scalars(proof, ("c", "s"))
    except QVError as e:
        raise QVError("E_DKG_COMPLAINT", e.detail or e.code)
    if not dh_check(mh, i, j, E, R, S, c, s):
        raise QVError("E_DKG_COMPLAINT", "DLEQ challenge mismatch")


# --------------------------------------------------------------- §5.10.1 CDS 0/1


def cds_check(
    ctx: bytes, binder: bytes, cid: str, oid: str, K: RPoint, alpha: RPoint, beta: RPoint,
    c0: int, s0: int, c1: int, s1: int,
) -> bool:
    beta0 = beta
    beta1 = beta - G
    a0 = G.mul(s0) - alpha.mul(c0)
    b0 = K.mul(s0) - beta0.mul(c0)
    a1 = G.mul(s1) - alpha.mul(c1)
    b1 = K.mul(s1) - beta1.mul(c1)
    c = hs(
        "cds01", ctx, binder, cid, oid, K.encode(), alpha.encode(), beta.encode(),
        a0.encode(), b0.encode(), a1.encode(), b1.encode(),
    )
    return (c0 + c1) % L == c


def cds_verify(
    ctx: bytes, binder: bytes, cid: str, oid: str, K_hex: str, alpha_hex: str, beta_hex: str,
    proof: dict,
) -> None:
    K = decode_hex(K_hex, non_identity=True)
    alpha = decode_hex(alpha_hex, non_identity=True)
    beta = decode_hex(beta_hex, non_identity=True)
    c0, s0, c1, s1 = _scalars(proof, ("c0", "s0", "c1", "s1"))
    if not cds_check(ctx, binder, cid, oid, K, alpha, beta, c0, s0, c1, s1):
        raise QVError("E_CDS", "0/1 proof failed")


# --------------------------------------------------------------- §5.10.2 selection limit


def limit_check(
    ctx: bytes, binder: bytes, cid: str, Lim: int, K: RPoint, Asum: RPoint, Bsum: RPoint,
    c: int, s: int,
) -> bool:
    a = G.mul(s) - Asum.mul(c)
    b = K.mul(s) - (Bsum - G.mul(Lim)).mul(c)
    return c == hs(
        "cp-limit", ctx, binder, cid, u32(Lim), K.encode(), Asum.encode(), Bsum.encode(),
        a.encode(), b.encode(),
    )


def limit_verify(
    ctx: bytes, binder: bytes, cid: str, Lim: int, K_hex: str, Asum_hex: str, Bsum_hex: str,
    proof: dict,
) -> None:
    K = decode_hex(K_hex, non_identity=True)
    Asum = decode_hex(Asum_hex)
    Bsum = decode_hex(Bsum_hex)
    c, s = _scalars(proof, ("c", "s"))
    if not limit_check(ctx, binder, cid, Lim, K, Asum, Bsum, c, s):
        raise QVError("E_LIMIT_PROOF", "selection-limit proof failed")


# --------------------------------------------------------------- §5.16 partial decryption


def dec_check(
    ctx: bytes, cid: str, oid: str, j: int, Y: RPoint, A: RPoint, B: RPoint, M: RPoint,
    c: int, s: int,
) -> bool:
    a = G.mul(s) - Y.mul(c)
    b = A.mul(s) - M.mul(c)
    return c == hs(
        "cp-dec", ctx, cid, oid, u8(j), Y.encode(), A.encode(), B.encode(), M.encode(),
        a.encode(), b.encode(),
    )


def dec_verify(
    ctx: bytes, cid: str, oid: str, j: int, Y_hex: str, A_hex: str, B_hex: str, M_hex: str,
    proof: dict,
) -> None:
    try:
        Y = decode_hex(Y_hex)
        A = decode_hex(A_hex)
        B = decode_hex(B_hex)
        M = decode_hex(M_hex)
        c, s = _scalars(proof, ("c", "s"))
    except QVError as e:
        raise QVError("E_DEC_PROOF", e.detail or e.code)
    if not dec_check(ctx, cid, oid, j, Y, A, B, M, c, s):
        raise QVError("E_DEC_PROOF", "partial-decryption proof failed")
