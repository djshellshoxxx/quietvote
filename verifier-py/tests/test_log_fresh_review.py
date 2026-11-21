"""Fresh review probes for authenticated evidence versus transport/claim assertions.

The small synthetic transcript is board-only evidence, not a valid election.
Known test seeds allow adversarial headers/heads to be correctly re-signed, so a
rejection cannot be attributed merely to a broken signature or stale tree root.
"""

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from qv_verifier import merkle, qvjson
from qv_verifier.election import State, verify_bundle
from qv_verifier.logcheck import verify_into
from qv_verifier.logwire import b64_decode, body_digest, decode_header
from tests.test_logcheck import b64, b64u, framed_header, read, synthetic_extra_author
from tests.test_logwire import note, note_text, receipt


def reseal(board):
    root = merkle.mth([b64_decode(e['header_b64u'], url=True) for e in board['entries']])
    board['root_b64'] = b64(root)
    board['checkpoints'] = [note(note_text(size=len(board['entries']), root=root, origin=board['origin']))]


def check_board(bundle, board, extra, **evidence):
    state = State()
    verify_into(bundle, {'board': board, 'extraAuthorKeys': [extra], **evidence}, state)
    return state


class TestFreshLogReview(unittest.TestCase):
    def test_v1_transport_fields_cannot_be_omitted_or_retyped(self):
        bundle, board, extra = synthetic_extra_author()
        self.assertEqual(check_board(bundle, board, extra).findings, [])
        cases = [('spec', 'QV-19'), ('spec', None), ('generator', []), ('receipts', None),
                 ('policy', {'log_pk_b64': board['policy']['log_pk_b64']}),
                 ('policy', {**board['policy'], 'witness_policy': {'quorum': False,
                             'none_acknowledged': True, 'witnesses': []}})]
        for key, value in cases:
            altered = copy.deepcopy(board)
            altered[key] = value
            with self.subTest(key=key, value=value):
                result = check_board(bundle, altered, extra)
                self.assertTrue(any(f.code == 'E_LOG_FORMAT' and f.fatal for f in result.findings))
        for key in ('spec', 'generator', 'receipts'):
            altered = copy.deepcopy(board)
            del altered[key]
            with self.subTest(missing=key):
                self.assertTrue(any(f.code == 'E_LOG_FORMAT' and f.fatal
                                    for f in check_board(bundle, altered, extra).findings))

    def test_redaction_inventory_requires_time_and_reason(self):
        bundle, board, extra = synthetic_extra_author()
        board['entries'][1]['body_b64u'] = None
        for item in ({'seq': 1}, {'seq': 1, 'redacted_at': True, 'reason': 'x'},
                     {'seq': 1, 'redacted_at': 3, 'reason': []}):
            board['redactions'] = [item]
            with self.subTest(item=item):
                self.assertTrue(any(f.code == 'E_LOG_FORMAT' and f.fatal
                                    for f in check_board(bundle, board, extra).findings))
        board['redactions'] = [{'seq': 1, 'redacted_at': 3, 'reason': 'review'}]
        result = check_board(bundle, board, extra)
        self.assertEqual(result.findings, [])
        self.assertIn('canonical body supplied', ' '.join(result.notes))

    def test_self_and_forward_references_fail_with_valid_signatures_and_heads(self):
        for ref in (1, 2, (1 << 53) - 1):
            bundle, board, extra = synthetic_extra_author()
            header = decode_header(b64_decode(board['entries'][1]['header_b64u'], url=True))
            header['refs'] = [ref]
            board['entries'][1]['header_b64u'] = b64u(framed_header(header, bytes(range(2, 34))))
            reseal(board)
            with self.subTest(ref=ref):
                result = check_board(bundle, board, extra)
                self.assertEqual([(f.code, f.fatal) for f in result.findings], [('E_LOG_BINDING', True)])
                self.assertIn('reference', result.findings[0].detail)

    def test_nonballot_author_and_voter_field_do_not_establish_ballot_ownership(self):
        bundle, board, extra = synthetic_extra_author()
        record = bundle['log'][0]['entry']
        record['body']['voter'] = extra
        canonical = qvjson.jcs(record)
        header = decode_header(b64_decode(board['entries'][1]['header_b64u'], url=True))
        header['body_len'], header['body_digest'] = len(canonical), body_digest(canonical)
        raw = framed_header(header, bytes(range(2, 34)))
        board['entries'][1].update(header_b64u=b64u(raw), body_b64u=b64u(canonical))
        reseal(board)
        # It is correctly authenticated as caller-authorized external evidence.
        self.assertEqual(check_board(bundle, board, extra).findings, [])
        sample = {'voter': extra, 'receipt': receipt(origin=board['origin'], seq=1,
                                                   leaf_hash=b64(merkle.leaf_hash(raw)))}
        result = check_board(bundle, board, extra, receipts=[sample])
        self.assertEqual([(f.code, f.fatal) for f in result.findings], [('E_LOG_RECEIPT_CLASH', False)])

    def test_observed_forks_and_rollback_require_the_pinned_log_signature(self):
        bundle, board, extra = synthetic_extra_author()
        for size, root, expected in ((2, b'x' * 32, 'E_LOG_FORK'),
                                     (3, b'x' * 32, 'E_LOG_ROLLBACK')):
            text = note_text(size=size, root=root, origin=board['origin'])
            impostor = note(text, seed=b'X' * 32)
            untrusted = check_board(bundle, board, extra, observed=[impostor])
            self.assertEqual(untrusted.findings, [])
            self.assertIn('Ignored observed checkpoint', ' '.join(untrusted.notes))
            trusted = check_board(bundle, board, extra, observed=[note(text)])
            self.assertEqual([(f.code, f.fatal) for f in trusted.findings], [(expected, True)])

    def test_failed_manifest_anchor_never_authenticates_board_evidence(self):
        bundle, board = read('bundle.json'), read('board.json')
        bundle['manifest_hash'] = '00' * 32
        report = verify_bundle(bundle, log={'board': board})
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertEqual(report['checks']['chk.manifest.hash'], 'fail')
        self.assertEqual(report['checks']['chk.board.append_only'], 'not_run')
        self.assertEqual(report['checks']['chk.board.witness'], 'not_run')
        self.assertEqual(report['checks']['chk.receipts.sample'], 'not_run')

    def test_missing_manifest_quorum_also_stops_optional_log_and_cli(self):
        bundle = read('bundle.json')
        bundle['manifest']['sigs'] = []
        # Even structurally unusable optional evidence has no authority until
        # the coordinator quorum authenticates the election manifest.
        board = {'this': 'is not a board export'}
        report = verify_bundle(bundle, log={'board': board})
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertEqual(report['codes'], ['E_MANIFEST_SIG'])
        self.assertEqual(report['checks']['chk.manifest.hash'], 'pass')
        self.assertEqual(report['checks']['chk.manifest.sig'], 'fail')
        self.assertTrue(all(status == 'not_run' for check, status in report['checks'].items()
                            if check not in ('chk.manifest.hash', 'chk.manifest.sig')))
        self.assertNotIn('ctx_prefix', report)
        self.assertNotIn('results', report)
        package = Path(__file__).resolve().parents[1] / 'qv_verifier'
        with tempfile.TemporaryDirectory() as tmp:
            election, evidence = Path(tmp) / 'election.json', Path(tmp) / 'board.json'
            election.write_text(json.dumps(bundle))
            evidence.write_text(json.dumps(board))
            result = subprocess.run([sys.executable, '-I', str(package), 'verify', str(election),
                                     '--board', str(evidence)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(json.loads(result.stdout), report)


if __name__ == '__main__':
    unittest.main()
