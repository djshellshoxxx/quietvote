"""Read the uncompressed reference-server QV-18 §12 export, without extraction.

Archive checksums detect corruption. Only the existing election/board verifier
checks signatures, author authority, Merkle history and tally evidence.
"""
from __future__ import annotations

import hashlib
import io
import os
import re
import stat
from pathlib import Path
from typing import BinaryIO

from . import qvjson
from .errors import QVError
from .logio import MAX_JSON_BYTES, parse_json
from .logwire import MAX_NOTE_BYTES, b64_decode, body_digest, decode_header

_BLOCK = 512
_MAX_FILES = 10_000
_MAX_ENTRIES = 100_000
_MAX_LINE = 2 << 20  # Includes a base64url-encoded, at most 1 MiB signed body.
_BOARD_FIELDS = ('format', 'origin', 'created_at', 'tree_size', 'root_b64', 'generator', 'spec')
_REQUIRED = {'bundle.json', 'election.json', 'log/entries.jsonl', 'witness/policy.json',
             'redactions.json', 'SHA256SUMS'}
_CHECKPOINT = re.compile(r'log/checkpoints/(0|[1-9][0-9]{0,15})\.txt')


def _invalid(detail: str) -> QVError:
    return QVError('E_ARCHIVE', detail)


def _octal(field: bytes) -> int:
    digits = field.rstrip(b'\0 ').lstrip(b' ')
    if not re.fullmatch(b'[0-7]+', digits):
        raise _invalid('invalid ustar integer')
    return int(digits, 8)


def _members(stream: BinaryIO) -> dict[str, bytes]:
    """Read only regular, explicitly supported members; bound all allocations."""
    files = {}
    consumed = 0
    while True:
        header = stream.read(_BLOCK)
        consumed += _BLOCK
        if len(header) != _BLOCK or consumed + _BLOCK > MAX_JSON_BYTES:
            raise _invalid('truncated or oversized archive')
        if header == bytes(_BLOCK):
            if stream.read(_BLOCK) != bytes(_BLOCK):
                raise _invalid('missing second end block')
            consumed += _BLOCK
            while tail := stream.read(8192):
                consumed += len(tail)
                if consumed > MAX_JSON_BYTES or len(tail) % _BLOCK or any(tail):
                    raise _invalid('invalid trailing archive data')
            break
        if len(files) >= _MAX_FILES:
            raise _invalid('too many archive members')
        checksum = sum(header[:148]) + 8 * 32 + sum(header[156:])
        if checksum != _octal(header[148:156]):
            raise _invalid('ustar header checksum mismatch')
        if (header[257:265] != b'ustar\x0000' or header[156:157] not in (b'0', b'\0')
                or any(header[157:257]) or any(header[345:500])):
            raise _invalid('expected an unprefixed regular ustar member')
        name = header[:100].rstrip(b'\0').decode('ascii')
        if name not in _REQUIRED and name != 'README.txt' and not _CHECKPOINT.fullmatch(name):
            raise _invalid('unsupported archive member')
        if name in files:
            raise _invalid('duplicate archive member')
        size = _octal(header[124:136])
        if ((name == 'bundle.json' and size > 65536)
                or (name == 'SHA256SUMS' and size > _MAX_FILES * 167)
                or (_CHECKPOINT.fullmatch(name) and size > MAX_NOTE_BYTES)):
            raise _invalid('archive metadata exceeds its byte limit')
        padding = -size % _BLOCK
        consumed += size + padding
        if consumed + 2 * _BLOCK > MAX_JSON_BYTES:
            raise _invalid('archive exceeds byte limit')
        data = stream.read(size)
        if len(data) != size or stream.read(padding) != bytes(padding):
            raise _invalid('truncated member or invalid padding')
        files[name] = data
    if not _REQUIRED.issubset(files):
        raise _invalid('missing required archive member')

    # Bind each byte string once, including the optional README and every note.
    sums = files.pop('SHA256SUMS')
    pending = set(files)
    for line in io.BytesIO(sums):
        match = re.fullmatch(rb'([0-9a-f]{64})  ([A-Za-z0-9._/-]{1,100})\n', line)
        if not match:
            raise _invalid('invalid SHA256SUMS row')
        name = match[2].decode('ascii')
        if name not in pending or hashlib.sha256(files[name]).hexdigest() != match[1].decode('ascii'):
            raise _invalid('unknown, duplicate or mismatched member checksum')
        pending.remove(name)
    if pending:
        raise _invalid('missing member checksum')
    return files


def _election_records(raw: bytes, election: dict, tree_size: int) -> tuple[list, list]:
    copies = election['log']
    if not isinstance(copies, list) or len(copies) > tree_size:
        raise _invalid('invalid convenience log')
    declared = {}
    previous = 0
    for copy in copies:
        if (not isinstance(copy, dict) or set(copy) != {'seq', 'entry'}
                or type(copy['seq']) is not int or not previous < copy['seq'] < tree_size):
            raise _invalid('invalid or duplicate convenience sequence')
        previous = copy['seq']
        declared[previous] = copy['entry']

    entries, records = [], []
    source = io.BytesIO(raw)
    while line := source.readline(_MAX_LINE + 1):
        seq = len(entries)
        if len(line) > _MAX_LINE or not line.endswith(b'\n') or seq >= tree_size:
            raise _invalid('invalid entry line framing or count')
        row = parse_json(line)
        if (not isinstance(row, dict) or set(row) != {'seq', 'header_b64u', 'body_b64u'}
                or type(row['seq']) is not int or row['seq'] != seq):
            raise _invalid('entry sequence or shape mismatch')
        header = decode_header(b64_decode(row['header_b64u'], url=True, max_bytes=2048))
        entries.append(row)
        if seq == 0 and header['type'] != 'manifest':
            raise _invalid('entry zero must commit to the manifest')
        if row['body_b64u'] is None:
            if seq != 0:
                if seq in declared:
                    raise _invalid('convenience log supplies an absent archive body')
                continue
            body = qvjson.jcs(election['manifest'])
        else:
            body = b64_decode(row['body_b64u'], url=True)
        if len(body) != header['body_len'] or body_digest(body) != header['body_digest']:
            raise _invalid('entry body differs from header commitment')
        if seq == 0:
            if body != qvjson.jcs(election['manifest']):
                raise _invalid('manifest differs from entry zero')
            continue
        record = qvjson.parse(body)
        if seq in declared and qvjson.jcs(declared[seq]) != body:
            raise _invalid('convenience record differs from board body')
        records.append({'seq': seq, 'entry': record})
    if len(entries) != tree_size:
        raise _invalid('entry count differs from descriptor')
    return entries, records


def load_archive(path: Path) -> dict:
    """Return the full JSON-equivalent verifier input, retaining every board row."""
    flags = os.O_RDONLY | getattr(os, 'O_NONBLOCK', 0) | getattr(os, 'O_BINARY', 0)
    with os.fdopen(os.open(path, flags), 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_JSON_BYTES:
            raise _invalid('expected a bounded regular archive file')
        files = _members(stream)
    descriptor = qvjson.parse(files['bundle.json'])
    policy = qvjson.parse(files['witness/policy.json'])
    election = qvjson.parse(files['election.json'])
    if (not isinstance(descriptor, dict) or not set(_BOARD_FIELDS).issubset(descriptor)
            or descriptor['format'] != 'qv-bundle/v1' or descriptor['spec'] != 'QV-18'
            or type(descriptor['tree_size']) is not int or not 1 <= descriptor['tree_size'] <= _MAX_ENTRIES):
        raise _invalid('invalid board descriptor')
    if not isinstance(election, dict) or set(election) != {'manifest', 'manifest_hash', 'roll', 'log'}:
        raise _invalid('invalid reference-server election descriptor')
    log_pk = b64_decode(descriptor.get('log_pk_b64u'), 32, url=True)
    if (not isinstance(policy, dict) or b64_decode(policy.get('log_pk_b64'), 32) != log_pk
            or log_pk.hex() != election['manifest']['body']['bb']['log_pk']):
        raise _invalid('archive log keys disagree')
    raw = files['log/entries.jsonl']
    if hashlib.sha256(raw).hexdigest() != descriptor.get('entries_sha256'):
        raise _invalid('entry file differs from descriptor digest')
    entries, records = _election_records(raw, election, descriptor['tree_size'])
    redactions = qvjson.parse(files['redactions.json'])
    missing = {row['seq'] for row in entries if row['body_b64u'] is None}
    if (not isinstance(redactions, list) or len(redactions) != len(missing)
            or any(not isinstance(row, dict) or type(row.get('seq')) is not int for row in redactions)
            or {row['seq'] for row in redactions} != missing):
        raise _invalid('redaction list differs from missing board bodies')
    notes = []
    for name, data in files.items():
        if match := _CHECKPOINT.fullmatch(name):
            note = data.decode('utf-8')
            lines = note.split('\n', 2)
            if len(lines) != 3 or lines[:2] != [descriptor['origin'], match[1]]:
                raise _invalid('checkpoint filename or origin disagrees with its note')
            notes.append((int(match[1]), note))
    board = {field: descriptor[field] for field in _BOARD_FIELDS}
    board.update(entries=entries, policy=policy, checkpoints=[note for _, note in sorted(notes)],
                 redactions=redactions, receipts=[])
    return {**election, 'log': records, 'board': board}
