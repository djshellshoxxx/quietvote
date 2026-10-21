"""DKG adjudication from the public record (QV-16 §5.7.3-§5.7.8).

Given the phase markers (sequence numbers) and the commit / dealing / shares / complaint
records, compute R1, the qualified set Q, the joint key K, the public key shares Y_j and the
election context ctx. Key confirmations (§5.7.8, decrypter set T) are out of scope for the
``dkg.adjudicate`` vectors and handled by callers that have them.
"""

from __future__ import annotations

from typing import Any

from . import qvjson
from .aead import aes256gcm_decrypt, hkdf_sha256
from .edwards import L as ELL
from .errors import QVError
from .framed_hash import H256, u8, u32
from .proofs import POK_ENC_KEY_INDEX, dh_check, pok_check
from .ristretto import G, R_IDENTITY, RPoint, decode_hex, scalar_decode_hex

SHARE_INFO_PREFIX = b"qv1-r255-sha2/dkg-share"


def _first_timely(records: list[dict], who_key: str, who: int, lo: int, hi: int) -> dict | None:
    """First record (by seq) from `who` with lo < seq < hi."""
    for r in sorted(records, key=lambda r: r["seq"]):
        if r["body"].get(who_key) == who and lo < r["seq"] < hi:
            return r
    return None


def _decode_dealing(body: dict, t: int):
    """Returns (E, [A_k], enc proof (c,s), [(c,s)]) or raises QVError."""
    enc = body["enc"]
    E = decode_hex(enc["E"], non_identity=True)
    ce, se = scalar_decode_hex(enc["c"]), scalar_decode_hex(enc["s"])
    coeffs = body["coeffs"]
    if not isinstance(coeffs, list) or len(coeffs) != t:
        raise QVError("E_DKG_R1", "wrong coefficient count")
    A, prf = [], []
    for co in coeffs:
        A.append(decode_hex(co["A"], non_identity=True))
        prf.append((scalar_decode_hex(co["c"]), scalar_decode_hex(co["s"])))
    return E, A, (ce, se), prf


def feldman_eval(A: list[RPoint], j: int) -> RPoint:
    """Σ_k [j^k] A_k by Horner (QV-16 §5.7.5 (F))."""
    P = A[-1]
    for k in range(len(A) - 2, -1, -1):
        P = P.mul(j) + A[k]
    return P


def share_key(mh: bytes, i: int, j: int, R: RPoint, S: RPoint) -> bytes:
    info = SHARE_INFO_PREFIX + u8(i) + u8(j) + R.encode()
    return hkdf_sha256(mh, S.encode(), info, 32)


def adjudicate(mh: bytes, n: int, t: int, markers: dict[str, int], records: dict[str, list]) -> dict:
    r1_open = markers["dkg-r1-open"]
    r1_close = markers["dkg-r1-close"]
    r2_close = markers["dkg-r2-close"]
    r3_close = markers["dkg-r3-close"]
    dkg_open = markers.get("dkg-open", 0)

    commits = records.get("commits", [])
    dealings_recs = records.get("dealings", [])
    shares_recs = records.get("shares", [])
    complaints = records.get("complaints", [])

    # ---- Round 0/1: commit-reveal, coefficient count, decoding, PoKs (R1)
    dealing: dict[int, dict] = {}
    decoded: dict[int, Any] = {}
    for i in range(1, n + 1):
        com = _first_timely(commits, "i", i, dkg_open, r1_open)
        dl = _first_timely(dealings_recs, "i", i, r1_open, r1_close)
        if com is None or dl is None:
            continue
        body = dl["body"]
        try:
            if body.get("proto") != "qv1-r255-sha2" or body.get("type") != "dkg-dealing":
                raise QVError("E_DKG_R1", "bad dealing type")
            if H256("dkg-commit", mh, u8(i), qvjson.jcs(body)).hex() != com["body"]["h"]:
                raise QVError("E_DKG_R1", "commit/reveal mismatch")
            E, A, (ce, se), prf = _decode_dealing(body, t)
            if not pok_check(mh, i, POK_ENC_KEY_INDEX, E, ce, se):
                raise QVError("E_DKG_R1", "encryption-key PoK")
            for k, (c, s) in enumerate(prf):
                if not pok_check(mh, i, k, A[k], c, s):
                    raise QVError("E_DKG_R1", f"coefficient {k} PoK")
        except (QVError, KeyError, TypeError):
            continue
        dealing[i] = body
        decoded[i] = (E, A)
    # distinct A_{i,0} (copy-attack hygiene): every dealer sharing an A_0 is disqualified
    a0 = {i: decoded[i][1][0].encode() for i in decoded}
    R1 = sorted(i for i in decoded if sum(1 for x in a0.values() if x == a0[i]) == 1)

    # ---- Round 2: complete, timely share packages
    pkg: dict[int, dict[int, dict]] = {}
    R2 = []
    for i in R1:
        rec = _first_timely(shares_recs, "i", i, r1_close, r2_close)
        if rec is None:
            continue
        try:
            entries = rec["body"]["shares"]
            if [e["j"] for e in entries] != [j for j in R1 if j != i]:
                continue
            for e in entries:
                decode_hex(e["R"], non_identity=True)
                if len(bytes.fromhex(e["ct"])) != 32 or len(bytes.fromhex(e["tag"])) != 16:
                    raise QVError("E_DKG_R2", "ct/tag width")
        except (QVError, KeyError, TypeError, ValueError):
            continue
        pkg[i] = {e["j"]: e for e in entries}
        R2.append(i)

    # ---- Round 3: complaints, adjudicated publicly
    disq: set[int] = set()
    for rec in sorted(complaints, key=lambda r: r["seq"]):
        if not (r2_close < rec["seq"] < r3_close):
            continue  # late (or premature): ignored
        b = rec["body"]
        try:
            j, i = b["accuser"], b["accused"]
            if i not in pkg or j not in R1 or j == i or j not in pkg[i]:
                continue  # names a non-member: ignored
            E_j = decoded[j][0]
            entry = pkg[i][j]
            R = decode_hex(entry["R"])
            S = decode_hex(b["S"])
            c, s = scalar_decode_hex(b["c"]), scalar_decode_hex(b["s"])
        except (QVError, KeyError, TypeError, ValueError):
            continue
        if not dh_check(mh, i, j, E_j, R, S, c, s):
            continue  # invalid DLEQ: ignored
        key = share_key(mh, i, j, R, S)
        aad = mh + u8(i) + u8(j) + R.encode()
        pt = aes256gcm_decrypt(key, b"\x00" * 12, bytes.fromhex(entry["ct"]),
                               bytes.fromhex(entry["tag"]), aad)
        dealer_bad = True
        if pt is not None:
            y = int.from_bytes(pt, "little")
            if len(pt) == 32 and y < ELL:
                dealer_bad = G.mul(y) != feldman_eval(decoded[i][1], j)
        disq.add(i if dealer_bad else j)

    Q = [i for i in R2 if i not in disq]
    if len(Q) < t:
        raise QVError("E_DKG_QUORUM", f"|Q| = {len(Q)} < t = {t}")

    # ---- Round 4: K, Y_j, transcript, ctx
    K = R_IDENTITY
    for i in Q:
        K = K + decoded[i][1][0]
    if K.is_identity():
        raise QVError("E_DKG_FINAL", "joint key is the identity")
    Y = {}
    for j in Q:
        acc = R_IDENTITY
        for i in Q:
            acc = acc + feldman_eval(decoded[i][1], j)
        Y[j] = acc
    qmask = sum(1 << (i - 1) for i in Q)
    digests = [H256("dkg-dealing", mh, u8(i), qvjson.jcs(dealing[i])) for i in Q]
    dt = H256("dkg-transcript", mh, u32(qmask), *digests)
    ctx = H256("election-ctx", mh, K.encode(), dt, u32(qmask), u8(t), u8(n))
    return {
        "Q": Q, "qmask": qmask, "K": K, "Y": Y, "ctx": ctx, "transcript_hash": dt,
        "R1": R1, "R2": R2, "dealings": dealing,
    }
