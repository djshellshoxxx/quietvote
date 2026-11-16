"""Regression cases found by independent review of the QV-18 integration.

These combine unchanged public signed fixtures. No signing key, replacement
signature, TypeScript implementation, or changed expected vector is used.
"""

import copy
import json
import unittest
from pathlib import Path

from qv_verifier.election import verify_bundle


TREE = Path(__file__).resolve().parents[2] / "test-vectors" / "v1"
FIXTURES = TREE / "elections" / "log-layer-4v"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


@unittest.skipUnless(FIXTURES.is_dir(), "log-layer fixtures absent")
class TestLogReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = read(FIXTURES / "bundle.json")
        cls.board = read(FIXTURES / "board.json")
        cls.vectors = read(FIXTURES / "vectors.json")["vectors"]

    def test_unknown_core_record_is_not_log_authority(self):
        bundle = read(FIXTURES / 'notices/waiver-before-open.bundle.json')
        report = verify_bundle(bundle)
        self.assertEqual(report['verdict'], 'PASS')
        self.assertEqual(report['checks']['chk.board.append_only'], 'not_run')
        self.assertEqual(report['checks']['chk.encoding.canonical'], 'fail')
        self.assertTrue(any(f['code'] == 'E_VERSION' and not f['fatal'] for f in report['findings']))

    def test_missing_or_malformed_protocol_dkg_notice_is_failure_not_hold(self):
        for mutation in ("missing", "name-list", "name-null", "type-list"):
            bundle = copy.deepcopy(self.bundle)
            marker = next(row for row in bundle["log"]
                          if row["entry"]["body"].get("name") == "dkg-r1-open")
            if mutation == "missing":
                bundle["log"].remove(marker)
            elif mutation == "type-list":
                marker["entry"]["body"]["type"] = []
            else:
                marker["entry"]["body"]["name"] = [] if mutation == "name-list" else None
            with self.subTest(mutation=mutation):
                # The actual board body is still an ordinary DKG marker. A
                # missing/malformed protocol counterpart cannot invent an X31 hold.
                result = verify_bundle(bundle, log={"board": self.board})
                self.assertEqual(result["verdict"], "FAIL")
                self.assertEqual(result["checks"]["chk.board.append_only"], "fail")

    def test_same_size_checkpoint_variants_cannot_hide_early_open_by_reordering(self):
        early = next(v for v in self.vectors if v["id"] == "time-early-open")
        early_head = early["input"]["board"]["replace"]["checkpoints"][1]
        normal_head = self.board["checkpoints"][1]
        signatures = []
        for variants in ([normal_head, early_head], [early_head, normal_head]):
            board = copy.deepcopy(self.board)
            board["checkpoints"] = [board["checkpoints"][0], *variants,
                                     *board["checkpoints"][2:]]
            result = verify_bundle(self.bundle, log={"board": board})
            signatures.append((result["verdict"], result["checks"], result["codes"]))
            self.assertEqual(result["verdict"], "FAIL")
            self.assertEqual(result["checks"]["chk.time.window"], "fail")
            self.assertIn("E_TIME_WINDOW", result["codes"])
        self.assertEqual(signatures[0], signatures[1])

    def test_duplicate_witness_lines_cannot_hide_early_authenticated_observation(self):
        early = next(v for v in self.vectors if v["id"] == "time-early-open")
        early_head = early["input"]["board"]["replace"]["checkpoints"][1]
        normal_head = self.board["checkpoints"][1]
        # Both notes sign exactly the same origin/size/root text. Transfer only
        # their valid witness lines, preserving every signature byte verbatim.
        early_lines = [line for line in early_head.splitlines() if line.startswith(("— w1 ", "— w2 "))]
        for at_start in (False, True):
            board = copy.deepcopy(self.board)
            body, original_lines = normal_head.split("\n\n")
            lines = original_lines.strip().splitlines()
            combined = early_lines + lines if at_start else lines + early_lines
            board["checkpoints"][1] = body + "\n\n" + "\n".join(combined) + "\n"
            result = verify_bundle(self.bundle, log={"board": board})
            self.assertEqual(result["verdict"], "FAIL")
            self.assertEqual(result["checks"]["chk.time.window"], "fail")
            self.assertIn("E_TIME_WINDOW", result["codes"])

    def test_malformed_unsigned_inclusion_is_class_i_without_erasing_promise(self):
        original = self.vectors[0]["input"]["receipts"][0]
        for value in (None, [], 0, "", {}):
            sample = copy.deepcopy(original)
            sample["receipt"]["inclusion"] = value
            with self.subTest(inclusion=value):
                result = verify_bundle(self.bundle, log={"board": self.board, "receipts": [sample]})
                self.assertEqual(result["verdict"], "PASS")
                self.assertEqual(result["checks"]["chk.receipts.sample"], "fail")
                self.assertEqual(result["checks"]["chk.board.append_only"], "pass")
                self.assertIn("E_LOG_RECEIPT", result["codes"])
                # This same authentic promise is broken by the adversarial view;
                # corrupting unsigned inclusion must not downgrade fatal evidence.
                adversary = read(FIXTURES / "adv-bundle.json")
                adv_board = read(FIXTURES / "adv-board.json")
                result = verify_bundle(adversary, log={"board": adv_board, "receipts": [sample]})
                self.assertEqual(result["verdict"], "FAIL")
                self.assertEqual(result["checks"]["chk.receipts.sample"], "fail")
                self.assertIn("E_LOG_RECEIPT", result["codes"])


if __name__ == "__main__":
    unittest.main()
