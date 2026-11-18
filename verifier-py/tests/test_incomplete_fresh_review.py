"""PY-02 review with authentic pre-tally checkpoints and external rollback evidence."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from qv_verifier.election import verify_bundle
from tests.test_logcheck import read


def pending_with_board():
    bundle, board = read('bundle.json'), read('board.json')
    # The unchanged shipped log contains a real signed/witnessed size-23 head
    # after close and before the tally at seq23. Keep those exact bytes.
    latest = board['checkpoints'][-1]
    bundle['log'] = [row for row in bundle['log'] if row['seq'] < 23]
    board['entries'] = board['entries'][:23]
    board['checkpoints'] = [note for note in board['checkpoints'] if int(note.splitlines()[1]) <= 23]
    board['tree_size'] = 23
    board['root_b64'] = next(note.splitlines()[2] for note in board['checkpoints']
                             if int(note.splitlines()[1]) == 23)
    return bundle, board, latest


class TestIncompleteFreshReview(unittest.TestCase):
    def test_authenticated_pending_board_retains_evidence_without_final_result(self):
        bundle, board, _ = pending_with_board()
        report = verify_bundle(bundle, log={'board': board})
        self.assertEqual(report['verdict'], 'INCOMPLETE')
        self.assertEqual(report['codes'], [])
        self.assertEqual(report['checks']['chk.board.append_only'], 'pass')
        self.assertEqual(report['checks']['chk.board.witness'], 'pass')
        for check in ('chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules'):
            self.assertEqual(report['checks'][check], 'not_run')
        self.assertNotIn('results', report)

    def test_later_authenticated_head_turns_the_same_pending_view_into_rollback(self):
        bundle, board, latest = pending_with_board()
        report = verify_bundle(bundle, log={'board': board, 'observed': [latest]})
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_LOG_ROLLBACK', report['codes'])
        self.assertEqual(report['checks']['chk.board.append_only'], 'fail')
        self.assertEqual(report['checks']['chk.tally.decrypt'], 'not_run')
        self.assertNotIn('results', report)

    def test_nonfatal_unknown_record_does_not_become_a_fatal_missing_tally(self):
        bundle, _, _ = pending_with_board()
        bundle['log'].append({'seq': 23, 'entry': {'body': {
            'proto': 'qv1-r255-sha2', 'type': 'future-evidence'},
            'sig': {'key': '00' * 32, 'sig': '00' * 64}}})
        report = verify_bundle(bundle)
        self.assertEqual(report['verdict'], 'INCOMPLETE')
        self.assertEqual(report['codes'], ['E_VERSION'])
        self.assertTrue(all(not item['fatal'] for item in report['findings']))
        self.assertEqual(report['checks']['chk.encoding.canonical'], 'fail')
        self.assertEqual(report['checks']['chk.tally.decrypt'], 'not_run')
        self.assertNotIn('results', report)

    def test_actual_cli_pending_and_rollback_exits_use_the_same_signed_prefix(self):
        bundle, board, latest = pending_with_board()
        package = Path(__file__).resolve().parents[1] / 'qv_verifier'
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            for name, data in (('bundle', bundle), ('board', board), ('observed', [latest])):
                (base / f'{name}.json').write_text(json.dumps(data))
            args = [sys.executable, '-I', str(package), 'verify', str(base / 'bundle.json'),
                    '--board', str(base / 'board.json')]
            for options, code, verdict in (([], 3, 'INCOMPLETE'),
                                           (['--observed', str(base / 'observed.json')], 1, 'FAIL')):
                with self.subTest(verdict=verdict):
                    result = subprocess.run(args + options, capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                    self.assertEqual(json.loads(result.stdout)['verdict'], verdict)
                    self.assertEqual(result.stderr, '')


if __name__ == '__main__':
    unittest.main()
