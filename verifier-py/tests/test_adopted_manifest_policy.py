"""ADR-027 N-27 and source-backed B1-08 restrictions; shared TS/Python cases."""

import copy
import io
import json
from pathlib import Path
import unittest

from qv_verifier.adapter import HELLO, TreeReader, dispatch, serve
from qv_verifier.errors import QVError
from qv_verifier.manifest import validate
from qv_verifier.ops import op_manifest, op_rules
from qv_verifier.rules import evaluate

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / 'packages/protocol/test/fixtures/adopted-manifest-policy.json').read_text())
BUNDLE = json.loads((ROOT / 'test-vectors/v1/elections/tiny-yesno-3v/bundle.json').read_text())


def candidate(row):
    value = copy.deepcopy(BUNDLE['manifest']['body'])
    contest = value['contests'][0]
    if 'basis' in row:
        contest['rule']['basis'] = row['basis']
    if 'method' in row:
        contest['method'] = row['method']
        contest.pop('rule', None)
        contest['tie_break'] = {'type': 'declare-tie'}
        if row['method'] == 'approval':
            contest.pop('selection_limit', None)
        else:
            contest['selection_limit'] = row.get('selection_limit', 1)
    if 'options' in row:
        contest['options'] = [{'id': option, 'label': option.upper()} for option in row['options']]
    if 'winners' in row:
        contest['winners'] = row['winners']
    if 'quorum' in row:
        value['quorum'] = row['quorum']
    return value


def rules_input(row):
    contest = copy.deepcopy(BUNDLE['manifest']['body']['contests'][0])
    contest['rule']['basis'] = row['basis']
    return {'manifest_quorum': row['quorum'], 'contest': contest, 'counts': row['counts'],
            'participation': row['participation'], 'roll_size': row['roll_size']}


class AdoptedManifestPolicy(unittest.TestCase):
    def test_manifest_and_public_operation_follow_adopted_policy(self):
        for row in CASES['manifest_cases']:
            for operation in ('validator', 'public-operation'):
                with self.subTest(case=row['id'], operation=operation):
                    value = candidate(row)
                    def check():
                        if operation == 'validator':
                            validate(value, len(BUNDLE['roll']))
                        else:
                            op_manifest({'manifest': value, 'roll_size': len(BUNDLE['roll'])})
                    if row['valid']:
                        check()
                    else:
                        with self.assertRaises(QVError) as caught:
                            check()
                        self.assertEqual(caught.exception.code, row['py_error'])

    def test_stream_dispatch_rejects_all_three_invalid_manifest_forms(self):
        tree = TreeReader(ROOT / 'test-vectors')
        try:
            for row in CASES['manifest_cases']:
                if row['valid']:
                    continue
                with self.subTest(case=row['id']):
                    response = dispatch({'id': row['id'], 'op': 'manifest.validate_hash',
                        'input': {'manifest': candidate(row), 'roll_size': len(BUNDLE['roll'])}}, tree)
                    self.assertEqual(response, {'id': row['id'], 'ok': False, 'error': row['py_error']})
        finally:
            tree.close()

    def test_supported_bases_blank_ballots_and_roll_quorum_keep_exact_results(self):
        for row in CASES['rules_cases']:
            with self.subTest(case=row['id']):
                inp = rules_input(row)
                direct = evaluate(inp['manifest_quorum'], inp['contest'], inp['counts'],
                                  inp['participation'], inp['roll_size'])
                self.assertEqual(direct['outcome'], row['outcome'])
                self.assertEqual(op_rules(inp)['result'], direct)
        # This correction does not adopt a new rule-field presence policy for
        # other methods; their existing evaluator behavior is unchanged.
        contest = candidate({'method': 'single-choice', 'options': ['a', 'b']})['contests'][0]
        contest['rule'] = {'basis': 'roll'}
        self.assertEqual(evaluate(None, contest, {'a': 3, 'b': 1}, 4, 5)['outcome'],
                         {'kind': 'winners', 'winners': ['a']})

    def test_reserved_roll_threshold_is_refused_by_direct_and_public_rules(self):
        row = {**CASES['rules_cases'][0], 'basis': 'roll'}
        inp = rules_input(row)
        for operation in (
                lambda: evaluate(inp['manifest_quorum'], inp['contest'], inp['counts'],
                                 inp['participation'], inp['roll_size']),
                lambda: op_rules(inp)):
            with self.assertRaises(QVError) as caught:
                operation()
            self.assertEqual(caught.exception.code, 'E_RULES')

    def test_reserved_roll_threshold_is_not_hidden_by_unmet_quorum(self):
        row = {**CASES['rules_cases'][-2], 'basis': 'roll'}
        with self.assertRaises(QVError) as caught:
            op_rules(rules_input(row))
        self.assertEqual(caught.exception.code, 'E_RULES')

    def test_json_lines_refusal_keeps_adapter_available_for_supported_rules(self):
        requests = [HELLO,
            {'id': 'reserved', 'op': 'rules.evaluate',
             'input': rules_input({**CASES['rules_cases'][0], 'basis': 'roll'})},
            {'id': 'supported', 'op': 'rules.evaluate', 'input': rules_input(CASES['rules_cases'][0])}]
        source = io.BytesIO(b''.join((json.dumps(row) + '\n').encode() for row in requests))
        sink = io.BytesIO()
        tree = TreeReader(ROOT / 'test-vectors')
        try:
            self.assertEqual(serve(tree, source, sink), 0)
        finally:
            tree.close()
        responses = [json.loads(line) for line in sink.getvalue().splitlines()]
        self.assertEqual(responses[1], {'id': 'reserved', 'ok': False, 'error': 'E_RULES'})
        self.assertTrue(responses[2]['ok'])
        self.assertEqual(responses[2]['output']['result']['outcome'], {'kind': 'passed'})


if __name__ == '__main__':
    unittest.main()
