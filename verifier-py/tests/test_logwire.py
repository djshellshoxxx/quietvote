"""Independent QV-18 framing, checkpoint and promise hostile-input tests."""

import base64
import hashlib
import itertools
import json
from pathlib import Path
import struct
import unittest

from qv_verifier import ed25519
from qv_verifier.edwards import BASE, L, P, Point, ed_encode
from qv_verifier.errors import QVError
from qv_verifier.logwire import (
    MAX_SAFE, b64_decode, body_digest, decode_header, key_id,
    parse_checkpoint, parse_receipt, witness_observations, witness_times,
)

FIXTURES = Path(__file__).resolve().parents[2] / "test-vectors/v1/elections/log-layer-4v"
ORIGIN = "quietvote/v1/" + "a" * 26
OTHER_ORIGIN = "quietvote/v1/" + "b" * 26
LOG_SEED = bytes(range(32))
AUTHOR_SEED = bytes(range(32, 64))
WITNESS_SEED = bytes(range(64, 96))
LOG_PK = ed25519.public_key(LOG_SEED)
AUTHOR_PK = ed25519.public_key(AUTHOR_SEED)
WITNESS_PK = ed25519.public_key(WITNESS_SEED)


def b64(data):
    return base64.b64encode(data).decode("ascii")


def field(text):
    raw = text.encode("utf-8")
    return struct.pack(">H", len(raw)) + raw


def header(*, origin=ORIGIN, entry_type="ballot", body=b"{}", refs=(), version=1,
           created_at=123, body_len=None, algorithm="ed25519", signature_size=64):
    """Construct the documented wire grammar independently of the decoder."""
    author_id = hashlib.sha256(b"QV-KEYID-v1\0ed25519\0" + AUTHOR_PK).digest()
    digest = hashlib.sha256(b"qv/body/v1\0" + body).digest()
    unsigned = (struct.pack(">H", version) + field(origin) + field(entry_type)
                + author_id + field(algorithm) + b"n" * 16
                + struct.pack(">QQ", created_at, len(body) if body_len is None else body_len)
                + digest + struct.pack(">H", len(refs))
                + b"".join(struct.pack(">Q", ref) for ref in refs))
    sig = ed25519.sign(AUTHOR_SEED, b"QV-ENTRY-v1\0" + unsigned)
    return unsigned + struct.pack(">H", signature_size) + sig[:signature_size]


def signature_line(name, pk, payload, kind=1):
    identifier = hashlib.sha256(name.encode() + b"\n" + bytes([kind]) + pk).digest()[:4]
    return f"— {name} {b64(identifier + payload)}\n"


def note_text(size=5, root=b"r" * 32, origin=ORIGIN):
    return f"{origin}\n{size}\n{b64(root)}\n"


def note(text=None, extra="", seed=LOG_SEED):
    text = text or note_text()
    pk = ed25519.public_key(seed)
    return text + "\n" + signature_line(text.split("\n")[0], pk, ed25519.sign(seed, text.encode())) + extra


def cosig(text, timestamp=123, name="witness", seed=WITNESS_SEED):
    msg = f"cosignature/v1\ntime {timestamp}\n{text}".encode()
    payload = struct.pack(">Q", timestamp) + ed25519.sign(seed, msg)
    return signature_line(name, ed25519.public_key(seed), payload, 4)


def receipt(**changes):
    result = {"origin": ORIGIN, "seq": 3, "leaf_hash": b64(b"l" * 32),
              "sequenced_at": 100, "checkpoint_deadline": 130}
    result.update(changes)
    msg = (b"QV-RECEIPT-v1\0" + field(result["origin"])
           + struct.pack(">Q", result["seq"]) + base64.b64decode(result["leaf_hash"])
           + struct.pack(">QQ", result["sequenced_at"], result["checkpoint_deadline"]))
    result["promise_sig"] = b64(ed25519.sign(LOG_SEED, msg))
    return result


class TestBase64(unittest.TestCase):
    def test_canonical_alphabets_and_padding(self):
        self.assertEqual(b64_decode("+/8=", 2), b"\xfb\xff")
        self.assertEqual(b64_decode("-_8", 2, url=True), b"\xfb\xff")
        for value in ("Zh==", "Zg", "Zg===", "Zg==\n", " Zg==", "-_8=", "é", False, None):
            with self.subTest(value=value), self.assertRaises(QVError):
                b64_decode(value)
        for value in ("Zg==", "Zh", "+/8", "a", "Zg\n"):
            with self.subTest(value=value), self.assertRaises(QVError):
                b64_decode(value, url=True)

    def test_bound_and_exact_length(self):
        self.assertEqual(b64_decode("", max_bytes=0), b"")
        self.assertEqual(b64_decode("YQ==", max_bytes=1), b"a")
        for options in ({"max_bytes": 0}, {"length": 2}, {"max_bytes": -1}, {"length": True}):
            with self.subTest(options=options), self.assertRaises(QVError):
                b64_decode("YQ==", **options)


class TestHeader(unittest.TestCase):
    def test_independently_signed_header_and_domain_binding(self):
        raw = header(refs=(0, 2))
        decoded = decode_header(raw)
        self.assertEqual(decoded["refs"], [0, 2])
        self.assertEqual(decoded["author"], key_id(AUTHOR_PK))
        self.assertEqual(decoded["body_digest"], body_digest(b"{}"))
        self.assertTrue(ed25519.verify(AUTHOR_PK, decoded["signed_bytes"], decoded["sig"]))
        for changed in (raw.replace(ORIGIN.encode(), OTHER_ORIGIN.encode()),
                        raw.replace(decoded["body_digest"], b"x" * 32)):
            decoded_changed = decode_header(changed)
            self.assertFalse(ed25519.verify(AUTHOR_PK, decoded_changed["signed_bytes"], decoded_changed["sig"]))

    def test_truncation_and_trailing_bytes(self):
        raw = header(refs=(0, 1))
        for end in range(len(raw)):
            with self.subTest(end=end), self.assertRaises(QVError):
                decode_header(raw[:end])
        for bad in (raw + b"\0", b"x" * 2049, None, {}, "header"):
            with self.subTest(value=str(bad)[:20]), self.assertRaises(QVError):
                decode_header(bad)

    def test_header_bounds_and_closed_versions(self):
        cases = [dict(version=0), dict(version=2), dict(origin=ORIGIN.upper()),
                 dict(entry_type="future_type"), dict(algorithm="Ed25519"),
                 dict(created_at=MAX_SAFE + 1), dict(body_len=(1 << 20) + 1),
                 dict(refs=(2, 1)), dict(refs=(1, 1)), dict(refs=(MAX_SAFE + 1,)),
                 dict(signature_size=63)]
        for args in cases:
            with self.subTest(args=args), self.assertRaises(QVError):
                decode_header(header(**args))
        self.assertEqual(decode_header(header(created_at=MAX_SAFE))["created_at"], MAX_SAFE)

    def test_key_and_body_type_errors_are_named(self):
        for pk in (None, "00" * 32, b"x" * 31):
            with self.assertRaises(QVError):
                key_id(pk)
        with self.assertRaises(QVError):
            body_digest("not bytes")


class TestCheckpoints(unittest.TestCase):
    def assert_checkpoint_rejected(self, value, pk=LOG_PK, origin=ORIGIN):
        with self.assertRaises(QVError) as error:
            parse_checkpoint(value, pk, origin)
        self.assertEqual(error.exception.code, "E_LOG_CHECKPOINT")

    def test_self_generated_checkpoint_and_cosignature(self):
        text = note_text()
        parsed = parse_checkpoint(note(text, cosig(text)), LOG_PK, ORIGIN)
        self.assertEqual((parsed["size"], parsed["root"], parsed["text"]), (5, b"r" * 32, text))
        self.assertEqual(witness_times(parsed, [{"name": "witness", "pk": WITNESS_PK.hex()}]),
                         {WITNESS_PK.hex(): 123})

    def test_checkpoint_syntax_and_bounds(self):
        valid = note()
        for value in (None, {}, valid[:-1], valid.replace("\n", "\r\n"), "\ufeff" + valid,
                      valid.replace("\n5\n", "\n05\n"), valid.replace("\n5\n", "\n-1\n"),
                      valid.replace("\n5\n", f"\n{MAX_SAFE + 1}\n"),
                      valid.replace("\n\n", "\nextension\n\n"),
                      valid.replace("— ", "- "), valid.replace("— ", "— +"),
                      valid + "\n", "x" * ((1 << 20) + 1), valid.replace("\n5\n", "\n５\n"),
                      valid.replace("— ", "— \ud800")):
            with self.subTest(value=str(value)[:70]):
                self.assert_checkpoint_rejected(value)

    def test_log_key_root_origin_and_signature_binding(self):
        valid = note()
        self.assert_checkpoint_rejected(valid, AUTHOR_PK)
        self.assert_checkpoint_rejected(valid, origin=OTHER_ORIGIN)
        self.assert_checkpoint_rejected(valid.replace(b64(b"r" * 32), b64(b"s" * 32)))
        self.assert_checkpoint_rejected(valid.replace(ORIGIN, OTHER_ORIGIN), origin=OTHER_ORIGIN)
        wrong = signature_line(ORIGIN, LOG_PK, b"x" * 64)
        self.assert_checkpoint_rejected(valid + wrong)

    def test_unknown_signatures_and_bound(self):
        unknown = signature_line("unknown", AUTHOR_PK, b"x" * 64)
        parsed = parse_checkpoint(note(extra=unknown * 16), LOG_PK, ORIGIN)
        self.assertEqual(len(parsed["signatures"]), 17)
        self.assert_checkpoint_rejected(note(extra=unknown * 128))
        self.assert_checkpoint_rejected(note().replace("\n\n", "\n\n— unknown YQ==\n"))

    def test_witness_distinct_keys_and_wrong_signature_inputs(self):
        text = note_text()
        first = cosig(text)
        alias = cosig(text, name="alias", timestamp=124)
        parsed = parse_checkpoint(note(text, first + first + alias), LOG_PK, ORIGIN)
        policy = [{"name": "witness", "pk": WITNESS_PK.hex()}, {"name": "alias", "pk": WITNESS_PK.hex()}]
        self.assertEqual(witness_times(parsed, policy), {WITNESS_PK.hex(): 123})
        for bad in (cosig(note_text(size=6)), cosig(note_text(origin=OTHER_ORIGIN)),
                    cosig(text, seed=AUTHOR_SEED), cosig(text, timestamp=MAX_SAFE + 1),
                    signature_line("witness", WITNESS_PK, b"x" * 72, 4)):
            with self.subTest(bad=bad[:40]):
                parsed = parse_checkpoint(note(text, bad), LOG_PK, ORIGIN)
                self.assertEqual(witness_times(parsed, policy), {})
        parsed = parse_checkpoint(note(text, first), LOG_PK, ORIGIN)
        self.assertEqual(witness_times(parsed, [{"name": "witness", "pk": "01" + "00" * 31}]), {})

    def test_witness_observations_are_permutation_invariant(self):
        text = note_text()
        early = cosig(text, timestamp=100)
        late = cosig(text, timestamp=200)
        alias = cosig(text, timestamp=150, name="alias")
        policy = [{"name": "witness", "pk": WITNESS_PK.hex()},
                  {"name": "alias", "pk": WITNESS_PK.hex()}]
        for ordering in itertools.permutations((early, late, alias)):
            with self.subTest(ordering=ordering):
                parsed = parse_checkpoint(note(text, "".join(ordering) + early), LOG_PK, ORIGIN)
                self.assertEqual(witness_observations(parsed, policy), {WITNESS_PK.hex(): [100, 150, 200]})
                self.assertEqual(witness_times(parsed, policy), {WITNESS_PK.hex(): 100})

        # Invalid claims at an earlier time must not replace authenticated evidence.
        forged_early = cosig(text, timestamp=1, seed=AUTHOR_SEED)
        parsed = parse_checkpoint(note(text, forged_early + late + early), LOG_PK, ORIGIN)
        self.assertEqual(witness_observations(parsed, policy), {WITNESS_PK.hex(): [100, 200]})

    def test_mixed_order_log_key_is_rejected(self):
        torsion = Point(0, P - 1, 1, 0)
        scalar, nonce = 17, 29
        pk = ed_encode(BASE.mul(scalar) + torsion)
        rb = ed_encode(BASE.mul(nonce) + torsion)
        for size in range(100):
            text = note_text(size)
            challenge = int.from_bytes(hashlib.sha512(rb + pk + text.encode()).digest(), "little") % L
            if challenge % 2 == 1:
                break
        sig = rb + ((nonce + challenge * scalar) % L).to_bytes(32, "little")
        # This satisfies the cofactorless equation, but violates prime-subgroup policy.
        forged = text + "\n" + signature_line(ORIGIN, pk, sig)
        self.assert_checkpoint_rejected(forged, pk)


class TestReceipts(unittest.TestCase):
    def assert_receipt_rejected(self, value, pk=LOG_PK, origin=ORIGIN):
        with self.assertRaises(QVError) as error:
            parse_receipt(value, pk, origin)
        self.assertEqual(error.exception.code, "E_LOG_RECEIPT")

    def test_independent_promise_and_untrusted_inclusion(self):
        original = receipt()
        parsed = parse_receipt(original, LOG_PK, ORIGIN)
        self.assertEqual(parsed["leaf"], b"l" * 32)
        self.assertNotIn("inclusion", parsed)
        for inclusion in (None, {}, {"tree_size": False}, "bad"):
            candidate = dict(original, inclusion=inclusion)
            self.assertEqual(parse_receipt(candidate, LOG_PK, ORIGIN)["inclusion"], inclusion)

    def test_receipt_signature_binds_each_field_and_log_key(self):
        original = receipt()
        for field_name, value in (("seq", 4), ("leaf_hash", b64(b"m" * 32)),
                                  ("sequenced_at", 101), ("checkpoint_deadline", 131)):
            with self.subTest(field_name=field_name):
                self.assert_receipt_rejected(dict(original, **{field_name: value}))
        self.assert_receipt_rejected(original, AUTHOR_PK)
        self.assert_receipt_rejected(original, origin=OTHER_ORIGIN)
        self.assert_receipt_rejected(dict(original, origin=OTHER_ORIGIN), origin=OTHER_ORIGIN)

    def test_receipt_schema_numbers_and_encoding(self):
        original = receipt()
        for value in (None, [], {}, dict(original, extra=1)):
            self.assert_receipt_rejected(value)
        for key in original:
            missing = dict(original)
            del missing[key]
            self.assert_receipt_rejected(missing)
        for key in ("seq", "sequenced_at", "checkpoint_deadline"):
            for value in (True, -1, 1.0, "1", MAX_SAFE + 1, None):
                with self.subTest(key=key, value=value):
                    self.assert_receipt_rejected(dict(original, **{key: value}))
        for key in ("leaf_hash", "promise_sig"):
            self.assert_receipt_rejected(dict(original, **{key: original[key].rstrip("=")}))
        self.assert_receipt_rejected(receipt(checkpoint_deadline=99))
        self.assertEqual(parse_receipt(receipt(seq=MAX_SAFE), LOG_PK, ORIGIN)["seq"], MAX_SAFE)


@unittest.skipUnless(FIXTURES.is_dir(), "public log fixtures absent")
class TestPublicLogFixtures(unittest.TestCase):
    def test_shipped_entry_framing_heads_and_promises(self):
        board = json.loads((FIXTURES / "board.json").read_text())
        manifest = json.loads((FIXTURES / "bundle.json").read_text())["manifest"]["body"]
        log_pk = bytes.fromhex(manifest["bb"]["log_pk"])
        keys = manifest["coordinator"]["keys"] + [t["sign_pk"] for t in manifest["trustees"]]
        keys += json.loads((FIXTURES / "bundle.json").read_text())["roll"]
        authors = {key_id(bytes.fromhex(pk)): bytes.fromhex(pk) for pk in keys}
        for entry in board["entries"]:
            h = decode_header(b64_decode(entry["header_b64u"], url=True))
            body = b64_decode(entry["body_b64u"], url=True)
            self.assertEqual(h["body_len"], len(body))
            self.assertEqual(h["body_digest"], body_digest(body))
            self.assertTrue(ed25519.verify(authors[h["author"]], h["signed_bytes"], h["sig"]))
        for raw_note in board["checkpoints"]:
            cp = parse_checkpoint(raw_note, log_pk, board["origin"])
            self.assertGreaterEqual(len(witness_times(cp, manifest["bb"]["witnesses"])), 2)
        vectors = json.loads((FIXTURES / "vectors.json").read_text())["vectors"]
        for claim in vectors[0]["input"]["receipts"]:
            parsed = parse_receipt(claim["receipt"], log_pk, board["origin"])
            self.assertEqual(parsed["seq"], claim["receipt"]["seq"])


if __name__ == "__main__":
    unittest.main()
