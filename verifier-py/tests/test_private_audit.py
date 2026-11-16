"""Private Benaloh audit: honest controls and independently signed attacks.

Fixtures use the QV-16 formulas and existing Python primitives, not the TypeScript
implementation. The shipped five private-audit vectors are also run by the normal
repository-vector test once the operation is registered.
"""

import copy
import hashlib
import unittest

from qv_verifier import ballot, ed25519, qvjson
from qv_verifier.framed_hash import H256, hs, hs_nz, u32
from qv_verifier.ops import OPS, run_op
from qv_verifier.ristretto import G, R_IDENTITY, decode_hex, sc
from qv_verifier.edwards import L
from tests.test_protocol import make_manifest


class TestPrivateAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = make_manifest()
        cls.manifest["contests"] = cls.manifest["contests"][:1]
        cls.ctx = hashlib.sha256(b"private-audit test context").digest()
        cls.K = G.mul(123456789)
        cls.seeds = [bytes([70 + n]) * 32 for n in range(3)]
        cls.keys = [ed25519.public_key(seed) for seed in cls.seeds]
        cls.reveal = {"xi": hashlib.sha512(b"private-audit seed").hexdigest(),
                      "selections": {"budget": ["yes"]}}
        body = ballot.encrypt(cls.manifest, cls.K, cls.ctx, cls.keys[0], ballot.ZERO32,
                              cls.reveal["selections"], bytes.fromhex(cls.reveal["xi"]))
        cls.input = {
            "params": {"manifest": cls.manifest, "ctx_hex": cls.ctx.hex(), "K_hex": cls.K.hex()},
            "roll": sorted(pk.hex() for pk in cls.keys),
            "envelope": {"intent": "spoil", "body": body},
            "reveal": cls.reveal,
        }
        cls.commit_and_sign(cls.input)

    @classmethod
    def sign(cls, inp, voter=0):
        env = inp["envelope"]
        code = ballot.ballot_code(cls.ctx, env["body"])
        msg = (ballot.sig_cast_msg(cls.ctx, code) if env["intent"] == "cast" else
               ballot.sig_spoil_msg(cls.ctx, code, bytes.fromhex(env["reveal_digest"])))
        env["sig"] = ed25519.sign(cls.seeds[voter], msg).hex()

    @classmethod
    def commit_and_sign(cls, inp):
        inp["envelope"]["reveal_digest"] = H256("reveal", cls.ctx, qvjson.jcs(inp["reveal"])).hex()
        cls.sign(inp)

    def audit(self, inp):
        return run_op("benaloh.private_audit", inp)

    def assertError(self, inp, code):
        actual = self.audit(inp)
        self.assertFalse(actual["ok"], actual)
        self.assertEqual(actual["error"], code, actual)

    def test_honest_private_and_published_reveals(self):
        for published in (False, True):
            inp = copy.deepcopy(self.input)
            if published:
                inp["envelope"]["reveal"] = copy.deepcopy(inp["reveal"])
            before = copy.deepcopy(inp)
            self.assertEqual(self.audit(inp), {"ok": True, "output": {
                "audited": True,
                "ballot_code_hex": ballot.ballot_code(self.ctx, inp["envelope"]["body"]).hex(),
            }})
            self.assertEqual(inp, before, "verification must not change caller-held secrets")

    def test_cast_is_not_a_spoil(self):
        inp = copy.deepcopy(self.input)
        inp["envelope"]["intent"] = "cast"
        del inp["envelope"]["reveal_digest"]
        self.sign(inp)
        self.assertError(inp, "E_SPOIL_MISMATCH")

    def test_forged_and_malleated_signatures(self):
        from qv_verifier.edwards import L
        for kind in ("forged", "noncanonical"):
            inp = copy.deepcopy(self.input)
            sig = bytes.fromhex(inp["envelope"]["sig"])
            if kind == "forged":
                sig = sig[:32] + bytes(32)
            else:
                sig = sig[:32] + (int.from_bytes(sig[32:], "little") + L).to_bytes(32, "little")
            inp["envelope"]["sig"] = sig.hex()
            self.assertError(inp, "E_SIG")

    def test_digest_is_signed_and_must_commit_to_the_reveal(self):
        for digest in ("11" * 32, ballot.ZERO32):
            inp = copy.deepcopy(self.input)
            inp["envelope"]["reveal_digest"] = digest
            self.assertError(inp, "E_SIG")
            self.sign(inp)
            self.assertError(inp, "E_SPOIL_MISMATCH")

    def test_committed_wrong_reveal_still_requires_reproduction(self):
        for change in ({"selections": {"budget": ["no"]}}, {"xi": "11" * 64}):
            inp = copy.deepcopy(self.input)
            inp["reveal"].update(change)
            self.commit_and_sign(inp)
            self.assertError(inp, "E_SPOIL_MISMATCH")

    def test_conflicting_embedded_reveal(self):
        inp = copy.deepcopy(self.input)
        inp["envelope"]["reveal"] = copy.deepcopy(inp["reveal"])
        inp["envelope"]["reveal"]["selections"]["budget"] = ["no"]
        self.assertError(inp, "E_SPOIL_MISMATCH")

    def test_replay_context_voter_and_key_binding(self):
        inp = copy.deepcopy(self.input)
        inp["params"]["ctx_hex"] = "22" * 32
        self.assertError(inp, "E_CTX")
        inp = copy.deepcopy(self.input)
        inp["envelope"]["body"]["voter"] = self.keys[1].hex()
        self.assertError(inp, "E_SIG")
        self.sign(inp, voter=1)
        self.assertError(inp, "E_CDS")
        inp = copy.deepcopy(self.input)
        inp["params"]["K_hex"] = G.mul(987654321).hex()
        self.assertError(inp, "E_CDS")

    def test_voter_must_belong_to_supplied_roll(self):
        inp = copy.deepcopy(self.input)
        outsider = ed25519.public_key(b"\x7f" * 32).hex()
        inp["roll"] = sorted([pk.hex() for pk in self.keys[1:]] + [outsider])
        self.assertError(inp, "E_VOTER_NOT_ELIGIBLE")

    def test_signed_bad_proofs_are_not_a_successful_audit(self):
        for kind, code in (("cds", "E_CDS"), ("limit", "E_LIMIT_PROOF")):
            inp = copy.deepcopy(self.input)
            contest = inp["envelope"]["body"]["contests"][0]
            if kind == "cds":
                contest["sel"][0]["s0"] = sc(1).hex()
            else:
                contest["lim"]["s"] = sc(1).hex()
            self.sign(inp)
            self.assertError(inp, code)

    def test_valid_but_different_proofs_do_not_reproduce_the_committed_body(self):
        # Validity alone is insufficient: a fresh proof for the same ciphertext
        # must still fail the byte-for-byte deterministic reproduction check.
        xi = bytes.fromhex(self.reveal["xi"])
        binder = ballot.binder_roll(self.ctx, self.keys[0])
        for kind in ("cds", "limit"):
            with self.subTest(kind=kind):
                inp = copy.deepcopy(self.input)
                contest = inp["envelope"]["body"]["contests"][0]
                cid = contest["id"]
                w = 1234567  # deliberately different from proof-w / limit-w
                if kind == "cds":
                    entry = contest["sel"][0]  # selected yes, hence real branch 1
                    oid = entry["opt"]
                    a, b = decode_hex(entry["a"]), decode_hex(entry["b"])
                    c0, s0 = int.from_bytes(bytes.fromhex(entry["c0"]), "little"), int.from_bytes(bytes.fromhex(entry["s0"]), "little")
                    challenge = hs("cds01", self.ctx, binder, cid, oid,
                                   self.K.encode(), a.encode(), b.encode(),
                                   (G.mul(s0) - a.mul(c0)).encode(),
                                   (self.K.mul(s0) - b.mul(c0)).encode(),
                                   G.mul(w).encode(), self.K.mul(w).encode())
                    c1 = (challenge - c0) % L
                    r = hs_nz("enc-nonce", xi, cid, oid)
                    entry.update(c1=sc(c1).hex(), s1=sc((w + c1 * r) % L).hex())
                else:
                    Asum, Bsum, rsum = R_IDENTITY, R_IDENTITY, 0
                    for entry in contest["sel"] + contest["ph"]:
                        Asum += decode_hex(entry["a"])
                        Bsum += decode_hex(entry["b"])
                        rsum += hs_nz("enc-nonce", xi, cid, entry["opt"])
                    challenge = hs("cp-limit", self.ctx, binder, cid, u32(1),
                                   self.K.encode(), Asum.encode(), Bsum.encode(),
                                   G.mul(w).encode(), self.K.mul(w).encode())
                    contest["lim"] = {"c": sc(challenge).hex(),
                                      "s": sc((w + challenge * rsum) % L).hex()}
                self.sign(inp)
                ballot.verify_envelope(self.manifest, self.K, self.ctx,
                                       set(self.keys), inp["envelope"])
                self.assertError(inp, "E_SPOIL_MISMATCH")

    def test_malformed_or_ignored_reveal_fields_are_rejected(self):
        bad_reveals = [
            None, [], {}, dict(self.reveal, extra="unsigned metadata"),
            dict(self.reveal, xi=self.reveal["xi"].upper()),
            dict(self.reveal, xi=self.reveal["xi"] + "\n"),
            dict(self.reveal, xi="11" * 63), dict(self.reveal, xi=5),
            dict(self.reveal, selections=[]),
            dict(self.reveal, selections={"budget": "yes"}),
            dict(self.reveal, selections={"budget": [True]}),
            dict(self.reveal, selections={"budget": [{}]}),
            dict(self.reveal, selections={"budget": ["yes"], "unknown": ["x"]}),
            dict(self.reveal, selections={"budget": ["unknown"]}),
            dict(self.reveal, selections={"budget": ["yes", "yes"]}),
            dict(self.reveal, selections={"budget": ["yes", "no"]}),
        ]
        for reveal in bad_reveals:
            with self.subTest(reveal=reveal):
                inp = copy.deepcopy(self.input)
                inp["reveal"] = reveal
                # Exercise semantics even when an attacker signs the bad reveal.
                if reveal is not None:
                    self.commit_and_sign(inp)
                self.assertError(inp, "E_SPOIL_MISMATCH")

    def test_schema_rejections_are_not_crashes_or_audit_success(self):
        cases = [None, [], {}, dict(self.input, extra=True)]
        for key in ("params", "roll", "envelope"):
            inp = copy.deepcopy(self.input)
            inp[key] = []
            cases.append(inp)
        for key in ("K_hex", "ctx_hex"):
            inp = copy.deepcopy(self.input)
            inp["params"][key] = "ab" * 31 + "FF"
            cases.append(inp)
        inp = copy.deepcopy(self.input)
        inp["roll"][0] += "\n"
        cases.append(inp)
        # Empty roll is a well-formed array, but violates the manifest's roll size.
        for inp in cases:
            with self.subTest(inp=inp):
                actual = self.audit(inp)
                self.assertFalse(actual["ok"], actual)
                self.assertIn(actual["error"], ("E_SCHEMA", "E_MANIFEST"), actual)

    def test_log_verification_is_still_explicitly_unsupported(self):
        self.assertNotIn("log.verify_election", OPS)


if __name__ == "__main__":
    unittest.main()
