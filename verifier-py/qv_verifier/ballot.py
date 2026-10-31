"""Ballots: deterministic encryption from ξ (QV-16 §5.9-5.12), per-ballot verification
(§5.14.4 checks 1-9) and Benaloh spoil-reveal reproduction (§5.13.2)."""

from __future__ import annotations

import re
from typing import Any

from . import ed25519, qvjson
from .errors import QVError
from .framed_hash import H256, H512, hs, hs_nz, u8, u32, u64
from .proofs import cds_check, limit_check
from .ristretto import G, R_IDENTITY, RPoint, decode_hex, scalar_decode_hex, sc
from .edwards import L as ELL

PROTO = "qv1-r255-sha2"
ZERO32 = "00" * 32
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX128 = re.compile(r"^[0-9a-f]{128}$")


def binder_roll(ctx: bytes, voter_pk: bytes) -> bytes:
    """QV-16 §5.8 Phase-1 binder."""
    return H256("binder-roll", ctx, voter_pk)


def ballot_code(ctx: bytes, body: dict) -> bytes:
    return H256("ballot-code", ctx, qvjson.jcs(body))


def sig_cast_msg(ctx: bytes, code: bytes) -> bytes:
    return H256("sig-cast", ctx, code)


def sig_spoil_msg(ctx: bytes, code: bytes, reveal_digest: bytes) -> bytes:
    return H256("sig-spoil", ctx, code, reveal_digest)


def derive_xi(ctx: bytes, vnk: bytes, rho: bytes, attempt: int, selvec_digest: bytes) -> bytes:
    """QV-16 §5.11: ξ = H512("ballot-seed"; ctx, voter_nonce_key, ρ, u64(attempt), selvec_digest)."""
    return H512("ballot-seed", ctx, vnk, rho, u64(attempt), selvec_digest)


def contest_limit(contest: dict) -> int | None:
    lim = contest.get("selection_limit")
    return lim if isinstance(lim, int) and not isinstance(lim, bool) else None


def plaintext_positions(contest: dict, selected: list[str]) -> list[tuple[str, int]]:
    """QV-16 §5.9.1: canonical (option id, bit) list for one contest, placeholders included."""
    option_ids = [o["id"] for o in contest["options"]]
    if len(set(selected)) != len(selected) or any(s not in option_ids for s in selected):
        raise QVError("E_STRUCTURE", f"invalid selections for contest {contest['id']}")
    lim = contest_limit(contest)
    if lim is not None and len(selected) > lim:
        raise QVError("E_STRUCTURE", "overvote")
    pos = [(oid, 1 if oid in selected else 0) for oid in option_ids]
    if lim is not None:
        fill = lim - len(selected)
        pos += [(f"~ph{k}", 1 if k <= fill else 0) for k in range(1, lim + 1)]
    return pos


def _cds_prove(ctx, binder, cid, oid, K: RPoint, xi: bytes, m: int, r: int, alpha, beta):
    w = hs_nz("proof-w", xi, cid, oid, u8(m))
    c_sim = hs("proof-csim", xi, cid, oid)
    s_sim = hs("proof-ssim", xi, cid, oid)
    sim = 1 - m
    beta_sim = beta - G.mul(sim)
    a = {m: G.mul(w), sim: G.mul(s_sim) - alpha.mul(c_sim)}
    b = {m: K.mul(w), sim: K.mul(s_sim) - beta_sim.mul(c_sim)}
    c = hs(
        "cds01", ctx, binder, cid, oid, K.encode(), alpha.encode(), beta.encode(),
        a[0].encode(), b[0].encode(), a[1].encode(), b[1].encode(),
    )
    c_real = (c - c_sim) % ELL
    s_real = (w + c_real * r) % ELL
    cs = {m: (c_real, s_real), sim: (c_sim, s_sim)}
    return cs[0][0], cs[0][1], cs[1][0], cs[1][1]


def encrypt(
    manifest: dict, K: RPoint, ctx: bytes, voter_pk: bytes, supersedes_hex: str,
    selections: dict, xi: bytes,
) -> dict:
    """BallotEncrypt(ctx, voter, supersedes, selections, ξ): a pure function (QV-16 §5.13.2)."""
    binder = binder_roll(ctx, voter_pk)
    contests_out = []
    for contest in manifest["contests"]:
        cid = contest["id"]
        selected = selections.get(cid, [])
        if not isinstance(selected, list):
            raise QVError("E_STRUCTURE", "selections must be lists")
        lim = contest_limit(contest)
        sel_out, ph_out = [], []
        Asum, Bsum, Rsum = R_IDENTITY, R_IDENTITY, 0
        for oid, m in plaintext_positions(contest, selected):
            r = hs_nz("enc-nonce", xi, cid, oid)
            alpha = G.mul(r)
            beta = G.mul(m) + K.mul(r)
            c0, s0, c1, s1 = _cds_prove(ctx, binder, cid, oid, K, xi, m, r, alpha, beta)
            entry = {
                "opt": oid, "a": alpha.hex(), "b": beta.hex(),
                "c0": sc(c0).hex(), "s0": sc(s0).hex(), "c1": sc(c1).hex(), "s1": sc(s1).hex(),
            }
            (ph_out if oid.startswith("~") else sel_out).append(entry)
            Asum, Bsum, Rsum = Asum + alpha, Bsum + beta, (Rsum + r) % ELL
        c_out: dict[str, Any] = {"id": cid, "sel": sel_out}
        if lim is not None:
            u = hs_nz("limit-w", xi, cid)
            a, b = G.mul(u), K.mul(u)
            c = hs(
                "cp-limit", ctx, binder, cid, u32(lim), K.encode(), Asum.encode(),
                Bsum.encode(), a.encode(), b.encode(),
            )
            s = (u + c * Rsum) % ELL
            c_out["ph"] = ph_out
            c_out["lim"] = {"c": sc(c).hex(), "s": sc(s).hex()}
        contests_out.append(c_out)
    return {
        "proto": PROTO, "type": "ballot", "ctx": ctx.hex(), "voter": voter_pk.hex(),
        "supersedes": supersedes_hex, "contests": contests_out,
    }


# ------------------------------------------------------------------ verification


def _require_keys(obj: Any, required: set[str], optional: set[str] = frozenset(), what: str = "object"):
    if not isinstance(obj, dict):
        raise QVError("E_SCHEMA", f"{what} is not an object")
    keys = set(obj)
    missing = required - keys
    extra = keys - required - optional
    if missing:
        raise QVError("E_SCHEMA", f"{what}: missing {sorted(missing)}")
    if extra:
        raise QVError("E_SCHEMA", f"{what}: unknown fields {sorted(extra)}")


def _require_hex(v: Any, rx: re.Pattern, what: str):
    if not isinstance(v, str) or not rx.match(v):
        raise QVError("E_SCHEMA", f"{what} is not lower-case hex of the required width")


_SEL_KEYS = {"opt", "a", "b", "c0", "s0", "c1", "s1"}


def _schema_body(body: Any) -> None:
    _require_keys(body, {"proto", "type", "ctx", "voter", "supersedes", "contests"}, what="body")
    for k in ("proto", "type"):
        if not isinstance(body[k], str):
            raise QVError("E_SCHEMA", f"body.{k} not a string")
    for k in ("ctx", "voter", "supersedes"):
        _require_hex(body[k], HEX64, f"body.{k}")
    if not isinstance(body["contests"], list):
        raise QVError("E_SCHEMA", "body.contests not an array")
    for c in body["contests"]:
        _require_keys(c, {"id", "sel"}, {"ph", "lim"}, what="contest")
        if not isinstance(c["id"], str):
            raise QVError("E_SCHEMA", "contest.id not a string")
        for key in ("sel", "ph"):
            if key not in c:
                continue
            if not isinstance(c[key], list):
                raise QVError("E_SCHEMA", f"contest.{key} not an array")
            for e in c[key]:
                _require_keys(e, _SEL_KEYS, what="selection")
                if not isinstance(e["opt"], str):
                    raise QVError("E_SCHEMA", "selection.opt not a string")
                for f in ("a", "b", "c0", "s0", "c1", "s1"):
                    _require_hex(e[f], HEX64, f"selection.{f}")
        if "lim" in c:
            _require_keys(c["lim"], {"c", "s"}, what="lim")
            _require_hex(c["lim"]["c"], HEX64, "lim.c")
            _require_hex(c["lim"]["s"], HEX64, "lim.s")


def schema_envelope(env: Any) -> None:
    """Check 1 (QV-16 §5.14.4): QV-JSON value domain + closed envelope/body schema."""
    qvjson.check_value(env)
    if not isinstance(env, dict) or env.get("intent") not in ("cast", "spoil"):
        raise QVError("E_SCHEMA", "envelope.intent must be cast or spoil")
    if env["intent"] == "cast":
        _require_keys(env, {"intent", "body", "sig"}, what="envelope")
    else:
        _require_keys(env, {"intent", "body", "reveal_digest", "sig"}, {"reveal"}, what="envelope")
        _require_hex(env["reveal_digest"], HEX64, "reveal_digest")
        if "reveal" in env:
            _require_keys(env["reveal"], {"xi", "selections"}, what="reveal")
            _require_hex(env["reveal"]["xi"], HEX128, "reveal.xi")
            if not isinstance(env["reveal"]["selections"], dict):
                raise QVError("E_SCHEMA", "reveal.selections not an object")
    _require_hex(env["sig"], HEX128, "sig")
    _schema_body(env["body"])


def check_structure(manifest: dict, body: dict) -> None:
    """Check 5: contests/options/placeholders exactly as the manifest, in order."""
    mc = manifest["contests"]
    bc = body["contests"]
    if [c["id"] for c in bc] != [c["id"] for c in mc]:
        raise QVError("E_STRUCTURE", "contest list differs from manifest")
    for m, b in zip(mc, bc):
        if [e["opt"] for e in b["sel"]] != [o["id"] for o in m["options"]]:
            raise QVError("E_STRUCTURE", f"options of {m['id']} differ from manifest")
        lim = contest_limit(m)
        if lim is None:
            if "ph" in b or "lim" in b:
                raise QVError("E_STRUCTURE", f"{m['id']}: ph/lim present without a limit")
        else:
            if "ph" not in b or "lim" not in b:
                raise QVError("E_STRUCTURE", f"{m['id']}: ph/lim missing")
            if [e["opt"] for e in b["ph"]] != [f"~ph{k}" for k in range(1, lim + 1)]:
                raise QVError("E_STRUCTURE", f"{m['id']}: placeholder set differs")


def _positions(body: dict):
    for c in body["contests"]:
        for e in c["sel"] + c.get("ph", []):
            yield c, e


def verify_envelope(manifest: dict, K: RPoint, ctx: bytes, roll: set[bytes], env: Any) -> bytes:
    """QV-16 §5.14.4 checks 1-9 for a cast (or spoil) envelope. Returns the ballot code."""
    schema_envelope(env)  # 1
    body = env["body"]
    if body["proto"] != PROTO or body["type"] != "ballot":  # 2
        raise QVError("E_VERSION", "unknown proto/type")
    if bytes.fromhex(body["ctx"]) != ctx:
        raise QVError("E_CTX", "ballot ctx does not match election")
    voter = bytes.fromhex(body["voter"])  # 3
    if not ed25519.valid_public_key(voter) or voter not in roll:
        raise QVError("E_VOTER_NOT_ELIGIBLE", "voter key invalid or not on roll")
    code = ballot_code(ctx, body)  # 4
    if env["intent"] == "cast":
        msg = sig_cast_msg(ctx, code)
    else:
        msg = sig_spoil_msg(ctx, code, bytes.fromhex(env["reveal_digest"]))
    if not ed25519.verify(voter, msg, bytes.fromhex(env["sig"])):
        raise QVError("E_SIG", "ballot signature invalid")
    check_structure(manifest, body)  # 5
    pts = {}
    for c, e in _positions(body):  # 6
        pts[id(e)] = (decode_hex(e["a"], non_identity=True), decode_hex(e["b"], non_identity=True))
    scal = {}
    for c, e in _positions(body):  # 7
        scal[id(e)] = tuple(scalar_decode_hex(e[k]) for k in ("c0", "s0", "c1", "s1"))
    lims = {}
    for c in body["contests"]:
        if "lim" in c:
            lims[c["id"]] = (scalar_decode_hex(c["lim"]["c"]), scalar_decode_hex(c["lim"]["s"]))
    binder = binder_roll(ctx, voter)
    for c, e in _positions(body):  # 8
        alpha, beta = pts[id(e)]
        if not cds_check(ctx, binder, c["id"], e["opt"], K, alpha, beta, *scal[id(e)]):
            raise QVError("E_CDS", f"0/1 proof failed for {c['id']}/{e['opt']}")
    mlim = {m["id"]: contest_limit(m) for m in manifest["contests"]}
    for c in body["contests"]:  # 9
        if "lim" not in c:
            continue
        Asum, Bsum = R_IDENTITY, R_IDENTITY
        for e in c["sel"] + c["ph"]:
            a, b = pts[id(e)]
            Asum, Bsum = Asum + a, Bsum + b
        if not limit_check(ctx, binder, c["id"], mlim[c["id"]], K, Asum, Bsum, *lims[c["id"]]):
            raise QVError("E_LIMIT_PROOF", f"selection-limit proof failed for {c['id']}")
    return code


def verify_spoil_reveal(manifest: dict, K: RPoint, ctx: bytes, body: dict, reveal: dict) -> None:
    """QV-16 §5.13.2 step 2: recompute the ballot from (selections, ξ); JCS must match."""
    try:
        xi = bytes.fromhex(reveal["xi"])
        if len(xi) != 64:
            raise ValueError
        recomputed = encrypt(
            manifest, K, ctx, bytes.fromhex(body["voter"]), body["supersedes"],
            reveal["selections"], xi,
        )
    except (QVError, ValueError, KeyError, TypeError) as exc:
        raise QVError("E_SPOIL_MISMATCH", f"reveal cannot be re-encrypted: {exc}")
    if qvjson.jcs(recomputed) != qvjson.jcs(body):
        raise QVError("E_SPOIL_MISMATCH", "reveal does not reproduce the ballot")
