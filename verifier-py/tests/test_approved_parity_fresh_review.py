"""Independent probes for the approved record/outcome parity milestone."""
import copy
import json
from pathlib import Path
import unittest

from qv_verifier import dkg, proofs, rules
from qv_verifier.aead import aes256gcm_encrypt
from qv_verifier.election import verify_bundle
from qv_verifier.errors import QVError
from qv_verifier.framed_hash import hs, u8
from qv_verifier.ristretto import G, R_IDENTITY, sc
from tests.test_protocol import DKGFixture, MH, make_manifest

ROOT = Path(__file__).resolve().parents[2]
TREE = ROOT / 'test-vectors/v1'
AUDIT = ROOT / 'docs/audit/2026-10-28/poc/B1/audit-b1-poc/out'


def honest():
    return json.loads((TREE / 'elections/tiny-yesno-3v/bundle.json').read_text())


def kind(bundle, value):
    return next(row['entry'] for row in bundle['log']
                if row['entry'].get('body', {}).get('type') == value)


class FreshApprovedParityReview(unittest.TestCase):
    def test_degenerate_dh_statements_are_not_secret_knowledge(self):
        # Both statements satisfy the algebraic verifier without its explicit
        # nonidentity guard. These are computed proofs, not random bad bytes.
        for secret, R in ((0, G.mul(17)), (91, R_IDENTITY)):
            with self.subTest(secret=secret):
                E, S, nonce = G.mul(secret), R.mul(secret), 2345
                c = hs('cp-dh', MH, u8(1), u8(2), E.encode(), R.encode(),
                       S.encode(), G.mul(nonce).encode(), R.mul(nonce).encode())
                s = int.from_bytes(sc(nonce + c * secret), 'little')
                self.assertFalse(proofs.dh_check(MH, 1, 2, E, R, S, c, s))
                with self.assertRaises(QVError) as caught:
                    proofs.dh_verify(MH, 1, 2, E.hex(), R.hex(), S.hex(),
                                     {'c': sc(c).hex(), 's': sc(s).hex()})
                self.assertEqual(caught.exception.code, 'E_DKG_COMPLAINT')

    def test_identity_r_in_rejected_package_cannot_exclude_the_accuser(self):
        fixture = DKGFixture(n=4, t=2, false_complaint=(1, 2))
        i, j = 1, 2
        fixture.R[i, j] = R_IDENTITY
        entry = next(e for row in fixture.records['shares'] if row['body']['i'] == i
                     for e in row['body']['shares'] if e['j'] == j)
        key = dkg.share_key(MH, i, j, R_IDENTITY, R_IDENTITY)
        ct, tag = aes256gcm_encrypt(key, bytes(12), sc(fixture.f(i, j)),
                                   MH + u8(i) + u8(j) + R_IDENTITY.encode())
        entry.update(R=R_IDENTITY.hex(), ct=ct.hex(), tag=tag.hex())
        fixture.records['complaints'][0]['body'] = fixture._complaint(i, j, False)
        result = fixture.run()
        # Dealer 1's malformed package is excluded; the degenerate proof cannot
        # establish a false complaint by 2. Before repair Python returned [3,4].
        self.assertEqual(result['Q'], [2, 3, 4])
        self.assertEqual(result['R2'], [2, 3, 4])
        fixture.records['complaints'] = []
        no_complaint = fixture.run()
        self.assertEqual(result['ctx'], no_complaint['ctx'])
        self.assertEqual(result['K'], no_complaint['K'])

    def test_invalid_complaint_against_r2_excluded_dealer_is_ignored(self):
        fixture = DKGFixture(n=4, t=2, false_complaint=(1, 2), bad_dleq=True)
        row = next(r for r in fixture.records['shares'] if r['body']['i'] == 1)
        # Retain the complained-about share but omit a different recipient.
        row['body']['shares'] = [e for e in row['body']['shares'] if e['j'] != 4]
        result = fixture.run()
        self.assertEqual(result['Q'], [2, 3, 4])
        fixture.records['complaints'] = []
        self.assertEqual(result['ctx'], fixture.run()['ctx'])

    def test_unassociated_fatal_conflict_survives_default_and_content_only(self):
        bundle = honest()
        duplicate = copy.deepcopy(kind(bundle, 'tally'))
        duplicate['body']['contests'][0]['options'][0]['T'] += 1
        bundle['log'].append({'seq': bundle['log'][-1]['seq'] + 1, 'entry': duplicate})
        for optout in (False, True):
            with self.subTest(optout=optout):
                result = verify_bundle(bundle, allow_no_log=optout)
                self.assertEqual(result['verdict'], 'FAIL')
                self.assertEqual(result['checks']['chk.tally.decrypt'], 'pass')
                conflicts = [f for f in result['findings'] if f['code'] == 'E_RESULT']
                self.assertTrue(any(f['fatal'] and f['check'] is None for f in conflicts))

    def test_identical_tally_with_bad_convenience_signature_is_still_only_a_duplicate(self):
        bundle = honest()
        original = verify_bundle(bundle, allow_no_log=True)
        duplicate = copy.deepcopy(kind(bundle, 'tally'))
        duplicate['sig']['sig'] = '00' * 64
        bundle['log'].append({'seq': bundle['log'][-1]['seq'] + 1, 'entry': duplicate})
        result = verify_bundle(bundle, allow_no_log=True)
        self.assertEqual(result['verdict'], 'PASS')
        self.assertEqual(result['counts'], original['counts'])
        self.assertEqual(result['results'], original['results'])
        self.assertEqual(result['checks'], original['checks'])
        self.assertIn('E_SCHEMA', result['codes'])
        self.assertEqual(verify_bundle(bundle)['verdict'], 'INCOMPLETE')

    def test_later_valid_open_does_not_replace_first_authenticated_bad_binding(self):
        mutant = json.loads((TREE / 'mutations/open-roll-ref-nonexistent.json').read_text())['bundle']
        good_open = next(copy.deepcopy(r['entry']) for r in honest()['log']
                         if r['entry'].get('body', {}).get('name') == 'election-open')
        mutant['log'].append({'seq': mutant['log'][-1]['seq'] + 1, 'entry': good_open})
        result = verify_bundle(mutant, allow_no_log=True)
        self.assertEqual(result['verdict'], 'FAIL')
        self.assertEqual(result['checks']['chk.time.window'], 'fail')
        self.assertEqual(result['checks']['chk.tally.decrypt'], 'not_run')
        self.assertNotIn('results', result)

    def test_missing_authenticated_close_does_not_erase_an_existing_fatal(self):
        bundle = honest()
        for row in bundle['log']:
            if row['entry'].get('body', {}).get('name') == 'election-close':
                for signature in row['entry']['sigs']:
                    signature['sig'] = '00' * 64
        self.assertEqual(verify_bundle(bundle, allow_no_log=True)['verdict'], 'INCOMPLETE')
        # Duplicate sequence is independent fatal evidence, not an absence.
        bundle['log'][-1]['seq'] = bundle['log'][-2]['seq']
        result = verify_bundle(bundle, allow_no_log=True)
        self.assertEqual(result['verdict'], 'FAIL')
        self.assertIn('E_LOG_ORDER', result['codes'])
        self.assertNotIn('results', result)

    def test_exact_quorum_thresholds_and_zero_base(self):
        contest = make_manifest()['contests'][0]
        contest['rule'] = {'type': 'threshold', 'num': 2, 'den': 3,
                           'basis': 'counted', 'strict': True}
        contest['tie_break'] = {'type': 'status-quo', 'option': 'yes'}
        rows = [(1, 0, 1, 'no-quorum'), (2, 1, 3, 'passed'),
                (2, 2, 4, 'rejected'), (3, 0, 4, 'passed')]
        for yes, no, participation, expected in rows:
            with self.subTest(row=(yes, no, participation)):
                result = rules.evaluate({'type': 'count', 'value': 2}, contest,
                                        {'yes': yes, 'no': no}, participation, 10)
                self.assertEqual(result['outcome']['kind'], expected)
        contest['rule']['basis'] = 'yes+no'
        result = rules.evaluate(None, contest, {'yes': 0, 'no': 0}, 4, 10)
        self.assertEqual(result['outcome'], {'kind': 'rejected', 'reason': 'no-base'})


if __name__ == '__main__':
    unittest.main()
