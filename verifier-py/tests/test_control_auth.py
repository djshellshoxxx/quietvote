"""Approved N-12 legacy controls: independent threshold signatures and falsification."""
import copy
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from qv_verifier import ed25519
from qv_verifier.election import record_msg, verify_bundle
from qv_verifier.errors import QVError
from qv_verifier.logcheck import CONTROL_TYPES, _control_action
from qv_verifier.logio import vector_input
from qv_verifier.logwire import b64_decode, decode_header, key_id
from tests.test_logcheck import b64u, framed_header

TREE = Path(__file__).resolve().parents[2] / 'test-vectors/v1'
FIXTURE = TREE / 'elections/log-layer-4v'


def read(name):
    return json.loads((FIXTURE / name).read_text())


class TestControlSignatures(unittest.TestCase):
    def setUp(self):
        self.seeds = [hashlib.sha256(f'independent-control-test-{i}'.encode()).digest() for i in range(4)]
        self.keys = [ed25519.public_key(s).hex() for s in self.seeds]
        self.coord = {'keys': self.keys[:3], 'm': 2}
        self.scope = hashlib.sha256(b'independent-manifest-A').digest()

    def signed(self, action='witness-waiver', reason='test', signers=(0, 1), scope=None):
        body = {'proto': 'qv1-r255-sha2', 'type': 'control', 'action': action}
        if reason is not None:
            body['reason'] = reason
        scope = self.scope if scope is None else scope
        sigs = [{'key': self.keys[i], 'sig': ed25519.sign(self.seeds[i], record_msg(scope, body)).hex()} for i in signers]
        return {'body': body, 'sigs': sigs}

    def reject(self, record, code='E_LOG_BINDING', scope=None):
        with self.assertRaises(QVError) as error:
            _control_action(record, self.scope if scope is None else scope, self.coord)
        self.assertEqual(error.exception.code, code)

    def test_all_approved_actions_and_two_of_three_signers(self):
        for action in CONTROL_TYPES:
            for signers in ((0, 1), (0, 2), (1, 2), (0, 1, 2)):
                with self.subTest(action=action, signers=signers):
                    self.assertEqual(_control_action(self.signed(action, None, signers), self.scope, self.coord), action)

    def test_replay_different_scope_and_changed_signed_action_or_reason(self):
        record = self.signed()
        self.reject(record, scope=hashlib.sha256(b'independent-manifest-B').digest())
        for field, value in [('action', 'extension'), ('reason', 'changed')]:
            edited = copy.deepcopy(record)
            edited['body'][field] = value
            self.reject(edited)
        self.reject(self.signed(scope=b'\0' * 32))

    def test_distinct_coordinator_threshold_cannot_be_inflated(self):
        self.reject(self.signed(signers=(0,)))
        self.reject(self.signed(signers=(0, 0)))
        self.reject(self.signed(signers=(0, 3)))
        self.reject(self.signed(signers=(3, 3)))
        record = self.signed()
        record['sigs'][1]['sig'] = '00' * 64
        self.reject(record)
        record = self.signed()
        record['sigs'][1]['key'] = self.keys[2]
        self.reject(record)

    def test_closed_legacy_body_rejects_future_or_gate_replacement_fields(self):
        for field, value in [('control_seq', 1), ('after_seq', 2), ('quorum', 0), ('witnesses', []),
                             ('voting_close', '2099-01-01T00:00:00Z'), ('type_extra', True)]:
            record = self.signed()
            record['body'][field] = value
            with self.subTest(field=field):
                self.reject(record, 'E_LOG_FORMAT')
        record = self.signed()
        record['sig'] = record['sigs'][0]
        self.reject(record, 'E_LOG_FORMAT')
        record = self.signed()
        record['sigs'][0]['extra'] = 'unsigned'
        self.reject(record, 'E_LOG_FORMAT')

    def test_unknown_action_and_wire_bounds(self):
        for action in ('WITNESS-WAIVER', 'witness_waiver', 'info', 'redaction', 'not-defined'):
            self.reject(self.signed(action), 'E_LOG_BINDING')
        self.reject(self.signed('a' * 33), 'E_LOG_FORMAT')
        for reason in ('a' * 257, '\U0001f600' * 129):
            self.reject(self.signed(reason=reason), 'E_LOG_FORMAT')
        self.assertEqual(_control_action(self.signed(reason='\U0001f600' * 128), self.scope, self.coord), 'witness-waiver')
        for sigs in ([], self.signed()['sigs'] * 5):
            record = self.signed(); record['sigs'] = sigs
            self.reject(record, 'E_LOG_FORMAT')
        for reason in (False, 1, [], {}, None):
            record = self.signed(); record['body']['reason'] = reason
            self.reject(record, 'E_LOG_FORMAT')
        record = self.signed(); record['body']['reason'] = 'not NFC: e\u0301'
        self.reject(record, 'E_LOG_FORMAT')

    def test_malformed_bound_rejected_before_signature_arithmetic(self):
        record = self.signed(); record['sigs'] *= 10000
        with patch('qv_verifier.ed25519.verify', side_effect=AssertionError('must validate bounds first')):
            self.reject(record, 'E_LOG_FORMAT')


class TestControlLogEvidence(unittest.TestCase):
    def test_correctly_signed_outer_impostor_cannot_author_control(self):
        bundle = read('notices/waiver-before-open.bundle.json')
        board = read('notices/waiver-before-open.board.json')
        seq = next(r['seq'] for r in bundle['log'] if r['entry']['body']['type'] == 'control')
        seed = hashlib.sha256(b'operator-extra-author-test').digest()
        pk = ed25519.public_key(seed)
        header = decode_header(b64_decode(board['entries'][seq]['header_b64u'], url=True))
        header['author'] = key_id(pk)
        board['entries'][seq]['header_b64u'] = b64u(framed_header(header, seed))
        report = verify_bundle(bundle, log={'board': board, 'extraAuthorKeys': [pk.hex()]})
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertTrue(any(f['code'] == 'E_LOG_BINDING' and f'entry {seq}:' in f['detail'] for f in report['findings']))
        self.assertFalse(any(n.startswith('WITNESS WAIVER') for n in report['notes']))

    def test_waiver_and_extension_cannot_change_pinned_constraints(self):
        vectors = read('vectors.json')['vectors']
        wanted = ['notice-waiver-does-not-unblock-open-gate', 'notice-waiver-does-not-unblock-tally-gate',
                  'notice-extension-does-not-move-close', 'notice-pause-resume-do-not-move-close']
        for name in wanted:
            v = next(v for v in vectors if v['id'] == name)
            bundle, evidence = vector_input(TREE, v['input'])
            report = verify_bundle(bundle, log=evidence)
            with self.subTest(name=name):
                self.assertEqual(report['verdict'], 'FAIL')
                self.assertEqual(report['checks']['chk.board.witness'], 'fail')
                self.assertIn(v['expect']['error'], report['codes'])

    def test_unrecognized_record_class_l_does_not_hide_board_failure(self):
        for name in ('unknown-kind', 'unrecognised-body', 'waiver-with-quorum-field', 'waiver-by-trustee',
                     'waiver-record-sig-not-coordinator', 'waiver-in-anchor-entry'):
            bundle = read(f'notices/{name}.bundle.json')
            board = read(f'notices/{name}.board.json')
            core = verify_bundle(bundle, allow_no_log=True)  # Isolate core record classification.
            self.assertEqual(core['verdict'], 'PASS')
            self.assertTrue(any(f['code'] == 'E_VERSION' and not f['fatal'] for f in core['findings']))
            report = verify_bundle(bundle, log={'board': board})
            with self.subTest(name=name):
                self.assertEqual(report['verdict'], 'FAIL')
                self.assertEqual(report['checks']['chk.board.append_only'], 'fail')
                self.assertTrue(any(f['fatal'] and f['code'] in ('E_LOG_FORMAT', 'E_LOG_BINDING') for f in report['findings']))


if __name__ == '__main__':
    unittest.main()
