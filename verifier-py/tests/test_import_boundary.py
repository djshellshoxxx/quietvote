# SPDX-License-Identifier: AGPL-3.0-or-later
# @verifies QV-35-REQ-001 QV-35-REQ-009
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import check_imports

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
TOOL = ROOT / "check_imports.py"


class ImportBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="qv-python-imports-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "qv_verifier").mkdir()
        (self.root / "requirements.txt").write_text("# Standard library only.\n", encoding="utf-8")
        self.write("__init__.py", "VALUE = 1\n")

    def write(self, name, source):
        path = self.root / "qv_verifier" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")
        return path

    def result(self):
        return check_imports.check_tree(self.root)

    def assertCode(self, result, code):
        self.assertFalse(result["ok"])
        self.assertIn(code, {item["code"] for item in result["findings"]}, result)

    def run_tool(self, *args):
        return subprocess.run([sys.executable, "-I", str(TOOL), *args], cwd=self.root,
                              capture_output=True, text=True, timeout=10)

    def test_real_runtime_and_declared_empty_dependencies_pass_without_an_independence_claim(self):
        result = check_imports.check_tree(ROOT)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["runtime_files"], len(list((ROOT / "qv_verifier").rglob("*.py"))))
        self.assertEqual(result["runtime_files"], 26)
        self.assertEqual(result["findings"], [])
        self.assertIn("authorship and semantic independence are not assessed", result["scope"])

    def test_multiline_alias_and_internal_exports_preserve_ordinary_stdlib_functionality(self):
        self.write("helper.py", "VALUE = 7\n")
        self.write("json.py", "LOCAL = 1\n")  # Qualified local modules do not shadow stdlib roots.
        self.write("consumer.py", '''
import ctypes, subprocess, sys, math, os
import importlib.resources
from math import *
from .helper import (
    VALUE as value,
)
from qv_verifier import VALUE
from . import json as local_json
paths = sys.path
constant = subprocess.PIPE
number = ctypes.c_uint8(1)
flag = getattr(os, "O_NOFOLLOW", 0)
function = getattr(math, "sqrt")
''')
        self.assertTrue(self.result()["ok"], self.result())

    def test_reference_and_third_party_imports_are_found_even_in_nested_or_dead_code(self):
        cases = ["import packages.protocol as reference\n", "from packages import verifier\n",
                 "import requests\n", "from quickjs import Context\n", "if False:\n    import js2py\n",
                 "def operation():\n    from cryptography.hazmat import primitives\n"]
        for source in cases:
            with self.subTest(source=source):
                self.write("candidate.py", source)
                self.assertCode(self.result(), "EXTERNAL_IMPORT")

    def test_missing_local_modules_exports_and_relative_escape_are_distinguished(self):
        for source, code in [("import qv_verifier.missing\n", "LOCAL_MODULE_MISSING"),
                             ("from .missing import check\n", "LOCAL_MODULE_MISSING"),
                             ("from . import missing\n", "LOCAL_IMPORT_MISSING"),
                             ("from ..packages import verifier\n", "RELATIVE_IMPORT_ESCAPE")]:
            with self.subTest(source=source):
                self.write("candidate.py", source)
                self.assertCode(self.result(), code)

    def test_import_like_comments_and_string_literals_are_not_imports(self):
        self.write("candidate.py", '''
"""Mirrors packages/protocol/src/verify.ts; this comment cannot prove authorship."""
# import requests
example = "from packages import verifier"
''')
        self.assertTrue(self.result()["ok"], self.result())

    def test_known_execution_and_loader_references_are_found_through_import_aliases(self):
        cases = ["import subprocess as process\nprocess.run(['node', 'example.js'])\n",
                 "from subprocess import run as launch\nlaunch(['node'])\n",
                 "import os as operating\noperating.system('node example.js')\n",
                 "from os import *\nsystem('node example.js')\n",
                 "import os\nplatform = os\nplatform.popen('node example.js')\n",
                 "import os\ngetattr(os, 'system')('node example.js')\n",
                 "import ctypes\nctypes.CDLL('example.so')\n",
                 "from importlib import import_module as load\nload('packages')\n",
                 "import importlib.util as loader\nloader.spec_from_file_location('x', 'example.py')\n",
                 "import runpy\nrunpy.run_path('example.py')\n",
                 "import builtins\nbuiltins.exec('pass')\n"]
        for source in cases:
            with self.subTest(source=source):
                self.write("candidate.py", source)
                self.assertCode(self.result(), "EXECUTION_BRIDGE_REFERENCE")

    def test_builtin_dynamic_execution_cannot_be_hidden_by_assigning_its_reference(self):
        for name in ["__import__", "eval", "exec", "compile"]:
            with self.subTest(name=name):
                self.write("candidate.py", f"loader = {name}\n")
                self.assertCode(self.result(), "DYNAMIC_CODE_REFERENCE")

    def test_only_the_existing_guarded_launcher_path_repair_is_recognized(self):
        self.write("cli.py", "def main():\n    return 0\n")
        original = (ROOT / "qv_verifier/__main__.py").read_text(encoding="utf-8")
        self.write("__main__.py", original)
        self.assertTrue(self.result()["ok"], self.result())
        self.write("__main__.py", original.replace("str(_pkg_dir.parent)", "str(_pkg_dir.parent.parent)"))
        self.assertCode(self.result(), "IMPORT_STATE_MUTATION")
        self.write("__main__.py", original)
        self.write("candidate.py", "import sys as runtime\nruntime.path.insert(0, '../packages')\n")
        self.assertCode(self.result(), "IMPORT_STATE_MUTATION")

    def test_other_import_state_mutations_are_rejected_but_reads_are_allowed(self):
        for source in ["import sys\nsys.meta_path.append(object())\n", "import sys\nsys.modules['injected'] = object()\n",
                       "from sys import path as paths\npaths[:] = ['../packages']\n"]:
            with self.subTest(source=source):
                self.write("candidate.py", source)
                self.assertCode(self.result(), "IMPORT_STATE_MUTATION")
        self.write("candidate.py", "import sys\nexisting = sys.modules.get('json')\npaths = list(sys.path)\n")
        self.assertTrue(self.result()["ok"], self.result())

    def test_requirements_entries_flags_and_missing_file_cannot_be_ignored(self):
        requirements = self.root / "requirements.txt"
        for text in ["requests==1.0\n", "-r other.txt\n", "--extra-index-url https://example.invalid\n"]:
            with self.subTest(text=text):
                requirements.write_text(text, encoding="utf-8")
                self.assertCode(self.result(), "RUNTIME_DEPENDENCY_DECLARED")
        requirements.write_text("\n # no dependencies\n", encoding="utf-8")
        self.assertTrue(self.result()["ok"])
        requirements.unlink()
        self.assertCode(self.result(), "SOURCE_UNAVAILABLE")

    def test_source_symlinks_and_native_runtime_artifacts_are_not_silently_skipped(self):
        target = self.root / "external.py"
        target.write_text("import requests\n", encoding="utf-8")
        link = self.root / "qv_verifier/linked.py"
        os.symlink(target, link)
        self.assertCode(self.result(), "SOURCE_SYMLINK")
        link.unlink()
        os.symlink(self.root, self.root / "qv_verifier/linked-dir", target_is_directory=True)
        self.assertCode(self.result(), "SOURCE_SYMLINK")
        (self.root / "qv_verifier/linked-dir").unlink()
        (self.root / "qv_verifier/module.pyd").write_bytes(b"test-only")
        self.assertCode(self.result(), "NATIVE_RUNTIME_ARTIFACT")

    def test_parent_stdlib_shadowing_is_visible(self):
        for name in ["json.py", "os.py", "hashlib.py"]:
            with self.subTest(name=name):
                shadow = self.root / name
                shadow.write_text("VALUE = 1\n", encoding="utf-8")
                self.assertCode(self.result(), "STDLIB_SHADOW")
                shadow.unlink()

    def test_invalid_oversized_nonregular_or_missing_source_does_not_pass(self):
        candidate = self.write("candidate.py", "def incomplete(:\n")
        self.assertCode(self.result(), "SOURCE_SYNTAX")
        with candidate.open("wb") as source:
            source.truncate(check_imports.MAX_FILE_BYTES + 1)
        self.assertCode(self.result(), "SOURCE_LIMIT")
        candidate.unlink(); candidate.mkdir()
        self.assertCode(self.result(), "SOURCE_NOT_REGULAR")
        candidate.rmdir(); (self.root / "qv_verifier/__init__.py").unlink()
        self.assertCode(self.result(), "LOCAL_MODULE_MISSING")

    def test_file_entry_and_output_limits_are_bounded(self):
        self.write("first.py", "VALUE = 1\n")
        self.write("second.py", "VALUE = 2\n")
        with patch.object(check_imports, "MAX_FILES", 2):
            result = self.result()
            self.assertCode(result, "SOURCE_LIMIT"); self.assertLessEqual(result["runtime_files"], 2)
        with patch.object(check_imports, "MAX_ENTRIES", 2):
            self.assertCode(self.result(), "SOURCE_LIMIT")
        with patch.object(check_imports, "MAX_TOTAL_BYTES", 12):
            result = self.result()
            self.assertCode(result, "SOURCE_LIMIT"); self.assertLessEqual(result["source_bytes"], 12)
        self.write("candidate.py", "import requests\n" * 110)
        result = self.result()
        self.assertFalse(result["ok"]); self.assertTrue(result["findings_truncated"])
        self.assertEqual(len(result["findings"]), 100)

    def test_static_scan_never_executes_the_scanned_module(self):
        sentinel = self.root / "executed.txt"
        self.write("candidate.py", f"from pathlib import Path\nPath({str(sentinel)!r}).write_text('executed')\n")
        result = self.run_tool("--root", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["ok"])
        self.assertFalse(sentinel.exists())

    def test_actual_cli_reports_deterministic_success_failure_and_usage_outcomes(self):
        first = self.run_tool("--root", str(self.root)); second = self.run_tool("--root", str(self.root))
        self.assertEqual(first.returncode, 0, first.stderr); self.assertEqual(first.stdout, second.stdout)
        self.assertNotIn(str(self.root), first.stdout)
        self.write("candidate.py", "import packages.verifier\n")
        failed = self.run_tool("--root", str(self.root))
        self.assertEqual(failed.returncode, 1); self.assertCode(json.loads(failed.stdout), "EXTERNAL_IMPORT")
        self.assertEqual(self.run_tool("--unknown").returncode, 2)
        self.assertEqual(self.run_tool("--help").returncode, 0)

    def test_ci_runs_the_static_boundary_before_verifier_execution(self):
        workflow = (REPO / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        scan = workflow.index("run: python3 -I verifier-py/check_imports.py")
        unit = workflow.index("run: python3 -I -m unittest")
        self.assertLess(scan, unit)
        self.assertNotIn("continue-on-error", workflow[workflow.rfind("- name:", 0, scan):unit])


if __name__ == "__main__":
    unittest.main()
