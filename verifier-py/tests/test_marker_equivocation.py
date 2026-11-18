"""QV-ADR-027 / P10: independently sign election-marker variants; preserve the corpus."""
import copy
import hashlib
import unittest

from qv_verifier import ed25519
from qv_verifier.election import record_msg, verify_bundle
from tests.test_approved_report_parity import honest, tally

COORD = hashlib.sha256(b'vec-tiny/coord').digest()
OUTSIDER = hashlib.sha256(b'p10-python-outsider').digest()
NAMES = ('election-open', 'election-close')
DEPENDENTS = ('chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate',
              'chk.tally.decrypt', 'chk.result.rules', 'chk.benaloh.spoiled')


def marker(bundle, name):
    return next(row['entry'] for row in bundle['log']
                if row['entry'].get('body', {}).get('name') == name)


def signed(bundle, body, seed=COORD):
    ctx = bytes.fromhex(tally(bundle)['ctx'])
    return {'body': body, 'sigs': [{'key': ed25519.public_key(seed).hex(),
                                   'sig': ed25519.sign(seed, record_msg(ctx, body)).hex()}]}


def append(bundle, entry):
    bundle['log'].append({'seq': bundle['log'][-1]['seq'] + 1, 'entry': entry})


class MarkerEquivocation(unittest.TestCase):
    def assert_pass(self, report, bundle):
        self.assertEqual(report['verdict'], 'PASS', report['findings'])
        self.assertEqual(report['checks']['chk.time.window'], 'pass')
        self.assertEqual(report['counts']['counted'], tally(bundle)['n_counted'])
        self.assertEqual(report['results'], tally(bundle)['results'])

    def test_honest_election_and_default_log_gate(self):
        bundle = honest()
        self.assertEqual(ed25519.public_key(COORD).hex(), bundle['manifest']['body']['coordinator']['keys'][0])
        self.assert_pass(verify_bundle(bundle, allow_no_log=True), bundle)
        self.assertEqual(verify_bundle(bundle)['verdict'], 'INCOMPLETE')

    def test_identical_canonical_bodies_ignore_signature_array_order(self):
        for name in NAMES:
            with self.subTest(name=name):
                bundle = honest()
                first = marker(bundle, name)
                first['sigs'].extend(signed(bundle, first['body'], OUTSIDER)['sigs'])
                repeat = copy.deepcopy(first)
                repeat['body'] = dict(reversed(list(repeat['body'].items())))
                repeat['sigs'].reverse()
                self.assertNotEqual(first['sigs'], repeat['sigs'])
                append(bundle, repeat)
                report = verify_bundle(bundle, allow_no_log=True)
                self.assert_pass(report, bundle)
                self.assertTrue(any(f['code'] == 'E_MARKERS' and not f['fatal'] for f in report['findings']))
                self.assertFalse(any(f['fatal'] for f in report['findings']))

    def test_differing_authenticated_bodies_fail_window_and_stop_dependents(self):
        for name in NAMES:
            for changed_first in (False, True):
                bundle = honest()
                first = marker(bundle, name)
                original = copy.deepcopy(first)
                # An existing valid marker field; do not add an invented opens_at field.
                changed = signed(bundle, {**first['body'], 'qmask': 1})
                if changed_first:
                    first.update(changed)
                append(bundle, original if changed_first else changed)
                for allow_no_log in (False, True):
                    with self.subTest(name=name, changed_first=changed_first, content_only=allow_no_log):
                        report = verify_bundle(bundle, allow_no_log=allow_no_log)
                        self.assertEqual(report['verdict'], 'FAIL', report['findings'])
                        self.assertEqual(report['checks']['chk.time.window'], 'fail')
                        self.assertTrue(any(f['code'] == 'E_MARKERS' and f['fatal'] for f in report['findings']))
                        for check in ('chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees'):
                            self.assertEqual(report['checks'][check], 'pass', check)
                        for check in DEPENDENTS:
                            self.assertEqual(report['checks'][check], 'not_run', check)
                        self.assertEqual(report['counts'], {'cast': 0, 'spoiled': 0, 'counted': 0})
                        self.assertNotIn('results', report)

    def test_invalid_or_unauthorized_signatures_do_not_poison_a_valid_marker(self):
        for name in NAMES:
            for before in (False, True):
                for bad_signature in (False, True):
                    with self.subTest(name=name, before=before, bad_signature=bad_signature):
                        bundle = honest()
                        body = {**marker(bundle, name)['body'], 'qmask': 1}
                        # A valid outsider signature is still below the required coordinator threshold.
                        junk = signed(bundle, body, COORD if bad_signature else OUTSIDER)
                        if bad_signature:
                            junk['sigs'][0]['sig'] = '00' * 64
                        if before:
                            bundle['log'].insert(0, {'seq': 0, 'entry': junk})
                        else:
                            append(bundle, junk)
                        report = verify_bundle(bundle, allow_no_log=True)
                        self.assert_pass(report, bundle)
                        self.assertTrue(any(f['code'] == 'E_SIG' and not f['fatal'] for f in report['findings']))
                        self.assertNotIn('E_MARKERS', report['codes'])


if __name__ == '__main__':
    unittest.main()
