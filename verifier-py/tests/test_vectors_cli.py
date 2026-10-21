"""Integration: the runner/CLI and the repository's v1 vector tree (skipped if absent)."""

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from qv_verifier.election import verify_bundle
from qv_verifier.ops import OPS, run_op

PKG = Path(__file__).resolve().parents[1] / "qv_verifier"
TREE = Path(__file__).resolve().parents[2] / "test-vectors" / "v1"


def cli(*args):
    return subprocess.run([sys.executable, "-I", str(PKG), *args], capture_output=True, text=True)


class TestCLI(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def write(self, name, doc):
        (self.tmp / name).write_text(json.dumps(doc), encoding="utf-8")

    def vector_file(self, op, vectors):
        return {"format_version": 1, "protocol_version": "qv1", "suite": "t", "operation": op,
                "origin": "quietvote", "status": "draft", "encoding": {}, "vectors": vectors}

    def test_exit_codes(self):
        ok = {"id": "abc", "input": {"msg_hex": "616263"}, "expect": {"ok": True, "output": {
            "digest_hex": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}}}
        self.write("a.json", self.vector_file("hash.sha256", [ok]))
        self.write("b.json", self.vector_file("token.blind", [{"id": "x", "input": {}, "expect": {"ok": True, "output": {}}}]))
        r = cli("vectors", str(self.tmp))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PASS", r.stdout)
        self.assertIn("NOT-IMPLEMENTED", r.stdout)
        bad = copy.deepcopy(ok)
        bad["expect"]["output"]["digest_hex"] = "00" * 32
        self.write("c.json", self.vector_file("hash.sha256", [bad]))
        r = cli("vectors", str(self.tmp))
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL", r.stdout)
        # a wrong rejection code is a FAIL too
        neg = {"id": "n", "input": {"scalar_hex": "ff" * 32}, "expect": {"ok": False, "error": "E_LENGTH"}}
        (self.tmp / "c.json").unlink()
        self.write("d.json", self.vector_file("scalar.decode", [neg]))
        self.assertEqual(cli("vectors", str(self.tmp)).returncode, 1)

    def test_missing_dir(self):
        self.assertEqual(cli("vectors", str(self.tmp / "nope")).returncode, 2)


@unittest.skipUnless(TREE.is_dir(), "test-vectors/v1 not present")
class TestRepositoryVectors(unittest.TestCase):
    def test_every_implemented_op_vector_passes(self):
        failures = []
        for path in sorted(TREE.rglob("*.json")):
            doc = json.loads(path.read_text(encoding="utf-8"))
            if not (isinstance(doc, dict) and isinstance(doc.get("vectors"), list)):
                continue
            if doc.get("operation") not in OPS:
                continue
            for v in doc["vectors"]:
                got = run_op(doc["operation"], v["input"])
                exp = v["expect"]
                if exp["ok"] != got["ok"] or (exp["ok"] and got["output"] != exp["output"]) or (
                        not exp["ok"] and got["error"] != exp["error"]):
                    failures.append(f"{path.name}:{v['id']}")
        self.assertEqual(failures, [])

    def test_tiny_election_and_a_local_mutant(self):
        bundle = json.loads((TREE / "elections" / "tiny-yesno-3v" / "bundle.json").read_text())
        rep = verify_bundle(bundle)
        self.assertEqual(rep["verdict"], "PASS", rep["findings"])
        mut = copy.deepcopy(bundle)
        tally = next(e for e in mut["log"] if e["entry"].get("body", {}).get("type") == "tally")
        tally["entry"]["body"]["contests"][0]["options"][1]["T"] += 1
        rep = verify_bundle(mut)
        self.assertEqual(rep["verdict"], "FAIL")
        self.assertEqual(rep["checks"]["chk.tally.decrypt"], "fail")
        self.assertIn("E_DLOG_RANGE", rep["codes"])


if __name__ == "__main__":
    unittest.main()
