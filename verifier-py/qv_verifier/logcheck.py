"""Independent QV-18 evidence verification over the stable suite-v1 records.

Sources: QV-18, board NOTES 1-9, protocol NOTES X21-X30, and shipped wire vectors.
Legacy control notices follow ADR-027 / N-12 and protocol NOTES X31-X34.
The core verifier remains responsible for record/proof/tally semantics; notices
never relax a witness gate or change the manifest schedule.
"""
from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timezone
from typing import Any

from . import ballot, ed25519, merkle, qvjson
from .errors import QVError
from .logwire import b64_decode, body_digest, decode_header, key_id, parse_checkpoint, parse_receipt, witness_observations
from .recordfields import hex_field

APPEND = 'chk.board.append_only'
WITNESS = 'chk.board.witness'
RECEIPTS = 'chk.receipts.sample'
TIME = 'chk.time.window'
MAX_ITEMS = 1 << 20
SAFE = (1 << 53) - 1
STABLE_RECORD_TYPES = frozenset({'manifest', 'marker', 'roll-commit', 'ballot', 'tally',
    'dkg-commit', 'dkg-dealing', 'dkg-shares', 'dkg-complaint', 'dkg-keyconf'})


def _uint(v: Any) -> bool:
    return type(v) is int and 0 <= v <= SAFE


def _object(v: Any, required: set[str], optional: set[str] = frozenset()) -> bool:
    return isinstance(v, dict) and required <= v.keys() <= required | optional


def _list(v: Any) -> bool:
    return isinstance(v, list) and len(v) <= MAX_ITEMS


def _body(entry: Any) -> dict:
    return entry.get('body', {}) if isinstance(entry, dict) and isinstance(entry.get('body'), dict) else {}


def _entry_type(record: Any) -> str | None:
    b = _body(record)
    kind = b.get('type')
    if not isinstance(kind, str):
        return None
    if kind == 'ballot':
        return {'cast': 'ballot', 'spoil': 'ballot_audit'}.get(record.get('intent'))
    if kind == 'control':
        return CONTROL_TYPES.get(b.get('action')) if isinstance(b.get('action'), str) else None
    if kind == 'marker':
        if not isinstance(b.get('name'), str):
            return None
        return {'dkg-open': 'ceremony_start', 'dkg-r1-open': 'notice', 'dkg-r1-close': 'notice',
                'dkg-r2-close': 'notice', 'dkg-r3-close': 'notice', 'dkg-final': 'joint_key',
                'election-open': 'election_open', 'election-close': 'election_close'}.get(b.get('name'))
    return {'manifest': 'manifest', 'dkg-commit': 'dkg_round1', 'dkg-dealing': 'dkg_round1',
            'dkg-shares': 'dkg_round2', 'dkg-complaint': 'dkg_complaint', 'dkg-keyconf': 'key_confirm',
            'roll-commit': 'roll_commit', 'tally': 'tally_result'}.get(kind)


CONTROL_TYPES = {
    'pause': 'notice', 'resume': 'notice', 'invalidate': 'notice',
    'security-notice': 'notice', 'witness-waiver': 'notice', 'extension': 'notice',
    'audit-close': 'audit_close', 'cancel': 'election_cancel', 'abort': 'ceremony_abort',
}

CONTROL_REASONS = frozenset({'KEY_COMPROMISE_TRUSTEE', 'KEY_COMPROMISE_STEWARD', 'PROOF_SYSTEM_FLAW', 'VERIFIER_FLAW',
    'CLIENT_COMPROMISE', 'SUPPLY_CHAIN', 'BOARD_EQUIVOCATION', 'BOARD_ROLLBACK', 'ROLL_INTEGRITY', 'TALLY_MISMATCH',
    'AVAILABILITY', 'OPERATOR_COMPROMISE', 'COERCION_EVIDENCE', 'OTHER'})


def advance_control_seq(current: int, body: dict) -> int:
    """After authentication, allow a legacy prefix, then require 1, 2, ... without downgrade."""
    if 'control_seq' not in body:
        if current == 0:
            return 0
        raise QVError('E_LOG_ORDER', 'unsequenced control after the sequenced-control boundary')
    value = body['control_seq']
    if type(value) is not int or not 1 <= value <= SAFE or current >= SAFE or value != current + 1:
        raise QVError('E_LOG_ORDER', 'control_seq must be exactly one greater than the last authenticated sequenced control')
    return value


def _control_action(record: dict, manifest_hash: bytes, coordinator: dict) -> str:
    """Authenticate legacy N-12 or sequenced B2-05 controls; reasons on the latter are catalog codes.

    The header must separately be signed by a coordinator key. Strict record
    signatures bind this election's manifest hash and count distinct keys only.
    """
    from .election import _coordinator_ok
    b = _body(record)
    def text_bound(value, maximum):
        # Adopted legacy JSON schema counts UTF-16 code units, as its existing
        # wire contract does; non-BMP scalars occupy two units.
        return isinstance(value, str) and len(value) <= maximum and sum(1 + (ord(c) > 0xffff) for c in value) <= maximum
    if (not _object(record, {'body', 'sigs'})
            or not _object(b, {'proto', 'type', 'action'}, {'reason', 'control_seq'})
            or b['proto'] != 'qv1-r255-sha2' or b['type'] != 'control'
            or not text_bound(b['action'], 32)
            or ('reason' in b and not text_bound(b['reason'], 256))
            or ('control_seq' in b and (type(b['control_seq']) is not int or not 1 <= b['control_seq'] <= SAFE
                or ('reason' in b and b['reason'] not in CONTROL_REASONS)))
            or not isinstance(record['sigs'], list) or not 1 <= len(record['sigs']) <= 8
            or any(not _object(sig, {'key', 'sig'}) or not hex_field(sig['key'], 32)
                   or not hex_field(sig['sig'], 64) for sig in record['sigs'])):
        raise QVError('E_LOG_FORMAT', 'malformed control record')
    try:
        qvjson.check_value(record)
    except QVError as exc:
        raise QVError('E_LOG_FORMAT', f'control is outside QV-JSON: {exc.detail}') from exc
    action = b['action']
    if action not in CONTROL_TYPES:
        raise QVError('E_LOG_BINDING', 'unrecognised control action')
    if not _coordinator_ok(manifest_hash, b, record['sigs'], coordinator):
        raise QVError('E_LOG_BINDING', 'control lacks distinct coordinator quorum signatures on this manifest')
    return action


def _author_keys(record: dict, manifest: dict, roll: set[str], extra: set[str]) -> set[str]:
    b = _body(record)
    kind = b.get('type')
    coord = set(manifest['coordinator']['keys'])
    trustees = {t['index']: t['sign_pk'] for t in manifest['trustees']}
    if kind in ('manifest', 'marker', 'roll-commit', 'control'):
        return coord
    if kind in ('dkg-commit', 'dkg-dealing', 'dkg-shares', 'dkg-complaint', 'dkg-keyconf'):
        field = 'accuser' if kind == 'dkg-complaint' else 'j' if kind == 'dkg-keyconf' else 'i'
        pk = trustees.get(b.get(field)) if _uint(b.get(field)) else None
        return {pk} if pk else set()
    if kind == 'ballot':
        return {b['voter']} if isinstance(b.get('voter'), str) and b['voter'] in roll else set()
    if kind == 'tally':
        sig = record.get('sig')
        return {sig['key']} if isinstance(sig, dict) and hex_field(sig.get('key'), 32) else set()
    return coord | set(trustees.values()) | extra


def _body_limit(kind: str, trustees: int) -> int:
    return min(1 << 20, {'manifest': 256 << 10, 'dkg_round1': 8 << 10,
        'dkg_round2': (16 << 10) * trustees, 'dkg_complaint': 4 << 10,
        'key_confirm': 1 << 10, 'joint_key': (8 << 10) * trustees,
        'roll_commit': 4 << 10, 'ballot': 256 << 10, 'ballot_audit': 256 << 10,
        'tally_result': 16 << 10, 'anchor': 64 << 10, 'tally_aggregate': 64 << 10,
        'decryption_share': 16 << 10, 'notice': 4 << 10}.get(kind, 1 << 10))


def _witness_policy(manifest: dict, evidence: dict, st: Any) -> list[dict]:
    bb = manifest['bb']
    ws = bb.get('witnesses')
    if ws is None:
        ws = evidence.get('witnesses', [])
        if ws:
            st.notes.append('Witness keys supplied by caller; absent from hash-pinned manifest')
    if not _list(ws):
        st.add(WITNESS, 'E_LOG_WITNESS', True, 'invalid trusted witness list')
        return []
    names, keys, trusted = set(), set(), []
    for w in ws:
        if (not _object(w, {'name', 'pk'}) or not isinstance(w['name'], str) or not w['name']
                or len(w['name'].encode('utf-8', errors='replace')) > 255
                or any(c.isspace() or c == '+' or ord(c) < 32 for c in w['name'])
                or not hex_field(w['pk'], 32) or not ed25519.valid_public_key(bytes.fromhex(w['pk']))
                or w['pk'] == bb['log_pk']):
            st.add(WITNESS, 'E_LOG_WITNESS', True, 'invalid trusted witness name/key')
            continue
        if w['name'] in names or w['pk'] in keys:
            st.add(WITNESS, 'E_LOG_WITNESS', True, 'duplicate trusted witness name/key')
            continue
        names.add(w['name']); keys.add(w['pk']); trusted.append(w)
    return trusted


def verify_into(bundle: dict, evidence: Any, st: Any) -> None:
    """Attach log findings to the existing core State without changing core classes."""
    st.skipped.discard(APPEND)
    st.notes[:] = [n for n in st.notes if n != 'witness cosignatures required but not supported by this skeleton']
    try:
        _verify(bundle, evidence, st)
    except (QVError, KeyError, TypeError, ValueError, OverflowError, UnicodeError) as exc:
        st.add(APPEND, 'E_LOG_FORMAT', True, f'log evidence unusable: {exc}')
        # A malformed export supplies no successful checkpoint/witness evidence.
        st.skip(WITNESS, RECEIPTS)


def _verify(bundle: dict, evidence: Any, st: Any) -> None:
    if not _object(evidence, {'board'}, {'receipts', 'observed', 'witnesses', 'extraAuthorKeys'}):
        raise QVError('E_LOG_FORMAT', 'log options must contain board and only known fields')
    board = evidence['board']
    required = {'format', 'origin', 'created_at', 'tree_size', 'root_b64', 'entries', 'checkpoints',
                'policy', 'redactions', 'generator', 'spec', 'receipts'}
    if (not _object(board, required) or board['format'] != 'qv-bundle/v1'
            or board['spec'] != 'QV-18' or not isinstance(board['generator'], str)
            or not all(_list(board[k]) for k in ('entries', 'checkpoints', 'redactions'))
            or not _uint(board['created_at']) or not _uint(board['tree_size'])
            or not isinstance(board['origin'], str)):
        raise QVError('E_LOG_FORMAT', 'malformed board export')
    for k in ('receipts', 'observed', 'extraAuthorKeys'):
        if not _list(evidence.get(k, [])):
            raise QVError('E_LOG_FORMAT', f'{k} must be a bounded array')
    if not _list(board.get('receipts', [])):
        raise QVError('E_LOG_FORMAT', 'board receipts must be an array')
    m = bundle['manifest']['body']
    bb = m['bb']
    log_pk = bytes.fromhex(bb['log_pk'])
    origin = board['origin']
    expected_origin = 'quietvote/v1/' + base64.b32encode(bytes.fromhex(m['election_id'])).decode('ascii').lower().rstrip('=')
    if origin != expected_origin or hashlib.sha256(origin.encode()).hexdigest() != bb['log_id']:
        st.add(APPEND, 'E_LOG_BINDING', True, 'export origin/log_id differs from hash-pinned election')
    policy = board['policy']
    if not _object(policy, {'log_pk_b64', 'witness_policy'}):
        raise QVError('E_LOG_FORMAT', 'invalid exported policy shape')
    copied = policy['witness_policy']
    if (not _object(copied, {'quorum', 'none_acknowledged', 'witnesses'}) or not _uint(copied['quorum'])
            or type(copied['none_acknowledged']) is not bool or not _list(copied['witnesses'])):
        raise QVError('E_LOG_FORMAT', 'invalid exported witness policy shape')
    for witness in copied['witnesses']:
        if (not _object(witness, {'name', 'alg', 'pk_b64'}) or not isinstance(witness['name'], str)
                or witness['alg'] not in ('ed25519', 'mldsa44')):
            raise QVError('E_LOG_FORMAT', 'invalid exported witness metadata')
        # Parse the untrusted copy's bytes, without granting either algorithm or
        # any copied key/quorum authority over the hash-pinned witness policy.
        b64_decode(witness['pk_b64'])
    if b64_decode(policy['log_pk_b64'], 32) != log_pk:
        st.add(APPEND, 'E_LOG_BINDING', True, 'export log public key differs from hash-pinned manifest')
    extra = evidence.get('extraAuthorKeys', [])
    if not all(hex_field(k, 32) and ed25519.valid_public_key(bytes.fromhex(k)) for k in extra):
        raise QVError('E_LOG_FORMAT', 'extra author keys must be strict Ed25519 public keys')
    extra = set(extra)
    records = {0: bundle['manifest']}
    for row in bundle['log']:
        if not isinstance(row, dict) or not _uint(row.get('seq')) or row['seq'] in records:
            st.add(APPEND, 'E_LOG_BINDING', True, 'duplicate/invalid protocol sequence')
            continue
        records[row['seq']] = row.get('entry')
    entries = board['entries']
    if board['tree_size'] != len(entries) or set(records) != set(range(len(entries))):
        st.add(APPEND, 'E_LOG_BINDING', True, 'protocol and board entries must correspond one-to-one')
    redacted = set()
    for red in board['redactions']:
        if (not _object(red, {'seq', 'redacted_at', 'reason'}) or not _uint(red['seq'])
                or not _uint(red['redacted_at']) or not isinstance(red['reason'], str) or red['seq'] >= len(entries)
                or red['seq'] in redacted):
            raise QVError('E_LOG_FORMAT', 'invalid/duplicate redaction sequence')
        redacted.add(red['seq'])
    leaves, headers = [], {}
    nonces, cardinality = set(), set()
    markers = {b.get('name'): seq for seq, r in records.items() if (b := _body(r)).get('type') == 'marker'}
    rollseq = [s for s, r in records.items() if _body(r).get('type') == 'roll-commit']
    tallies = [s for s, r in records.items() if _body(r).get('type') == 'tally']
    op, cl = markers.get('election-open'), markers.get('election-close')
    control_seq = 0
    for seq, entry in enumerate(entries):
        try:
            if not _object(entry, {'seq', 'header_b64u', 'body_b64u'}) or entry['seq'] != seq or type(entry['seq']) is not int:
                raise QVError('E_LOG_FORMAT', f'entry {seq}: malformed or non-gapless seq')
            raw = b64_decode(entry['header_b64u'], url=True, max_bytes=2048)
            leaves.append(merkle.leaf_hash(raw))
            h = decode_header(raw)
            headers[seq] = h
            if h['origin'] != origin:
                raise QVError('E_LOG_BINDING', f'entry {seq}: wrong origin')
            record = records.get(seq)
            if not isinstance(record, dict):
                raise QVError('E_LOG_BINDING', f'entry {seq}: no protocol record')
            wanted = qvjson.jcs(record)
            if h['body_len'] != len(wanted) or h['body_digest'] != body_digest(wanted):
                raise QVError('E_LOG_BINDING', f'entry {seq}: digest/length differs from protocol record')
            if entry['body_b64u'] is None:
                if seq not in redacted:
                    raise QVError('E_LOG_FORMAT', f'entry {seq}: unlisted redaction')
                st.notes.append(f'Entry {seq} redacted in board; canonical body supplied and authenticated by protocol view')
            elif b64_decode(entry['body_b64u'], url=True) != wanted:
                raise QVError('E_LOG_BINDING', f'entry {seq}: body is not exact JCS of protocol record')
            if len(wanted) > _body_limit(h['type'], m['n']):
                raise QVError('E_LOG_FORMAT', f'entry {seq}: per-type body limit')
            action = _control_action(record, bytes.fromhex(bundle['manifest_hash']), m['coordinator']) if _body(record).get('type') == 'control' else None
            expected_type = _entry_type(record)
            record_type = _body(record).get('type')
            if isinstance(record_type, str) and record_type in STABLE_RECORD_TYPES and expected_type is None:
                raise QVError('E_LOG_BINDING', f'entry {seq}: unrecognised stable record variant')
            if h['type'] == 'notice' and expected_type != 'notice':
                raise QVError('E_LOG_BINDING', f'entry {seq}: notice is neither a DKG marker nor an authenticated control')
            if expected_type is not None and h['type'] != expected_type:
                raise QVError('E_LOG_BINDING', f'entry {seq}: header/record type mismatch')
            authorized = _author_keys(record, m, set(bundle['roll']), extra)
            pk = next((bytes.fromhex(k) for k in authorized if key_id(bytes.fromhex(k)) == h['author']), None)
            if pk is None or not ed25519.verify(pk, h['signed_bytes'], h['sig']):
                raise QVError('E_LOG_BINDING', f'entry {seq}: unauthorized author or invalid header signature')
            h['public_key'] = pk.hex()
            nonce = (h['author'], h['type'], h['author_nonce'])
            if nonce in nonces:
                raise QVError('E_LOG_BINDING', f'entry {seq}: repeated author/type/nonce')
            nonces.add(nonce)
            if any(r >= seq for r in h['refs']) or (h['type'] == 'ballot_audit' and h['refs']):
                raise QVError('E_LOG_BINDING', f'entry {seq}: invalid forward/self/audit reference')
            once = {'manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close'}
            if h['type'] in once:
                if h['type'] in cardinality or (h['type'] == 'manifest' and seq != 0):
                    raise QVError('E_LOG_BINDING', f'entry {seq}: repeated/misplaced lifecycle entry')
                cardinality.add(h['type'])
            if h['type'] in {'ballot', 'ballot_audit'} and (op is None or seq <= op or (cl is not None and seq >= cl)):
                raise QVError('E_LOG_BINDING', f'entry {seq}: ballot outside open/close sequence')
            if h['type'] in {'dkg_round1', 'dkg_round2', 'dkg_complaint', 'key_confirm', 'joint_key', 'roll_commit'} and op is not None and seq >= op:
                raise QVError('E_LOG_BINDING', f'entry {seq}: setup record after open')
            if h['type'] == 'tally_result' and (cl is None or seq <= cl):
                raise QVError('E_LOG_BINDING', f'entry {seq}: tally before close')
            if action is not None:
                control_seq = advance_control_seq(control_seq, _body(record))
                label = action.replace('-', ' ').upper()
                st.notes.append(f'{label} at seq {seq}: authenticated coordinator notice; never relaxes witness gates or changes the manifest schedule')
                if action == 'extension' and cl is not None and seq > cl:
                    st.add(TIME, 'E_TIME_WINDOW', True, f'extension at seq {seq} was sequenced after election-close {cl}')
                if action in ('invalidate', 'cancel', 'abort'):
                    st.notes.append(f'{label}: terminal/election-validity effects are outside this legacy evidence report')
        except QVError as exc:
            st.add(APPEND, exc.code, True, exc.detail)
            # Preserve the physical index after a framing error; no signed head may
            # authenticate this placeholder as a valid decoded entry.
            if len(leaves) <= seq:
                leaves.append(b'\0' * 32)
    # Build each complete aligned subtree once. Checking many prefix heads must
    # not repeatedly rehash the first N leaves (quadratic for dense exports).
    levels = [leaves]
    while len(levels[-1]) >= 2:
        previous = levels[-1]
        levels.append([merkle.node_hash(previous[i], previous[i + 1]) for i in range(0, len(previous) - 1, 2)])
    root_cache = {0: hashlib.sha256(b'').digest()}
    def root(size: int) -> bytes:
        if size not in root_cache:
            end, accumulated = size, None
            for level in range(size.bit_length()):
                width = 1 << level
                if size & width:
                    end -= width
                    part = levels[level][end >> level]
                    accumulated = part if accumulated is None else merkle.node_hash(part, accumulated)
            root_cache[size] = accumulated
        return root_cache[size]
    if b64_decode(board['root_b64'], 32) != root(len(entries)):
        st.add(APPEND, 'E_LOG_CHECKPOINT', True, 'export root differs from recomputed tree')
    # Parse first, detect signed forks, then compare each prefix. Input order is not
    # chronological; checkpoint sets are routinely thinned/reordered on export.
    signed = []
    for note in board['checkpoints']:
        try:
            signed.append(parse_checkpoint(note, log_pk, origin))
        except QVError as exc:
            st.add(APPEND, 'E_LOG_CHECKPOINT', True, exc.detail)
    seen_roots = {}
    usable = []
    for head in signed:
        size, digest = head['size'], head['root']
        if size in seen_roots and digest != seen_roots[size]:
            st.add(APPEND, 'E_LOG_FORK', True, f'two log-signed roots for size {size}')
        seen_roots[size] = digest
        if size > len(entries) or digest != root(size):
            st.add(APPEND, 'E_LOG_CHECKPOINT', True, f'checkpoint {size} is not this log prefix')
        else:
            usable.append(head)
    if not any(h['size'] == len(entries) for h in usable):
        st.add(APPEND, 'E_LOG_CHECKPOINT', True, 'missing authenticated full-size checkpoint')
    for note in evidence.get('observed', []):
        try:
            h = parse_checkpoint(note, log_pk, origin)
        except QVError:
            st.notes.append('Ignored observed checkpoint without a valid signature of this log')
            continue
        if h['size'] > len(entries):
            st.add(APPEND, 'E_LOG_ROLLBACK', True, f'observed signed size {h["size"]} exceeds export')
        elif h['root'] != root(h['size']):
            st.add(APPEND, 'E_LOG_FORK', True, f'observed signed root differs at size {h["size"]}')
    quorum = bb['witness_quorum']
    witnesses = _witness_policy(m, evidence, st)
    if quorum == 0:
        st.skip(WITNESS)
        st.notes.append('NOT WITNESSED: witness_quorum = 0; wall-clock times are unwitnessed')
    else:
        st.skipped.discard(WITNESS)
        if quorum > len(witnesses):
            st.add(WITNESS, 'E_LOG_WITNESS', True, 'insufficient trusted witness keys')
        # Duplicate notes for one tree head are a set of authenticated evidence.
        # Neither checkpoint order nor cosignature line order chooses its time.
        grouped = {}
        for h in usable:
            g = grouped.setdefault((h['size'], h['root']), {'size': h['size'], 'observations': {}})
            for key, times in witness_observations(h, witnesses).items():
                g['observations'].setdefault(key, set()).update(times)
        heads = sorted(grouped.values(), key=lambda h: h['size'])
        for h in heads:
            h['times'] = {key: min(times) for key, times in h['observations'].items()}
        disqualified = set()
        for w in witnesses:
            # Every signed observation at a smaller size must precede every
            # signed observation at a larger size, even across duplicate notes.
            previous_max = -1
            for h in heads:
                times = h['observations'].get(w['pk'])
                if not times:
                    continue
                if min(times) < previous_max:
                    disqualified.add(w['pk'])
                previous_max = max(previous_max, max(times))
        if disqualified:
            st.notes.append('ALARM: non-monotone witness timestamps excluded from every quorum: ' + ', '.join(sorted(disqualified)))
        for h in heads:
            h['times'] = {k: t for k, t in h['times'].items() if k not in disqualified}
        witnessed = [h for h in heads if len(h['times']) >= quorum]
        lower = max([markers.get('dkg-final', -1), *rollseq]) + 1
        if op is not None and not any(lower <= h['size'] <= op for h in witnessed):
            st.add(WITNESS, 'E_LOG_WITNESS', True, 'no quorum-witnessed setup checkpoint before open')
        if tallies and cl is not None and not any(cl <= h['size'] <= min(tallies) for h in witnessed):
            st.add(WITNESS, 'E_LOG_WITNESS', True, 'no quorum-witnessed close checkpoint before tally')
        for label, seq, value in [('open', op, m['voting_open']), ('close', cl, m['voting_close'])]:
            if seq is None:
                continue
            covering = next((h for h in witnessed if h['size'] > seq), None)
            target = int(datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp())
            skew = m['clock_skew_s']
            if covering is None:
                bad = bool(tallies)
            else:
                ts = covering['times'].values()
                bad = sum(t >= target - skew and (label == 'open' or t <= target + skew) for t in ts) < quorum
            if bad:
                detail = f'{label}: no covering quorum timestamps within manifest bounds'
                st.add(TIME, 'E_TIME_WINDOW', True, detail)
                st.add(WITNESS, 'E_TIME_WINDOW', True, detail)
        if not any(h['size'] == len(entries) for h in witnessed):
            st.notes.append('NOT WITNESSED: latest/tally checkpoint has no witness quorum')
    samples = list(board.get('receipts', [])) + evidence.get('receipts', [])
    if samples:
        st.skipped.discard(RECEIPTS)
    else:
        st.skip(RECEIPTS)
    claims = {}
    for sample in samples:
        _receipt_sample(sample, log_pk, origin, leaves, headers, records, root, claims, st)


def _receipt_sample(sample, log_pk, origin, leaves, headers, records, root, claims, st):
    # Neither an unauthenticated sample nor a claimant assertion can itself prove
    # log misbehaviour. A valid log promise contradicted by this export can.
    try:
        if not isinstance(sample, dict):
            raise QVError('E_LOG_RECEIPT', 'receipt sample must be an object')
        if 'receipt' in sample:
            if not _object(sample, {'receipt'}, {'voter', 'code'}):
                raise QVError('E_LOG_RECEIPT', 'unknown receipt claim fields')
            claim, transport = sample, sample['receipt']
        else:
            claim, transport = {}, sample
        r = parse_receipt(transport, log_pk, origin)
    except QVError as exc:
        st.add(RECEIPTS, 'E_LOG_RECEIPT', False, exc.detail)
        return
    seq, leaf = r['seq'], r['leaf']
    if seq >= len(leaves) or leaf != leaves[seq]:
        st.add(RECEIPTS, 'E_LOG_RECEIPT', True, f'signed promise for seq {seq} not honoured by export')
        return
    if 'inclusion' in r:
        inc = r['inclusion']
        try:
            if not _object(inc, {'tree_size', 'path', 'checkpoint_note'}) or not _uint(inc['tree_size']) or not isinstance(inc['path'], list) or len(inc['path']) > 64:
                raise QVError('E_LOG_RECEIPT', 'malformed receipt inclusion')
            h = parse_checkpoint(inc['checkpoint_note'], log_pk, origin)
            if h['size'] > len(leaves) or h['root'] != root(h['size']):
                st.add(RECEIPTS, 'E_LOG_RECEIPT', True, 'receipt log-signed checkpoint is not an export prefix')
                return
            path = [b64_decode(p, 32) for p in inc['path']]
            if h['size'] != inc['tree_size'] or not merkle.verify_inclusion(leaf, seq, h['size'], path, h['root']):
                raise QVError('E_LOG_RECEIPT', 'receipt inclusion proof does not verify')
        except QVError as exc:
            st.add(RECEIPTS, 'E_LOG_RECEIPT', False, exc.detail)
    record = records.get(seq)
    b = _body(record)
    header = headers.get(seq, {})
    ballot_entry = (b.get('type') == 'ballot' and isinstance(record, dict)
                    and record.get('intent') in ('cast', 'spoil')
                    and header.get('type') == _entry_type(record))
    if 'voter' in claim:
        voter = claim['voter']
        if not ballot_entry or not hex_field(voter, 32) or header.get('public_key') != voter or b.get('voter') != voter:
            st.add(RECEIPTS, 'E_LOG_RECEIPT_CLASH', False, f'seq {seq}: claimant differs from authenticated header/voter')
        if seq in claims and claims[seq] != voter:
            st.add(RECEIPTS, 'E_LOG_RECEIPT_CLASH', False, f'seq {seq}: different receipt claimants')
        claims[seq] = voter
    if 'code' in claim:
        try:
            if not ballot_entry or not hex_field(claim['code'], 32) or not hex_field(b.get('ctx'), 32) or ballot.ballot_code(bytes.fromhex(b['ctx']), b).hex() != claim['code']:
                raise QVError('E_LOG_RECEIPT_CLASH', 'claimed ballot code differs')
        except (QVError, KeyError, TypeError, ValueError):
            st.add(RECEIPTS, 'E_LOG_RECEIPT_CLASH', False, f'seq {seq}: claimed ballot code differs')
