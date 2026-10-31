"""Protocol-level tests on transcripts built here from the QV-16 formulas (no vector files)."""

import copy
import hashlib
import unittest

from qv_verifier import ballot, dkg, ed25519, manifest, proofs, qvjson, rules
from qv_verifier.aead import aes256gcm_encrypt
from qv_verifier.edwards import L
from qv_verifier.election import bsgs, lagrange_at_zero
from qv_verifier.errors import QVError
from qv_verifier.framed_hash import H256, hs, u8, u16
from qv_verifier.ristretto import G, R_IDENTITY, sc

MH = hashlib.sha256(b"test manifest").digest()


def make_manifest(**over):
    m = {
        "proto": "qv1-r255-sha2", "type": "manifest", "election_id": "00112233445566778899aabbccddeeff",
        "title": "Unit test", "created": "2026-10-21T12:00:00Z", "voting_open": "2026-11-01T09:00:00Z",
        "voting_close": "2026-11-08T21:00:00Z", "clock_skew_s": 300,
        "contests": [
            {"id": "budget", "title": "Budget?", "method": "yes-no",
             "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}],
             "selection_limit": 1, "min_selections": 0,
             "rule": {"type": "threshold", "num": 1, "den": 2, "basis": "yes+no", "strict": True},
             "tie_break": {"type": "status-quo", "option": "no"}},
            {"id": "board", "title": "Board", "method": "k-of-n",
             "options": [{"id": x, "label": x.upper()} for x in "pqrs"],
             "selection_limit": 2, "min_selections": 0, "tie_break": {"type": "lexicographic"}},
            {"id": "topics", "title": "Topics", "method": "approval",
             "options": [{"id": x, "label": x.upper()} for x in "abc"],
             "min_selections": 0, "winners": 1, "tie_break": {"type": "declare-tie"}},
        ],
        "roll": {"scheme": "ed25519-roll-v1", "weights": "uniform", "size": 3},
        "trustees": [{"index": i, "name": f"T{i}", "sign_pk": ed25519.public_key(bytes([i]) * 32).hex()}
                     for i in (1, 2, 3)],
        "n": 3, "t": 2,
        "coordinator": {"keys": [ed25519.public_key(b"\x09" * 32).hex()], "m": 1},
        "ballots": {"max_per_voter": 8, "max_spoils_per_voter": 16},
        "bb": {"log_id": "11" * 32, "log_pk": ed25519.public_key(b"\x22" * 32).hex(), "witness_quorum": 0},
        "privacy_ack": True,
    }
    m.update(over)
    return m


class TestManifest(unittest.TestCase):
    def test_valid_and_hash(self):
        m = make_manifest()
        manifest.validate(m, 3)
        j, h = manifest.manifest_hash(m)
        self.assertEqual(h, H256("manifest", qvjson.jcs(m)))
        w = make_manifest()
        w["bb"] = dict(w["bb"], witness_quorum=1, witnesses=[{"name": "w1", "pk": ed25519.public_key(b"\x33" * 32).hex()}])
        manifest.validate(w, 3)
        w["bb"]["witness_quorum"] = 2
        with self.assertRaises(QVError):
            manifest.validate(w, 3)

    def test_rejections(self):
        def bad(code, mutate):
            m = make_manifest()
            mutate(m)
            with self.assertRaises(QVError) as cm:
                manifest.validate(m, 3)
            self.assertEqual(cm.exception.code, code)

        bad("E_VERSION", lambda m: m.update(proto="qv2-x"))
        bad("E_SCHEMA", lambda m: m.update(extra=1))
        bad("E_SCHEMA", lambda m: m.update(election_id=m["election_id"].upper()))
        bad("E_MANIFEST", lambda m: m.update(t=4))
        bad("E_MANIFEST", lambda m: m.update(voting_close=m["voting_open"]))
        bad("E_MANIFEST", lambda m: m["contests"][1].update(id="budget"))
        bad("E_MANIFEST", lambda m: m["contests"][1].update(tie_break={"type": "beacon"}))
        bad("E_MANIFEST", lambda m: m["contests"][1].update(selection_limit=4))
        bad("E_MANIFEST", lambda m: m["contests"][0]["options"][0].update(label="Y‮es"))
        bad("E_MANIFEST", lambda m: m.update(privacy_ack=False))
        bad("E_MANIFEST", lambda m: m["trustees"][1].update(sign_pk=m["trustees"][0]["sign_pk"]))
        bad("E_PARSE", lambda m: m.update(title=None))


class TestRules(unittest.TestCase):
    YN = make_manifest()["contests"][0]

    def ev(self, q, contest, counts, V, N):
        return rules.evaluate(q, contest, counts, V, N)["outcome"]

    def test_qv03_reference_table(self):
        # QV-03 §7.4 rows, rewritten in the QV-16 rule vocabulary
        q20 = {"type": "fraction", "num": 1, "den": 5, "basis": "roll"}
        self.assertEqual(self.ev(q20, self.YN, {"yes": 19, "no": 0}, 19, 100), {"kind": "no-quorum"})
        self.assertEqual(self.ev(q20, self.YN, {"yes": 10, "no": 10}, 20, 100),
                         {"kind": "rejected", "reason": "tie-break"})
        self.assertEqual(self.ev(q20, self.YN, {"yes": 11, "no": 9}, 20, 100), {"kind": "passed"})
        two3 = dict(self.YN, rule={"type": "threshold", "num": 2, "den": 3, "basis": "yes+no", "strict": False})
        self.assertEqual(self.ev(None, two3, {"yes": 30, "no": 15}, 50, 100), {"kind": "passed"})
        self.assertEqual(self.ev(None, two3, {"yes": 29, "no": 15}, 50, 100), {"kind": "rejected"})
        two3c = dict(two3, rule=dict(two3["rule"], basis="counted"))
        self.assertEqual(self.ev(None, two3c, {"yes": 30, "no": 15}, 50, 100), {"kind": "rejected"})
        roll = dict(self.YN, rule=dict(self.YN["rule"], basis="roll"))
        self.assertEqual(self.ev(None, roll, {"yes": 4, "no": 0}, 4, 7), {"kind": "passed"})

    def test_appendix_a7(self):
        q = {"type": "fraction", "num": 1, "den": 3, "basis": "roll"}
        r = rules.evaluate(q, self.YN, {"yes": 1, "no": 1}, 2, 2)
        self.assertTrue(r["quorum_met"])
        self.assertEqual(r["outcome"], {"kind": "rejected", "reason": "tie-break"})

    def test_multi_winner(self):
        c = make_manifest()["contests"][1]
        self.assertEqual(self.ev(None, c, {"p": 5, "q": 4, "r": 4, "s": 0}, 6, 10),
                         {"kind": "winners", "winners": ["p", "q"], "reason": "tie-break"})
        self.assertEqual(self.ev(None, c, {"p": 5, "q": 4, "r": 1, "s": 0}, 6, 10),
                         {"kind": "winners", "winners": ["p", "q"]})


class DKGFixture:
    """A small honest/faulty Joint-Feldman transcript built from QV-16 §5.7 formulas."""

    def __init__(self, n=3, t=2, bad_share=None, false_complaint=None, bad_dleq=False):
        self.n, self.t = n, t
        self.coef = {i: [1000 * i + k + 1 for k in range(t)] for i in range(1, n + 1)}
        self.e = {i: 77 * i + 5 for i in range(1, n + 1)}
        seq = iter(range(1, 1000))
        self.markers = {"dkg-open": next(seq)}
        commits, dealings, shares, complaints = [], [], [], []
        bodies = {i: self._dealing(i) for i in range(1, n + 1)}
        for i in range(1, n + 1):
            h = H256("dkg-commit", MH, u8(i), qvjson.jcs(bodies[i])).hex()
            commits.append({"seq": next(seq), "body": {"proto": "qv1-r255-sha2", "type": "dkg-commit", "i": i, "h": h}})
        self.markers["dkg-r1-open"] = next(seq)
        for i in range(1, n + 1):
            dealings.append({"seq": next(seq), "body": bodies[i]})
        self.markers["dkg-r1-close"] = next(seq)
        self.R = {}
        for i in range(1, n + 1):
            entries = []
            for j in range(1, n + 1):
                if j == i:
                    continue
                y = self.f(i, j) + (1 if (i, j) == bad_share else 0)
                r = 999 + 10 * i + j
                R, S = G.mul(r), G.mul(r * self.e[j])
                self.R[(i, j)] = R
                key = dkg.share_key(MH, i, j, R, S)
                ct, tag = aes256gcm_encrypt(key, bytes(12), sc(y), MH + u8(i) + u8(j) + R.encode())
                entries.append({"j": j, "R": R.hex(), "ct": ct.hex(), "tag": tag.hex()})
            shares.append({"seq": next(seq), "body": {"proto": "qv1-r255-sha2", "type": "dkg-shares", "i": i, "shares": entries}})
        self.markers["dkg-r2-close"] = next(seq)
        for pair in (bad_share, false_complaint):
            if pair:
                i, j = pair
                complaints.append({"seq": next(seq), "body": self._complaint(i, j, bad_dleq)})
        self.markers["dkg-r3-close"] = next(seq)
        self.markers["dkg-final"] = next(seq)
        self.records = {"commits": commits, "dealings": dealings, "shares": shares, "complaints": complaints}

    def f(self, i, x):
        return sum(a * x**k for k, a in enumerate(self.coef[i])) % L

    def _pok(self, i, k, a):
        u = 31337 + 100 * i + k
        A, R = G.mul(a), G.mul(u)
        c = hs("pok", MH, u8(i), u16(k), A.encode(), R.encode())
        return {"c": sc(c).hex(), "s": sc(u + c * a).hex()}, A

    def _dealing(self, i):
        enc, E = self._pok(i, 0xFFFF, self.e[i])
        coeffs = []
        for k, a in enumerate(self.coef[i]):
            prf, A = self._pok(i, k, a)
            coeffs.append({"A": A.hex(), **prf})
        return {"proto": "qv1-r255-sha2", "type": "dkg-dealing", "i": i, "enc": {"E": E.hex(), **enc}, "coeffs": coeffs}

    def _complaint(self, i, j, bad_dleq):
        R = self.R[(i, j)]
        E, S = G.mul(self.e[j]), R.mul(self.e[j])
        u = 4242
        a1, a2 = G.mul(u), R.mul(u)
        c = hs("cp-dh", MH, u8(i), u8(j), E.encode(), R.encode(), S.encode(), a1.encode(), a2.encode())
        s = (u + c * self.e[j] + (1 if bad_dleq else 0)) % L
        return {"proto": "qv1-r255-sha2", "type": "dkg-complaint", "accuser": j, "accused": i,
                "S": S.hex(), "c": sc(c).hex(), "s": sc(s).hex()}

    def run(self):
        return dkg.adjudicate(MH, self.n, self.t, self.markers, self.records)


class TestDKG(unittest.TestCase):
    def test_honest(self):
        fx = DKGFixture()
        r = fx.run()
        self.assertEqual(r["Q"], [1, 2, 3])
        self.assertEqual(r["qmask"], 7)
        x = sum(fx.coef[i][0] for i in (1, 2, 3))
        self.assertEqual(r["K"], G.mul(x))
        for j in (1, 2, 3):
            self.assertEqual(r["Y"][j], G.mul(sum(fx.f(i, j) for i in (1, 2, 3))))

    def test_bad_share_disqualifies_dealer(self):
        self.assertEqual(DKGFixture(bad_share=(2, 3)).run()["Q"], [1, 3])

    def test_false_complaint_disqualifies_accuser(self):
        self.assertEqual(DKGFixture(false_complaint=(2, 3)).run()["Q"], [1, 2])

    def test_invalid_dleq_is_ignored(self):
        self.assertEqual(DKGFixture(bad_share=(2, 3), bad_dleq=True).run()["Q"], [1, 2, 3])

    def test_quorum_abort(self):
        with self.assertRaises(QVError) as cm:
            DKGFixture(n=3, t=3, bad_share=(1, 2)).run()
        self.assertEqual(cm.exception.code, "E_DKG_QUORUM")

    def test_pok_binding(self):
        fx = DKGFixture()
        body = fx.records["dealings"][0]["body"]
        co = body["coeffs"][1]
        proofs.pok_verify(MH, 1, 1, co["A"], co)
        for i, k in ((2, 1), (1, 0)):
            with self.assertRaises(QVError) as cm:
                proofs.pok_verify(MH, i, k, co["A"], co)
            self.assertEqual(cm.exception.code, "E_DKG_R1")


class TestBallotsAndTally(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = make_manifest()
        cls.x = 0x1234567890ABCDEF
        cls.K = G.mul(cls.x)
        cls.ctx = hashlib.sha256(b"ctx").digest()
        cls.sks = [bytes([0x40 + i]) * 32 for i in range(3)]
        cls.pks = [ed25519.public_key(sk) for sk in cls.sks]
        cls.roll = set(cls.pks)
        cls.sels = [
            {"budget": ["yes"], "board": ["p", "q"], "topics": ["a", "c"]},
            {"budget": ["no"], "board": ["q"], "topics": []},
            {"budget": [], "board": [], "topics": ["a", "b", "c"]},
        ]
        cls.envs = []
        for k in range(3):
            xi = hashlib.sha512(b"xi%d" % k).digest()
            body = ballot.encrypt(cls.m, cls.K, cls.ctx, cls.pks[k], "00" * 32, cls.sels[k], xi)
            code = ballot.ballot_code(cls.ctx, body)
            sig = ed25519.sign(cls.sks[k], ballot.sig_cast_msg(cls.ctx, code))
            cls.envs.append({"intent": "cast", "body": body, "sig": sig.hex()})

    def verify(self, env, roll=None):
        return ballot.verify_envelope(self.m, self.K, self.ctx, roll or self.roll, env)

    def resign(self, env, k=0):
        code = ballot.ballot_code(self.ctx, env["body"])
        env["sig"] = ed25519.sign(self.sks[k], ballot.sig_cast_msg(self.ctx, code)).hex()
        return env

    def assertCode(self, code, env, roll=None):
        with self.assertRaises(QVError) as cm:
            self.verify(env, roll)
        self.assertEqual(cm.exception.code, code)

    def test_valid_ballots(self):
        for env in self.envs:
            self.assertEqual(self.verify(env), ballot.ballot_code(self.ctx, env["body"]))

    def test_tampering(self):
        e = copy.deepcopy(self.envs[0])
        e["body"]["supersedes"] = "11" * 32
        self.assertCode("E_SIG", e)
        e = copy.deepcopy(self.envs[0])
        e["x"] = 1
        self.assertCode("E_SCHEMA", e)
        e = copy.deepcopy(self.envs[0])
        e["body"]["ctx"] = "22" * 32
        self.assertCode("E_CTX", e)
        self.assertCode("E_VOTER_NOT_ELIGIBLE", self.envs[0], roll={self.pks[1]})
        e = copy.deepcopy(self.envs[0])
        e["body"]["contests"][1]["ph"].pop()
        self.assertCode("E_STRUCTURE", self.resign(e))
        e = copy.deepcopy(self.envs[0])
        e["body"]["contests"][0]["sel"][0]["a"] = "00" * 32
        self.assertCode("E_IDENTITY", self.resign(e))
        e = copy.deepcopy(self.envs[0])
        e["body"]["contests"][0]["sel"][0]["s0"] = "ff" * 32
        self.assertCode("E_SCALAR_RANGE", self.resign(e))
        # plaintext 2: beta + G with the original proof -> CDS fails
        e = copy.deepcopy(self.envs[0])
        s0 = e["body"]["contests"][0]["sel"][0]
        from qv_verifier.ristretto import decode_hex
        s0["b"] = (decode_hex(s0["b"]) + G).hex()
        self.assertCode("E_CDS", self.resign(e))
        # ballot copying: Alice's ciphertexts and proofs re-signed by voter 1
        e = copy.deepcopy(self.envs[0])
        e["body"]["voter"] = self.pks[1].hex()
        self.assertCode("E_CDS", self.resign(e, 1))
        e = copy.deepcopy(self.envs[0])
        e["body"]["contests"][1]["lim"]["c"] = sc(5).hex()
        self.assertCode("E_LIMIT_PROOF", self.resign(e))
        with self.assertRaises(QVError):
            ballot.encrypt(self.m, self.K, self.ctx, self.pks[0], "00" * 32,
                           {"budget": ["yes", "no"]}, bytes(64))

    def test_benaloh(self):
        xi = hashlib.sha512(b"xi0").digest()
        body = self.envs[0]["body"]
        ballot.verify_spoil_reveal(self.m, self.K, self.ctx, body, {"xi": xi.hex(), "selections": self.sels[0]})
        for rev in ({"xi": xi.hex(), "selections": self.sels[1]}, {"xi": "00" * 64, "selections": self.sels[0]}):
            with self.assertRaises(QVError) as cm:
                ballot.verify_spoil_reveal(self.m, self.K, self.ctx, body, rev)
            self.assertEqual(cm.exception.code, "E_SPOIL_MISMATCH")

    def test_threshold_decryption_recovers_counts(self):
        # Shamir shares of x for t = 2 of n = 3: F(z) = x + d*z
        d = 0x0BADC0DE
        s = {j: (self.x + d * j) % L for j in (1, 2, 3)}
        Y = {j: G.mul(s[j]) for j in s}
        expected = {"yes": 1, "no": 1, "p": 1, "q": 2, "r": 0, "s": 0, "a": 2, "b": 1, "c": 2}
        for mc in self.m["contests"]:
            for o in mc["options"]:
                A, B = R_IDENTITY, R_IDENTITY
                for env in self.envs:
                    bc = next(c for c in env["body"]["contests"] if c["id"] == mc["id"])
                    e = next(x for x in bc["sel"] if x["opt"] == o["id"])
                    from qv_verifier.ristretto import decode_hex
                    A, B = A + decode_hex(e["a"]), B + decode_hex(e["b"])
                for S_ in ([1, 3], [2, 3], [1, 2]):
                    Mo = R_IDENTITY
                    for j in S_:
                        M = A.mul(s[j])
                        u = 5555 + j
                        a, b = G.mul(u), A.mul(u)
                        c = hs("cp-dec", self.ctx, mc["id"], o["id"], u8(j), Y[j].encode(), A.encode(),
                               B.encode(), M.encode(), a.encode(), b.encode())
                        self.assertTrue(proofs.dec_check(self.ctx, mc["id"], o["id"], j, Y[j], A, B, M, c, (u + c * s[j]) % L))
                        self.assertFalse(proofs.dec_check(self.ctx, mc["id"], o["id"], j, Y[j], A, B, M + G, c, (u + c * s[j]) % L))
                        Mo = Mo + M.mul(lagrange_at_zero(S_, j))
                    self.assertEqual(bsgs(B - Mo, 3), expected[o["id"]])
        self.assertIsNone(bsgs(G.mul(5), 3))


if __name__ == "__main__":
    unittest.main()
