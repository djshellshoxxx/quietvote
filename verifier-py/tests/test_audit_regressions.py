"""Audited synthetic elections and independently constructed subgroup edge cases."""
import copy
import hashlib
import json
import unittest
from pathlib import Path

from qv_verifier import dkg, ed25519, manifest
from qv_verifier.edwards import BASE, IDENTITY, L, P, Point, ed_encode
from qv_verifier.election import _record_schema_ok, verify_bundle
from qv_verifier.errors import QVError
from tests.test_protocol import DKGFixture, MH, make_manifest

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'docs/audit/2026-10-28/poc/B1/audit-b1-poc/out'

def bundle(name):
    return json.loads((EVIDENCE / (name + '.bundle.json')).read_text())

class TestAuditRegressions(unittest.TestCase):
    def test_mixed_order_keys_and_signature_R_rejected(self):
        # Independent construction: add a nontrivial 2-torsion point to a prime-order key.
        torsion = Point(0, P - 1, 1, 0)
        a, r = 17, 29
        for mixed_key, mixed_R in ((True, False), (False, True), (True, True)):
            A = BASE.mul(a) + torsion if mixed_key else BASE.mul(a)
            R = BASE.mul(r) + torsion if mixed_R else BASE.mul(r)
            pk, rb = ed_encode(A), ed_encode(R)
            self.assertFalse(A.edwards_equal(IDENTITY))
            # Select a challenge for which the cofactorless equation still accepts the torsion terms.
            for i in range(100):
                msg = f'mixed order {i}'.encode()
                k = int.from_bytes(hashlib.sha512(rb + pk + msg).digest(), 'little') % L
                if (mixed_key and not mixed_R and k % 2 == 0) or (mixed_R and mixed_key and k % 2 == 1):
                    break
            sig = rb + ((r + k * a) % L).to_bytes(32, 'little')
            if mixed_key:
                self.assertFalse(ed25519.valid_public_key(pk))
            self.assertFalse(ed25519.verify(pk, msg, sig))
        sk = bytes(range(32))
        pk = ed25519.public_key(sk)
        self.assertTrue(ed25519.valid_public_key(pk))
        self.assertTrue(ed25519.verify(pk, b'control', ed25519.sign(sk, b'control')))

    def test_CP01_rewrapped_published_spoil_is_alarmed(self):
        report = verify_bundle(bundle('K-CP01-rewrap-reveal'))
        self.assertEqual(report['checks']['chk.benaloh.spoiled'], 'fail')
        self.assertIn('E_SPOILED_CODE_CAST', report['codes'])

    def test_CP01_rewrapped_published_spoil_after_close_is_alarmed(self):
        b = bundle('K-CP01-rewrap-reveal')
        spoil = next(e for e in b['log'] if e['entry'].get('intent') == 'spoil')
        b['log'].remove(spoil)
        spoil['seq'] = b['log'][-1]['seq'] + 1
        b['log'].append(spoil)
        self.assertIn('E_SPOILED_CODE_CAST', verify_bundle(b)['codes'])

    def test_unsigned_alpha_plant_cannot_spoil_an_honest_audit(self):
        b = bundle('E0-baseline')
        # Construct an unsigned cast bearing an honest audit's ciphertexts. It must be ignored before clash analysis.
        source = bundle('K-CP01-rewrap-reveal')
        spoil = next(e for e in source['log'] if e['entry'].get('intent') == 'spoil')
        for e in source['log']:
            if e['entry'].get('intent') == 'cast' and e['entry']['body']['voter'] == spoil['entry']['body']['voter']:
                e['entry']['sig'] = '00' * 64
        report = verify_bundle(source)
        self.assertNotIn('E_SPOILED_CODE_CAST', report['codes'])

    def test_B101_spoil_after_close_still_excludes_cast(self):
        b = bundle('E1c-spoil-within-limit')
        spoil = next(e for e in b['log'] if e['entry'].get('intent') == 'spoil')
        b['log'].remove(spoil)
        spoil['seq'] = b['log'][-1]['seq'] + 1
        b['log'].append(spoil)
        report = verify_bundle(b)
        self.assertIn('E_SPOILED_CODE_CAST', report['codes'])
        self.assertEqual(report['checks']['chk.benaloh.spoiled'], 'fail')

    def test_B103_approval_without_winners_defaults_one_seat(self):
        report = verify_bundle(bundle('E5-approval-no-winners'))
        self.assertEqual(report['verdict'], 'PASS', report['findings'])

    def test_B103_yesno_without_rule_is_named_rejection(self):
        m = make_manifest()
        del m['contests'][0]['rule']
        with self.assertRaises(QVError):
            manifest.validate(m)

    def test_B104_record_hex_and_indices(self):
        b = bundle('E0-baseline')
        for original in [e['entry'] for e in b['log'] if e['entry'].get('body', {}).get('type') == 'dkg-dealing'][:1]:
            malformed = copy.deepcopy(original)
            malformed['body']['i'] = True
            self.assertFalse(_record_schema_ok(malformed), 'boolean index')
            malformed = copy.deepcopy(original)
            malformed['body']['enc']['E'] = malformed['body']['enc']['E'].upper()
            self.assertFalse(_record_schema_ok(malformed), 'uppercase point')
        for name in ('E14-tally-share-uppercase-hex', 'E18-roll-uppercase-hex'):
            report = verify_bundle(bundle(name))
            self.assertEqual(report['verdict'], 'FAIL', name)

    def test_B114_all_six_DKG_markers_are_required_in_order(self):
        report = verify_bundle(bundle('E20-dkg-open-marker-dropped'))
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_DKG_MARKERS', report['codes'])

    def test_B114_direct_DKG_adjudication_requires_marker_order(self):
        for remove in (True, False):
            fixture = DKGFixture()
            if remove:
                del fixture.markers['dkg-open']
            else:
                fixture.markers['dkg-open'] = fixture.markers['dkg-r1-open']
            with self.assertRaises(QVError) as cm:
                dkg.adjudicate(MH, fixture.n, fixture.t, fixture.markers, fixture.records)
            self.assertEqual(cm.exception.code, 'E_DKG_MARKERS')
        b = bundle('E0-baseline')
        # Move the signed dkg-open after r1-open without changing any signed bytes.
        markers = [e for e in b['log'] if e['entry'].get('body', {}).get('name') in ('dkg-open', 'dkg-r1-open')]
        markers[0]['seq'], markers[1]['seq'] = markers[1]['seq'], markers[0]['seq']
        b['log'].sort(key=lambda e: e['seq'])
        report = verify_bundle(b)
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_DKG_MARKERS', report['codes'])

    def test_B108_dates_are_calendar_valid_and_created_precedes_open(self):
        for field, value in [('created', '2026-11-02T00:00:00Z'), ('created', '2026-02-30T00:00:00Z'),
                             ('voting_open', '2026-11-01T24:00:00Z'), ('voting_close', '2026-11-31T12:00:00Z')]:
            with self.subTest(field=field, value=value):
                m = make_manifest()
                m[field] = value
                with self.assertRaises(QVError):
                    manifest.validate(m)

    def test_B108_every_manifest_signing_key_is_a_strict_subgroup_point(self):
        identity = ed_encode(IDENTITY).hex()
        mixed = ed_encode(BASE.mul(17) + Point(0, P - 1, 1, 0)).hex()
        for bad in (identity, mixed, 'ff' * 32):
            for field in ('trustee', 'coordinator', 'log', 'witness'):
                with self.subTest(field=field, bad=bad):
                    m = make_manifest()
                    if field == 'trustee':
                        m['trustees'][0]['sign_pk'] = bad
                    elif field == 'coordinator':
                        m['coordinator']['keys'][0] = bad
                    elif field == 'log':
                        m['bb']['log_pk'] = bad
                    else:
                        m['bb']['witnesses'] = [{'name': 'w1', 'pk': bad}]
                    with self.assertRaises(QVError):
                        manifest.validate(m)

    def test_manifest_signature_wrapper_is_closed(self):
        b = bundle('E0-baseline')
        b['manifest']['sigs'][0]['extra'] = 'unsigned malleability'
        report = verify_bundle(b)
        self.assertEqual(report['verdict'], 'FAIL')
        self.assertIn('E_SCHEMA', report['codes'])
