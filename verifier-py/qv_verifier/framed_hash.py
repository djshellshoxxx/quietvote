"""QV-16 §5.3 framed hash and §5.4 label registry."""

from __future__ import annotations

import hashlib

from .edwards import L
from .errors import QVError

SUITE = b"qv1-r255-sha2"
FRAME_TAG = b"QV1-HASH"

# QV-16 §5.4: label -> output function. Labels not listed here are rejected.
LABELS: dict[str, str] = {
    "manifest": "H256",
    "dkg-commit": "H256",
    "dkg-transcript": "H256",
    "dkg-dealing": "H256",
    "election-ctx": "H256",
    "pok": "hs",
    "pok-share": "hs",
    "cp-dh": "hs",
    "cds01": "hs",
    "cp-limit": "hs",
    "cp-dec": "hs",
    "cp-dec-spoil": "hs",
    "ballot-code": "H256",
    "binder-roll": "H256",
    "sig-cast": "H256",
    "sig-spoil": "H256",
    "sig-record": "H256",
    "voter-nonce-key": "H256",
    "ballot-seed": "H512",
    "selvec": "H256",
    "enc-nonce": "hs_nz",
    "proof-w": "hs_nz",
    "proof-csim": "hs",
    "proof-ssim": "hs",
    "limit-w": "hs_nz",
    "cp-dec-nonce": "hs_nz",
    "reveal": "H256",
}


def u8(x: int) -> bytes:
    return x.to_bytes(1, "big")


def u16(x: int) -> bytes:
    return x.to_bytes(2, "big")


def u32(x: int) -> bytes:
    return x.to_bytes(4, "big")


def u64(x: int) -> bytes:
    return x.to_bytes(8, "big")


def lp(x: bytes) -> bytes:
    return u32(len(x)) + x


def _as_bytes(f: bytes | str) -> bytes:
    if isinstance(f, str):
        return f.encode("utf-8")
    return bytes(f)


def frame(label: str, fields: list[bytes | str]) -> bytes:
    if label not in LABELS:
        raise QVError("E_DOMAIN_UNKNOWN", f"label {label!r} not in the QV-16 §5.4 registry")
    out = [lp(FRAME_TAG), lp(SUITE), lp(label.encode("ascii")), u32(len(fields))]
    out.extend(lp(_as_bytes(f)) for f in fields)
    return b"".join(out)


def _check_kind(label: str, kind: str) -> None:
    if label not in LABELS:
        raise QVError("E_DOMAIN_UNKNOWN", f"label {label!r} not in the QV-16 §5.4 registry")
    if LABELS[label] != kind:
        raise QVError("E_DOMAIN_UNKNOWN", f"label {label!r} is {LABELS[label]}, not {kind}")


def H256(label: str, *fields: bytes | str) -> bytes:
    _check_kind(label, "H256")
    return hashlib.sha256(frame(label, list(fields))).digest()


def H512(label: str, *fields: bytes | str) -> bytes:
    _check_kind(label, "H512")
    return hashlib.sha512(frame(label, list(fields))).digest()


def _hs_raw(label: str, fields: list[bytes | str]) -> int:
    return int.from_bytes(hashlib.sha512(frame(label, fields)).digest(), "little") % L


def hs(label: str, *fields: bytes | str) -> int:
    _check_kind(label, "hs")
    return _hs_raw(label, list(fields))


def hs_nz_full(label: str, *fields: bytes | str) -> tuple[int, int]:
    """hs_nz: append u32(c) as the last field, c = 0, 1, ... until non-zero.
    Returns (scalar, counter)."""
    _check_kind(label, "hs_nz")
    c = 0
    while True:
        v = _hs_raw(label, list(fields) + [u32(c)])
        if v != 0:
            return v, c
        c += 1


def hs_nz(label: str, *fields: bytes | str) -> int:
    return hs_nz_full(label, *fields)[0]
