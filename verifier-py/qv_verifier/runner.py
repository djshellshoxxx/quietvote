"""Vector runner: iterate a QV-34 vector tree and report PASS / FAIL / NOT-IMPLEMENTED.

Comparison semantics (QV-34 §10.3), applied strictly:
  * positive vectors: ``ok`` true and the output object equal to ``expect.output`` (exact map);
  * negative vectors: ``ok`` false and the error code equal to ``expect.error``. A different
    rejection code is reported as FAIL (QV-34 would allow a warning-level mismatch unless the
    vector is tagged strict_error; this runner does not relax that).
Election bundles and the canary are compared with the expected-report.json beside them;
mutants with their ``expect`` block (see _run_mutation).
"""

from __future__ import annotations

import hashlib
import json
import sys
import traceback
from dataclasses import dataclass, field
from pathlib import Path

from . import IMPL_NAME, __version__
from .election import verify_bundle
from .ops import OPS, run_op

PASS, FAIL, NI = "PASS", "FAIL", "NOT-IMPLEMENTED"


@dataclass
class Result:
    status: str
    file: str
    vid: str
    op: str
    note: str = ""


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)
    info: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def count(self, status: str) -> int:
        return sum(1 for r in self.results if r.status == status)


def _compare(expect: dict, actual: dict) -> tuple[bool, str]:
    if expect.get("ok") is True:
        if not actual["ok"]:
            return False, f"expected ok, got error {actual['error']} ({actual.get('detail', '')})"
        if actual["output"] != expect.get("output"):
            exp_keys = set(expect.get("output", {}))
            diff = sorted(k for k in exp_keys | set(actual["output"])
                          if actual["output"].get(k) != expect.get("output", {}).get(k))
            return False, f"output mismatch in {diff}"
        return True, ""
    if expect.get("ok") is False:
        if actual["ok"]:
            return False, f"expected rejection {expect.get('error')}, but accepted"
        if actual["error"] != expect.get("error"):
            return False, f"rejected with {actual['error']} instead of {expect.get('error')} ({actual.get('detail', '')})"
        return True, ""
    return False, "vector has no ok/expect"


def _run_vector_file(path: Path, rel: str, rep: Report) -> None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    op = doc.get("operation", "?")
    if doc.get("format_version") != 1 or doc.get("protocol_version") != "qv1":
        for v in doc["vectors"]:
            rep.results.append(Result(NI, rel, v.get("id", "?"), op, "unsupported format/protocol version"))
        return
    for v in doc["vectors"]:
        vid = v.get("id", "?")
        if op not in OPS:
            rep.results.append(Result(NI, rel, vid, op, "operation not implemented"))
            continue
        try:
            actual = run_op(op, v["input"])
        except Exception as exc:  # an unexpected crash is an implementation failure
            tb = traceback.format_exception_only(type(exc), exc)[-1].strip()
            rep.results.append(Result(FAIL, rel, vid, op, f"exception: {tb}"))
            continue
        ok, note = _compare(v["expect"], actual)
        rep.results.append(Result(PASS if ok else FAIL, rel, vid, op, note))


def _is_election_vector(path: Path) -> bool:
    """QV-34 §5: `<dir>/bundle.json` + `<dir>/expected-report.json`; for the canary directory the
    single bundle file (`canary-election.json`). Other bundles (e.g. `adv-bundle.json`) are
    inputs referenced by vector sets."""
    if not (path.parent / "expected-report.json").is_file():
        return False
    if path.name == "bundle.json":
        return True
    return not (path.parent / "bundle.json").exists() and path.name.startswith("canary")


def _run_election(path: Path, rel: str, bundle: dict) -> Result:
    """Election bundle vs the expected-report.json next to it (verdict, check map, counts,
    ctx prefix and, when present, results are compared exactly)."""
    exp_path = path.parent / "expected-report.json"
    vid = path.parent.name
    if not exp_path.is_file():
        return Result(NI, rel, vid, "verify.election", "no expected-report.json next to bundle")
    expected = json.loads(exp_path.read_text(encoding="utf-8"))
    try:
        got = verify_bundle(bundle)
    except Exception as exc:
        return Result(FAIL, rel, vid, "verify.election", f"exception: {exc!r}")
    diffs = [k for k in ("verdict", "checks", "counts", "ctx_prefix", "results")
             if k in expected and got.get(k) != expected[k]]
    if not diffs:
        return Result(PASS, rel, vid, "verify.election")
    detail = []
    for k in diffs:
        if k == "checks":
            detail += [f"{c}: expected {expected['checks'][c]}, got {got['checks'].get(c)}"
                       for c in expected["checks"] if expected["checks"][c] != got["checks"].get(c)]
        else:
            detail.append(f"{k}: expected {expected[k]!r}, got {got.get(k)!r}")
    return Result(FAIL, rel, vid, "verify.election", "; ".join(detail) + f" | codes={got['codes']}")


def _run_mutation(rel: str, doc: dict) -> Result:
    """Mutant vs its ``expect``: verdict and the set of failing checks are compared exactly;
    every expected error code must be among the emitted codes (QV-ERR-PY-005)."""
    vid = str(doc.get("id", rel))
    exp = doc["expect"]
    try:
        got = verify_bundle(doc["bundle"])
    except Exception as exc:
        return Result(FAIL, rel, vid, "verify.mutation", f"exception: {exc!r}")
    failed = sorted(c for c, s in got["checks"].items() if s == "fail")
    problems = []
    if got["verdict"] != exp.get("verdict"):
        problems.append(f"verdict expected {exp.get('verdict')}, got {got['verdict']}")
    if failed != sorted(exp.get("failed_checks", [])):
        problems.append(f"failed checks expected {sorted(exp.get('failed_checks', []))}, got {failed}")
    missing = sorted(set(exp.get("codes", [])) - set(got["codes"]))
    if missing:
        problems.append(f"codes {missing} not emitted (emitted {got['codes']})")
    if problems:
        return Result(FAIL, rel, vid, "verify.mutation", "; ".join(problems))
    return Result(PASS, rel, vid, "verify.mutation")


def _check_manifest(root: Path, rep: Report) -> None:
    """Informational: compare files under `root` with the tree's MANIFEST.json hashes."""
    for cand in (root / "MANIFEST.json", root.parent / "MANIFEST.json"):
        if cand.is_file():
            base = cand.parent
            try:
                man = json.loads(cand.read_text(encoding="utf-8"))
            except ValueError:
                rep.info.append(f"MANIFEST {cand}: unparsable")
                return
            ok = bad = missing = 0
            for f in man.get("files", []):
                p = base / f["path"]
                try:
                    p.relative_to(root)
                except ValueError:
                    continue
                if not p.is_file():
                    missing += 1
                elif hashlib.sha256(p.read_bytes()).hexdigest() == f["sha256"]:
                    ok += 1
                else:
                    bad += 1
            rep.info.append(
                f"MANIFEST {cand}: {ok} file hashes match, {bad} mismatch, {missing} missing "
                f"(signature: {man.get('signature', 'n/a')!r}; Merkle root not recomputed)"
            )
            return


def run_tree(root: Path) -> Report:
    rep = Report()
    _check_manifest(root, rep)
    for path in sorted(root.rglob("*.json")):
        rel = path.relative_to(root).as_posix()
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as exc:
            rep.results.append(Result(FAIL, rel, "-", "-", f"unparsable vector file: {exc}"))
            continue
        if isinstance(doc, dict) and isinstance(doc.get("vectors"), list):
            _run_vector_file(path, rel, rep)
        elif isinstance(doc, dict) and {"manifest", "log", "roll"} <= set(doc):
            if _is_election_vector(path):
                rep.results.append(_run_election(path, rel, doc))
            else:  # an input referenced by a vector set (e.g. {"path": ...}), not a vector
                rep.skipped.append(rel)
        elif isinstance(doc, dict) and {"base", "bundle", "expect"} <= set(doc):
            rep.results.append(_run_mutation(rel, doc))
        elif path.name == "expected-report.json":
            continue  # companion of a bundle; counted with the bundle
        else:
            rep.skipped.append(rel)
    if rep.skipped:
        rep.info.append(f"{len(rep.skipped)} non-vector input files skipped (bundles without an "
                        "expected-report.json, board files, other referenced inputs)")
    return rep


def main_vectors(root: str, quiet: bool = False, report_path: str | None = None) -> int:
    rootp = Path(root)
    if not rootp.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2
    rep = run_tree(rootp)
    print(f"{IMPL_NAME} {__version__} -- vector tree {rootp}")
    for line in rep.info:
        print(f"INFO  {line}")
    if not quiet:
        for rel in rep.skipped:
            print(f"INFO  skipped input {rel}")
    for r in rep.results:
        if quiet and r.status == PASS:
            continue
        note = f"  -- {r.note}" if r.note else ""
        print(f"{r.status:<15} {r.file} :: {r.vid} [{r.op}]{note}")
    total = len(rep.results)
    print(
        f"\nSUMMARY total={total} pass={rep.count(PASS)} fail={rep.count(FAIL)} "
        f"not_implemented={rep.count(NI)}"
    )
    if report_path:
        out = {
            "report_version": 1,
            "impl": {"name": IMPL_NAME, "version": __version__,
                     "language": f"python{sys.version_info.major}.{sys.version_info.minor}"},
            "vector_tree": {"protocol_version": "qv1", "path": str(rootp)},
            "profile_claimed": "none (skeleton)",
            "results": {"total": total, "passed": rep.count(PASS), "failed": rep.count(FAIL),
                        "not_implemented": rep.count(NI)},
            "vectors": [r.__dict__ for r in rep.results],
        }
        Path(report_path).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    return 1 if rep.count(FAIL) else 0
