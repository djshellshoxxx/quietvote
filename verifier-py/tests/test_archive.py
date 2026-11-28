"""Reference-server QVB transport QA; Python stdlib writes the test tar files."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from qv_verifier import archive
from qv_verifier.errors import QVError

ROOT = Path(__file__).resolve().parents[2]
VEC = ROOT / 'test-vectors/v1/elections/log-layer-4v'
CLI = ROOT / 'verifier-py/qv_verifier'


def encode(value):
    return json.dumps(value, separators=(',', ':')).encode()


def sum256(data):
    return hashlib.sha256(data).hexdigest()


def source_files():
    election = json.loads((VEC / 'bundle.json').read_bytes())
    board = json.loads((VEC / 'board.json').read_bytes())
    raw = b''.join(encode(row) + b'\n' for row in board['entries'])
    desc = {key: board[key] for key in ('format', 'origin', 'tree_size', 'created_at', 'root_b64', 'generator', 'spec')}
    pk = bytes.fromhex(election['manifest']['body']['bb']['log_pk'])
    desc.update(log_pk_b64u=base64.urlsafe_b64encode(pk).decode().rstrip('='), entries_sha256=sum256(raw))
    members = {'bundle.json': encode(desc), 'log/entries.jsonl': raw,
               'redactions.json': b'[]', 'election.json': encode(election),
               'witness/policy.json': encode(board['policy']), 'README.txt': b'QuietVote'}
    for note in board['checkpoints']:
        size = note.split('\n')[1]
        members[f'log/checkpoints/{size}.txt'] = note.encode()
    return members


def checksummed(members):
    sums = b''.join(f'{sum256(raw)}  {key}\n'.encode() for key, raw in sorted(members.items()))
    return list(members.items()) + [('SHA256SUMS', sums)]


def pack(items):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name, data in items:
            item = tarfile.TarInfo(name)
            item.size = len(data)
            tar.addfile(item, io.BytesIO(data))
    return buf.getvalue()


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = Path(tmp.name, 'snapshot.qvb')

    def load(self, files):
        self.path.write_bytes(pack(checksummed(files)))
        return archive.load_archive(self.path)

    def cli(self, path, *args):
        return subprocess.run([sys.executable, '-I', str(CLI), 'verify', str(path), *args],
                              capture_output=True, timeout=90)

    def test_complete_witnessed_archive_and_json_have_identical_real_cli_reports(self):
        files = source_files()
        # Archive members may be written in any order and convenience logs can be filtered.
        stripped = json.loads(files['election.json'])
        stripped['log'] = stripped['log'][::2]
        files['election.json'] = encode(stripped)
        result = self.load(dict(reversed(list(files.items()))))
        self.assertEqual(result['log'], json.loads((VEC / 'bundle.json').read_bytes())['log'])
        expected = self.cli(VEC / 'bundle.json', '--board', str(VEC / 'board.json'))
        actual = self.cli(self.path)
        self.assertEqual(expected.returncode, 0, expected.stderr)
        self.assertEqual(actual.returncode, 0, actual.stderr)
        self.assertEqual(actual.stdout, expected.stdout)
        self.assertEqual(json.loads(actual.stdout)['checks']['chk.board.witness'], 'pass')
        self.assertEqual(self.cli(self.path, '--board', str(VEC / 'board.json')).returncode, 2)

    def test_member_integrity_and_regular_file_framing(self):
        original = checksummed(source_files())
        cases = {'duplicate': pack(original + [original[0]]), 'unlisted': pack(original + [('README2', b'x')]),
                 'checksum': pack([(k, v + b'x' if k == 'README.txt' else v) for k, v in original]),
                 'trailing': pack(original) + b'x', 'truncated': pack(original)[:1100],
                 'omitted': pack([(k, v) for k, v in original if k != 'election.json'])}
        for name, raw in cases.items():
            with self.subTest(case=name), self.assertRaises(QVError):
                self.path.write_bytes(raw)
                archive.load_archive(self.path)

    def test_redacted_manifest_still_binds_the_convenience_copy_to_entry_zero(self):
        f = source_files()
        entries = [json.loads(row) for row in f['log/entries.jsonl'].splitlines()]
        entries[0]['body_b64u'] = None
        f['log/entries.jsonl'] = b''.join(encode(row) + b'\n' for row in entries)
        d = json.loads(f['bundle.json'])
        d['entries_sha256'] = sum256(f['log/entries.jsonl'])
        f['bundle.json'] = encode(d)
        f['redactions.json'] = encode([{'seq': 0, 'redacted_at': 1, 'reason': 'fixture'}])
        self.assertIsNone(self.load(f)['board']['entries'][0]['body_b64u'])
        e = json.loads(f['election.json'])
        e['manifest']['body']['title'] = 'A different election'
        f['election.json'] = encode(e)
        with self.assertRaisesRegex(QVError, 'header commitment'):
            self.load(f)

    def test_descriptor_convenience_and_checkpoint_binding(self):
        for case in ('other-key', 'entry-digest', 'duplicate-seq', 'reordered-seq', 'copy-mismatch',
                     'manifest-mismatch', 'checkpoint-name', 'wrong-size', 'phantom-redaction', 'duplicate-json-key'):
            with self.subTest(case=case), self.assertRaises(QVError):
                f = source_files()
                d, e = map(json.loads, (f['bundle.json'], f['election.json']))
                if case == 'other-key':
                    d['log_pk_b64u'] = 'A' * 43
                elif case == 'entry-digest':
                    d['entries_sha256'] = 'f' * 64
                elif case == 'duplicate-seq':
                    e['log'].append(e['log'][0])
                elif case == 'reordered-seq':
                    e['log'].reverse()
                elif case == 'copy-mismatch':
                    e['log'][0]['entry'] = {}
                elif case == 'manifest-mismatch':
                    e['manifest']['sigs'] = []
                elif case == 'checkpoint-name':
                    key = next(k for k in f if k.startswith('log/checkpoints/'))
                    f['log/checkpoints/999.txt'] = f.pop(key)
                elif case == 'wrong-size':
                    d['tree_size'] += 1
                elif case == 'phantom-redaction':
                    f['redactions.json'] = b'[{"seq":1,"reason":"operator","redacted_at":1}]'
                elif case == 'duplicate-json-key':
                    f['log/entries.jsonl'] = f['log/entries.jsonl'].replace(b'{"seq":0', b'{"seq":0,"seq":0', 1)
                    d['entries_sha256'] = sum256(f['log/entries.jsonl'])
                f['bundle.json'], f['election.json'] = encode(d), encode(e)
                self.load(f)

    def test_redaction_preserves_the_header_and_absent_record(self):
        f = source_files()
        entries = [json.loads(row) for row in f['log/entries.jsonl'].splitlines()]
        seq = 1
        header = entries[seq]['header_b64u']
        entries[seq]['body_b64u'] = None
        f['log/entries.jsonl'] = b''.join(encode(row) + b'\n' for row in entries)
        d = json.loads(f['bundle.json'])
        d['entries_sha256'] = sum256(f['log/entries.jsonl'])
        f['bundle.json'] = encode(d)
        f['redactions.json'] = encode([{'seq': seq, 'redacted_at': 1, 'reason': 'operator'}])
        with self.assertRaises(QVError):
            self.load(f)  # A convenience copy cannot reinsert an absent signed body.
        e = json.loads(f['election.json'])
        e['log'] = [row for row in e['log'] if row['seq'] != seq]
        f['election.json'] = encode(e)
        result = self.load(f)
        self.assertEqual(result['board']['entries'][seq], {'seq': seq, 'header_b64u': header, 'body_b64u': None})
        self.assertEqual(result['log'], e['log'])
        json_file = self.path.with_suffix('.json')
        json_file.write_bytes(encode(result))
        a, b = self.cli(self.path), self.cli(json_file)
        self.assertIn(a.returncode, (1, 3))
        self.assertEqual((a.returncode, a.stdout), (b.returncode, b.stdout))
        self.assertTrue(a.stdout)

    def test_public_metadata_cannot_authorize_a_witness_or_override_a_failed_check(self):
        f = source_files()
        b = json.loads(f['bundle.json'])
        b['root_b64'] = base64.b64encode(bytes(32)).decode()
        f['bundle.json'] = encode(b)
        self.load(f)
        result = self.cli(self.path, '--content-only')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(json.loads(result.stdout)['checks']['chk.board.append_only'], 'fail')

    def test_limits_include_padding_and_member_count(self):
        members = source_files()
        self.load(members)
        size = self.path.stat().st_size
        with patch.object(archive, 'MAX_JSON_BYTES', size):
            archive.load_archive(self.path)
        for limit, maximum in [('MAX_JSON_BYTES', size - 1), ('_MAX_FILES', len(members)),
                               ('_MAX_ENTRIES', 2), ('_MAX_LINE', 24)]:
            with self.subTest(limit=limit), patch.object(archive, limit, maximum), self.assertRaises(QVError):
                archive.load_archive(self.path)
