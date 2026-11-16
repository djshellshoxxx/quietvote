"""Command-line interface."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import IMPL_NAME, __version__
from .runner import main_vectors
from .election import verify_bundle
from .errors import NotImplementedOp, QVError
from .logio import load_json


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
    verify = sub.add_parser('verify', help='verify an election JSON bundle with optional QV-18 evidence')
    verify.add_argument('bundle')
    verify.add_argument('--board', help='board JSON export (qv-bundle/v1)')
    verify.add_argument('--receipts', help='JSON array of receipt samples')
    verify.add_argument('--observed', help='JSON array of previously observed checkpoint notes')
    verify.add_argument('--witnesses', help='JSON array of trusted {name,pk} keys when absent from manifest')
    verify.add_argument('--extra-author-key', action='append', default=[], help='additional Ed25519 author key hex')
    args = ap.parse_args(argv)
    if args.cmd == "vectors":
        return main_vectors(args.dir, quiet=args.quiet, report_path=args.report)
    if args.cmd == 'verify':
        if not args.board and (args.receipts or args.observed or args.witnesses or args.extra_author_key):
            ap.error('log evidence options require --board')
        try:
            bundle = load_json(Path(args.bundle))
            if not isinstance(bundle, dict):
                raise QVError('E_SCHEMA', 'election bundle must be an object')
            log = None
            if args.board:
                log = {'board': load_json(Path(args.board))}
                for field in ('receipts', 'observed', 'witnesses'):
                    if getattr(args, field):
                        log[field] = load_json(Path(getattr(args, field)))
                if args.extra_author_key:
                    log['extraAuthorKeys'] = args.extra_author_key
            report = verify_bundle(bundle, log=log)
        except NotImplementedOp as exc:
            print(json.dumps({'status': 'NOT-IMPLEMENTED', 'detail': str(exc)}))
            return 3
        except (OSError, QVError, KeyError, TypeError, ValueError, RecursionError) as exc:
            print(json.dumps({'status': 'ERROR', 'error': getattr(exc, 'code', 'E_PARSE'), 'detail': str(exc)}), file=sys.stderr)
            return 2
        print(json.dumps(report, indent=2))
        return {'PASS': 0, 'FAIL': 1, 'INCOMPLETE': 3}[report['verdict']]
    return 2
