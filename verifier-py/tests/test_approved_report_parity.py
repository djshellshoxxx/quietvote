"""QV-ADR-027 approved report dependencies; the shipped corpus is unchanged."""

import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from qv_verifier.election import CHECKS, verify_bundle

TREE = Path(__file__).resolve().parents[2] / "test-vectors" / "v1"
BASE = TREE / "elections" / "tiny-yesno-3v" / "bundle.json"


def honest():
    return json.loads(BASE.read_text(encoding="utf-8"))


def mutant(name):
    return json.loads((TREE / "mutations" / (name + ".json")).read_text(encoding="utf-8"))["bundle"]


def tally(bundle):
    return next(row["entry"]["body"] for row in bundle["log"]
                if row["entry"].get("body", {}).get("type") == "tally")


class ApprovedReportParity(unittest.TestCase):
    def assert_manifest_stop(self, report):
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["codes"], ["E_MANIFEST_SIG"])
        self.assertEqual(report["checks"]["chk.manifest.hash"], "pass")
        self.assertEqual(report["checks"]["chk.manifest.sig"], "fail")
        for check in CHECKS:
            if check not in ("chk.manifest.hash", "chk.manifest.sig"):
                self.assertEqual(report["checks"][check], "not_run", check)
        self.assertEqual(report["counts"], {"cast": 0, "spoiled": 0, "counted": 0})
        self.assertNotIn("ctx_prefix", report)
        self.assertNotIn("results", report)

    def test_removed_manifest_signature_stops_all_dependents(self):
        self.assert_manifest_stop(verify_bundle(mutant("manifest-signature-removed")))

    def test_invalid_manifest_signature_never_examines_untrusted_log(self):
        bundle = honest()
        for sig in bundle["manifest"]["sigs"]:
            sig["sig"] = "00" * 64
        # A rejected manifest cannot authorise inspecting or reporting this log.
        bundle["log"] = [{"seq": True, "entry": {"untrusted": "malformed"}}]
        self.assert_manifest_stop(verify_bundle(bundle))

    def assert_decrypt_stop(self, report):
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["checks"]["chk.tally.aggregate"], "pass")
        self.assertEqual(report["checks"]["chk.tally.decrypt"], "fail")
        self.assertEqual(report["checks"]["chk.result.rules"], "not_run")
        self.assertIn("E_DLOG_RANGE", report["codes"])
        self.assertNotIn("results", report)

    def test_published_count_mismatch_never_evaluates_rules(self):
        with patch("qv_verifier.election.rules.evaluate", side_effect=AssertionError("unverified counts")):
            report = verify_bundle(mutant("count-altered"))
        self.assert_decrypt_stop(report)

    def test_each_altered_option_count_with_matching_or_false_result_is_not_evidence(self):
        original = honest()
        for option in range(len(tally(original)["contests"][0]["options"])):
            for false_result in (False, True):
                with self.subTest(option=option, false_result=false_result):
                    bundle = copy.deepcopy(original)
                    tb = tally(bundle)
                    tb["contests"][0]["options"][option]["T"] += 1
                    if false_result:
                        tb["results"][0]["outcome"] = {"kind": "rejected"}
                    with patch("qv_verifier.election.rules.evaluate", side_effect=AssertionError("unverified counts")):
                        report = verify_bundle(bundle)
                    self.assert_decrypt_stop(report)
                    self.assertNotIn("E_RESULT", report["codes"])

    def test_published_result_mismatch_never_emits_recomputed_result(self):
        report = verify_bundle(mutant("result-flipped"))
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["checks"]["chk.tally.decrypt"], "pass")
        self.assertEqual(report["checks"]["chk.result.rules"], "fail")
        self.assertIn("E_RESULT", report["codes"])
        self.assertNotIn("results", report)

    def test_honest_result_and_completed_checks_are_retained(self):
        bundle = honest()
        report = verify_bundle(bundle)
        self.assertEqual(report["verdict"], "PASS")
        self.assertEqual(report["checks"]["chk.tally.decrypt"], "pass")
        self.assertEqual(report["checks"]["chk.result.rules"], "pass")
        self.assertEqual(report["results"], tally(bundle)["results"])


if __name__ == "__main__":
    unittest.main()
