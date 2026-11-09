"""Report semantics settled by the specs (strict TS/Python differential, 2026-11-04).

* A stop makes only the checks that have not run yet ``not_run`` (QV-35-REQ-005 "every later check",
  QV-ERR-PY-015 "stops all later checks"); a check that already ran keeps its result.
* ``chk.encoding.canonical`` is not ``pass`` before the voter envelopes were examined
  (QV-35-REQ-003: "no check reported as pass without its evidence").
* A tally record rejected by the closed schema is not examined (QV-16 §5.5 item 7, App. C step 1,
  §5.20 E_SCHEMA class R/L), so aggregate/decrypt/rules are ``not_run``.
"""

import copy
import json
import unittest
from pathlib import Path

from qv_verifier.election import verify_bundle

TREE = Path(__file__).resolve().parents[2] / "test-vectors" / "v1"
BASE = TREE / "elections" / "tiny-yesno-3v" / "bundle.json"
OPEN_MUTANTS = [
    "open-binding-fields-absent", "open-joint-key-ref-forward", "open-joint-key-ref-mismatch",
    "open-manifest-hash-mismatch", "open-roll-ref-absent", "open-roll-ref-forward",
    "open-roll-ref-nonexistent", "open-roll-ref-wrong-record",
]
LATER_THAN_WINDOW = [
    "chk.ballots.valid", "chk.ballots.latest", "chk.tally.aggregate", "chk.tally.decrypt",
    "chk.result.rules", "chk.benaloh.spoiled",
]


def _mutant(name: str) -> dict:
    return json.loads((TREE / "mutations" / f"{name}.json").read_text(encoding="utf-8"))["bundle"]


@unittest.skipUnless(TREE.is_dir(), "test-vectors/v1 not present")
class TestStopKeepsCompletedChecks(unittest.TestCase):
    def test_binding_failure_keeps_manifest_and_dkg_results(self):
        for name in OPEN_MUTANTS:
            with self.subTest(name):
                r = verify_bundle(_mutant(name))
                self.assertEqual(r["verdict"], "FAIL")
                self.assertEqual(r["checks"]["chk.time.window"], "fail")
                self.assertIn("E_MARKERS", r["codes"])
                # C1 and C2 ran to completion before the C3 binding check: they keep `pass`.
                self.assertEqual(r["checks"]["chk.manifest.hash"], "pass")
                self.assertEqual(r["checks"]["chk.manifest.sig"], "pass")
                self.assertEqual(r["checks"]["chk.keys.trustees"], "pass")
                # Voter envelopes were never examined: encoding is not claimed.
                self.assertEqual(r["checks"]["chk.encoding.canonical"], "not_run")
                for c in LATER_THAN_WINDOW:
                    self.assertEqual(r["checks"][c], "not_run", c)
                self.assertEqual(r["counts"], {"cast": 0, "spoiled": 0, "counted": 0})
                self.assertNotIn("results", r)

    def test_dkg_failure_keeps_manifest_sig(self):
        b = json.loads(BASE.read_text(encoding="utf-8"))
        b["log"] = [e for e in b["log"] if e["entry"].get("body", {}).get("name") != "dkg-final"]
        r = verify_bundle(b)
        self.assertEqual(r["verdict"], "FAIL")
        self.assertEqual(r["checks"]["chk.keys.trustees"], "fail")
        self.assertEqual(r["checks"]["chk.manifest.sig"], "pass")
        self.assertEqual(r["checks"]["chk.encoding.canonical"], "not_run")
        self.assertEqual(r["checks"]["chk.time.window"], "not_run")
        self.assertNotIn("ctx_prefix", r)

    def test_anchor_mismatch_still_stops_everything_later(self):
        b = json.loads(BASE.read_text(encoding="utf-8"))
        b["manifest_hash"] = "00" * 32
        r = verify_bundle(b)
        self.assertEqual(r["checks"]["chk.manifest.hash"], "fail")
        self.assertEqual({c: s for c, s in r["checks"].items() if c != "chk.manifest.hash"},
                         {c: "not_run" for c in r["checks"] if c != "chk.manifest.hash"})

    def test_record_encoding_failure_before_stop_is_kept(self):
        b = _mutant("open-roll-ref-absent")
        b["log"].append({"seq": b["log"][-1]["seq"] + 1,
                         "entry": {"body": {"proto": "qv1-r255-sha2", "type": "mystery"}}})
        r = verify_bundle(b)
        self.assertEqual(r["checks"]["chk.encoding.canonical"], "fail")
        self.assertEqual(r["checks"]["chk.keys.trustees"], "pass")


@unittest.skipUnless(TREE.is_dir(), "test-vectors/v1 not present")
class TestRejectedTallyIsNotExamined(unittest.TestCase):
    def _assert_rejected(self, r: dict, code: str) -> None:
        self.assertEqual(r["verdict"], "FAIL")
        self.assertEqual(r["checks"]["chk.encoding.canonical"], "fail")
        self.assertIn(code, r["codes"])
        for c in ("chk.tally.aggregate", "chk.tally.decrypt", "chk.result.rules"):
            self.assertEqual(r["checks"][c], "not_run", c)
        self.assertNotIn("results", r)
        # The ballots were still verified and counted.
        self.assertEqual(r["checks"]["chk.ballots.valid"], "pass")
        self.assertEqual(r["counts"], {"cast": 4, "spoiled": 1, "counted": 4})

    def test_unknown_field_in_tally(self):
        self._assert_rejected(verify_bundle(_mutant("unknown-field-in-tally")), "E_SCHEMA")

    def test_unknown_field_in_tally_result_entry(self):
        b = json.loads(BASE.read_text(encoding="utf-8"))
        tally = next(e for e in b["log"] if e["entry"].get("body", {}).get("type") == "tally")
        tally["entry"]["body"]["results"][0]["note"] = "junk"
        self._assert_rejected(verify_bundle(b), "E_SCHEMA")

    def test_tally_with_unknown_proto(self):
        b = json.loads(BASE.read_text(encoding="utf-8"))
        tally = next(e for e in b["log"] if e["entry"].get("body", {}).get("type") == "tally")
        tally["entry"]["body"]["proto"] = "qv2-unknown"
        self._assert_rejected(verify_bundle(b), "E_VERSION")

    def test_honest_bundle_control(self):
        r = verify_bundle(json.loads(BASE.read_text(encoding="utf-8")))
        self.assertEqual(r["verdict"], "PASS")
        self.assertEqual(r["checks"]["chk.encoding.canonical"], "pass")
        self.assertEqual(r["checks"]["chk.result.rules"], "pass")
        self.assertIn("results", r)


if __name__ == "__main__":
    unittest.main()
