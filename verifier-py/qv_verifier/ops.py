"""Operation dispatcher: QV-34 adapter op ids -> implementation.

Each op takes the vector ``input`` object and returns the ``output`` object, or raises
QVError(code). Ops not listed in OPS are reported as NOT-IMPLEMENTED by the runner.
"""

from __future__ import annotations

import hashlib
from typing import Any, Callable

from . import ballot, dkg, ed25519, manifest, merkle, proofs, qvjson, rules
from .errors import QVError
from .framed_hash import LABELS, frame, hs_nz_full, u32
from .ristretto import base_mul, decode_hex, scalar_decode, scalar_decode_hex, sc
from .edwards import L as ELL


def _hex(s: str) -> bytes:
    if not isinstance(s, str):
        raise QVError("E_SCHEMA", "expected hex string")
    return bytes.fromhex(s)


# ------------------------------------------------------------------ primitives


def op_sha256(i: dict) -> dict:
    return {"digest_hex": hashlib.sha256(_hex(i["msg_hex"])).hexdigest()}


def op_sha512(i: dict) -> dict:
    return {"digest_hex": hashlib.sha512(_hex(i["msg_hex"])).hexdigest()}


def op_tagged(i: dict) -> dict:
    label, kind = i["label"], i["kind"]
    fields = [_hex(f) for f in i["fields_hex"]]
    if label not in LABELS:
        raise QVError("E_DOMAIN_UNKNOWN", label)
    if LABELS[label] != kind:
        raise QVError("E_DOMAIN_UNKNOWN", f"{label} is {LABELS[label]}")
    if kind == "H256":
        pre = frame(label, fields)
        return {"preimage_hex": pre.hex(), "digest_hex": hashlib.sha256(pre).hexdigest()}
    if kind == "H512":
        pre = frame(label, fields)
        return {"preimage_hex": pre.hex(), "digest_hex": hashlib.sha512(pre).hexdigest()}
    if kind == "hs":
        pre = frame(label, fields)
        s = int.from_bytes(hashlib.sha512(pre).digest(), "little") % ELL
        return {"preimage_hex": pre.hex(), "scalar_hex": sc(s).hex()}
    if kind == "hs_nz":
        s, c = hs_nz_full(label, *fields)
        pre = frame(label, fields + [u32(c)])
        return {"preimage_hex": pre.hex(), "scalar_hex": sc(s).hex(), "counter_field_hex": u32(c).hex()}
    raise QVError("E_DOMAIN_UNKNOWN", f"unknown kind {kind}")


def op_canon_json(i: dict) -> dict:
    return {"canonical": qvjson.canonical_text(qvjson.parse(i["text"]))}


def op_ed25519_sign(i: dict) -> dict:
    sk = _hex(i["secret_hex"])
    return {
        "public_hex": ed25519.public_key(sk).hex(),
        "sig_hex": ed25519.sign(sk, _hex(i["msg_hex"])).hex(),
    }


def op_ed25519_verify(i: dict) -> dict:
    if not ed25519.verify(_hex(i["public_hex"]), _hex(i["msg_hex"]), _hex(i["sig_hex"])):
        raise QVError("E_SIG", "signature invalid under strict policy")
    return {"valid": True}


def op_ristretto_decode(i: dict) -> dict:
    pt = decode_hex(i["point_hex"], non_identity=bool(i.get("non_identity", False)))
    return {"is_identity": pt.is_identity()}


def op_base_mul(i: dict) -> dict:
    return {"point_hex": base_mul(scalar_decode_hex(i["scalar_hex"])).hex()}


def op_scalar_decode(i: dict) -> dict:
    scalar_decode(_hex(i["scalar_hex"]))
    return {"canonical": True}


# ------------------------------------------------------------------ protocol


def op_pok_verify(i: dict) -> dict:
    proofs.pok_verify(_hex(i["manifest_hash_hex"]), i["i"], i["k"], i["A_hex"], i["proof"])
    return {"valid": True}


def op_dh_verify(i: dict) -> dict:
    proofs.dh_verify(_hex(i["manifest_hash_hex"]), i["i"], i["j"], i["E_hex"], i["R_hex"], i["S_hex"], i["proof"])
    return {"valid": True}


def op_cds_verify(i: dict) -> dict:
    proofs.cds_verify(
        _hex(i["ctx_hex"]), _hex(i["binder_hex"]), i["cid"], i["oid"], i["K_hex"],
        i["alpha_hex"], i["beta_hex"], i["proof"],
    )
    return {"valid": True}


def op_limit_verify(i: dict) -> dict:
    proofs.limit_verify(
        _hex(i["ctx_hex"]), _hex(i["binder_hex"]), i["cid"], i["L"], i["K_hex"],
        i["Asum_hex"], i["Bsum_hex"], i["proof"],
    )
    return {"valid": True}


def op_partial_verify(i: dict) -> dict:
    proofs.dec_verify(
        _hex(i["ctx_hex"]), i["cid"], i["oid"], i["j"], i["Yj_hex"], i["A_hex"], i["B_hex"],
        i["M_hex"], i["proof"],
    )
    return {"valid": True}


def op_roll_root(i: dict) -> dict:
    root, leaves = merkle.roll_root([_hex(x) for x in i["voter_pks"]])
    return {"root_hex": root.hex(), "leaf_hashes": [h.hex() for h in leaves]}


def op_manifest(i: dict) -> dict:
    m = i["manifest"]
    manifest.validate(m, i.get("roll_size"))
    j, h = manifest.manifest_hash(m)
    return {"manifest_hash": h.hex(), "jcs_hex": j.hex()}


def _attempt(v: Any) -> int:
    if isinstance(v, str) and v.isdigit():
        return int(v)
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    raise QVError("E_SCHEMA", "attempt must be a decimal string")


def op_ballot_encrypt(i: dict) -> dict:
    if "params" not in i:  # the ξ-derivation vector
        xi = ballot.derive_xi(
            _hex(i["ctx_hex"]), _hex(i["voter_nonce_key_hex"]), _hex(i["rho_hex"]),
            _attempt(i["attempt"]), _hex(i["selvec_digest_hex"]),
        )
        return {"xi_hex": xi.hex()}
    p = i["params"]
    ctx = _hex(p["ctx_hex"])
    K = decode_hex(p["K_hex"], non_identity=True)
    pk = _hex(i["voter_pk_hex"])
    sk = _hex(i["voter_secret_hex"])
    if ed25519.public_key(sk) != pk:
        raise QVError("E_SCHEMA", "voter_secret does not match voter_pk")
    body = ballot.encrypt(p["manifest"], K, ctx, pk, i["supersedes"], i["selections"], _hex(i["xi_hex"]))
    code = ballot.ballot_code(ctx, body)
    return {
        "body_jcs_hex": qvjson.jcs(body).hex(),
        "ballot_code_hex": code.hex(),
        "binder_hex": ballot.binder_roll(ctx, pk).hex(),
        "cast_sig_hex": ed25519.sign(sk, ballot.sig_cast_msg(ctx, code)).hex(),
    }


def op_ballot_verify(i: dict) -> dict:
    p = i["params"]
    K = decode_hex(p["K_hex"], non_identity=True)
    roll = {_hex(x) for x in i["roll"]}
    code = ballot.verify_envelope(p["manifest"], K, _hex(p["ctx_hex"]), roll, i["envelope"])
    return {"ballot_code_hex": code.hex()}


def op_benaloh(i: dict) -> dict:
    p = i["params"]
    K = decode_hex(p["K_hex"], non_identity=True)
    ballot.verify_spoil_reveal(p["manifest"], K, _hex(p["ctx_hex"]), i["body"], i["reveal"])
    return {"reproduced": True}


def op_rules(i: dict) -> dict:
    return {"result": rules.evaluate(i["manifest_quorum"], i["contest"], i["counts"], i["participation"], i["roll_size"])}


def op_dkg(i: dict) -> dict:
    r = dkg.adjudicate(_hex(i["manifest_hash_hex"]), i["n"], i["t"], i["markers"], i["records"])
    return {
        "Q": r["Q"], "qmask": r["qmask"], "K_hex": r["K"].hex(), "ctx_hex": r["ctx"].hex(),
        "Y_hex": {str(j): y.hex() for j, y in r["Y"].items()},
    }


OPS: dict[str, Callable[[dict], dict]] = {
    "hash.sha256": op_sha256,
    "hash.sha512": op_sha512,
    "hash.tagged": op_tagged,
    "enc.canon_json": op_canon_json,
    "ed25519.sign": op_ed25519_sign,
    "ed25519.verify": op_ed25519_verify,
    "ristretto.decode": op_ristretto_decode,
    "ristretto.encode_base_mul": op_base_mul,
    "scalar.decode": op_scalar_decode,
    "pok.verify": op_pok_verify,
    "cp.verify_dh": op_dh_verify,
    "cds.verify": op_cds_verify,
    "limit.verify": op_limit_verify,
    "tally.partial_verify": op_partial_verify,
    "roll.merkle_root": op_roll_root,
    "manifest.validate_hash": op_manifest,
    "ballot.encrypt": op_ballot_encrypt,
    "ballot.verify": op_ballot_verify,
    "benaloh.verify_spoiled": op_benaloh,
    "rules.evaluate": op_rules,
    "dkg.adjudicate": op_dkg,
}


def run_op(op: str, inp: dict) -> dict:
    """Run one op. Returns {"ok": True, "output": ...} or {"ok": False, "error": code}."""
    fn = OPS[op]
    try:
        return {"ok": True, "output": fn(inp)}
    except QVError as e:
        return {"ok": False, "error": e.code, "detail": e.detail}
