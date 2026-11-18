"""QV-16 §5.19.1 / REQ-019: the published decrypter list must match T_valid."""

import json
import unittest
from pathlib import Path

from qv_verifier.election import _record_schema_ok, verify_bundle


BASE = (Path(__file__).resolve().parents[2] / "test-vectors" / "v1" /
        "elections" / "tiny-yesno-3v" / "bundle.json")


def bundle():
    return json.loads(BASE.read_text(encoding="utf-8"))


class TallyDecrypters(unittest.TestCase):
    def test_matching_decrypters_keep_the_existing_valid_result(self):
        value = bundle()
        record = next(e["entry"] for e in value["log"]
                      if e["entry"].get("body", {}).get("type") == "tally")
        self.assertEqual(record["body"]["decrypters"], [1, 3])
        report = verify_bundle(value, allow_no_log=True)
        self.assertEqual(report["verdict"], "PASS", report["findings"])
        self.assertEqual(report["checks"]["chk.tally.decrypt"], "pass")
        self.assertIn("results", report)

    def test_mismatching_decrypters_are_fatal_in_both_verification_modes(self):
        # All variants are well-formed lists; the existing share proofs remain unchanged.
        for listed in ([1], [1, 2, 3], [2, 3]):
            for content_only in (False, True):
                with self.subTest(listed=listed, content_only=content_only):
                    value = bundle()
                    record = next(e["entry"] for e in value["log"]
                                  if e["entry"].get("body", {}).get("type") == "tally")
                    record["body"]["decrypters"] = listed
                    self.assertTrue(_record_schema_ok(record))
                    report = verify_bundle(value, allow_no_log=content_only)
                    self.assertEqual(report["verdict"], "FAIL", report["findings"])
                    self.assertEqual(report["checks"]["chk.tally.aggregate"], "pass")
                    self.assertEqual(report["checks"]["chk.tally.decrypt"], "fail")
                    self.assertTrue(any(f["code"] == "E_DEC_PROOF" and f["fatal"]
                                        for f in report["findings"]))
                    self.assertEqual(report["checks"]["chk.result.rules"], "not_run")
                    self.assertNotIn("results", report)


if __name__ == "__main__":
    unittest.main()
