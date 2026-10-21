"""Manifest validation and hash (QV-16 §5.6.1, §5.5; QV-ADR-015, QV-ADR-021; QV-13 bidi rule).

Error classes, in the order they are checked:
  E_PARSE    -- value outside the QV-JSON domain (null, float, non-NFC, ...)
  E_VERSION  -- unknown ``proto`` or ``type``
  E_SCHEMA   -- closed-schema violation: missing/unknown field, wrong JSON type, hex not
                lower-case of the exact width, bad timestamp syntax
  E_MANIFEST -- semantic rule violated (ranges, uniqueness, ordering, method/limit rules,
                tie-break types, bidi controls in free text, privacy floor)
"""

from __future__ import annotations

import re
from typing import Any

from . import qvjson
from .errors import QVError
from .framed_hash import H256

PROTO = "qv1-r255-sha2"
HEX32 = re.compile(r"^[0-9a-f]{64}$")
HEX16 = re.compile(r"^[0-9a-f]{32}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
# Bidirectional formatting / mark characters (QV-13; QV-34 §7.2 "bidi control chars in labels").
BIDI = set("؜‎‏‪‫‬‭‮⁦⁧⁨⁩")
METHODS = {"yes-no", "single-choice", "approval", "k-of-n"}
TIE_TYPES = {"status-quo", "declare-tie", "lexicographic"}


def _obj(v: Any, req: set[str], opt: set[str], what: str) -> dict:
    if not isinstance(v, dict):
        raise QVError("E_SCHEMA", f"{what} is not an object")
    missing, extra = req - set(v), set(v) - req - opt
    if missing:
        raise QVError("E_SCHEMA", f"{what}: missing {sorted(missing)}")
    if extra:
        raise QVError("E_SCHEMA", f"{what}: unknown fields {sorted(extra)}")
    return v


def _int(v: Any, what: str) -> int:
    if not isinstance(v, int) or isinstance(v, bool):
        raise QVError("E_SCHEMA", f"{what} is not an integer")
    return v


def _str(v: Any, what: str) -> str:
    if not isinstance(v, str):
        raise QVError("E_SCHEMA", f"{what} is not a string")
    return v


def _bool(v: Any, what: str) -> bool:
    if not isinstance(v, bool):
        raise QVError("E_SCHEMA", f"{what} is not a boolean")
    return v


def _hex(v: Any, rx: re.Pattern, what: str) -> str:
    if not isinstance(v, str) or not rx.match(v):
        raise QVError("E_SCHEMA", f"{what} is not lower-case hex of the required width")
    return v


def _ts(v: Any, what: str) -> str:
    if not isinstance(v, str) or not TS_RE.match(v):
        raise QVError("E_SCHEMA", f"{what} is not YYYY-MM-DDTHH:MM:SSZ")
    return v


def _text(v: Any, what: str) -> str:
    s = _str(v, what)
    if any(ch in BIDI for ch in s):
        raise QVError("E_MANIFEST", f"{what}: bidi control character")
    return s


def _ident(v: Any, what: str) -> str:
    s = _str(v, what)
    if not ID_RE.match(s):
        raise QVError("E_MANIFEST", f"{what}: identifier {s!r} does not match the ID rule")
    return s


def _bad(msg: str):
    raise QVError("E_MANIFEST", msg)


def _contest(c: Any, idx: int) -> None:
    w = f"contests[{idx}]"
    _obj(c, {"id", "title", "method", "options", "min_selections", "tie_break"},
         {"selection_limit", "rule", "winners"}, w)
    _ident(c["id"], f"{w}.id")
    _text(c["title"], f"{w}.title")
    method = _str(c["method"], f"{w}.method")
    if method not in METHODS:
        _bad(f"{w}: unknown method {method!r}")
    opts = c["options"]
    if not isinstance(opts, list):
        raise QVError("E_SCHEMA", f"{w}.options is not an array")
    for k, o in enumerate(opts):
        _obj(o, {"id", "label"}, set(), f"{w}.options[{k}]")
        _ident(o["id"], f"{w}.options[{k}].id")
        _text(o["label"], f"{w}.options[{k}].label")
    ids = [o["id"] for o in opts]
    if not 1 <= len(ids) <= 255 or len(set(ids)) != len(ids):
        _bad(f"{w}: option count/uniqueness")
    if method == "yes-no" and ids != ["yes", "no"]:
        _bad(f"{w}: yes-no must have options [yes, no]")
    if _int(c["min_selections"], f"{w}.min_selections") != 0:
        _bad(f"{w}: min_selections must be 0 in suite v1")
    lim = c.get("selection_limit")
    if lim is not None:
        _int(lim, f"{w}.selection_limit")
    if method in ("yes-no", "single-choice"):
        if lim != 1:
            _bad(f"{w}: {method} requires selection_limit 1")
    elif method == "k-of-n":
        if lim is None or not 1 <= lim < len(ids):
            _bad(f"{w}: k-of-n requires 1 <= selection_limit < |options|")
    elif method == "approval":
        if lim is not None:
            _bad(f"{w}: approval has no selection_limit")
    if "winners" in c:
        wn = _int(c["winners"], f"{w}.winners")
        if not 1 <= wn <= len(ids):
            _bad(f"{w}: winners out of range")
    if "rule" in c:
        r = _obj(c["rule"], {"type", "num", "den", "basis", "strict"}, set(), f"{w}.rule")
        if _str(r["type"], "rule.type") != "threshold":
            _bad(f"{w}: unknown rule type")
        num, den = _int(r["num"], "rule.num"), _int(r["den"], "rule.den")
        if _str(r["basis"], "rule.basis") not in ("yes+no", "counted", "roll"):
            _bad(f"{w}: unknown rule basis")
        _bool(r["strict"], "rule.strict")
        if den <= 0 or not 0 <= num <= den:
            _bad(f"{w}: rule fraction out of range")
    tb = c["tie_break"]
    if not isinstance(tb, dict):
        raise QVError("E_SCHEMA", f"{w}.tie_break is not an object")
    tbt = _str(tb.get("type"), f"{w}.tie_break.type")
    if tbt == "status-quo":
        _obj(tb, {"type", "option"}, set(), f"{w}.tie_break")
        if tb["option"] not in ids:
            _bad(f"{w}: status-quo option not among options")
    elif tbt in TIE_TYPES:
        _obj(tb, {"type"}, set(), f"{w}.tie_break")
    else:
        # includes "beacon": reserved and rejected in suite v1 (QV-16 §5.6.1)
        _bad(f"{w}: tie_break type {tbt!r} not allowed in suite v1")


def validate(m: Any, roll_size: int | None = None) -> None:
    qvjson.check_value(m)
    if not isinstance(m, dict):
        raise QVError("E_SCHEMA", "manifest is not an object")
    if m.get("proto") != PROTO or m.get("type") != "manifest":
        raise QVError("E_VERSION", f"unknown proto/type {m.get('proto')!r}/{m.get('type')!r}")
    _obj(
        m,
        {"proto", "type", "election_id", "title", "created", "voting_open", "voting_close",
         "clock_skew_s", "contests", "roll", "trustees", "n", "t", "coordinator", "ballots", "bb"},
        {"quorum", "min_counted_ballots", "privacy_ack"},
        "manifest",
    )
    _hex(m["election_id"], HEX16, "election_id")
    _text(m["title"], "title")
    _ts(m["created"], "created")
    vo, vc = _ts(m["voting_open"], "voting_open"), _ts(m["voting_close"], "voting_close")
    if _int(m["clock_skew_s"], "clock_skew_s") < 0:
        _bad("clock_skew_s negative")
    if not vc > vo:  # fixed-width UTC timestamps compare lexicographically
        _bad("voting_close must be after voting_open")

    if not isinstance(m["contests"], list):
        raise QVError("E_SCHEMA", "contests is not an array")
    for k, c in enumerate(m["contests"]):
        _contest(c, k)
    cids = [c["id"] for c in m["contests"]]
    if not 1 <= len(cids) <= 64 or len(set(cids)) != len(cids):
        _bad("contest count / duplicate contest id")

    if "quorum" in m:
        q = m["quorum"]
        if not isinstance(q, dict):
            raise QVError("E_SCHEMA", "quorum is not an object")
        qt = _str(q.get("type"), "quorum.type")
        if qt == "fraction":
            _obj(q, {"type", "num", "den", "basis"}, set(), "quorum")
            num, den = _int(q["num"], "quorum.num"), _int(q["den"], "quorum.den")
            if q["basis"] != "roll" or den <= 0 or not 0 <= num <= den:
                _bad("quorum fraction invalid")
        elif qt == "count":
            _obj(q, {"type", "n"}, set(), "quorum")
            if _int(q["n"], "quorum.n") < 0:
                _bad("quorum count negative")
        else:
            _bad(f"unknown quorum type {qt!r}")

    roll = _obj(m["roll"], {"scheme", "weights"}, {"root", "size"}, "roll")
    if roll["scheme"] != "ed25519-roll-v1" or roll["weights"] != "uniform":
        _bad("roll scheme/weights not supported in Phase 1")
    if "root" in roll:
        _hex(roll["root"], HEX32, "roll.root")
    if "size" in roll:
        if _int(roll["size"], "roll.size") < 1:
            _bad("roll.size < 1")
        if roll_size is not None and roll["size"] != roll_size:
            _bad("roll.size differs from the roll")

    n, t = _int(m["n"], "n"), _int(m["t"], "t")
    trustees = m["trustees"]
    if not isinstance(trustees, list):
        raise QVError("E_SCHEMA", "trustees is not an array")
    for k, tr in enumerate(trustees):
        _obj(tr, {"index", "name", "sign_pk"}, set(), f"trustees[{k}]")
        _int(tr["index"], "trustee.index")
        _text(tr["name"], "trustee.name")
        _hex(tr["sign_pk"], HEX32, "trustee.sign_pk")
    if not 1 <= t <= n <= 32:
        _bad("require 1 <= t <= n <= 32")
    if len(trustees) != n or [tr["index"] for tr in trustees] != list(range(1, n + 1)):
        _bad("trustees must be exactly n entries with index 1..n in order")
    if len({tr["sign_pk"] for tr in trustees}) != n:
        _bad("duplicate trustee sign_pk")

    co = _obj(m["coordinator"], {"keys", "m"}, set(), "coordinator")
    if not isinstance(co["keys"], list) or not co["keys"]:
        raise QVError("E_SCHEMA", "coordinator.keys is not a non-empty array")
    for k in co["keys"]:
        _hex(k, HEX32, "coordinator.keys[]")
    if len(set(co["keys"])) != len(co["keys"]) or not 1 <= _int(co["m"], "coordinator.m") <= len(co["keys"]):
        _bad("coordinator m-of-k invalid")

    bl = _obj(m["ballots"], {"max_per_voter", "max_spoils_per_voter"}, set(), "ballots")
    if _int(bl["max_per_voter"], "max_per_voter") < 1 or _int(bl["max_spoils_per_voter"], "max_spoils_per_voter") < 0:
        _bad("ballot limits out of range")

    # `witnesses` is not in QV-16 §5.6.1; QV-18-REQ-020 calls the list `witness_policy`.
    # Accepted here as used by the log-layer vectors (QV-ERR-PY-014).
    bb = _obj(m["bb"], {"log_id", "log_pk", "witness_quorum"}, {"witnesses"}, "bb")
    _hex(bb["log_id"], HEX32, "bb.log_id")
    _hex(bb["log_pk"], HEX32, "bb.log_pk")
    wq = _int(bb["witness_quorum"], "bb.witness_quorum")
    wit = bb.get("witnesses", [])
    if not isinstance(wit, list):
        raise QVError("E_SCHEMA", "bb.witnesses is not an array")
    for k, w in enumerate(wit):
        _obj(w, {"name", "pk"}, set(), f"bb.witnesses[{k}]")
        _text(w["name"], "witness.name")
        _hex(w["pk"], HEX32, "witness.pk")
    if len({w["pk"] for w in wit}) != len(wit) or len({w["name"] for w in wit}) != len(wit):
        _bad("duplicate witness")
    if wq < 0 or ("witnesses" in bb and wq > len(wit)):
        _bad("witness_quorum out of range")

    # QV-ADR-021 privacy floor
    ack = _bool(m["privacy_ack"], "privacy_ack") if "privacy_ack" in m else False
    size = roll_size if roll_size is not None else roll.get("size")
    if "min_counted_ballots" in m:
        floor = _int(m["min_counted_ballots"], "min_counted_ballots")
    else:
        floor = 3 if (size is not None and size < 8) else 5
    if floor < 3:
        _bad("min_counted_ballots below hard floor 3")
    if floor < 10 and not ack:
        _bad("min_counted_ballots < 10 requires privacy_ack: true")


def manifest_hash(m: dict) -> tuple[bytes, bytes]:
    """Returns (JCS(manifest_body), H256("manifest"; JCS(manifest_body)))."""
    j = qvjson.jcs(m)
    return j, H256("manifest", j)
