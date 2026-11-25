"""Independent signed-control sequence regression cases for ADR-027 B2-05."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import unittest

from qv_verifier import ed25519, manifest as manifest_mod, merkle, qvjson
from qv_verifier.election import State, record_msg, verify_bundle
from qv_verifier.errors import QVError
from qv_verifier.logcheck import _control_action, advance_control_seq, verify_into
from qv_verifier.logwire import body_digest, key_id
from tests.test_logcheck import b64, b64u, framed_header

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = json.loads((ROOT / 'test-vectors/v1/elections/tiny-yesno-3v/bundle.json').read_text())
SEED = hashlib.sha256(b'vec-tiny/coord').digest()
OTHER = hashlib.sha256(b'control-sequence/outsider').digest()
SCOPE = bytes.fromhex(ORIGINAL['manifest_hash'])


def record(seq=None, scope=SCOPE, seed=SEED, reason=None):
    body = {'proto': 'qv1-r255-sha2', 'type': 'control', 'action': 'security-notice'}
    if seq is not None:
        body['control_seq'] = seq
    if reason is not None:
        body['reason'] = reason
    return {'body': body, 'sigs': [{'key': ed25519.public_key(seed).hex(), 'sig': ed25519.sign(seed, record_msg(scope, body)).hex()}]}


def content_report(records):
    bundle = copy.deepcopy(ORIGINAL)
    for entry in records:
        bundle['log'].append({'seq': bundle['log'][-1]['seq'] + 1, 'entry': entry})
    return verify_bundle(bundle, allow_no_log=True)


def board_state(counters, invalid_inner=False, invalid_outer=False):
    """Independent framing, Merkle tree and signed checkpoint for a control-only transcript."""
    m = copy.deepcopy(ORIGINAL['manifest']['body'])
    origin = 'quietvote/v1/' + base64.b32encode(bytes.fromhex(m['election_id'])).decode().lower().rstrip('=')
    log_seed = hashlib.sha256(b'control-sequence/log').digest()
    log_key = ed25519.public_key(log_seed)
    m['bb'] = {'log_id': hashlib.sha256(origin.encode()).hexdigest(), 'log_pk': log_key.hex(), 'witness_quorum': 0}
    _, mh = manifest_mod.manifest_hash(m)
    manifest = {'body': m, 'sigs': [{'key': ed25519.public_key(SEED).hex(), 'sig': ed25519.sign(SEED, record_msg(mh, m)).hex()}]}
    controls = [record(seq, mh, OTHER if invalid_inner and i == 0 else SEED) for i, seq in enumerate(counters)]
    bundle = {'manifest_hash': mh.hex(), 'manifest': manifest, 'roll': ORIGINAL['roll'],
              'log': [{'seq': i + 1, 'entry': entry} for i, entry in enumerate(controls)]}
    entries, headers = [], []
    for seq, entry in enumerate([manifest, *controls]):
        body = qvjson.jcs(entry)
        seed = OTHER if invalid_outer and seq == 1 else SEED
        header = {'v': 1, 'origin': origin, 'type': 'manifest' if seq == 0 else 'notice',
                  'author': key_id(ed25519.public_key(seed)), 'author_alg': 'ed25519',
                  'author_nonce': bytes([seq]) * 16, 'created_at': 100, 'body_len': len(body),
                  'body_digest': body_digest(body), 'refs': []}
        raw = framed_header(header, seed)
        headers.append(raw)
        entries.append({'seq': seq, 'header_b64u': b64u(raw), 'body_b64u': b64u(body)})
    root = merkle.mth(headers)
    text = f'{origin}\n{len(entries)}\n{b64(root)}\n'
    note_id = hashlib.sha256(origin.encode() + b'\n\x01' + log_key).digest()[:4]
    note = text + '\n— ' + origin + ' ' + b64(note_id + ed25519.sign(log_seed, text.encode())) + '\n'
    board = {'format': 'qv-bundle/v1', 'origin': origin, 'created_at': 100, 'tree_size': len(entries),
             'root_b64': b64(root), 'entries': entries, 'checkpoints': [note],
             'policy': {'log_pk_b64': b64(log_key), 'witness_policy': {'quorum': 0, 'none_acknowledged': True, 'witnesses': []}},
             'redactions': [], 'spec': 'QV-18', 'generator': 'independent-python-control-test', 'receipts': []}
    state = State()
    verify_into(bundle, {'board': board}, state)
    return state


class TestControlSequence(unittest.TestCase):
    def test_new_schema_and_integer_bounds_preserve_legacy_reasons(self):
        coord = ORIGINAL['manifest']['body']['coordinator']
        for value in [record(reason='legacy text'), record(1, reason='OTHER')]:
            self.assertEqual(_control_action(value, SCOPE, coord), 'security-notice')
        for value in [0, -1, 1.5, True, (1 << 53), '1', None]:
            r = record(1); r['body']['control_seq'] = value
            with self.subTest(value=value), self.assertRaises(QVError) as exc:
                _control_action(r, SCOPE, coord)
            self.assertEqual(exc.exception.code, 'E_LOG_FORMAT')
        with self.assertRaises(QVError):
            _control_action(record(1, reason='private free text'), SCOPE, coord)
        self.assertEqual(advance_control_seq((1 << 53) - 2, {'control_seq': (1 << 53) - 1}), (1 << 53) - 1)
        with self.assertRaises(QVError):
            advance_control_seq((1 << 53) - 1, {'control_seq': (1 << 53) - 1})

    def test_legacy_prefix_and_monotonic_controls_keep_the_original_result(self):
        for counters in [[None], [1, 2], [None, None, 1, 2]]:
            report = content_report([record(seq) for seq in counters])
            with self.subTest(counters=counters):
                self.assertEqual(report['verdict'], 'PASS', report['findings'])
                self.assertEqual(sum(f['code'] == 'E_VERSION' for f in report['findings']), counters.count(None))

    def test_replay_gap_future_and_downgrade_are_fatal_without_results(self):
        for counters in [[2], [1, 1], [1, 3], [1, None], [1, 2, 1]]:
            report = content_report([record(seq) for seq in counters])
            with self.subTest(counters=counters):
                self.assertEqual(report['verdict'], 'FAIL')
                self.assertEqual(report['checks']['chk.time.window'], 'fail')
                self.assertTrue(any(f['code'] == 'E_LOG_ORDER' and f['fatal'] for f in report['findings']))
                self.assertFalse(report.get('results'))

    def test_invalid_signature_scope_authority_or_schema_does_not_consume_counter(self):
        changed = record(1); changed['body']['control_seq'] = 2
        bad = record(1); bad['sigs'][0]['sig'] = '00' * 64
        for noise in [record(1, seed=OTHER), record(1, scope=b'\0' * 32), changed, bad, record(1, reason='not a catalog code')]:
            report = content_report([noise, record(1), record(2)])
            self.assertEqual(report['verdict'], 'PASS', report['findings'])
            self.assertNotIn('E_LOG_ORDER', report['codes'])
            self.assertTrue(any(f['code'] in ('E_SIG', 'E_SCHEMA') and not f['fatal'] for f in report['findings']))

    def test_board_rewraps_and_unauthorized_records_obey_same_boundary(self):
        good = board_state([None, None, 1, 2])
        self.assertFalse(good.failed('chk.board.append_only'), good.findings)
        for counters in [[2], [1, 1], [1, 3], [1, None]]:
            state = board_state(counters)
            self.assertTrue(any(f.code == 'E_LOG_ORDER' and f.fatal for f in state.findings))
        for inner, outer in [(True, False), (False, True)]:
            state = board_state([1, 1], inner, outer)
            self.assertTrue(any(f.code == 'E_LOG_BINDING' and f.fatal for f in state.findings))
            self.assertFalse(any(f.code == 'E_LOG_ORDER' for f in state.findings))
            self.assertEqual(sum('SECURITY NOTICE at seq 2' in n for n in state.notes), 1)


if __name__ == '__main__':
    unittest.main()
