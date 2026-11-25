"""Frozen interoperability vectors and independent signed-rule trust probes."""
import copy
import gc
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import warnings
from unittest.mock import patch

from qv_verifier import ed25519, qvjson
from qv_verifier.governance import (
    EXPORT_FORMAT, MAX_EXPORT_BYTES, governance_hash, group_id, rules_hash,
    read_export, signature_digest, verify_group_rules_export, verify_group_rules_json,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'conformance/governance/v1/cases.json'
FIXTURE_SHA256 = '739fccbe4e89116e31eb37d8738151d4a3aafb5063c9793068a431c4bad2d265'
CORPUS = json.loads(FIXTURE.read_bytes())
CASES = {c['id']: c for c in CORPUS['cases']}
CLI = ROOT / 'verifier-py/qv_verifier'


def trust(case):
    t = case['trust']
    return dict(identity_key=t['identityKey'], genesis_rules_hash=t['genesisRulesHash'])


def frame_hash(label, fields):
    # Deliberately spell out the published frame rather than call the IUT helper.
    def lp(data):
        return len(data).to_bytes(4, 'big') + data
    data = lp(b'QV-GOV-HASH') + lp(b'qv-governance/1') + lp(label.encode())
    data += len(fields).to_bytes(4, 'big') + b''.join(lp(x) for x in fields)
    return hashlib.sha256(data).digest()


def digest(body):
    return frame_hash('signature', [bytes.fromhex(body['group_id']), b'group-rules',
                                   frame_hash('body', [qvjson.jcs(body)])])


SEEDS = [bytes([n]) * 32 for n in range(101, 106)]
KEYS = [ed25519.public_key(seed).hex() for seed in SEEDS]


def signed(body, signers):
    result = {'body': copy.deepcopy(body), 'sigs': [
        {'key': KEYS[i], 'sig': ed25519.sign(SEEDS[i], digest(body)).hex()} for i in signers]}
    result['sigs'].sort(key=lambda s: s['key'])
    return result


def fresh_history():
    first = copy.deepcopy(CASES['genesis']['input']['rules'][0]['body'])
    first.update(identity_key=KEYS[0], group_id=frame_hash('group-id', [bytes.fromhex(KEYS[0])]).hex(),
                 steward_keys=sorted(KEYS[1:4]))
    first_hash = hashlib.sha256(b'QV-rules/1' + qvjson.jcs(first)).hexdigest()
    second = copy.deepcopy(first)
    second.update(version=2, prev_rules_hash=first_hash, decision_class='rules')
    second['policy']['enrollment']['invite_ttl_hours'] = 72
    amended = signed(second, [1, 2])
    amended['ratification'] = {'manifest_hash': 'ab' * 32}
    document = {'format': EXPORT_FORMAT, 'rules': [signed(first, [0, 1, 2]), amended]}
    return document, dict(identity_key=KEYS[0], genesis_rules_hash=first_hash)


class GovernanceVectors(unittest.TestCase):
    def test_frozen_shared_cases_and_independent_digest_constants(self):
        self.assertEqual(hashlib.sha256(FIXTURE.read_bytes()).hexdigest(), FIXTURE_SHA256)
        self.assertEqual(len(CORPUS['cases']), 64)
        for case in CORPUS['cases']:
            with self.subTest(vector=case['id']):
                report = verify_group_rules_export(case['input'], **trust(case),
                    verify_ratification=lambda r, c=case: dict(r) in c['trust'].get('ratifications', []))
                self.assertEqual(report['status'], case['status'], report)
                if 'code' in case:
                    self.assertEqual(report['errors'][0]['code'], case['code'])
                if 'active_version' in case:
                    self.assertEqual(report['active_version'], case['active_version'])
                if report['status'] == 'INVALID':
                    self.assertEqual(report['versions'], 0)
                    self.assertNotIn('active_rules_hash', report)
                    self.assertNotIn('candidate_rules_hash', report)
        first = CASES['genesis']['input']['rules'][0]['body']
        expected = CORPUS['hashes']
        self.assertEqual(rules_hash(first), expected['genesis_rules_hash'])
        self.assertEqual(signature_digest(first).hex(), expected['genesis_signature_digest'])
        self.assertEqual(digest(first), signature_digest(first))
        self.assertEqual(group_id(first['identity_key']), first['group_id'])
        for sig in CASES['genesis']['input']['rules'][0]['sigs']:
            self.assertTrue(ed25519.verify(bytes.fromhex(sig['key']), digest(first), bytes.fromhex(sig['sig'])))

    def test_new_python_signed_identity_can_also_be_a_steward_without_double_counting(self):
        doc, pins = fresh_history()
        first = doc['rules'][0]['body']
        first['steward_keys'] = sorted([KEYS[0], KEYS[1], KEYS[2]])
        pins['genesis_rules_hash'] = hashlib.sha256(b'QV-rules/1' + qvjson.jcs(first)).hexdigest()
        doc['rules'] = [signed(first, [0, 1])]
        self.assertEqual(verify_group_rules_export(doc, **pins)['status'], 'VERIFIED')
        doc['rules'] = [signed(first, [0])]
        report = verify_group_rules_export(doc, **pins)
        self.assertEqual(report['status'], 'INVALID')
        self.assertEqual(report['errors'][0]['code'], 'E_RULES_SIG')

    def test_wire_parser_and_resource_boundaries_fail_without_exposing_data(self):
        case = CASES['genesis']
        raw = qvjson.jcs(case['input'])
        self.assertEqual(verify_group_rules_json(raw, **trust(case))['status'], 'VERIFIED')
        variants = [raw.replace(b'"version":1', b'"version":1,"version":1'),
                    raw.replace(b'"version":1', b'"version":1.0'),
                    raw.replace(b'"version":1', b'"version":1e0'),
                    raw.replace(b'"version":1', b'"version":-0'),
                    raw.replace(b'"group-rules"', b'"private-sentinel\\ud800"'),
                    raw.replace(b'"group-rules"', b'"e\\u0301"'), b'\xef\xbb\xbf' + raw,
                    raw + b'\x00', b'\xff', b'{"private-sentinel":null}']
        for value in variants:
            report = verify_group_rules_json(value, **trust(case))
            self.assertEqual(report['status'], 'INVALID')
            self.assertEqual(report['errors'][0]['code'], 'E_RULES_SCHEMA')
            self.assertNotIn('private-sentinel', json.dumps(report))
        report = verify_group_rules_json(b' ' * (MAX_EXPORT_BYTES + 1), **trust(case))
        self.assertEqual(report['errors'][0]['code'], 'E_RULES_BOUND')
        doc = copy.deepcopy(case['input'])
        doc['rules'] *= 129
        self.assertEqual(verify_group_rules_export(doc, **trust(case))['errors'][0]['code'], 'E_RULES_BOUND')
        cycle = {}
        cycle['x'] = cycle
        self.assertEqual(verify_group_rules_export(cycle, **trust(case))['status'], 'INVALID')

    def test_all_evidence_is_checked_before_a_ratification_callback(self):
        doc, pins = fresh_history()
        called = []
        doc['rules'][1]['sigs'][0]['sig'] = '00' * 64
        report = verify_group_rules_export(doc, **pins, verify_ratification=lambda req: called.append(req) or True)
        self.assertEqual(report['status'], 'INVALID')
        self.assertEqual(called, [])
        self.assertEqual(report['pending_ratifications'], [])
        self.assertNotIn('active_version', report)

    def test_missing_pointer_cannot_activate_even_when_callback_would_approve(self):
        doc, pins = fresh_history()
        del doc['rules'][1]['ratification']
        called = []
        report = verify_group_rules_export(doc, **pins, verify_ratification=lambda req: called.append(req) or True)
        self.assertEqual(report['status'], 'INCOMPLETE')
        self.assertEqual(report['active_version'], 1)
        self.assertNotIn('manifest_hash', report['pending_ratifications'][0])
        self.assertEqual(called, [])

    def test_pointer_can_be_attached_after_signing_but_cannot_choose_competing_election(self):
        doc, pins = fresh_history()
        signed_candidate = copy.deepcopy(doc['rules'][1])
        del doc['rules'][1]['ratification']
        original_hash = rules_hash(doc['rules'][1]['body'])
        doc['rules'].append(signed_candidate)
        called = []
        def approve(req):
            called.append(dict(req))
            return req['manifest_hash'] == 'ab' * 32
        report = verify_group_rules_export(doc, **pins, verify_ratification=approve)
        self.assertEqual(report['status'], 'VERIFIED')
        self.assertEqual(report['active_version'], 2)
        self.assertEqual(report['candidate_rules_hash'], original_hash)
        self.assertEqual(report['versions'], 2)
        self.assertEqual(len(called), 1)
        conflicting = copy.deepcopy(signed_candidate)
        conflicting['ratification']['manifest_hash'] = 'cd' * 32
        doc['rules'].append(conflicting)
        called.clear()
        report = verify_group_rules_export(doc, **pins, verify_ratification=approve)
        self.assertEqual(report['errors'][0]['code'], 'E_RULES_CHAIN')
        self.assertEqual(called, [])

    def test_later_ratifications_never_skip_an_unratified_predecessor(self):
        case = CASES['later-approval-cannot-skip-earlier']
        requests = []
        def only_later(req):
            requests.append(dict(req))
            return dict(req) in case['trust']['ratifications']
        report = verify_group_rules_export(case['input'], **trust(case), verify_ratification=only_later)
        self.assertEqual(report['status'], 'INCOMPLETE')
        self.assertEqual(report['active_version'], 1)
        self.assertEqual(len(requests), 2)
        self.assertEqual(len(report['pending_ratifications']), 1)

    def test_callback_cannot_mutate_verified_snapshot_or_request(self):
        doc, pins = fresh_history()
        candidate_hash = rules_hash(doc['rules'][1]['body'])
        def approve(req):
            doc['rules'][1]['body']['policy']['stewards']['approval']['k'] = 1
            with self.assertRaises(TypeError):
                req['rules_hash'] = 'ff' * 32
            return True
        report = verify_group_rules_export(doc, **pins, verify_ratification=approve)
        self.assertEqual(report['status'], 'VERIFIED')
        self.assertEqual(report['candidate_rules_hash'], candidate_hash)

    def test_nonboolean_callback_answers_cannot_supply_authority_or_execute_protocols(self):
        doc, pins = fresh_history()
        called = []
        class HostileAnswer:
            def __bool__(self):
                called.append('truthiness')
                raise AssertionError('never called')
            def __await__(self):
                called.append('await')
                raise AssertionError('never called')
        for answer in (1, 'true', {'verified': True}, HostileAnswer(), None):
            report = verify_group_rules_export(doc, **pins, verify_ratification=lambda req: answer)
            self.assertEqual(report['status'], 'INCOMPLETE')
            self.assertEqual(report['active_version'], 1)
        self.assertEqual(called, [])
        def rejected(_):
            raise RuntimeError('private-sentinel')
        report = verify_group_rules_export(doc, **pins, verify_ratification=rejected)
        self.assertEqual(report['status'], 'INCOMPLETE')
        self.assertNotIn('private-sentinel', json.dumps(report))

    def test_async_callback_is_not_executed_and_does_not_leak_unawaited_warning(self):
        doc, pins = fresh_history()
        called = []
        async def async_approve(_):
            called.append('executed')
            raise RuntimeError('private-sentinel')
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter('always')
            report = verify_group_rules_export(doc, **pins, verify_ratification=async_approve)
            gc.collect()
        self.assertEqual(report['status'], 'INCOMPLETE')
        self.assertEqual(called, [])
        self.assertEqual(captured, [])

    def test_pins_are_external_and_cannot_be_injected_into_export(self):
        doc, pins = fresh_history()
        for field, value in (('identity_key', pins['identity_key']),
                             ('genesis_rules_hash', pins['genesis_rules_hash']),
                             ('verify_ratification', True), ('ratifications', [])):
            changed = {**doc, field: value}
            report = verify_group_rules_export(changed, **pins)
            self.assertEqual(report['status'], 'INVALID')
            self.assertEqual(report['errors'][0]['code'], 'E_RULES_SCHEMA')
        self.assertEqual(verify_group_rules_export(doc)['status'], 'INVALID')

    def test_governance_domain_is_distinct_and_frame_boundaries_are_checked(self):
        self.assertNotEqual(governance_hash('body', [b'ab', b'c']), governance_hash('body', [b'a', b'bc']))
        self.assertNotEqual(governance_hash('body', [b'ab']), governance_hash('group-id', [b'ab']))
        for label, fields in [('BODY', []), ('body', [b'x'] * 17), ('body', [b' ' * (MAX_EXPORT_BYTES + 1)]),
                              ('body', ['not bytes'])]:
            with self.assertRaises(ValueError):
                governance_hash(label, fields)

    def test_file_reader_fails_closed_when_nonblocking_nofollow_is_unavailable(self):
        with patch('qv_verifier.governance.os.O_NOFOLLOW', 0, create=True):
            with self.assertRaises(ValueError):
                read_export('not-consulted')


class GovernanceCLI(unittest.TestCase):
    def run_cli(self, path, pins=None, extra=()):
        pins = pins or trust(CASES['genesis'])
        args = [sys.executable, '-I', str(CLI), 'governance', 'verify', str(path),
                '--identity-key', pins['identity_key'], '--genesis-hash', pins['genesis_rules_hash'], *extra]
        with tempfile.TemporaryDirectory() as cwd:
            return subprocess.run(args, cwd=cwd, capture_output=True, timeout=20)

    def test_actual_executable_distinguishes_genesis_pending_and_invalid(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rules.json'
            for name, exit_code in [('genesis', 0), ('amendment-needs-final-election', 3), ('signature-flipped', 1)]:
                case = CASES[name]
                path.write_bytes(qvjson.jcs(case['input']))
                result = self.run_cli(path, trust(case))
                self.assertEqual(result.returncode, exit_code, result.stderr)
                self.assertEqual(result.stderr, b'')
                self.assertEqual(json.loads(result.stdout)['status'], case['status'])

    def test_cli_requires_external_pins_and_has_no_ratification_override(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rules.json'
            path.write_bytes(qvjson.jcs(CASES['genesis']['input']))
            missing = subprocess.run([sys.executable, '-I', str(CLI), 'governance', 'verify', str(path)],
                                     capture_output=True, timeout=10)
            self.assertEqual(missing.returncode, 2)
            result = self.run_cli(path, extra=['--trust-ratification'])
            self.assertEqual(result.returncode, 2)
            result = self.run_cli(path, {**trust(CASES['genesis']), 'genesis_rules_hash': 'ff' * 32})
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['errors'][0]['code'], 'E_RULES_ANCHOR')

    def test_cli_bounds_input_before_parsing_and_does_not_echo_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'private-sentinel'
            result = self.run_cli(path)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn(b'private-sentinel', result.stderr)
            with path.open('wb') as stream:
                stream.truncate(MAX_EXPORT_BYTES + 1)
            result = self.run_cli(path)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['errors'][0]['code'], 'E_RULES_BOUND')
            path.write_bytes(b'{"private-sentinel":"\\ud800"}')
            result = self.run_cli(path)
            self.assertEqual(result.returncode, 1)
            self.assertNotIn(b'private-sentinel', result.stdout + result.stderr)

    @unittest.skipUnless(hasattr(os, 'O_NOFOLLOW') and hasattr(os, 'mkfifo'), 'POSIX special-file protection')
    def test_cli_never_blocks_on_fifo_or_follows_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            os.mkfifo(root / 'fifo')
            result = self.run_cli(root / 'fifo')
            self.assertEqual(result.returncode, 2)
            real = root / 'real.json'
            real.write_bytes(qvjson.jcs(CASES['genesis']['input']))
            (root / 'link.json').symlink_to(real)
            result = self.run_cli(root / 'link.json')
            self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
