"""CLI entry point.

    python -I -m qv_verifier vectors <dir> [--quiet] [--report FILE]
    python -I path/to/verifier-py/qv_verifier vectors <dir> ...   (no installation needed)

``python -I`` implies ``-P`` (safe_path) on Python 3.11+, so ``-m qv_verifier`` only finds the
package when it is importable from sys.path (e.g. installed). Running the package directory
directly works from anywhere; in that case this file fixes sys.path itself.
"""

import sys

if not __package__:
    # Executed as `python -I .../qv_verifier`: sys.path[0] is the package directory itself.
    # Replace it with its parent so the package imports by name and its module names can
    # never shadow standard-library modules.
    from pathlib import Path

    _pkg_dir = Path(__file__).resolve().parent
    sys.path[:] = [p for p in sys.path if Path(p or ".").resolve() != _pkg_dir]
    sys.path.insert(0, str(_pkg_dir.parent))
    from qv_verifier.cli import main
else:
    from .cli import main

if __name__ == "__main__":
    sys.exit(main())
