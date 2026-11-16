"""Independent P1 public-policy and interrupted-log trust boundary probes."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from qv_verifier.election import verify_bundle
from tests.test_logcheck import read


def pending_with_board():
    bundle, board = read('bundle.json'), read('board.json')
    latest = board['checkpoints'][-1]
    bundle['log'] = [row for row in bundle['log'] if row['seq'] < 23]
    board['entries'] = board['entries'][:23]
    board['checkpoints'] = [note for note in board['checkpoints'] if int(note.splitlines()[1]) <= 23]
    board['tree_size'] = 23
    board['root_b64'] = next(note.splitlines()[2] for note in board['checkpoints'] if int(note.splitlines()[1]) == 23)
    return bundle, board, latest


class TestLogPolicyFreshReview(unittest.TestCase):
    def test_default_requires_evidence_and_only_boolean_caller_optout_grants_content_pass(self):
        bundle = read('bundle.json')
        report = verify_bundle(bundle)
        self.assertEqual(report['verdict'], 'INCOMPLETE')
        self.assertEqual(report['checks']['chk.tally.decrypt'], 'pass')
        for value in (1, 'true', [], {}, None):
            with self.subTest(value=value):
                self.assertEqual(verify_bundle(bundle, allow_no_log=value)['verdict'], 'INCOMPLETE')
        injected = {**bundle, 'allow_no_log': True, 'allowNoLog': True, 'contentOnly': True,
                    'options': {'allow_no_log': True}}
        self.assertEqual(verify_bundle(injected)['verdict'], 'INCOMPLETE')
        report = verify_bundle(bundle, allow_no_log=True)
        self.assertEqual(report['verdict'], 'PASS')
        self.assertIn('CONTENT-ONLY', ' '.join(report['notes']))
        self.assertEqual(report['checks']['chk.board.append_only'], 'not_run')

    def test_present_malformed_evidence_is_not_absent_even_with_optout(self):
        bundle = read('bundle.json')
        for evidence in ({}, {'board': None}, {'board': {}}, {'board': []}):
            with self.subTest(evidence=evidence):
                report = verify_bundle(bundle, log=evidence, allow_no_log=True)
                self.assertEqual(report['verdict'], 'FAIL')
                self.assertEqual(report['checks']['chk.board.append_only'], 'fail')

    def test_unsigned_export_zero_quorum_cannot_replace_the_signed_manifest(self):
        bundle, board = read('bundle.json'), read('board.json')
        board['policy']['witness_policy'] = {'quorum': 0, 'none_acknowledged': True, 'witnesses': []}
        notes = []
        for note in board['checkpoints']:
            text, lines = note.split('\n\n')
            log_line = next(line for line in lines.splitlines() if line.startswith('— ' + board['origin'] + ' '))
            notes.append(text + '\n\n' + log_line + '\n')
        board['checkpoints'] = notes
        for allowed in (False, True):
            report = verify_bundle(bundle, log={'board': board}, allow_no_log=allowed)
            self.assertEqual(report['verdict'], 'FAIL')
            self.assertIn('E_LOG_WITNESS', report['codes'])
        self.assertEqual(verify_bundle(bundle, log={'board': read('board.json')})['verdict'], 'PASS')

    def test_unexpected_log_fault_never_passes_or_exposes_raw_exception(self):
        bundle, board = read('bundle.json'), read('board.json')
        for allowed in (False, True):
            with patch('qv_verifier.logcheck.verify_into', side_effect=RuntimeError('private-review-sentinel')):
                report = verify_bundle(bundle, log={'board': board}, allow_no_log=allowed)
            self.assertEqual(report['verdict'], 'INCOMPLETE')
            for check in ('chk.board.append_only', 'chk.board.witness', 'chk.receipts.sample'):
                self.assertEqual(report['checks'][check], 'not_run')
            self.assertNotIn('private-review-sentinel', json.dumps(report))

    def test_confirmed_fatal_evidence_survives_later_log_interruption(self):
        def interrupted(bundle, evidence, state):
            state.add('chk.board.append_only', 'E_LOG_FORK', True, 'authenticated conflicting checkpoint')
            raise RuntimeError('private-review-sentinel')
        with patch('qv_verifier.logcheck.verify_into', side_effect=interrupted):
            report = verify_bundle(read('bundle.json'), log={'board': read('board.json')}, allow_no_log=True)
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_LOG_FORK', report['codes'])
        self.assertNotIn('private-review-sentinel', json.dumps(report))
        rejected = read('bundle.json')
        rejected['manifest']['sigs'] = []
        with patch('qv_verifier.logcheck.verify_into', side_effect=RuntimeError('should not run')) as check:
            report = verify_bundle(rejected, log={'board': read('board.json')}, allow_no_log=True)
        check.assert_not_called()
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertEqual(report['codes'], ['E_MANIFEST_SIG'])

    def test_no_tally_never_becomes_pass_through_content_only(self):
        bundle, board, _ = pending_with_board()
        for evidence in (None, {'board': board}):
            report = verify_bundle(bundle, log=evidence, allow_no_log=True)
            self.assertEqual(report['verdict'], 'INCOMPLETE')
            self.assertNotIn('results', report)

    def test_cli_requires_flag_and_preserves_supplied_evidence_failures(self):
        bundle = {**read('bundle.json'), 'allow_no_log': True, 'allowNoLog': True}
        package = Path(__file__).resolve().parents[1] / 'qv_verifier'
        with tempfile.TemporaryDirectory() as tmp:
            election, board = Path(tmp) / 'bundle.json', Path(tmp) / 'board.json'
            election.write_text(json.dumps(bundle))
            board.write_text('{}')
            cases = (([], 3, 'INCOMPLETE'), (['--content-only'], 0, 'PASS'),
                     (['--content-only', '--board', str(board)], 1, 'FAIL'))
            for options, code, verdict in cases:
                result = subprocess.run([sys.executable, '-I', str(package), 'verify', str(election), *options],
                                        capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                report = json.loads(result.stdout)
                self.assertEqual(report['verdict'], verdict)
                if verdict == 'PASS':
                    self.assertIn('CONTENT-ONLY', ' '.join(report['notes']))


if __name__ == '__main__':
    unittest.main()
