"""ADR-027 B1-02/07: independently recompute the preserved audit examples.

No recorded TS result is consumed. Matching TypeScript tests run the same
unchanged public fixtures; these assertions pin each approved outcome.
"""

import copy
import json
import unittest
from pathlib import Path

from qv_verifier import dkg, manifest, rules
from qv_verifier.election import verify_bundle
from qv_verifier.errors import QVError
from tests.test_protocol import make_manifest

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'docs/audit/2026-10-28/poc/B1/audit-b1-poc/out'


def bundle(name='E0-baseline'):
    return json.loads((FIXTURES / (name + '.bundle.json')).read_text())


class ApprovedSemanticParity(unittest.TestCase):
    def assert_content_pass(self, b):
        r = verify_bundle(b, allow_no_log=True)
        self.assertEqual(r['verdict'], 'PASS', r['findings'])
        self.assertFalse(any(f['fatal'] for f in r['findings']))
        self.assertEqual(r['checks']['chk.tally.aggregate'], 'pass')
        self.assertEqual(r['checks']['chk.tally.decrypt'], 'pass')
        self.assertEqual(r['checks']['chk.result.rules'], 'pass')
        return r

    def test_non_ballot_noise_never_replaces_valid_evidence(self):
        for name, code, encoding in [
                ('E7-bad-close-then-good', 'E_SIG', 'pass'),
                ('E13-C3-close-with-binding', 'E_SCHEMA', 'fail'),
                ('E17-tally-posted-twice', 'E_SCHEMA', 'pass')]:
            with self.subTest(name=name):
                r = self.assert_content_pass(bundle(name))
                self.assertIn(code, r['codes'])
                self.assertEqual(r['checks']['chk.encoding.canonical'], encoding)
                self.assertEqual(r['checks']['chk.keys.trustees'], 'pass')
                self.assertEqual(r['checks']['chk.time.window'], 'pass')
                self.assertEqual(verify_bundle(bundle(name))['verdict'], 'INCOMPLETE')

    def test_malformed_non_tally_is_ignored_but_malformed_tally_is_fatal(self):
        for extra in (None, {}, {'body': {'proto': 'qv1-r255-sha2', 'type': 'marker'}}):
            with self.subTest(extra=extra):
                b = bundle()
                b['log'].append({'seq': b['log'][-1]['seq'] + 1, 'entry': extra})
                r = self.assert_content_pass(b)
                self.assertEqual(r['checks']['chk.encoding.canonical'], 'fail')
        b = bundle()
        b['log'].append({'seq': b['log'][-1]['seq'] + 1,
                         'entry': {'body': {'proto': 'qv1-r255-sha2', 'type': 'tally'}}})
        self.assertEqual(verify_bundle(b, allow_no_log=True)['verdict'], 'FAIL')

    def test_forged_dkg_and_roll_markers_do_not_veto_honest_records(self):
        for typ in ('marker', 'roll-commit'):
            b = bundle()
            entry = copy.deepcopy(next(r['entry'] for r in b['log']
                                       if r['entry'].get('body', {}).get('type') == typ))
            for sig in entry['sigs']:
                sig['sig'] = '00' * 64
            b['log'].insert(0, {'seq': 0, 'entry': entry})
            r = self.assert_content_pass(b)
            self.assertIn('E_SIG', r['codes'])
            self.assertEqual(r['checks']['chk.keys.trustees'], 'pass')

    def test_no_valid_phase_marker_cannot_be_substituted_by_junk(self):
        b = bundle()
        for row in b['log']:
            if row['entry'].get('body', {}).get('name') == 'dkg-open':
                for sig in row['entry']['sigs']:
                    sig['sig'] = '00' * 64
        r = verify_bundle(b, allow_no_log=True)
        self.assertEqual(r['verdict'], 'FAIL')
        self.assertIn('E_DKG_MARKERS', r['codes'])

    def test_no_authenticated_close_is_incomplete_not_a_fabricated_tally(self):
        b = bundle()
        for row in b['log']:
            if row['entry'].get('body', {}).get('name') == 'election-close':
                for sig in row['entry']['sigs']:
                    sig['sig'] = '00' * 64
        r = verify_bundle(b, allow_no_log=True)
        self.assertEqual(r['verdict'], 'INCOMPLETE')
        self.assertEqual(r['checks']['chk.time.window'], 'not_run')
        self.assertEqual(r['checks']['chk.tally.decrypt'], 'not_run')
        self.assertNotIn('results', r)

    def test_conflicting_tally_is_fatal_while_original_computation_is_retained(self):
        r = verify_bundle(bundle('K-P3-second-tally-differs'), allow_no_log=True)
        self.assertEqual(r['verdict'], 'FAIL')
        self.assertIn('E_RESULT', r['codes'])
        self.assertTrue(any(f['fatal'] for f in r['findings']))
        self.assertEqual(r['checks']['chk.tally.decrypt'], 'pass')

    def test_approved_honest_election_outcomes(self):
        for name in ('E2-count-quorum', 'E3-tie-basis-counted', 'E3b-2of3-status-quo-yes',
                     'E4-kofn-winner-order', 'E15-excluded-latest-cast'):
            with self.subTest(name=name):
                b = bundle(name)
                r = self.assert_content_pass(b)
                expected = next(row['entry']['body']['results'] for row in b['log']
                                if row['entry'].get('body', {}).get('type') == 'tally')
                self.assertEqual(r['results'], expected)

    def test_count_quorum_has_one_canonical_field(self):
        m = make_manifest()
        m['quorum'] = {'type': 'count', 'value': 2}
        manifest.validate(m)
        self.assertTrue(rules.quorum_met(m['quorum'], 2, 100))
        self.assertFalse(rules.quorum_met(m['quorum'], 1, 100))
        m['quorum'] = {'type': 'count', 'n': 2}
        with self.assertRaises(QVError):
            manifest.validate(m)

    def test_specified_v1_roll_bound_is_enforced_without_allocating_a_roll(self):
        m = make_manifest()
        m['roll']['size'] = 1 << 20
        manifest.validate(m)
        m['roll']['size'] += 1
        with self.assertRaises(QVError):
            manifest.validate(m)
        del m['roll']['size']
        with self.assertRaises(QVError):
            manifest.validate(m, (1 << 20) + 1)

    def test_strict_threshold_equality_not_raw_yes_no_equality_controls_ties(self):
        c = make_manifest()['contests'][0]
        c['rule'] = {'type': 'threshold', 'num': 2, 'den': 3, 'basis': 'yes+no', 'strict': True}
        c['tie_break'] = {'type': 'status-quo', 'option': 'yes'}
        self.assertEqual(rules.evaluate(None, c, {'yes': 2, 'no': 1}, 3, 3)['outcome'],
                         {'kind': 'passed', 'reason': 'tie-break'})
        self.assertEqual(rules.evaluate(None, c, {'yes': 1, 'no': 1}, 3, 3)['outcome'],
                         {'kind': 'rejected'})
        c['rule']['strict'] = False
        self.assertEqual(rules.evaluate(None, c, {'yes': 2, 'no': 1}, 3, 3)['outcome'],
                         {'kind': 'passed'})

    def test_dkg_distinguishing_cases_recompute_approved_sets_and_contexts(self):
        expected = {
            'D0-honest': ([1, 2, 3], 'bed87454af06620a1772b99c6b42d4a86f9944cd8d1482dc1c75107cc4e6ef45'),
            'D1-duplicate-different-commit': ([1, 2], '0856ce918a0c587b7d1fa6e5ec73dfc4f2481204cacc0d060466449f22c5b024'),
            'D3-complaint-vs-R2-disqualified': ([1, 3], '1151574fece914d9004ac64d791977bd608822528960c7729b73d101a7d5625c'),
            'D4-commit-before-dkg-open': ([1, 2, 3], 'd36b2afefca89aada1042ed8e0cc18f9d835d63e26faf4ade1ce04ee72c63971'),
        }
        for v in json.loads((FIXTURES / 'op-dkg.json').read_text()):
            if v['id'] not in expected:
                continue
            with self.subTest(name=v['id']):
                q, ctx = expected[v['id']]
                for reversed_order in (False, True):
                    records = copy.deepcopy(v['records'])
                    if reversed_order:
                        for rows in records.values():
                            rows.reverse()
                    got = dkg.adjudicate(bytes.fromhex(v['manifest_hash_hex']), v['n'], v['t'], v['markers'], records)
                    self.assertEqual(got['Q'], q)
                    self.assertEqual(got['ctx'].hex(), ctx)

    def test_dkg_identical_repeat_and_late_conflict_do_not_change_context(self):
        v = next(x for x in json.loads((FIXTURES / 'op-dkg.json').read_text()) if x['id'] == 'D0-honest')
        expected = dkg.adjudicate(bytes.fromhex(v['manifest_hash_hex']), v['n'], v['t'], v['markers'], v['records'])
        for duplicate in (True, False):
            records = copy.deepcopy(v['records'])
            extra = copy.deepcopy(records['commits'][0])
            if duplicate:
                extra['seq'] = 0  # Same body before the commitment cutoff.
            else:
                extra['seq'] = v['markers']['dkg-r1-open']  # Strictly late.
                extra['body']['h'] = 'ff' * 32
            records['commits'].append(extra)
            got = dkg.adjudicate(bytes.fromhex(v['manifest_hash_hex']), v['n'], v['t'], v['markers'], records)
            self.assertEqual(got['Q'], expected['Q'])
            self.assertEqual(got['ctx'], expected['ctx'])


if __name__ == '__main__':
    unittest.main()
