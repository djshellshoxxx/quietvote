"""QV-03 §7.3 / ADR-027 B1-08: status-quo applies only to yes/no contests."""

import json
import unittest
from pathlib import Path

from qv_verifier.errors import QVError
from qv_verifier.manifest import validate
from qv_verifier.ops import op_manifest


BASE = (Path(__file__).resolve().parents[2] / "test-vectors" / "v1" /
        "elections" / "tiny-yesno-3v" / "bundle.json")


def manifest(method="yes-no", tie_type="status-quo", option="no"):
    value = json.loads(BASE.read_text(encoding="utf-8"))["manifest"]["body"]
    contest = value["contests"][0]
    contest["method"] = method
    if method != "yes-no":
        contest.pop("rule", None)
    if method == "approval":
        contest.pop("selection_limit", None)
    else:
        contest["selection_limit"] = 1
    contest["tie_break"] = {"type": tie_type}
    if tie_type == "status-quo":
        contest["tie_break"]["option"] = option
    return value


class ManifestTieMethods(unittest.TestCase):
    def test_status_quo_rejects_each_non_yes_no_method(self):
        for method in ("single-choice", "approval", "k-of-n"):
            with self.subTest(method=method):
                value = manifest(method)
                for operation in (lambda: validate(value),
                                  lambda: op_manifest({"manifest": value})):
                    with self.assertRaises(QVError) as caught:
                        operation()
                    self.assertEqual(caught.exception.code, "E_MANIFEST")

    def test_status_quo_keeps_both_valid_yes_no_options(self):
        # Choosing the status-quo option remains an existing manifest decision.
        for option in ("yes", "no"):
            with self.subTest(option=option):
                validate(manifest(option=option))

    def test_other_tie_rules_remain_valid_for_all_supported_methods(self):
        for method in ("yes-no", "single-choice", "approval", "k-of-n"):
            for tie_type in ("declare-tie", "lexicographic"):
                with self.subTest(method=method, tie_type=tie_type):
                    validate(manifest(method, tie_type))

    def test_unknown_status_quo_option_still_fails(self):
        with self.assertRaises(QVError) as caught:
            validate(manifest(option="missing"))
        self.assertEqual(caught.exception.code, "E_MANIFEST")


if __name__ == "__main__":
    unittest.main()
