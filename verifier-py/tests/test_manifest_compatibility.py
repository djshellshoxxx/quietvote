"""ADR-027 B1-05/PY-01: exact approved manifest compatibility boundaries."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from qv_verifier.election import verify_bundle
from qv_verifier.errors import QVError
from qv_verifier.manifest import manifest_hash, validate
from qv_verifier.ops import op_manifest

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "test-vectors" / "v1"
BASE = CORPUS / "elections" / "tiny-yesno-3v" / "bundle.json"


def bundle():
    return json.loads(BASE.read_text(encoding="utf-8"))


def with_flag(value):
    b = bundle()
    b["manifest"]["body"]["spoil_trustee_decrypt"] = value
    b["manifest_hash"] = manifest_hash(b["manifest"]["body"])[1].hex()
    return b


class ManifestCompatibility(unittest.TestCase):
    def test_false_and_alm_hashes_match_independent_typescript_results(self):
        # Computed using the unchanged TS validateManifest/manifestHash at
        # 12565e6. This test neither imports TS nor modifies the corpus.
        expected = {
            "false": "d35908217a519231947f03df541d1e1d000fab2cb985d31ca7a483c0aeb188a7",
            "alm": "be8e2cd6eac760a24e62ed367c378b0bf58f00a0ed6e5b4b39f3f097d74f07d2",
            "both": "9e0c7585d56d49114948e19caa3c2e6d3472b51bbfa16854a27197ba310a36f7",
        }
        for variant, digest in expected.items():
            with self.subTest(variant=variant):
                b = bundle()
                m = b["manifest"]["body"]
                if variant in ("false", "both"):
                    m["spoil_trustee_decrypt"] = False
                if variant in ("alm", "both"):
                    m["title"] += "\u061c"
                result = op_manifest({"manifest": m, "roll_size": len(b["roll"])})
                self.assertEqual(result["manifest_hash"], digest)
                self.assertEqual(bytes.fromhex(result["jcs_hex"]), manifest_hash(m)[0])

    def test_alm_is_allowed_in_each_free_text_kind(self):
        original = bundle()["manifest"]["body"]
        for location in ("title", "contest", "option", "trustee", "witness"):
            with self.subTest(location=location):
                m = copy.deepcopy(original)
                if location == "title":
                    m["title"] += "\u061c"
                elif location == "contest":
                    m["contests"][0]["title"] += "\u061c"
                elif location == "option":
                    m["contests"][0]["options"][0]["label"] += "\u061c"
                elif location == "trustee":
                    m["trustees"][0]["name"] += "\u061c"
                else:
                    m["bb"]["witnesses"] = [{"name": "witness\u061c", "pk": m["trustees"][0]["sign_pk"]}]
                    m["bb"]["witness_quorum"] = 1
                validate(m)

    def test_other_existing_bidi_rejections_are_preserved(self):
        for cp in (0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A)):
            with self.subTest(codepoint=hex(cp)):
                m = bundle()["manifest"]["body"]
                m["title"] += chr(cp)
                with self.assertRaises(QVError) as caught:
                    validate(m)
                self.assertEqual(caught.exception.code, "E_MANIFEST")

    def test_flag_is_strict_boolean_and_does_not_open_the_schema(self):
        for value in (0, 1, "false", "true", [], {}, None):
            with self.subTest(value=repr(value)):
                m = bundle()["manifest"]["body"]
                m["spoil_trustee_decrypt"] = value
                with self.assertRaises(QVError) as caught:
                    validate(m)
                self.assertEqual(caught.exception.code, "E_PARSE" if value is None else "E_SCHEMA")
        m = bundle()["manifest"]["body"]
        m["spoil_trustee_decrypt"] = False
        m["spoil_trustee_decrypt_version"] = 1
        with self.assertRaises(QVError) as caught:
            validate(m)
        self.assertEqual(caught.exception.code, "E_SCHEMA")

    def test_false_does_not_bypass_manifest_signature_authentication(self):
        report = verify_bundle(with_flag(False))
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["codes"], ["E_MANIFEST_SIG"])
        self.assertEqual(report["checks"]["chk.manifest.hash"], "pass")
        self.assertEqual(report["checks"]["chk.keys.trustees"], "not_run")

    def test_true_is_named_unsupported_in_direct_and_election_apis(self):
        b = with_flag(True)
        with self.assertRaises(QVError) as caught:
            validate(b["manifest"]["body"])
        self.assertEqual(caught.exception.code, "E_UNSUPPORTED")
        report = verify_bundle(b)
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["codes"], ["E_UNSUPPORTED"])
        self.assertEqual(report["checks"]["chk.keys.trustees"], "not_run")

    def test_actual_cli_rejects_true_with_named_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unsupported.json"
            path.write_text(json.dumps(with_flag(True)), encoding="utf-8")
            result = subprocess.run([sys.executable, "-I", str(ROOT / "verifier-py" / "qv_verifier"),
                                     "verify", str(path)], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(json.loads(result.stdout)["codes"], ["E_UNSUPPORTED"])


if __name__ == "__main__":
    unittest.main()
