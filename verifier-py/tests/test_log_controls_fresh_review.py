"""Independent legacy-control authorization probes using correctly signed logs.

These are small board-only transcripts: they isolate N-12 header and record
authority without claiming a complete election. Both layers, body digests and
checkpoints are correctly re-signed after hostile mutations unless the test
specifically attacks that signature scope.
"""

import copy
import unittest

from qv_verifier import ed25519, manifest, qvjson
from qv_verifier.election import State
from qv_verifier.framed_hash import H256
from qv_verifier.logcheck import verify_into
from qv_verifier.logwire import b64_decode, body_digest, decode_header, key_id
from tests.test_logcheck import b64u, framed_header, synthetic_extra_author
from tests.test_log_fresh_review import reseal


COORDINATORS = (bytes(range(1, 33)), b'C' * 32)
OUTSIDER = b'X' * 32


def signed_control(*, body_changes=None, signatures=None, scope=None, author=None):
    bundle, board, _ = synthetic_extra_author()
    m = bundle['manifest']['body']
    m['coordinator'] = {'keys': [ed25519.public_key(s).hex() for s in COORDINATORS], 'm': 2}
    _, mh = manifest.manifest_hash(m)
    bundle['manifest_hash'] = mh.hex()
    body = {'proto': m['proto'], 'type': 'control', 'action': 'pause', 'reason': 'review'}
    body.update(body_changes or {})
    digest = H256('sig-record', mh if scope is None else scope, 'control', qvjson.jcs(body))
    sigs = [{'key': ed25519.public_key(s).hex(), 'sig': ed25519.sign(s, digest).hex()} for s in COORDINATORS]
    if signatures is not None:
        sigs = signatures(sigs)
    record = {'body': body, 'sigs': sigs}
    bundle['log'][0]['entry'] = record
    for seq, value, kind, seed in ((0, bundle['manifest'], 'manifest', COORDINATORS[0]),
                                    (1, record, 'notice', author or COORDINATORS[0])):
        entry = board['entries'][seq]
        header = decode_header(b64_decode(entry['header_b64u'], url=True))
        canonical = qvjson.jcs(value)
        header.update(type=kind, author=key_id(ed25519.public_key(seed)),
                      body_len=len(canonical), body_digest=body_digest(canonical))
        entry.update(body_b64u=b64u(canonical), header_b64u=b64u(framed_header(header, seed)))
    reseal(board)
    return bundle, board


def verify_log(pair, **options):
    state = State()
    bundle, board = pair
    verify_into(bundle, {'board': board, **options}, state)
    return state


class TestFreshControlReview(unittest.TestCase):
    def assert_rejected(self, result, code):
        self.assertTrue(any(f.check == 'chk.board.append_only' and f.code == code and f.fatal
                            for f in result.findings), result.findings)
        self.assertFalse(any('authenticated coordinator notice' in note for note in result.notes))

    def test_two_distinct_coordinators_are_required_despite_valid_header(self):
        accepted = verify_log(signed_control())
        self.assertEqual(accepted.findings, [])
        self.assertIn('authenticated coordinator notice', ' '.join(accepted.notes))
        for sigs in (lambda ss: ss[:1], lambda ss: [ss[0], copy.deepcopy(ss[0])]):
            self.assert_rejected(verify_log(signed_control(signatures=sigs)), 'E_LOG_BINDING')

    def test_record_signatures_are_bound_to_this_manifest(self):
        self.assert_rejected(verify_log(signed_control(scope=b'X' * 32)), 'E_LOG_BINDING')

    def test_extra_author_cannot_replace_coordinator_header_authority(self):
        outsider = ed25519.public_key(OUTSIDER).hex()
        # Both valid coordinator record signatures remain present. Only the
        # independent board header is signed by the caller-trusted extra key.
        result = verify_log(signed_control(author=OUTSIDER), extraAuthorKeys=[outsider])
        self.assert_rejected(result, 'E_LOG_BINDING')

    def test_control_schema_cannot_carry_policy_overrides_or_unknown_actions(self):
        cases = [({'quorum': 0}, 'E_LOG_FORMAT'), ({'control_seq': 1}, 'E_LOG_FORMAT'),
                 ({'proto': 'qv2'}, 'E_LOG_FORMAT'), ({'action': 'constructor'}, 'E_LOG_BINDING'),
                 ({'action': 'witness_waiver'}, 'E_LOG_BINDING')]
        for changes, code in cases:
            with self.subTest(changes=changes):
                self.assert_rejected(verify_log(signed_control(body_changes=changes)), code)

    def test_adopted_string_and_signature_bounds_are_checked(self):
        # Existing adopted bounds are UTF-16 code units, not Unicode code points.
        self.assertEqual(verify_log(signed_control(body_changes={'reason': '\U0001f642' * 128})).findings, [])
        for reason in ('x' * 257, '\U0001f642' * 129):
            with self.subTest(reason_units=len(reason.encode('utf-16-le')) // 2):
                self.assert_rejected(verify_log(signed_control(body_changes={'reason': reason})), 'E_LOG_FORMAT')
        for sigs in (lambda ss: [], lambda ss: ss * 4 + ss[:1]):
            self.assert_rejected(verify_log(signed_control(signatures=sigs)), 'E_LOG_FORMAT')


if __name__ == '__main__':
    unittest.main()
