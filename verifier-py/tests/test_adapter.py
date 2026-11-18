"""Actual-process interoperability and hostile transport tests for QV-34 §10.2."""
import copy
import hashlib
import io
import json
import os
import queue
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from qv_verifier.adapter import HELLO, MAX_REQUEST_BYTES, TreeReader, serve
from qv_verifier.logio import MAX_JSON_BYTES

ROOT = Path(__file__).resolve().parents[2]
TREE = ROOT / 'test-vectors' / 'v1'
CLI = ROOT / 'verifier-py' / 'qv_verifier'


def line(value):
    return json.dumps(value, separators=(',', ':')).encode() + b'\n'


def request(ident='hash', op='hash.sha256', inp=None):
    return {'id': ident, 'op': op, 'input': {'msg_hex': '616263'} if inp is None else inp}


class AdapterTests(unittest.TestCase):
    def execute(self, lines, *, tree=TREE, content_only=False):
        command = [sys.executable, '-I', str(CLI), 'adapter', '--tree', str(tree)]
        if content_only:
            command.append('--content-only')
        # The tree is explicit; the process must not depend on checkout cwd.
        with tempfile.TemporaryDirectory() as cwd:
            completed = subprocess.run(command, input=b''.join(lines), cwd=cwd,
                                       capture_output=True, timeout=40)
        decoded = [json.loads(s) for s in completed.stdout.splitlines()]
        return completed, decoded

    def test_handshake_and_multiple_operations_flush_only_protocol_output(self):
        result, responses = self.execute([line(HELLO), line(request()),
            line(request('sha512', 'hash.sha512')), line(request('unknown', 'future.unknown', {})),
            line(request('again'))])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, b'')
        self.assertEqual(responses[0], {'impl': 'py-qv-verify', 'version': '0.1.0',
                                      'protocol_versions': ['qv1'], 'profiles': []})
        self.assertEqual(responses[1], {'id': 'hash', 'ok': True,
                                      'output': {'digest_hex': hashlib.sha256(b'abc').hexdigest()}})
        self.assertEqual(responses[2]['output']['digest_hex'], hashlib.sha512(b'abc').hexdigest())
        self.assertEqual(responses[3], {'id': 'unknown', 'ok': False, 'error': 'ERR_UNSUPPORTED_OP'})
        self.assertTrue(responses[4]['ok'])

    def test_interactive_response_arrives_before_eof(self):
        process = subprocess.Popen([sys.executable, '-I', str(CLI), 'adapter', '--tree', str(TREE)],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for message in (HELLO, request()):
                process.stdin.write(line(message))
                process.stdin.flush()
                arrived = queue.Queue()
                reader = threading.Thread(target=lambda: arrived.put(process.stdout.readline()), daemon=True)
                reader.start()
                response = json.loads(arrived.get(timeout=5))
                reader.join(timeout=1)
                self.assertTrue('impl' in response or response.get('ok') is True)
            process.stdin.close()
            self.assertEqual(process.wait(timeout=5), 0)
            self.assertEqual(process.stderr.read(), b'')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()

    def test_invalid_handshakes_terminate_before_any_operation(self):
        for hello in ({**HELLO, 'format_version': True}, {**HELLO, 'protocol_version': 'qv2'},
                      {**HELLO, 'extra': 1}, request()):
            with self.subTest(hello=hello):
                result, responses = self.execute([line(hello), line(request())])
                self.assertEqual(result.returncode, 2)
                self.assertEqual(responses, [{'ok': False, 'error': 'ERR_PROTOCOL'}])
        result, responses = self.execute([])
        self.assertEqual(result.returncode, 2)
        self.assertEqual(responses, [])

    def test_malformed_json_is_rejected_without_desynchronizing(self):
        bad = [b'not json\n', b'\xff\n', b'{"id":"a","id":"b","op":"hash.sha256","input":{}}\n',
               b'{"id":"a","op":"hash.sha256","input":{"x":NaN}}\n',
               b'{"id":"a","op":"hash.sha256","input":{"x":1.5}}\n',
               b'{"id":"a","op":"hash.sha256","input":{"x":9007199254740992}}\n']
        result, responses = self.execute([line(HELLO), *bad, line(request())])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([r['error'] for r in responses[1:-1]], ['E_PARSE'] * len(bad))
        self.assertTrue(responses[-1]['ok'])

    def test_invalid_envelopes_and_malformed_operation_recover(self):
        bad = [[], {**request(), 'extra': True}, request(ident='x' * 257),
               request(op='bad\nop'), request(inp=[]), request(inp={}),
               request(inp={'msg_hex': 'zz'}), request(inp={'msg_hex': 123})]
        result, responses = self.execute([line(HELLO), *map(line, bad), line(request())])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([r['error'] for r in responses[1:-1]], ['E_SCHEMA'] * len(bad))
        self.assertTrue(responses[-1]['ok'])

    def test_oversized_line_is_bounded_and_terminates_without_resync(self):
        result, responses = self.execute([line(HELLO), b' ' * (MAX_REQUEST_BYTES + 1), b'\n', line(request())])
        self.assertEqual(result.returncode, 2)
        self.assertEqual(responses[-1], {'ok': False, 'error': 'ERR_REQUEST_TOO_LARGE'})
        self.assertEqual(len(responses), 2)

    def test_actual_proof_inputs_compute_positive_and_negative_results(self):
        vectors = json.loads((TREE / 'protocol/proofs/cds-disjunctive/cds.json').read_text())['vectors']
        chosen = [vectors[0], next(v for v in vectors if not v['expect']['ok'])]
        result, responses = self.execute([line(HELLO), *[
            line(request(v['id'], 'cds.verify', v['input'])) for v in chosen]])
        self.assertEqual(result.returncode, 0, result.stderr)
        for vector, got in zip(chosen, responses[1:]):
            self.assertEqual(got, {'id': vector['id'], **vector['expect']})

    def test_small_inputs_cannot_supply_unbounded_protocol_loop_counts(self):
        b = json.loads((TREE / 'protocol/ballot/ballot-encrypt.json').read_text())['vectors'][1]['input']
        b['params']['manifest']['contests'][0]['method'] = 'k-of-n'
        b['params']['manifest']['contests'][0]['selection_limit'] = (1 << 53) - 1
        result, responses = self.execute([line(HELLO),
            line(request('dkg', 'dkg.adjudicate', {'n': (1 << 53) - 1, 't': 1})),
            line(request('bool', 'dkg.adjudicate', {'n': True, 't': 1})),
            line(request('ballot', 'ballot.encrypt', b)), line(request())])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(responses[1]['error'], 'E_SCHEMA')
        self.assertEqual(responses[2]['error'], 'E_SCHEMA')
        self.assertFalse(responses[3]['ok'])
        self.assertTrue(responses[4]['ok'])

    def test_election_file_default_is_incomplete_and_content_optout_is_explicit(self):
        inp = {'path': 'elections/tiny-yesno-3v/bundle.json'}
        result, responses = self.execute([line(HELLO), line(request('election', 'verify.election', inp))])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(responses[1]['ok'])  # processed, not a PASS claim
        self.assertEqual(responses[1]['output']['verdict'], 'INCOMPLETE')
        self.assertEqual(responses[1]['output']['checks']['chk.board.append_only'], 'not_run')
        result, responses = self.execute([line(HELLO), line(request('election', 'verify.election', inp))], content_only=True)
        expected = json.loads((TREE / 'elections/tiny-yesno-3v/expected-report.json').read_text())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(responses[1]['output'], expected)
        self.assertTrue(any('content' in n.lower() for n in responses[1]['details']['notes']))

    def test_election_cannot_supply_content_only_option_or_forge_signatures(self):
        original = json.loads((TREE / 'elections/tiny-yesno-3v/bundle.json').read_text())
        original['manifest']['sigs'] = []
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'election.json'
            path.write_text(json.dumps(original))
            result, responses = self.execute([line(HELLO),
                line(request('bad', 'verify.election', {'path': 'election.json'})),
                line(request('override', 'verify.election', {'path': 'election.json', 'content_only': True}))],
                tree=directory, content_only=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(responses[1]['error'], 'E_MANIFEST_SIG')
        self.assertEqual(responses[1]['details']['verdict'], 'FAIL')
        self.assertEqual(responses[2]['error'], 'E_SCHEMA')

    def test_log_operation_preserves_exact_check_map_and_tampered_evidence(self):
        vectors = json.loads((TREE / 'elections/log-layer-4v/vectors.json').read_text())['vectors']
        valid = next(v for v in vectors if v['expect'].get('ok') is True)
        invalid = copy.deepcopy(valid['input'])
        invalid['board']['replace'] = {'checkpoints': []}
        result, responses = self.execute([line(HELLO),
            line(request('valid', 'log.verify_election', valid['input'])),
            line(request('invalid', 'log.verify_election', invalid))], content_only=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(responses[1]['output'], valid['expect']['output'])
        self.assertFalse(responses[2]['ok'])
        self.assertEqual(responses[2]['details']['verdict'], 'FAIL')

    @unittest.skipUnless(os.open in os.supports_dir_fd and hasattr(os, 'O_NOFOLLOW'), 'safe POSIX file reader')
    def test_file_references_reject_escape_symlinks_and_special_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'root'
            root.mkdir()
            (Path(directory) / 'secret.json').write_text('{"secret":"do not reflect"}')
            (root / 'link.json').symlink_to(Path(directory) / 'secret.json')
            (root / 'linkdir').symlink_to(directory, target_is_directory=True)
            os.mkfifo(root / 'fifo')
            paths = ['../secret.json', str(Path(directory) / 'secret.json'), 'link.json',
                     'linkdir/secret.json', 'fifo', 'C:\\secret.json', 'a/../secret.json']
            result, responses = self.execute([line(HELLO), *[
                line(request(str(i), 'verify.election', {'path': p})) for i, p in enumerate(paths)], line(request())], tree=root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(r['ok'] is False for r in responses[1:-1]))
        self.assertTrue(responses[-1]['ok'])
        self.assertNotIn(b'do not reflect', result.stdout + result.stderr)

    @unittest.skipUnless(os.open in os.supports_dir_fd and hasattr(os, 'O_NOFOLLOW'), 'safe POSIX file reader')
    def test_tree_descriptor_stays_pinned_when_path_is_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'tree'
            root.mkdir()
            (root / 'value.json').write_text('{"value":"pinned"}')
            tree = TreeReader(root)
            try:
                root.rename(Path(directory) / 'original')
                root.mkdir()
                (root / 'value.json').write_text('{"value":"substitute"}')
                self.assertEqual(tree.read({'path': 'value.json'}), {'value': 'pinned'})
            finally:
                tree.close()

    def test_file_size_limit_and_response_size_limit_are_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            huge = Path(directory) / 'huge.json'
            with huge.open('wb') as stream:
                stream.truncate(MAX_JSON_BYTES + 1)
            result, responses = self.execute([line(HELLO), line(request('huge', 'verify.election', {'path': 'huge.json'}))], tree=directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(responses[1]['error'], 'E_PARSE')
            tree = TreeReader(Path(directory))
            try:
                sink = io.BytesIO()
                with patch('qv_verifier.adapter.MAX_RESPONSE_BYTES', 200):
                    status = serve(tree, io.BytesIO(line(HELLO) + line(request('large', 'enc.canon_json', {'text': '"' + 'x' * 1000 + '"'}))), sink)
                self.assertEqual(status, 0)
                self.assertEqual(json.loads(sink.getvalue().splitlines()[1]),
                                 {'id': 'large', 'ok': False, 'error': 'ERR_RESPONSE_TOO_LARGE'})
            finally:
                tree.close()

    def test_primitives_remain_available_when_safe_file_io_is_unsupported(self):
        with tempfile.TemporaryDirectory() as directory, patch('qv_verifier.adapter.os.supports_dir_fd', set()):
            tree = TreeReader(Path(directory))
            sink = io.BytesIO()
            status = serve(tree, io.BytesIO(line(HELLO) + line(request()) +
                line(request('file', 'verify.election', {'path': 'x.json'}))), sink)
            tree.close()
        responses = [json.loads(s) for s in sink.getvalue().splitlines()]
        self.assertEqual(status, 0)
        self.assertTrue(responses[1]['ok'])
        self.assertEqual(responses[2]['error'], 'ERR_UNSUPPORTED_OP')


if __name__ == '__main__':
    unittest.main()
