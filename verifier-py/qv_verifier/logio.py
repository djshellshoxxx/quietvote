"""Bounded offline JSON loading for election/log evidence and vector references.

Board transport permits null redacted bodies. Protocol bodies still go through
QV-JSON in the existing verifier. No network, archive extraction or implicit paths.
"""
from __future__ import annotations

import json
from pathlib import Path

from .errors import QVError

MAX_JSON_BYTES = 64 << 20


def load_json(path: Path):
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out:
                raise QVError('E_PARSE', f'duplicate JSON key: {k}')
            out[k] = v
        return out
    def forbidden(value):
        raise QVError('E_PARSE', f'non-integer JSON number: {value}')
    def integer(value):
        if value == '-0' or len(value) > 17:
            raise QVError('E_PARSE', 'noncanonical/oversized integer')
        parsed = int(value)
        if abs(parsed) > (1 << 53) - 1:
            raise QVError('E_PARSE', 'unsafe JSON integer')
        return parsed
    with path.open('rb') as f:
        raw = f.read(MAX_JSON_BYTES + 1)
    if len(raw) > MAX_JSON_BYTES:
        raise QVError('E_PARSE', f'JSON exceeds {MAX_JSON_BYTES} byte input limit')
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                          parse_float=forbidden, parse_constant=forbidden, parse_int=integer)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise QVError('E_PARSE', f'invalid JSON: {exc}') from exc


def vector_input(root: Path, inp: dict) -> tuple[dict, dict]:
    """Resolve file references beneath the selected vector tree, never outside it."""
    if not isinstance(inp, dict) or not {'bundle', 'board'} <= inp.keys() <= {'bundle', 'board', 'receipts', 'observed', 'witnesses', 'extraAuthorKeys'}:
        raise QVError('E_SCHEMA', 'unknown/missing log vector input fields')
    base = root.resolve()
    def read(ref, replace=False):
        allowed = {'path', 'replace'} if replace else {'path'}
        if not isinstance(ref, dict) or not {'path'} <= ref.keys() <= allowed or not isinstance(ref['path'], str):
            raise QVError('E_SCHEMA', 'file reference requires path')
        rel = Path(ref['path'])
        if rel.is_absolute() or '..' in rel.parts:
            raise QVError('E_SCHEMA', 'file reference must remain within vector tree')
        path = (base / rel).resolve()
        if not path.is_relative_to(base):
            raise QVError('E_SCHEMA', 'file reference escapes vector tree')
        doc = load_json(path)
        if 'replace' in ref:
            if not isinstance(doc, dict) or not isinstance(ref['replace'], dict):
                raise QVError('E_SCHEMA', 'board replacement must be an object')
            doc.update(ref['replace'])
        return doc
    bundle = read(inp['bundle'])
    evidence = {k: v for k, v in inp.items() if k not in ('bundle', 'board')}
    evidence['board'] = read(inp['board'], replace=True)
    return bundle, evidence
