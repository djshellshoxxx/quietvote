"""QV-JSON profile (QV-16 §5.5): strict parsing and RFC 8785 (JCS) serialisation.

Parsing rules enforced (QV-16 §5.5 items 1, 2, 4):
  * UTF-8 without BOM (when given bytes); no lone surrogates;
  * no duplicate object keys at any depth;
  * values limited to object, array, string, integer, boolean (no null, no fraction/exponent,
    no NaN/Infinity, no -0); integers within [-(2^53-1), 2^53-1];
  * every string (keys and values) must be Unicode NFC;
  * no trailing data; raw control characters inside strings are rejected.

Hex/width/closed-schema rules (items 3, 7) are schema-level and enforced by the per-object
validators, not here.

Serialisation (item 6 / RFC 8785): object keys sorted by UTF-16 code units, no whitespace,
ECMAScript string escaping, shortest integer form.
"""

from __future__ import annotations

import json
import unicodedata
from typing import Any

from .errors import QVError

MAX_SAFE = 2**53 - 1


def _reject_float(s: str) -> Any:
    raise QVError("E_PARSE", f"non-integer number {s!r}")


def _reject_constant(s: str) -> Any:
    raise QVError("E_PARSE", f"non-finite number {s!r}")


def _parse_int(s: str) -> int:
    if s == "-0":
        raise QVError("E_PARSE", "-0 is not allowed")
    v = int(s)
    if not -MAX_SAFE <= v <= MAX_SAFE:
        raise QVError("E_PARSE", "integer outside the safe range")
    return v


def _pairs(pairs: list[tuple[str, Any]]) -> dict:
    out: dict = {}
    for k, v in pairs:
        if k in out:
            raise QVError("E_PARSE", f"duplicate key {k!r}")
        out[k] = v
    return out


def _check_string(s: str) -> None:
    try:
        s.encode("utf-8")
    except UnicodeEncodeError:
        raise QVError("E_PARSE", "lone surrogate in string")
    if not unicodedata.is_normalized("NFC", s):
        raise QVError("E_PARSE", "string is not NFC")


def check_value(v: Any) -> None:
    """Check an already-parsed value against the QV-JSON value domain."""
    if v is None:
        raise QVError("E_PARSE", "null is forbidden")
    if isinstance(v, bool):
        return
    if isinstance(v, int):
        if not -MAX_SAFE <= v <= MAX_SAFE:
            raise QVError("E_PARSE", "integer outside the safe range")
        return
    if isinstance(v, float):
        raise QVError("E_PARSE", "non-integer number")
    if isinstance(v, str):
        _check_string(v)
        return
    if isinstance(v, list):
        for x in v:
            check_value(x)
        return
    if isinstance(v, dict):
        for k, x in v.items():
            if not isinstance(k, str):
                raise QVError("E_PARSE", "non-string key")
            _check_string(k)
            check_value(x)
        return
    raise QVError("E_PARSE", f"unsupported value type {type(v).__name__}")


def parse(text: str | bytes) -> Any:
    """Strict QV-JSON parse; raises QVError('E_PARSE')."""
    if isinstance(text, (bytes, bytearray)):
        if bytes(text[:3]) == b"\xef\xbb\xbf":
            raise QVError("E_PARSE", "BOM not allowed")
        try:
            text = bytes(text).decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            raise QVError("E_PARSE", "invalid UTF-8")
    if text.startswith("﻿"):
        raise QVError("E_PARSE", "BOM not allowed")
    try:
        v = json.loads(
            text,
            object_pairs_hook=_pairs,
            parse_float=_reject_float,
            parse_int=_parse_int,
            parse_constant=_reject_constant,
            strict=True,
        )
    except QVError:
        raise
    except (ValueError, RecursionError) as exc:
        raise QVError("E_PARSE", str(exc))
    check_value(v)
    return v


_SHORT = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


def _ser_str(s: str) -> str:
    out = ['"']
    for ch in s:
        if ch in _SHORT:
            out.append(_SHORT[ch])
        elif ord(ch) < 0x20:
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _utf16_key(k: str) -> bytes:
    return k.encode("utf-16-be", errors="surrogatepass")


def _ser(v: Any, out: list[str]) -> None:
    if v is True:
        out.append("true")
    elif v is False:
        out.append("false")
    elif isinstance(v, int):
        out.append(str(v))
    elif isinstance(v, str):
        out.append(_ser_str(v))
    elif isinstance(v, list):
        out.append("[")
        for i, x in enumerate(v):
            if i:
                out.append(",")
            _ser(x, out)
        out.append("]")
    elif isinstance(v, dict):
        out.append("{")
        for i, k in enumerate(sorted(v, key=_utf16_key)):
            if i:
                out.append(",")
            out.append(_ser_str(k))
            out.append(":")
            _ser(v[k], out)
        out.append("}")
    else:
        raise QVError("E_PARSE", f"cannot serialise {type(v).__name__}")


def canonical_text(v: Any) -> str:
    check_value(v)
    out: list[str] = []
    _ser(v, out)
    return "".join(out)


def jcs(v: Any) -> bytes:
    """JCS(v): the RFC 8785 canonical UTF-8 bytes of v under QV-JSON."""
    return canonical_text(v).encode("utf-8")
