"""Stable log evidence: independent signatures, hostile transports and real CLI."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from qv_verifier import ed25519, merkle, qvjson
from qv_verifier.election import State, verify_bundle
from qv_verifier.errors import QVError
from qv_verifier.logcheck import verify_into
from qv_verifier.logio import load_json, vector_input
from qv_verifier.logwire import b64_decode, body_digest, decode_header, key_id
from qv_verifier.runner import _run_log_vector

ROOT = Path(__file__).resolve().parents[2]
TREE = ROOT / 'test-vectors/v1'
FIXTURE = TREE / 'elections/log-layer-4v'
PKG = ROOT / 'verifier-py/qv_verifier'


def read(name):
    return json.loads((FIXTURE / name).read_text())


def b64u(value):
    return base64.urlsafe_b64encode(value).decode().rstrip('=')


def b64(value):
    return base64.b64encode(value).decode()


def framed_header(h, seed):
    """Independent test encoder of the documented u16/u64 board framing."""
    def number(value, size):
        return value.to_bytes(size, 'big')
    def string(value):
        raw = value.encode()
        return number(len(raw), 2) + raw
    raw = (number(h['v'], 2) + string(h['origin']) + string(h['type']) + h['author']
           + string(h['author_alg']) + h['author_nonce'] + number(h['created_at'], 8)
           + number(h['body_len'], 8) + h['body_digest'] + number(len(h['refs']), 2)
           + b''.join(number(r, 8) for r in h['refs']))
    return raw + b'\0@' + ed25519.sign(seed, b'QV-ENTRY-v1\0' + raw)


def synthetic_extra_author():
    """A small complete append-only transcript, not a complete election claim."""
    log_seed = bytes(range(32))
    coord_seed = bytes(range(1, 33))
    extra_seed = bytes(range(2, 34))
    coord, log_key, extra = [ed25519.public_key(s).hex() for s in (coord_seed, log_seed, extra_seed)]
    m = copy.deepcopy(read('bundle.json')['manifest']['body'])
    m['coordinator'] = {'keys': [coord], 'm': 1}
    m['bb'] = {'log_id': m['bb']['log_id'], 'log_pk': log_key, 'witness_quorum': 0}
    env = {'body': m, 'sigs': []}
    anchor = {'body': {'proto': m['proto'], 'type': 'external-evidence', 'value': 'public anchor'},
              'sig': {'key': extra, 'sig': '00' * 64}}
    bundle = {'manifest': env, 'log': [{'seq': 1, 'entry': anchor}], 'roll': []}
    origin = 'quietvote/v1/' + base64.b32encode(bytes.fromhex(m['election_id'])).decode().lower().rstrip('=')
    entries = []
    for seq, (record, kind, seed) in enumerate([(env, 'manifest', coord_seed), (anchor, 'anchor', extra_seed)]):
        body = qvjson.jcs(record)
        h = {'v': 1, 'origin': origin, 'type': kind, 'author': key_id(ed25519.public_key(seed)),
             'author_alg': 'ed25519', 'author_nonce': bytes([seq]) * 16, 'created_at': 1,
             'body_len': len(body), 'body_digest': body_digest(body), 'refs': []}
        entries.append({'seq': seq, 'header_b64u': b64u(framed_header(h, seed)), 'body_b64u': b64u(body)})
    root = merkle.mth([b64_decode(e['header_b64u'], url=True) for e in entries])
    text = f'{origin}\n2\n{b64(root)}\n'
    note_id = hashlib.sha256(origin.encode() + b'\n\x01' + bytes.fromhex(log_key)).digest()[:4]
    note = text + '\n— ' + origin + ' ' + b64(note_id + ed25519.sign(log_seed, text.encode())) + '\n'
    board = {'format': 'qv-bundle/v1', 'origin': origin, 'created_at': 2, 'tree_size': 2,
             'root_b64': b64(root), 'entries': entries, 'checkpoints': [note],
             'policy': {'log_pk_b64': b64(bytes.fromhex(log_key)),
                        'witness_policy': {'quorum': 0, 'none_acknowledged': True, 'witnesses': []}},
             'redactions': [], 'spec': 'QV-18', 'generator': 'independent-python-test', 'receipts': []}
    return bundle, board, extra


class TestStableLog(unittest.TestCase):
    def setUp(self):
        self.bundle = read('bundle.json')
        self.board = read('board.json')

    def report(self, **kwargs):
        return verify_bundle(self.bundle, log={'board': self.board, **kwargs})

    def test_every_log_vector_has_exact_report_and_no_capability_skip(self):
        passed = 0
        for v in read('vectors.json')['vectors']:
            with self.subTest(vector=v['id']):
                ok, reason = _run_log_vector(TREE, v)
                self.assertTrue(ok, reason)
                passed += 1
        self.assertEqual(passed, 48)

    def test_core_control_is_class_l_and_log_authority_is_separate(self):
        self.assertEqual(verify_bundle(self.bundle)['checks']['chk.board.append_only'], 'not_run')
        control = read('notices/waiver-before-open.bundle.json')
        core = verify_bundle(control)
        self.assertEqual(core['verdict'], 'PASS')
        self.assertTrue(any(f['code'] == 'E_VERSION' and not f['fatal'] for f in core['findings']))
        report = verify_bundle(control, log={'board': read('notices/waiver-before-open.board.json')})
        self.assertEqual(report['verdict'], 'PASS')
        self.assertEqual(report['checks']['chk.board.append_only'], 'pass')
        self.assertIn('WITNESS WAIVER', ' '.join(report['notes']))

    def test_missing_protocol_notice_marker_is_binding_failure_not_policy_hold(self):
        self.bundle['log'] = [r for r in self.bundle['log'] if r['seq'] != 4]
        report = self.report()
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_LOG_BINDING', report['codes'])

    def test_header_signature_and_body_binding(self):
        for field, value in [('header_b64u', b64u(b'junk')), ('body_b64u', b64u(b'{}'))]:
            with self.subTest(field=field):
                saved = self.board['entries'][17][field]
                self.board['entries'][17][field] = value
                report = self.report()
                self.assertEqual(report['verdict'], 'FAIL')
                self.assertEqual(report['checks']['chk.board.append_only'], 'fail')
                self.board['entries'][17][field] = saved
        raw = bytearray(b64_decode(self.board['entries'][17]['header_b64u'], url=True))
        raw[-1] ^= 1
        self.board['entries'][17]['header_b64u'] = b64u(bytes(raw))
        self.assertTrue(any(f['code'] == 'E_LOG_BINDING' and 'signature' in f['detail'] for f in self.report()['findings']))

    def test_extra_author_cannot_impersonate_voter_or_coordinator(self):
        seed = b'X' * 32
        pk = ed25519.public_key(seed)
        for seq in (0, 17):
            with self.subTest(seq=seq):
                saved = self.board['entries'][seq]['header_b64u']
                h = decode_header(b64_decode(saved, url=True))
                h['author'] = key_id(pk)
                self.board['entries'][seq]['header_b64u'] = b64u(framed_header(h, seed))
                report = self.report(extraAuthorKeys=[pk.hex()])
                self.assertTrue(any(f['code'] == 'E_LOG_BINDING' and f'entry {seq}:' in f['detail'] for f in report['findings']))
                self.board['entries'][seq]['header_b64u'] = saved

    def test_extra_author_authenticates_only_unrecognised_noncontrol_record(self):
        bundle, board, extra = synthetic_extra_author()
        without = State()
        verify_into(bundle, {'board': board}, without)
        self.assertTrue(any('entry 1:' in f.detail and f.code == 'E_LOG_BINDING' for f in without.findings))
        with_extra = State()
        verify_into(bundle, {'board': board, 'extraAuthorKeys': [extra]}, with_extra)
        self.assertEqual(with_extra.findings, [])
        self.assertIn('NOT WITNESSED', ' '.join(with_extra.notes))
        # This is only board authentication; unrecognised core record semantics
        # are not converted into a valid election or an authority decision.

    def test_author_nonce_replay_is_rejected_even_with_valid_header_signature(self):
        self.board['entries'][18] = {**copy.deepcopy(self.board['entries'][17]), 'seq': 18}
        self.bundle['log'][17]['entry'] = copy.deepcopy(self.bundle['log'][16]['entry'])
        report = self.report()
        self.assertTrue(any(f['code'] == 'E_LOG_BINDING' and 'nonce' in f['detail'] for f in report['findings']))

    def test_redacted_body_requires_inventory_and_canonical_protocol_copy(self):
        self.board['entries'][17]['body_b64u'] = None
        self.assertIn('E_LOG_FORMAT', self.report()['codes'])
        self.board['redactions'] = [{'seq': 17, 'redacted_at': 1800000000, 'reason': 'test'}]
        good = self.report()
        self.assertEqual(good['verdict'], 'PASS', good['findings'])
        self.assertIn('canonical body supplied', ' '.join(good['notes']))
        self.bundle['log'][16]['entry']['body']['supersedes'] = 'ff' * 32
        self.assertIn('E_LOG_BINDING', self.report()['codes'])

    def test_malformed_and_cross_size_inclusion_never_passes_sampling(self):
        original = read('vectors.json')['vectors'][0]['input']['receipts'][0]
        for bad in [None, [], 4, {}, {'tree_size': True, 'path': [], 'checkpoint_note': ''}]:
            with self.subTest(inclusion=bad):
                sample = copy.deepcopy(original)
                sample['receipt']['inclusion'] = bad
                report = self.report(receipts=[sample])
                self.assertEqual(report['checks']['chk.receipts.sample'], 'fail')
                self.assertEqual(report['verdict'], 'PASS')
        sample = copy.deepcopy(original)
        sample['receipt']['inclusion']['tree_size'] -= 1
        self.assertEqual(self.report(receipts=[sample])['checks']['chk.receipts.sample'], 'fail')

    def test_authentic_broken_promise_survives_malformed_auxiliary_proof(self):
        v = next(v for v in read('vectors.json')['vectors'] if v['id'] == 'receipt-broken-promise-dropped-revote')
        bundle, evidence = vector_input(TREE, v['input'])
        evidence['receipts'][0]['receipt']['inclusion'] = None
        report = verify_bundle(bundle, log=evidence)
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertTrue(any(f['code'] == 'E_LOG_RECEIPT' and f['fatal'] for f in report['findings']))

    def test_malformed_transport_is_a_failure_without_exceptions(self):
        for field, value in [('entries', None), ('tree_size', True), ('checkpoints', {}), ('root_b64', '!!!!'),
                             ('redactions', [{'seq': []}]), ('policy', None), ('spec', 'QV-19'), ('generator', []),
                             ('receipts', None), ('redactions', [{'seq': 17}]),
                             ('policy', {'log_pk_b64': self.board['policy']['log_pk_b64']})]:
            with self.subTest(field=field):
                bad = copy.deepcopy(self.board)
                bad[field] = value
                report = verify_bundle(self.bundle, log={'board': bad})
                self.assertEqual(report['verdict'], 'FAIL')
                self.assertEqual(report['checks']['chk.board.append_only'], 'fail')
        del self.board['receipts']
        self.assertEqual(self.report()['verdict'], 'FAIL')

    def test_export_witness_policy_is_not_a_trust_anchor(self):
        self.board['policy']['witness_policy'] = {'quorum': 0, 'none_acknowledged': True, 'witnesses': []}
        self.board['checkpoints'] = ['\n'.join(n.split('\n')[:5]) + '\n' for n in self.board['checkpoints']]
        report = self.report()
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_LOG_WITNESS', report['codes'])

    def test_actual_cli_control_notice_and_usage_exit_status(self):
        def run(*args):
            return subprocess.run([sys.executable, '-I', str(PKG), 'verify', *map(str, args)], capture_output=True, text=True)
        good = run(FIXTURE / 'bundle.json', '--board', FIXTURE / 'board.json')
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertEqual(json.loads(good.stdout)['checks']['chk.board.witness'], 'pass')
        notice = run(FIXTURE / 'notices/waiver-before-open.bundle.json', '--board', FIXTURE / 'notices/waiver-before-open.board.json')
        self.assertEqual(notice.returncode, 0, notice.stderr)
        self.assertIn('WITNESS WAIVER', ' '.join(json.loads(notice.stdout)['notes']))
        usage = run(FIXTURE / 'bundle.json', '--receipts', 'anything.json')
        self.assertEqual(usage.returncode, 2)


class TestLogInput(unittest.TestCase):
    def test_json_parser_and_file_reference_containment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / 'input.json'
            for raw in ['{"a":1,"a":2}', '{"n":1e0}', '{"n":NaN}', '{"n":-0}', '{"n":9007199254740992}', '\ufeff{}']:
                target.write_text(raw)
                with self.subTest(raw=raw), self.assertRaises(QVError):
                    load_json(target)
            target.write_text('{"body_b64u":null}')
            self.assertEqual(load_json(target), {'body_b64u': None})
            for path in ['../outside.json', '/etc/passwd']:
                with self.subTest(path=path), self.assertRaises(QVError):
                    vector_input(root, {'bundle': {'path': path}, 'board': {'path': 'input.json'}})
            (root / 'link').symlink_to('/etc')
            with self.assertRaises(QVError):
                vector_input(root, {'bundle': {'path': 'link/passwd'}, 'board': {'path': 'input.json'}})


if __name__ == '__main__':
    unittest.main()
