"""QV-34 §10.2 JSON Lines adapter over the independent Python operations.

This is an offline conformance interface, not a network service. File references
are resolved through an explicitly selected tree descriptor; neither symlinks nor
special files are followed. No expected vector output is read by this module.
"""
from __future__ import annotations

import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import BinaryIO

from . import IMPL_NAME, __version__
from .election import verify_bundle
from .errors import NotImplementedOp, QVError
from .logio import MAX_JSON_BYTES, parse_json
from .ops import OPS, run_op
from .manifest import validate as validate_manifest

MAX_REQUEST_BYTES = 1 << 20
MAX_RESPONSE_BYTES = 4 << 20
HELLO = {"hello": "qv-conformance", "format_version": 1, "protocol_version": "qv1"}


class TreeReader:
    """Read regular files beneath a pinned directory without path races."""

    def __init__(self, root: Path):
        root = root.resolve(strict=True)
        if not root.is_dir():
            raise ValueError("adapter tree must be a directory")
        self.fd = None
        if os.open in os.supports_dir_fd and hasattr(os, "O_NOFOLLOW") and hasattr(os, "O_DIRECTORY"):
            self.fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def read(self, ref: dict, *, replace: bool = False):
        allowed = {"path", "replace"} if replace else {"path"}
        if not isinstance(ref, dict) or not {"path"} <= ref.keys() <= allowed:
            raise QVError("E_SCHEMA", "file reference requires path")
        name = ref["path"]
        if (not isinstance(name, str) or not 1 <= len(name) <= 4096
                or any(c in name for c in ("\\", ":", "\x00"))
                or any(p in ("", ".", "..") for p in name.split("/"))):
            raise QVError("E_SCHEMA", "file reference must be relative to the tree")
        if self.fd is None:
            raise NotImplementedOp("safe directory-relative file reads unavailable on this platform")
        parent = os.dup(self.fd)
        try:
            parts = name.split("/")
            for part in parts[:-1]:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                os.close(parent)
                parent = child
            fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            with os.fdopen(fd, "rb") as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                    raise QVError("E_SCHEMA", "file reference must be a regular file")
                doc = parse_json(stream.read(MAX_JSON_BYTES + 1))
        finally:
            os.close(parent)
        if "replace" in ref:
            if not isinstance(doc, dict) or not isinstance(ref["replace"], dict):
                raise QVError("E_SCHEMA", "board replacement must be an object")
            doc.update(ref["replace"])
        return doc


def _verification(op: str, inp: dict, tree: TreeReader, content_only: bool) -> dict:
    if op == "verify.election":
        bundle = tree.read(inp)
        log = {"board": bundle["board"]} if isinstance(bundle, dict) and "board" in bundle else None
    else:
        if not {"bundle", "board"} <= inp.keys() <= {
                "bundle", "board", "receipts", "observed", "witnesses", "extraAuthorKeys"}:
            raise QVError("E_SCHEMA", "unknown/missing log input fields")
        bundle = tree.read(inp["bundle"])
        log = {k: v for k, v in inp.items() if k not in ("bundle", "board")}
        log["board"] = tree.read(inp["board"], replace=True)
    if not isinstance(bundle, dict):
        raise QVError("E_SCHEMA", "election bundle must be an object")
    report = verify_bundle(bundle, log=log, allow_no_log=content_only)
    # Log vectors explicitly distinguish nonfatal findings from their verdict.
    rejected = bool(report["codes"]) if op == "log.verify_election" else report["verdict"] == "FAIL"
    if rejected:
        return {"ok": False, "error": report["codes"][0] if report["codes"] else "E_VERIFY",
                "failed_checks": sorted(k for k, v in report["checks"].items() if v == "fail"),
                "details": report}
    keys = ("verdict", "checks") if op == "log.verify_election" else ("verdict", "checks", "counts", "ctx_prefix", "results")
    return {"ok": True, "output": {k: report[k] for k in keys if k in report}, "details": report}


def dispatch(request: dict, tree: TreeReader, *, content_only: bool = False) -> dict:
    """Handle one request; protocol values remain checked by their own modules."""
    request_id = None
    if isinstance(request, dict):
        value = request.get("id")
        if isinstance(value, str) and 1 <= len(value) <= 256:
            request_id = value
    prefix = {"id": request_id} if request_id is not None else {}
    if (not isinstance(request, dict) or request.keys() != {"id", "op", "input"}
            or request_id is None or not isinstance(request["op"], str)
            or not re.fullmatch(r"[a-z][a-z0-9_.-]{0,127}", request["op"])
            or not isinstance(request["input"], dict)):
        return {**prefix, "ok": False, "error": "E_SCHEMA"}
    try:
        op, inp = request["op"], request["input"]
        if op in OPS:
            # The pre-existing vector dispatcher consumes trusted fixture sizes.
            # Enforce protocol loop bounds before exposing it to streamed input.
            if op == "dkg.adjudicate" and (type(inp.get("n")) is not int
                    or type(inp.get("t")) is not int or not 1 <= inp["t"] <= inp["n"] <= 32):
                raise QVError("E_SCHEMA", "DKG requires 1 <= t <= n <= 32")
            if op in ("ballot.encrypt", "ballot.verify", "benaloh.verify_spoiled") and "params" in inp:
                validate_manifest(inp["params"]["manifest"])
            actual = run_op(op, inp)
            # Do not reflect exception details or supplied test secrets.
            result = {k: actual[k] for k in ("ok", "output", "error") if k in actual}
        elif op in ("verify.election", "log.verify_election"):
            result = _verification(op, inp, tree, content_only is True)
        else:
            raise NotImplementedOp(op)
    except NotImplementedOp:
        result = {"ok": False, "error": "ERR_UNSUPPORTED_OP"}
    except QVError as exc:
        result = {"ok": False, "error": exc.code}
    except OSError:
        result = {"ok": False, "error": "E_IO"}
    except (KeyError, TypeError, ValueError, ArithmeticError, RecursionError):
        result = {"ok": False, "error": "E_SCHEMA"}
    except Exception:
        print("adapter operation failed internally", file=sys.stderr)
        result = {"ok": False, "error": "ERR_INTERNAL"}
    return {**prefix, **result}


def serve(tree: TreeReader, source: BinaryIO, sink: BinaryIO, *, content_only: bool = False) -> int:
    """Serve until EOF. Oversized framing or a bad handshake ends the session."""
    def write(value):
        raw = json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode("ascii")
        if len(raw) > MAX_RESPONSE_BYTES:
            value = {**({"id": value["id"]} if "id" in value else {}),
                     "ok": False, "error": "ERR_RESPONSE_TOO_LARGE"}
            raw = json.dumps(value, separators=(",", ":")).encode("ascii")
        sink.write(raw + b"\n")
        sink.flush()

    ready = False
    while True:
        line = source.readline(MAX_REQUEST_BYTES + 1)
        if not line:
            return 0 if ready else 2
        if len(line) > MAX_REQUEST_BYTES:
            write({"ok": False, "error": "ERR_REQUEST_TOO_LARGE"})
            return 2
        try:
            value = parse_json(line)
        except QVError:
            write({"ok": False, "error": "E_PARSE"})
            if not ready:
                return 2
            continue
        if not ready:
            if (value != HELLO or not isinstance(value, dict)
                    or type(value.get("format_version")) is not int):
                write({"ok": False, "error": "ERR_PROTOCOL"})
                return 2
            write({"impl": IMPL_NAME, "version": __version__, "protocol_versions": ["qv1"],
                   "profiles": []})
            ready = True
        else:
            write(dispatch(value, tree, content_only=content_only))


def main_adapter(root: str, *, content_only: bool = False) -> int:
    try:
        tree = TreeReader(Path(root))
    except (OSError, ValueError):
        print("adapter requires an accessible vector tree directory", file=sys.stderr)
        return 2
    try:
        return serve(tree, sys.stdin.buffer, sys.stdout.buffer, content_only=content_only)
    except (BrokenPipeError, OSError):
        print("adapter stream failed", file=sys.stderr)
        return 2
    finally:
        tree.close()
