"""Independent verifier for the opt-in qv-governance/1 signed rule history.

The byte contract is docs/GOVERNANCE-CORE.md. This module reuses only Python
QV-JSON and strict Ed25519 primitives; it does not execute the TypeScript IUT.
VERIFIED here means pinned, signed rules, not a governed-election verdict.
"""
from __future__ import annotations

import hashlib
import os
import re
import stat
from dataclasses import dataclass
from types import CoroutineType, MappingProxyType
from typing import Callable, Mapping

from . import ed25519, qvjson

PROFILE = "qv-governance/1"
EXPORT_FORMAT = "qv-governance-export/1"
MAX_EXPORT_BYTES = 4 << 20
MAX_BODY_BYTES = 64 << 10
MAX_SAFE = (1 << 53) - 1
CLASSES = ("ordinary", "bylaw", "rules", "entrenched")
GROUNDS = tuple(f"G{i}_{s}" for i, s in enumerate(
    ("MISSING_BALLOT", "VERIFY_FAIL", "ROLL_ERROR", "PROCEDURE", "CONFLICT", "OTHER"), 1))
EXCLUSIONS = ("stewards", "trustees", "proposers", "challengers")


class RulesError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _fail(code: str, message: str):
    raise RulesError(code, message)


def _closed(value, required, optional=()):
    if (type(value) is not dict or not set(required) <= value.keys()
            or not value.keys() <= set(required) | set(optional)):
        _fail("E_RULES_SCHEMA", "unexpected or missing field")


def _hex(value, size):
    return type(value) is str and re.fullmatch("[0-9a-f]{%d}" % (2 * size), value) is not None


def _key(value):
    if not _hex(value, 32) or not ed25519.valid_public_key(bytes.fromhex(value)):
        _fail("E_RULES_SCHEMA", "invalid public key")


def _snapshot(value, limit):
    try:
        encoded = qvjson.jcs(value)
        if len(encoded) > limit:
            _fail("E_RULES_BOUND", "document exceeds byte limit")
        return qvjson.parse(encoded)
    except RulesError:
        raise
    except Exception:
        _fail("E_RULES_SCHEMA", "invalid canonical JSON")


@dataclass(frozen=True)
class _Integer:
    minimum: int
    maximum: int


@dataclass(frozen=True)
class _Array:
    item: object
    minimum: int
    maximum: int


def _shape(value, schema):
    """Closed policy data schema; Booleans never count as Python integers."""
    if isinstance(schema, _Integer):
        if type(value) is not int:
            _fail("E_RULES_SCHEMA", "invalid group policy")
        if not schema.minimum <= value <= schema.maximum:
            _fail("E_RULES_BOUND", "invalid group policy")
    elif isinstance(schema, _Array):
        if type(value) is not list or not schema.minimum <= len(value) <= schema.maximum:
            _fail("E_RULES_SCHEMA", "invalid group policy")
        for item in value:
            _shape(item, schema.item)
    elif type(schema) is dict:
        _closed(value, schema)
        for name, field in schema.items():
            _shape(value[name], field)
    elif type(schema) is tuple:
        if type(value) is not str or value not in schema:
            _fail("E_RULES_SCHEMA", "invalid group policy")
    else:
        raise AssertionError("internal policy schema")


def validate_policy(value):
    """QV-03 bounds, restricted to the frozen signed-governance policy profile."""
    count = lambda low=0, high=MAX_SAFE: _Integer(low, high)
    hours = count(24, 2160)
    threshold = {"num": count(), "den": count(1), "cmp": ("gt", "gte"),
                 "base": ("yes_no", "all_cast", "eligible")}
    decision = {"quorum_bp": count(0, 10000), "threshold": threshold,
                "min_review_hours": hours, "min_voting_hours": hours}
    schema = {
        "stewards": {"approval": {"k": count(1, 15), "n": count(1, 15)},
                     "term_days": count(), "max_consecutive_terms": count()},
        "enrollment": {"approval": ("auto", "steward"), "invite_ttl_hours": count(1, 2160),
                       "vouches": count(0, 10), "label_policy": ("pseudonym_ok", "unique_only")},
        "proposals": {"who": ("any_member", "sponsored", "stewards"),
                      "sponsors_required": count(), "min_review_hours": hours,
                      "max_open_per_member": count(1, 20), "max_text_chars": count(1, 20000)},
        "elections": {"min_notice_hours": count(24, 720), "min_voting_hours": hours,
                      "max_voting_hours": hours, "revoting": ("allowed", "single"),
                      "trustees": {"min_n": count(3, 15), "min_t": count(2, 15),
                                   "independence": ("warn", "require")},
                      "roll_churn_alarm_bp": count(0, 10000),
                      "extension": {"allowed_if": ("always", "quorum_unmet"),
                                    "max_hours": count(1), "max_times": count(1)}},
        "decision_classes": {name: decision for name in CLASSES},
        "tie_break": {"yes_no": ("status_quo",), "multi_winner": ("drand_lot", "runoff", "fail", "incumbent")},
        "disputes": {"window_hours": count(72),
                     "arbiters": {"count": count(3), "selection": ("sortition", "named"),
                                  "exclude": _Array(EXCLUSIONS, 0, len(EXCLUSIONS))},
                     "grounds": _Array(GROUNDS, 1, len(GROUNDS))},
        "halt": {"authority": ("none", "stewards_k_or_trustees_t"),
                 "max_hours_each": count(1, 168), "max_halts": count(), "max_total_hours": count()},
        "disclosure": {"roll_labels": ("members", "public", "hidden"), "result_detail": ("full_counts",)},
        "retention_profile": ("default-v1",),
    }
    _shape(value, schema)
    p = value
    trustee = p["elections"]["trustees"]
    checks = [
        p["stewards"]["approval"]["k"] <= p["stewards"]["approval"]["n"],
        p["proposals"]["who"] != "sponsored" or p["proposals"]["sponsors_required"] >= 1,
        p["elections"]["min_voting_hours"] <= p["elections"]["max_voting_hours"],
        trustee["min_t"] <= trustee["min_n"],
        2 * trustee["min_t"] > trustee["min_n"],
        p["disputes"]["arbiters"]["count"] % 2 == 1,
        len(set(p["disputes"]["arbiters"]["exclude"])) == len(p["disputes"]["arbiters"]["exclude"]),
        len(set(p["disputes"]["grounds"])) == len(p["disputes"]["grounds"]),
        p["halt"]["authority"] == "none" or p["halt"]["max_halts"] >= 1,
    ]
    for decision in p["decision_classes"].values():
        checks.extend((decision["threshold"]["num"] <= decision["threshold"]["den"],
                       decision["min_voting_hours"] <= p["elections"]["max_voting_hours"]))
    ent = p["decision_classes"]["entrenched"]
    checks.extend((ent["quorum_bp"] >= 6000, ent["threshold"]["cmp"] == "gte",
                   4 * ent["threshold"]["num"] >= 3 * ent["threshold"]["den"]))
    if not all(checks):
        _fail("E_RULES_BOUND", "invalid group policy")


def governance_hash(label: str, fields: list[bytes] | tuple[bytes, ...]) -> bytes:
    """New domain frame, independent of suite-v1's label registry."""
    if (type(label) is not str or re.fullmatch("[a-z-]{1,32}", label) is None
            or type(fields) not in (list, tuple) or len(fields) > 16
            or any(type(x) is not bytes or len(x) > MAX_EXPORT_BYTES for x in fields)):
        raise ValueError("governance frame bounds")
    lp = lambda x: len(x).to_bytes(4, "big") + x
    parts = [lp(b"QV-GOV-HASH"), lp(PROFILE.encode()), lp(label.encode()), len(fields).to_bytes(4, "big")]
    parts.extend(lp(field) for field in fields)
    return hashlib.sha256(b"".join(parts)).digest()


def group_id(identity_key: str) -> str:
    _key(identity_key)
    return governance_hash("group-id", [bytes.fromhex(identity_key)]).hex()


def validate_body(value):
    body = _snapshot(value, MAX_BODY_BYTES)
    _closed(body, ("proto", "kind", "identity_key", "group_id", "version", "steward_keys", "policy"),
            ("prev_rules_hash", "decision_class"))
    if body["proto"] != PROFILE or body["kind"] != "group-rules":
        _fail("E_RULES_SCHEMA", "unsupported governance profile or kind")
    _key(body["identity_key"])
    if not _hex(body["group_id"], 32) or body["group_id"] != group_id(body["identity_key"]):
        _fail("E_RULES_SCHEMA", "group identity mismatch")
    if type(body["version"]) is not int or not 1 <= body["version"] <= 64:
        _fail("E_RULES_BOUND", "version outside profile")
    keys = body["steward_keys"]
    if type(keys) is not list or not 1 <= len(keys) <= 15:
        _fail("E_RULES_BOUND", "steward count outside profile")
    for index, key in enumerate(keys):
        _key(key)
        if index and keys[index - 1] >= key:
            _fail("E_RULES_SCHEMA", "steward keys must be strictly sorted")
    validate_policy(body["policy"])
    if body["policy"]["stewards"]["approval"]["n"] != len(keys):
        _fail("E_RULES_BOUND", "steward count and approval disagree")
    if body["version"] == 1:
        if "prev_rules_hash" in body or "decision_class" in body:
            _fail("E_RULES_CHAIN", "genesis cannot have predecessor or decision class")
    else:
        if not _hex(body.get("prev_rules_hash"), 32):
            _fail("E_RULES_CHAIN", "amendment requires predecessor")
        if body.get("decision_class") not in ("rules", "entrenched"):
            _fail("E_RULES_SCHEMA", "invalid amendment decision class")
    return body


def _rules_hash(body):
    return hashlib.sha256(b"QV-rules/1" + qvjson.jcs(body)).hexdigest()


def rules_hash(body) -> str:
    return _rules_hash(validate_body(body))


def _signature_digest(body):
    return governance_hash("signature", [bytes.fromhex(body["group_id"]), b"group-rules",
                                        governance_hash("body", [qvjson.jcs(body)])])


def signature_digest(body) -> bytes:
    return _signature_digest(validate_body(body))


def _envelope(value):
    _closed(value, ("body", "sigs"), ("ratification",))
    body = validate_body(value["body"])
    sigs = value["sigs"]
    if type(sigs) is not list or not 1 <= len(sigs) <= 16:
        _fail("E_RULES_SIG", "signature count outside profile")
    for index, sig in enumerate(sigs):
        _closed(sig, ("key", "sig"))
        _key(sig["key"])
        if not _hex(sig["sig"], 64) or (index and sigs[index - 1]["key"] >= sig["key"]):
            _fail("E_RULES_SIG", "invalid signature encoding or order")
    envelope = {"body": body, "sigs": sigs}
    if "ratification" in value:
        if body["version"] == 1:
            _fail("E_RULES_CHAIN", "genesis cannot have ratification")
        _closed(value["ratification"], ("manifest_hash",))
        if not _hex(value["ratification"]["manifest_hash"], 32):
            _fail("E_RULES_SCHEMA", "invalid ratification reference")
        envelope["ratification"] = value["ratification"]
    return envelope


def amendment_class(previous, following):
    """Conservative protected-field classification; inputs must be valid bodies."""
    p, n = previous["policy"], following["policy"]
    protected = (previous["steward_keys"] != following["steward_keys"]
                 or any(p[k] != n[k] for k in ("stewards", "disputes", "halt", "retention_profile"))
                 or any(p["decision_classes"][k] != n["decision_classes"][k] for k in ("rules", "entrenched")))
    privacy = {"hidden": 0, "members": 1, "public": 2}
    protected |= privacy[n["disclosure"]["roll_labels"]] > privacy[p["disclosure"]["roll_labels"]]
    return "entrenched" if protected else "rules"


def _signatures(envelope, previous=None):
    body = envelope["body"]
    authority = body if previous is None else previous
    allowed = set(authority["steward_keys"])
    if previous is None:
        allowed.add(body["identity_key"])
    digest = _signature_digest(body)
    for sig in envelope["sigs"]:
        if sig["key"] not in allowed or not ed25519.verify(bytes.fromhex(sig["key"]), digest, bytes.fromhex(sig["sig"])):
            _fail("E_RULES_SIG", "unauthorized or invalid signature")
    signed = {sig["key"] for sig in envelope["sigs"]}
    if ((previous is None and body["identity_key"] not in signed)
            or len(signed & set(authority["steward_keys"])) < authority["policy"]["stewards"]["approval"]["k"]):
        _fail("E_RULES_SIG", "signature quorum not met")


def _report(error=None):
    result = {"scope": "signed-group-rules", "status": "INVALID", "versions": 0,
              "pending_ratifications": [], "errors": []}
    if error is not None:
        result["errors"].append({"code": error.code, "message": str(error)})
    return result


def verify_group_rules_export(document, *, identity_key=None, genesis_rules_hash=None,
                              verify_ratification: Callable[[Mapping[str, str]], bool] | None = None):
    """Verify history with external pins and an optional trusted synchronous verifier.

    Callback requests are read-only snapshots. Only literal True is evidence;
    untrusted export data cannot supply pins or a callback. All links/signatures
    are checked before invoking the caller's independent election verifier.
    """
    try:
        _key(identity_key)
        if not _hex(genesis_rules_hash, 32):
            _fail("E_RULES_ANCHOR", "missing genesis pin")
        value = _snapshot(document, MAX_EXPORT_BYTES)
        _closed(value, ("format", "rules"))
        if value["format"] != EXPORT_FORMAT:
            _fail("E_RULES_SCHEMA", "unsupported export profile")
        records = value["rules"]
        if type(records) is not list or not 1 <= len(records) <= 128:
            _fail("E_RULES_BOUND", "history length outside profile")
        # Ordered distinct candidates, never live or mutable operator state.
        history = []
        for raw in records:
            record = _envelope(raw)
            body = record["body"]
            digest = _rules_hash(body)
            if body["identity_key"] != identity_key:
                _fail("E_RULES_ANCHOR", "identity pin mismatch")
            version = body["version"]
            if version <= len(history):
                old, old_hash = history[version - 1]
                if old_hash != digest:
                    _fail("E_RULES_CHAIN", "competing rules at occupied version")
                _signatures(record, history[version - 2][0]["body"] if version > 1 else None)
                if "ratification" in record:
                    if "ratification" in old and old["ratification"] != record["ratification"]:
                        _fail("E_RULES_CHAIN", "conflicting ratification references")
                    old["ratification"] = record["ratification"]
                continue
            if version != len(history) + 1:
                _fail("E_RULES_CHAIN", "nonconsecutive rule version")
            previous = history[-1] if history else None
            if previous is None:
                if digest != genesis_rules_hash:
                    _fail("E_RULES_ANCHOR", "genesis pin mismatch")
            else:
                if body["prev_rules_hash"] != previous[1]:
                    _fail("E_RULES_CHAIN", "predecessor hash mismatch")
                if amendment_class(previous[0]["body"], body) == "entrenched" and body["decision_class"] != "entrenched":
                    _fail("E_RULES_BOUND", "protected amendment requires entrenched class")
            _signatures(record, previous[0]["body"] if previous else None)
            history.append((record, digest))

        pending = []
        active = history[0]
        for index, (record, digest) in enumerate(history[1:], 1):
            request = {"previous_rules_hash": history[index - 1][1], "rules_hash": digest,
                       "decision_class": record["body"]["decision_class"]}
            proved = False
            if "ratification" in record:
                request["manifest_hash"] = record["ratification"]["manifest_hash"]
                if verify_ratification is not None:
                    try:
                        answer = verify_ratification(MappingProxyType(dict(request)))
                        proved = answer is True
                        # Close only native unawaited coroutines. Never execute
                        # arbitrary __await__/truthiness methods from an answer.
                        if type(answer) is CoroutineType:
                            CoroutineType.close(answer)
                    except Exception:
                        pass
            if not proved:
                pending.append(request)
            if not pending:
                active = (record, digest)
        report = _report()
        report.update(status="INCOMPLETE" if pending else "VERIFIED", versions=len(history),
                      active_version=active[0]["body"]["version"], active_rules_hash=active[1],
                      candidate_rules_hash=history[-1][1], pending_ratifications=pending)
        return report
    except RulesError as error:
        return _report(error)
    except Exception:
        return _report(RulesError("E_RULES_SCHEMA", "invalid governance input"))


def verify_group_rules_json(raw, **trust):
    try:
        if type(raw) is str:
            raw = raw.encode("utf-8", errors="strict")
        if type(raw) is not bytes:
            _fail("E_RULES_SCHEMA", "invalid governance JSON")
        if len(raw) > MAX_EXPORT_BYTES:
            _fail("E_RULES_BOUND", "document exceeds byte limit")
        value = qvjson.parse(raw)
    except RulesError as error:
        return _report(error)
    except Exception:
        return _report(RulesError("E_RULES_SCHEMA", "invalid governance JSON"))
    return verify_group_rules_export(value, **trust)


def read_export(path):
    """Bounded regular-file CLI input; never block on a FIFO or follow a link."""
    if not getattr(os, "O_NONBLOCK", 0) or not getattr(os, "O_NOFOLLOW", 0):
        raise ValueError("safe regular-file input unavailable on this platform")
    flags = os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW
    fd = os.open(path, flags)
    with os.fdopen(fd, "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("governance input must be a regular file")
        if metadata.st_size > MAX_EXPORT_BYTES:
            _fail("E_RULES_BOUND", "document exceeds byte limit")
        return stream.read(MAX_EXPORT_BYTES + 1)
