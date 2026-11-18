"""Primitive known answers taken from the external standards (not from the QV vector files)."""

import hashlib
import unittest

from qv_verifier import aead, ed25519, merkle, ristretto
from qv_verifier.edwards import BASE, L, P, ed_decode, is_small_order
from qv_verifier.errors import QVError
from qv_verifier.framed_hash import H256, LABELS, frame, hs, hs_nz_full, lp, u32


class TestEd25519(unittest.TestCase):
    # RFC 8032 §7.1 TEST 1, 2, 3
    CASES = [
        ("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "",
         "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
         "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
        ("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb", "72",
         "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
         "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
        ("c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7", "af82",
         "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
         "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a"),
    ]

    def test_rfc8032_sign_verify(self):
        for sk, msg, pk, sig in self.CASES:
            sk_b, m = bytes.fromhex(sk), bytes.fromhex(msg)
            self.assertEqual(ed25519.public_key(sk_b).hex(), pk)
            self.assertEqual(ed25519.sign(sk_b, m).hex(), sig)
            self.assertTrue(ed25519.verify(bytes.fromhex(pk), m, bytes.fromhex(sig)))
            self.assertFalse(ed25519.verify(bytes.fromhex(pk), m + b"x", bytes.fromhex(sig)))

    def test_strict_policy(self):
        sk, _, pk, sig = self.CASES[0]
        pk_b, sig_b = bytes.fromhex(pk), bytes.fromhex(sig)
        S = int.from_bytes(sig_b[32:], "little")
        malleated = sig_b[:32] + (S + L).to_bytes(32, "little")
        self.assertFalse(ed25519.verify(pk_b, b"", malleated), "S + l must be rejected")
        identity = (1).to_bytes(32, "little")
        self.assertFalse(ed25519.verify(identity, b"", identity + bytes(32)), "small-order A")
        self.assertFalse(ed25519.verify(pk_b, b"", sig_b[:63]), "short signature")
        # non-canonical A: y >= p (y = p + 1 encodes the same point as y = 1 if accepted)
        self.assertIsNone(ed_decode((P + 1).to_bytes(32, "little")))
        self.assertTrue(is_small_order(ed_decode(identity)))
        self.assertFalse(is_small_order(BASE))


class TestRistretto(unittest.TestCase):
    # RFC 9496 Appendix A.1 (multiples 0..3 of the generator)
    MULTIPLES = [
        "0000000000000000000000000000000000000000000000000000000000000000",
        "e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76",
        "6a493210f7499cd17fecb510ae0cea23a110e8d5b901f8acadd3095c73a3b919",
        "94741f5d5d52755ece4f23f044ee27d5d1ea1e2bd196b462166b16152a9d0259",
    ]

    def test_generator_multiples_and_roundtrip(self):
        for k, h in enumerate(self.MULTIPLES):
            pt = ristretto.base_mul(k)
            self.assertEqual(pt.hex(), h)
            self.assertEqual(ristretto.decode(bytes.fromhex(h)), pt)
            self.assertEqual(ristretto.decode(bytes.fromhex(h)).hex(), h)

    def test_group_law(self):
        a, b = 123456789, 987654321
        self.assertEqual(ristretto.base_mul(a) + ristretto.base_mul(b), ristretto.base_mul(a + b))
        self.assertEqual(ristretto.base_mul(a) - ristretto.base_mul(a), ristretto.R_IDENTITY)
        self.assertTrue(ristretto.G.mul(L).is_identity())
        # P and P + (0, -1) (2-torsion) are the same ristretto element
        from qv_verifier.edwards import Point
        x, y = ristretto.G.p.affine()
        alt = ristretto.RPoint(Point(-x, -y, 1, x * y))
        self.assertEqual(alt, ristretto.G)
        self.assertEqual(alt.encode(), ristretto.G.encode())

    def test_invalid_encodings(self):
        for h in (
            "00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",  # non-canonical
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
            "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",  # = p
            "0100000000000000000000000000000000000000000000000000000000000000",  # negative s
        ):
            with self.assertRaises(QVError) as cm:
                ristretto.decode(bytes.fromhex(h))
            self.assertEqual(cm.exception.code, "E_POINT_DECODE")
        with self.assertRaises(QVError):
            ristretto.decode(bytes(31))
        with self.assertRaises(QVError) as cm:
            ristretto.decode_hex("00" * 32, non_identity=True)
        self.assertEqual(cm.exception.code, "E_IDENTITY")

    def test_scalars(self):
        self.assertEqual(ristretto.scalar_decode((L - 1).to_bytes(32, "little")), L - 1)
        for bad, code in ((L.to_bytes(32, "little"), "E_SCALAR_RANGE"),
                          (b"\xff" * 32, "E_SCALAR_RANGE"), (bytes(31), "E_LENGTH")):
            with self.assertRaises(QVError) as cm:
                ristretto.scalar_decode(bad)
            self.assertEqual(cm.exception.code, code)


class TestFramedHash(unittest.TestCase):
    def test_frame_layout(self):
        pre = frame("manifest", [b"ab", b"c"])
        expect = lp(b"QV1-HASH") + lp(b"qv1-r255-sha2") + lp(b"manifest") + u32(2) + lp(b"ab") + lp(b"c")
        self.assertEqual(pre, expect)
        self.assertNotEqual(H256("manifest", b"ab", b"c"), H256("manifest", b"a", b"bc"))

    def test_cds01_preimage_length_383(self):
        # QV-16 Appendix A.4: 11 fields with ids "budget"/"yes" -> 383 bytes
        f32 = bytes(32)
        pre = frame("cds01", [f32, f32, b"budget", b"yes"] + [f32] * 7)
        self.assertEqual(len(pre), 383)

    def test_registry(self):
        with self.assertRaises(QVError) as cm:
            H256("nope")
        self.assertEqual(cm.exception.code, "E_DOMAIN_UNKNOWN")
        with self.assertRaises(QVError):
            H256("pok", b"")  # pok is an hs label, not H256
        self.assertEqual(len(LABELS), 27)

    def test_hs_nz_appends_counter(self):
        s, c = hs_nz_full("enc-nonce", b"x")
        self.assertEqual(c, 0)
        digest = hashlib.sha512(frame("enc-nonce", [b"x", u32(0)])).digest()
        self.assertEqual(s, int.from_bytes(digest, "little") % L)
        self.assertNotEqual(s, 0)
        self.assertLess(hs("pok", b"x"), L)


class TestMerkle(unittest.TestCase):
    def test_rfc9162_shapes(self):
        d = [bytes([i]) for i in range(5)]
        lh = [hashlib.sha256(b"\x00" + x).digest() for x in d]
        node = lambda a, b: hashlib.sha256(b"\x01" + a + b).digest()
        self.assertEqual(merkle.mth([]), hashlib.sha256(b"").digest())
        self.assertEqual(merkle.mth(d[:1]), lh[0])
        self.assertEqual(merkle.mth(d[:3]), node(node(lh[0], lh[1]), lh[2]))
        self.assertEqual(merkle.mth(d), node(node(node(lh[0], lh[1]), node(lh[2], lh[3])), lh[4]))

    def test_roll_rules(self):
        pks = sorted(ed25519.public_key(bytes([i]) * 32) for i in range(3))
        root, leaves = merkle.roll_root(pks)
        self.assertEqual(len(leaves), 3)
        for bad in ([pks[0], pks[0]], [pks[1], pks[0]], [(1).to_bytes(32, "little")]):
            with self.assertRaises(QVError) as cm:
                merkle.roll_root(bad)
            self.assertEqual(cm.exception.code, "E_ROLL")


class TestAead(unittest.TestCase):
    def test_aes256_fips197_c3(self):
        self.assertEqual(
            aead.AES256(bytes(range(32))).encrypt_block(bytes.fromhex("00112233445566778899aabbccddeeff")).hex(),
            "8ea2b7ca516745bfeafc49904b496089",
        )

    def test_gcm_known_answers(self):
        # McGrew-Viega GCM test cases 13 and 14 (AES-256, zero key, zero 96-bit IV)
        self.assertEqual(aead.aes256gcm_encrypt(bytes(32), bytes(12), b"", b"")[1].hex(),
                         "530f8afbc74536b9a963b4f1c4cb738b")
        ct, tag = aead.aes256gcm_encrypt(bytes(32), bytes(12), bytes(16), b"")
        self.assertEqual(ct.hex(), "cea7403d4d606b6e074ec5d3baf39d18")
        self.assertEqual(tag.hex(), "d0d1c8a799996bf0265b98b5d48ab919")
        self.assertEqual(aead.aes256gcm_decrypt(bytes(32), bytes(12), ct, tag, b""), bytes(16))
        self.assertIsNone(aead.aes256gcm_decrypt(bytes(32), bytes(12), ct, tag, b"aad"))

    def test_hkdf_rfc5869_case1(self):
        okm = aead.hkdf_sha256(bytes.fromhex("000102030405060708090a0b0c"), bytes.fromhex("0b" * 22),
                               bytes.fromhex("f0f1f2f3f4f5f6f7f8f9"), 42)
        self.assertEqual(okm.hex(), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865")


if __name__ == "__main__":
    unittest.main()
