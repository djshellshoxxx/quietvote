"""Approved PY-02: absent evidence is distinct from a rejected or bad tally."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qv_verifier.election import verify_bundle

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "test-vectors/v1/elections/tiny-yesno-3v"
CLI = ROOT / "verifier-py/qv_verifier"


def honest():
    return json.loads((FIXTURE / "bundle.json").read_text(encoding="utf-8"))


def pending():
    bundle = honest()
    bundle["log"] = [row for row in bundle["log"]
                     if row["entry"].get("body", {}).get("type") != "tally"]
    return bundle


def tally(bundle):
    return next(row["entry"] for row in bundle["log"]
                if row["entry"].get("body", {}).get("type") == "tally")


class TestIncompleteVerdict(unittest.TestCase):
    def test_absent_tally_retains_verified_evidence_without_an_outcome(self):
        with patch("qv_verifier.election.rules.evaluate", side_effect=AssertionError("no tally evidence")):
            report = verify_bundle(pending())
        expected = json.loads((FIXTURE / "expected-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["verdict"], "INCOMPLETE")
        self.assertEqual(report["codes"], [])
        self.assertEqual(report["counts"], expected["counts"])
        self.assertEqual(report["ctx_prefix"], expected["ctx_prefix"])
        self.assertNotIn("results", report)
        for check in ("chk.tally.aggregate", "chk.tally.decrypt", "chk.result.rules"):
            self.assertEqual(report["checks"][check], "not_run", check)
        for check in ("chk.manifest.hash", "chk.manifest.sig", "chk.keys.trustees",
                      "chk.ballots.valid", "chk.ballots.latest", "chk.benaloh.spoiled",
                      "chk.encoding.canonical", "chk.time.window"):
            self.assertEqual(report["checks"][check], "pass", check)

    def test_fatal_manifest_error_wins_over_missing_tally(self):
        bundle = pending()
        bundle["manifest"]["sigs"] = []
        report = verify_bundle(bundle)
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["codes"], ["E_MANIFEST_SIG"])
        self.assertEqual(report["checks"]["chk.tally.decrypt"], "not_run")
        self.assertEqual(report["counts"], {"cast": 0, "spoiled": 0, "counted": 0})
        self.assertNotIn("results", report)

    def test_fatal_board_error_wins_over_missing_tally(self):
        report = verify_bundle(pending(), log={"board": {}})
        self.assertEqual(report["verdict"], "FAIL")
        self.assertIn("E_LOG_FORMAT", report["codes"])
        self.assertEqual(report["checks"]["chk.tally.decrypt"], "not_run")

    def test_rejected_tally_is_not_an_absent_tally(self):
        for mutation in ("unknown_field", "wrong_proto"):
            bundle = honest()
            body = tally(bundle)["body"]
            if mutation == "unknown_field":
                body["unsigned_extra"] = True
            else:
                body["proto"] = "qv2-unsupported"
            with self.subTest(mutation=mutation):
                report = verify_bundle(bundle)
                self.assertEqual(report["verdict"], "FAIL")
                self.assertEqual(report["checks"]["chk.encoding.canonical"], "fail")
                self.assertIn("E_SCHEMA" if mutation == "unknown_field" else "E_VERSION", report["codes"])
                self.assertEqual(report["checks"]["chk.tally.decrypt"], "not_run")
                self.assertNotIn("results", report)

    def test_multiple_tallies_keep_existing_fatal_conflict_behavior(self):
        bundle = honest()
        duplicate = copy.deepcopy(tally(bundle))
        duplicate["body"]["contests"][0]["options"][0]["T"] += 1
        bundle["log"].append({"seq": bundle["log"][-1]["seq"] + 1, "entry": duplicate})
        report = verify_bundle(bundle)
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["checks"]["chk.tally.aggregate"], "fail")
        self.assertIn("E_SCHEMA", report["codes"])

    def test_actual_cli_distinguishes_pending_complete_and_invalid(self):
        invalid = pending()
        invalid["manifest"]["sigs"] = []
        with tempfile.TemporaryDirectory(prefix="qv-incomplete-") as tmp:
            for name, bundle, verdict, exit_code in (("pending", pending(), "INCOMPLETE", 3),
                                                    ("complete", honest(), "PASS", 0),
                                                    ("invalid", invalid, "FAIL", 1)):
                with self.subTest(name=name):
                    path = Path(tmp) / (name + ".json")
                    path.write_text(json.dumps(bundle), encoding="utf-8")
                    run = subprocess.run([sys.executable, "-I", str(CLI), "verify", str(path)],
                                         capture_output=True, text=True, timeout=30)
                    self.assertEqual(run.returncode, exit_code, run.stdout + run.stderr)
                    self.assertEqual(json.loads(run.stdout)["verdict"], verdict)
                    self.assertEqual(run.stderr, "")


if __name__ == "__main__":
    unittest.main()
