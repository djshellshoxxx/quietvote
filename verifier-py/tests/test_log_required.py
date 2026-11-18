"""Approved default evidence gate; opt-out belongs to the caller, not the bundle."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from qv_verifier.election import verify_bundle

ROOT = Path(__file__).resolve().parents[2]
V = ROOT / 'test-vectors/v1/elections'
def read(name):
    return json.loads((V / name).read_text())

class TestLogRequired(unittest.TestCase):
    def test_default_and_explicit_scope(self):
        bundle = read('tiny-yesno-3v/bundle.json')
        self.assertEqual(verify_bundle(bundle)['verdict'], 'INCOMPLETE')
        for field in ('allowNoLog', 'allow_no_log', 'contentOnly'):
            b = copy.deepcopy(bundle); b[field] = True
            self.assertEqual(verify_bundle(b)['verdict'], 'INCOMPLETE')
        self.assertEqual(verify_bundle(bundle, allow_no_log=1)['verdict'], 'INCOMPLETE')
        r = verify_bundle(bundle, allow_no_log=True)
        self.assertEqual(r['verdict'], 'PASS')
        self.assertEqual(r['checks']['chk.board.append_only'], 'not_run')
        self.assertTrue(any(n.startswith('CONTENT-ONLY') for n in r['notes']))

    def test_witnessed_and_malformed(self):
        b = read('log-layer-4v/bundle.json'); evidence = read('log-layer-4v/board.json')
        self.assertEqual(verify_bundle(b, log={'board': evidence})['verdict'], 'PASS')
        for malformed in (None, {}, {'format': 'qv-bundle/v1'}):
            self.assertEqual(verify_bundle(b, log={'board': malformed}, allow_no_log=True)['verdict'], 'FAIL')

    def test_operational_failure_does_not_certify_partial_checks(self):
        b = read('log-layer-4v/bundle.json')
        def partial(bundle, log, st):
            st.skipped.discard('chk.board.append_only')
            raise RuntimeError('private diagnostic must not be rendered')
        with patch('qv_verifier.logcheck.verify_into', side_effect=partial):
            r = verify_bundle(b, log={'board': read('log-layer-4v/board.json')}, allow_no_log=True)
        self.assertEqual(r['verdict'], 'INCOMPLETE')
        self.assertEqual(r['checks']['chk.board.append_only'], 'not_run')
        self.assertNotIn('private diagnostic', json.dumps(r))
        b['manifest']['sigs'] = []
        with patch('qv_verifier.logcheck.verify_into', side_effect=RuntimeError):
            self.assertEqual(verify_bundle(b, log={'board': {}}, allow_no_log=True)['verdict'], 'FAIL')

    def test_actual_cli_checks_bundled_board_even_in_content_only_mode(self):
        bundle = read('log-layer-4v/bundle.json')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'bundle.json'
            for board, code, verdict in ((read('log-layer-4v/board.json'), 0, 'PASS'), ({}, 1, 'FAIL')):
                bundle['board'] = board
                path.write_text(json.dumps(bundle))
                p = subprocess.run([sys.executable, '-I', str(ROOT/'verifier-py/qv_verifier'), 'verify', str(path), '--content-only'], capture_output=True, text=True)
                self.assertEqual(p.returncode, code, p.stderr)
                self.assertEqual(json.loads(p.stdout)['verdict'], verdict)

    def test_actual_cli_scope_and_exits(self):
        file = V / 'tiny-yesno-3v/bundle.json'
        for flags, code, verdict in (([], 3, 'INCOMPLETE'), (['--content-only'], 0, 'PASS')):
            p = subprocess.run([sys.executable, '-I', str(ROOT/'verifier-py/qv_verifier'), 'verify', str(file), *flags], capture_output=True, text=True)
            self.assertEqual(p.returncode, code, p.stderr)
            r = json.loads(p.stdout); self.assertEqual(r['verdict'], verdict)
            if flags: self.assertTrue(any(n.startswith('CONTENT-ONLY') for n in r['notes']))
