"""Command-line interface."""

from __future__ import annotations

import argparse

from . import IMPL_NAME, __version__
from .runner import main_vectors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="qv_verifier",
        description=f"{IMPL_NAME} {__version__}: independent QuietVote verifier "
        "(SKELETON, unaudited, not for real elections)",
    )
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("vectors", help="run a QV-34 vector tree (e.g. test-vectors/v1)")
    v.add_argument("dir")
    v.add_argument("--quiet", action="store_true", help="print only non-PASS lines")
    v.add_argument("--report", metavar="FILE", help="also write a JSON report to FILE")
    args = ap.parse_args(argv)
    if args.cmd == "vectors":
        return main_vectors(args.dir, quiet=args.quiet, report_path=args.report)
    return 2
