"""Independent QV-18 byte framing and authenticated signed-note primitives.

Wire widths follow board/NOTES.md 1-2 and the shipped public fixtures; QV-18
does not specify those widths itself. Checkpoints use C2SP signed-note and
tlog-checkpoint v1.0.0; witness signatures use tlog-cosignature v1.0.0 (0x04).
Only the existing strict Ed25519 implementation is used. Parsing a header does
not authorize its author; parsing a receipt does not establish inclusion.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re

from . import ed25519
from .errors import QVError

MAX_SAFE = (1 << 53) - 1
MAX_NOTE_BYTES = 1 << 20
MAX_SIGNATURES = 128
ORIGIN = re.compile(r"quietvote/v1/[a-z2-7]{26}\Z")
HEX_KEY = re.compile(r"[0-9a-f]{64}\Z")
ENTRY_TYPES = frozenset({
    "manifest", "trustee_accept", "trustee_decline", "ceremony_start",
    "dkg_round1", "dkg_round2", "dkg_complaint", "dkg_justification",
    "key_confirm", "joint_key", "keycheck", "ceremony_abort", "roll_commit",
    "election_open", "ballot", "ballot_audit", "notice", "election_close",
    "tally_aggregate", "decryption_share", "tally_result",
    "trustee_compromise_report", "key_destruction", "anchor", "audit_close",
    "election_cancel", "pause", "resume", "invalidate", "security_notice",
})


def _error(detail: str, code: str = "E_LOG_FORMAT") -> QVError:
    return QVError(code, detail)


def _uint(value: object) -> bool:
    return type(value) is int and 0 <= value <= MAX_SAFE


def b64_decode(value: str, length: int | None = None, url: bool = False,
               max_bytes: int = 1 << 20) -> bytes:
    """Decode one canonical base64 value, with an allocation bound.

    Standard base64 requires padding. URL transport is unpadded. Re-encoding
    rejects nonzero unused pad bits as well as alternate alphabets/whitespace.
    """
    if (not isinstance(value, str) or type(max_bytes) is not int or max_bytes < 0
            or len(value) > 4 * ((max_bytes + 2) // 3)):
        raise _error("base64 value exceeds its bound or is not text")
    if length is not None and (type(length) is not int or length < 0):
        raise _error("invalid base64 length bound")
    try:
        ascii_value = value.encode("ascii")
        if url:
            if re.fullmatch(rb"[A-Za-z0-9_-]*", ascii_value) is None:
                raise _error("noncanonical base64url alphabet or padding")
            raw = base64.b64decode(ascii_value + b"=" * (-len(value) % 4),
                                   altchars=b"-_", validate=True)
            encoded = base64.urlsafe_b64encode(raw).rstrip(b"=")
        else:
            raw = base64.b64decode(ascii_value, validate=True)
            encoded = base64.b64encode(raw)
    except (UnicodeEncodeError, binascii.Error, ValueError) as exc:
        raise _error("invalid base64") from exc
    if encoded != ascii_value or len(raw) > max_bytes:
        raise _error("noncanonical or oversized base64")
    if length is not None and len(raw) != length:
        raise _error("wrong decoded base64 length")
    return raw


def key_id(pk: bytes) -> bytes:
    """QV-18 board-local author identifier, not a signed-note four-byte id."""
    if not isinstance(pk, bytes) or len(pk) != 32:
        raise _error("author public key must be 32 bytes")
    return hashlib.sha256(b"QV-KEYID-v1\0ed25519\0" + pk).digest()


def body_digest(body: bytes) -> bytes:
    if not isinstance(body, bytes):
        raise _error("entry body must be bytes")
    return hashlib.sha256(b"qv/body/v1\0" + body).digest()


def decode_header(raw: bytes) -> dict:
    """Parse the unique v1 header encoding; never infer authorization from it."""
    if not isinstance(raw, bytes) or len(raw) > 2048:
        raise _error("header is not bytes or exceeds 2 KiB")
    pos = 0

    def take(n: int) -> bytes:
        nonlocal pos
        if n > len(raw) - pos:
            raise _error("truncated entry header")
        value = raw[pos:pos + n]
        pos += n
        return value

    def number(width: int) -> int:
        value = int.from_bytes(take(width), "big")
        if value > MAX_SAFE:
            raise _error("header integer exceeds exact JSON range")
        return value

    def string() -> str:
        try:
            return take(number(2)).decode("utf-8", "strict")
        except UnicodeDecodeError as exc:
            raise _error("header string is not UTF-8") from exc

    version = number(2)
    origin, entry_type = string(), string()
    author = take(32)
    algorithm = string()
    nonce = take(16)
    created_at, body_len = number(8), number(8)
    digest = take(32)
    ref_count = number(2)
    # Check against remaining bytes before walking an attacker-selected count.
    if ref_count > (len(raw) - pos - 66) // 8:
        raise _error("truncated reference list")
    refs = [number(8) for _ in range(ref_count)]
    unsigned = raw[:pos]
    signature_length = number(2)
    signature = take(signature_length)
    if pos != len(raw):
        raise _error("trailing entry header bytes")
    if version != 1 or ORIGIN.fullmatch(origin) is None:
        raise _error("unsupported header version or origin")
    if entry_type not in ENTRY_TYPES or algorithm != "ed25519":
        raise _error("unsupported entry type or author algorithm")
    if body_len > 1 << 20 or signature_length != 64:
        raise _error("body or signature length outside v1 limits")
    if refs != sorted(set(refs)):
        raise _error("header references must be unique and ascending")
    return {"v": version, "origin": origin, "type": entry_type,
            "author": author, "author_alg": algorithm, "author_nonce": nonce,
            "created_at": created_at, "body_len": body_len,
            "body_digest": digest, "refs": refs, "sig": signature,
            "signed_bytes": b"QV-ENTRY-v1\0" + unsigned}


def _name_ok(name: object) -> bool:
    if not isinstance(name, str) or not name:
        return False
    try:
        return (len(name.encode("utf-8")) <= 255
                and not any(c.isspace() or ord(c) < 32 or c == "+" for c in name))
    except UnicodeEncodeError:
        return False


def _note_key_id(name: str, algorithm: int, pk: bytes) -> bytes:
    return hashlib.sha256(name.encode("utf-8") + b"\n" + bytes([algorithm]) + pk).digest()[:4]


def parse_checkpoint(note: str, log_pk: bytes, expected_origin: str) -> dict:
    """Return a checkpoint only after authenticating its exact note text.

    Unknown signatures are retained for a caller's trusted witness policy.
    Duplicate cosignature lines do not gain quorum votes (``witness_times``).
    """
    code = "E_LOG_CHECKPOINT"
    try:
        if (not isinstance(note, str) or len(note) > MAX_NOTE_BYTES
                or not isinstance(log_pk, bytes) or len(log_pk) != 32
                or not isinstance(expected_origin, str)):
            raise _error("invalid checkpoint input", code)
        encoded_note = note.encode("utf-8", "strict")
        if (len(encoded_note) > MAX_NOTE_BYTES or not note.endswith("\n")
                or any(ord(c) < 32 and c != "\n" for c in note)):
            raise _error("checkpoint has noncanonical text", code)
        parts = note.split("\n\n")
        if len(parts) != 2:
            raise _error("checkpoint needs exactly one signature separator", code)
        body, signed_lines = parts
        lines = body.split("\n")
        if len(lines) != 3:
            raise _error("checkpoint extensions are unsupported by QV-18", code)
        origin, decimal_size, root_text = lines
        if origin != expected_origin or not _name_ok(origin):
            raise _error("checkpoint origin differs from the trusted log", code)
        if re.fullmatch(r"0|[1-9][0-9]{0,15}", decimal_size) is None:
            raise _error("checkpoint size is not canonical decimal", code)
        size = int(decimal_size)
        if size > MAX_SAFE:
            raise _error("checkpoint size exceeds exact JSON range", code)
        root = b64_decode(root_text, 32)
        text = body + "\n"
        sig_lines = signed_lines[:-1].split("\n")
        if not 1 <= len(sig_lines) <= MAX_SIGNATURES:
            raise _error("checkpoint signature count outside limits", code)
        expected_id = _note_key_id(origin, 1, log_pk)
        authenticated = False
        signatures = []
        for line in sig_lines:
            fields = line.split(" ")
            if len(fields) != 3 or fields[0] != "—" or not _name_ok(fields[1]):
                raise _error("malformed checkpoint signature line", code)
            name = fields[1]
            payload = b64_decode(fields[2], max_bytes=8192)
            if len(payload) < 4:
                raise _error("checkpoint signature lacks key identifier", code)
            signatures.append((name, payload))
            if name == origin and payload[:4] == expected_id:
                if not ed25519.verify(log_pk, text.encode("utf-8"), payload[4:]):
                    raise _error("invalid signature from the trusted log key", code)
                authenticated = True
        if not authenticated:
            raise _error("checkpoint lacks a valid trusted log signature", code)
        return {"origin": origin, "size": size, "root": root, "text": text,
                "signatures": signatures}
    except (UnicodeEncodeError, QVError) as exc:
        if isinstance(exc, QVError) and exc.code == code:
            raise
        raise _error("invalid checkpoint encoding", code) from exc


def witness_observations(checkpoint: dict, witnesses: list[dict]) -> dict[str, list[int]]:
    """All distinct authenticated type-0x04 timestamps, grouped by public key.

    The caller chooses trusted witnesses. Unknown, invalid, duplicate, and
    unsupported signature lines cannot add quorum votes. Retaining each valid
    time makes cross-checkpoint monotonicity checks independent of note order.
    Aliases for the same public key remain one witness.
    """
    if (not isinstance(checkpoint, dict) or not isinstance(witnesses, list)
            or not isinstance(checkpoint.get("text"), str)
            or not isinstance(checkpoint.get("signatures"), list)):
        raise _error("invalid witness input", "E_LOG_WITNESS")
    trusted = {}
    for witness in witnesses:
        if not isinstance(witness, dict):
            continue
        name, key = witness.get("name"), witness.get("pk")
        if (not _name_ok(name) or not isinstance(key, str) or HEX_KEY.fullmatch(key) is None):
            continue
        pk = bytes.fromhex(key)
        if not ed25519.valid_public_key(pk):
            continue
        trusted[(name, _note_key_id(name, 4, pk))] = (key, pk)
    result: dict[str, set[int]] = {}
    for item in checkpoint["signatures"]:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        name, payload = item
        if not isinstance(name, str) or not isinstance(payload, bytes) or len(payload) != 76:
            continue
        key = trusted.get((name, payload[:4]))
        if key is None:
            continue
        timestamp = int.from_bytes(payload[4:12], "big")
        if timestamp > MAX_SAFE:
            continue
        try:
            msg = f"cosignature/v1\ntime {timestamp}\n{checkpoint['text']}".encode("utf-8")
        except UnicodeEncodeError:
            continue
        if ed25519.verify(key[1], msg, payload[12:]):
            result.setdefault(key[0], set()).add(timestamp)
    return {key: sorted(timestamps) for key, timestamps in result.items()}


def witness_times(checkpoint: dict, witnesses: list[dict]) -> dict[str, int]:
    """Earliest authenticated timestamp per distinct trusted public key.

    A later cosignature or a reordered duplicate cannot erase an earlier
    authenticated observation. Use ``witness_observations`` when every observed
    time is required, for example to exclude non-monotone witnesses.
    """
    return {key: times[0] for key, times in witness_observations(checkpoint, witnesses).items()}


def parse_receipt(receipt: dict, log_pk: bytes, expected_origin: str) -> dict:
    """Authenticate a promise only; callers must separately check inclusion.

    ``inclusion`` is unsigned auxiliary evidence and is deliberately returned
    unchanged. Its failure cannot erase an otherwise authentic log promise.
    Deadline ordering is structural; elapsed MMD is not decided without a
    trusted clock. QV-18's fixed 30-second issuance policy belongs to admission.
    """
    code = "E_LOG_RECEIPT"
    required = {"origin", "seq", "leaf_hash", "sequenced_at", "checkpoint_deadline", "promise_sig"}
    try:
        if (not isinstance(receipt, dict) or not required <= set(receipt) <= required | {"inclusion"}
                or not isinstance(log_pk, bytes) or len(log_pk) != 32):
            raise _error("receipt has an invalid schema", code)
        origin = receipt["origin"]
        if not isinstance(origin, str) or origin != expected_origin or ORIGIN.fullmatch(origin) is None:
            raise _error("receipt origin differs from the trusted log", code)
        if not all(_uint(receipt[k]) for k in ("seq", "sequenced_at", "checkpoint_deadline")):
            raise _error("receipt numbers must be exact nonnegative integers", code)
        if receipt["checkpoint_deadline"] < receipt["sequenced_at"]:
            raise _error("receipt deadline precedes sequencing", code)
        leaf = b64_decode(receipt["leaf_hash"], 32)
        signature = b64_decode(receipt["promise_sig"], 64)
        origin_bytes = origin.encode("ascii")
        signed = (b"QV-RECEIPT-v1\0" + len(origin_bytes).to_bytes(2, "big") + origin_bytes
                  + receipt["seq"].to_bytes(8, "big") + leaf
                  + receipt["sequenced_at"].to_bytes(8, "big")
                  + receipt["checkpoint_deadline"].to_bytes(8, "big"))
        if not ed25519.verify(log_pk, signed, signature):
            raise _error("receipt promise signature is invalid", code)
        result = {"seq": receipt["seq"], "leaf": leaf, "origin": origin,
                  "sequenced_at": receipt["sequenced_at"],
                  "checkpoint_deadline": receipt["checkpoint_deadline"]}
        if "inclusion" in receipt:
            result["inclusion"] = receipt["inclusion"]
        return result
    except QVError as exc:
        if exc.code == code:
            raise
        raise _error("invalid receipt encoding", code) from exc
