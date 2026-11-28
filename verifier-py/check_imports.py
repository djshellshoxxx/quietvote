#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# @verifies QV-35-REQ-001 QV-35-REQ-009
"""Static import/dependency/obvious-bridge checks; never executes verifier code.

Authorship, translated logic, arbitrary reflection, semantic independence and
the QV-35-REQ-014 human review remain outside this bounded syntax check.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
from pathlib import Path
import stat
import sys

MAX_FILES = 128
MAX_ENTRIES = 1024
MAX_FILE_BYTES = 1024 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024
MAX_FINDINGS = 100
DYNAMIC_NAMES = frozenset({"__import__", "eval", "exec", "compile"})
IMPORT_STATE = ("sys.path", "sys.meta_path", "sys.path_hooks", "sys.path_importer_cache", "sys.modules")
MUTATORS = frozenset({"append", "extend", "insert", "clear", "pop", "popitem", "remove", "reverse", "sort", "update", "setdefault", "__setitem__", "__delitem__"})
BOOTSTRAP = ast.parse('''
if not __package__:
    from pathlib import Path
    _pkg_dir = Path(__file__).resolve().parent
    sys.path[:] = [p for p in sys.path if Path(p or ".").resolve() != _pkg_dir]
    sys.path.insert(0, str(_pkg_dir.parent))
    from qv_verifier.cli import main
else:
    from .cli import main
''').body[0]


class InputRefusal(Exception):
    """A fixed diagnostic code, without source contents or exception details."""


def read_regular(path: Path, limit: int) -> bytes:
    try:
        before = path.lstat()
        if stat.S_ISLNK(before.st_mode):
            raise InputRefusal("SOURCE_SYMLINK")
        if not stat.S_ISREG(before.st_mode):
            raise InputRefusal("SOURCE_NOT_REGULAR")
        if before.st_size > limit:
            raise InputRefusal("SOURCE_LIMIT")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(fd, "rb") as source:
            opened = os.fstat(source.fileno())
            if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
                raise InputRefusal("SOURCE_CHANGED")
            data = source.read(limit + 1)
            after = os.fstat(source.fileno())
        if len(data) > limit:
            raise InputRefusal("SOURCE_LIMIT")
        if len(data) != before.st_size or (after.st_size, after.st_mtime_ns) != (before.st_size, before.st_mtime_ns):
            raise InputRefusal("SOURCE_CHANGED")
        return data
    except OSError as error:
        raise InputRefusal("SOURCE_UNAVAILABLE") from error


def exported_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                names.update(child.id for child in ast.walk(target) if isinstance(child, ast.Name))
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update(alias.asname or alias.name.split(".")[0] for alias in node.names)
    return names


def qualified(node: ast.AST, aliases: dict[str, str]) -> str | None:
    if isinstance(node, ast.Name):
        return aliases.get(node.id, node.id)
    if isinstance(node, ast.Attribute):
        base = qualified(node.value, aliases)
        return None if base is None else base + "." + node.attr
    return None


def execution_bridge(name: str | None) -> bool:
    if name is None:
        return False
    if name.startswith("os."):
        member = name[3:].split(".")[0]
        return member in {"system", "popen", "startfile", "posix_spawn", "posix_spawnp"} or member.startswith(("exec", "spawn"))
    return name in {
        "subprocess.run", "subprocess.Popen", "subprocess.call", "subprocess.check_call", "subprocess.check_output",
        "subprocess.getoutput", "subprocess.getstatusoutput", "ctypes.CDLL", "ctypes.PyDLL", "ctypes.WinDLL", "ctypes.OleDLL",
        "ctypes.LibraryLoader", "ctypes.cdll.LoadLibrary", "ctypes.pydll.LoadLibrary", "ctypes.windll.LoadLibrary", "ctypes.oledll.LoadLibrary",
        "importlib.import_module", "importlib.__import__", "importlib.util.spec_from_file_location", "importlib.util.module_from_spec",
        "importlib.machinery.SourceFileLoader", "importlib.machinery.SourcelessFileLoader", "importlib.machinery.ExtensionFileLoader",
        "runpy.run_module", "runpy.run_path", "imp.load_module", "imp.load_source", "imp.load_compiled", "pkgutil.get_loader",
        "builtins.__import__", "builtins.eval", "builtins.exec", "builtins.compile", "types.FunctionType", "types.CodeType",
    }


def check_tree(root: Path) -> dict:
    root = Path(root)
    findings: list[dict] = []
    truncated = False

    def add(path: str, code: str, line: int = 0, module: str | None = None) -> None:
        nonlocal truncated
        item = {"path": path, "line": line, "code": code}
        if module is not None:
            item["module"] = module[:160]
        if item in findings:
            return
        if len(findings) == MAX_FINDINGS:
            truncated = True
        else:
            findings.append(item)

    try:
        requirements = read_regular(root / "requirements.txt", 64 * 1024).decode("utf-8")
        for number, line in enumerate(requirements.splitlines(), 1):
            if line.strip() and not line.lstrip().startswith("#"):
                add("requirements.txt", "RUNTIME_DEPENDENCY_DECLARED", number)
    except (InputRefusal, UnicodeError) as error:
        add("requirements.txt", str(error) if isinstance(error, InputRefusal) else "SOURCE_ENCODING")

    package = root / "qv_verifier"
    trees: dict[str, ast.Module] = {}
    module_paths: dict[str, str] = {}
    stdlib = set(sys.stdlib_module_names)
    absolute_roots: set[str] = set()
    entries = 0
    total_bytes = 0
    try:
        if package.is_symlink():
            raise InputRefusal("SOURCE_SYMLINK")
        if not package.is_dir():
            raise InputRefusal("SOURCE_UNAVAILABLE")
        # The launcher adds verifier-py/, so a sibling can shadow absolute stdlib imports.
        for child in root.iterdir():
            entries += 1
            if entries > MAX_ENTRIES:
                raise InputRefusal("SOURCE_LIMIT")
            if (child.stem if child.suffix == ".py" else child.name) in stdlib:
                add(child.name, "STDLIB_SHADOW")
        pending = [package]
        while pending:
            directory = pending.pop()
            children = []
            with os.scandir(directory) as listing:
                for child in listing:
                    entries += 1
                    if entries > MAX_ENTRIES:
                        raise InputRefusal("SOURCE_LIMIT")
                    children.append(child)
            for child in sorted(children, key=lambda item: item.name):
                path = Path(child.path)
                relative = path.relative_to(root).as_posix()
                if child.is_symlink():
                    add(relative, "SOURCE_SYMLINK")
                elif child.is_dir(follow_symlinks=False):
                    if path.suffix == ".py":
                        add(relative, "SOURCE_NOT_REGULAR")
                        continue
                    if child.name == "__pycache__":
                        continue
                    if len(path.relative_to(package).parts) > 16:
                        add(relative, "SOURCE_LIMIT")
                    else:
                        pending.append(path)
                elif path.suffix == ".py":
                    if len(trees) >= MAX_FILES or total_bytes >= MAX_TOTAL_BYTES:
                        raise InputRefusal("SOURCE_LIMIT")
                    parts = path.relative_to(root).with_suffix("").parts
                    parts = parts[:-1] if parts[-1] == "__init__" else parts
                    if any(not part.isidentifier() for part in parts):
                        add(relative, "MODULE_NAME")
                        continue
                    module = ".".join(parts)
                    if module in trees:
                        add(relative, "MODULE_COLLISION")
                        continue
                    try:
                        data = read_regular(path, min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - total_bytes))
                        total_bytes += len(data)
                        trees[module] = ast.parse(data, filename=relative)
                        module_paths[module] = relative
                    except InputRefusal as error:
                        add(relative, str(error))
                    except (SyntaxError, ValueError, RecursionError):
                        add(relative, "SOURCE_SYNTAX")
                elif path.suffix in {".so", ".pyd", ".dll"}:
                    add(relative, "NATIVE_RUNTIME_ARTIFACT")
    except InputRefusal as error:
        add("qv_verifier", str(error))
    except OSError:
        add("qv_verifier", "SOURCE_UNAVAILABLE")
    if "qv_verifier" not in trees:
        add("qv_verifier/__init__.py", "LOCAL_MODULE_MISSING")

    exports = {module: exported_names(tree) for module, tree in trees.items()}
    for module, tree in sorted(trees.items()):
        path = module_paths[module]
        package_parts = module.split(".") if path.endswith("/__init__.py") else module.split(".")[:-1]
        aliases: dict[str, str] = {}
        imported_modules: set[str] = set()
        wildcard_roots: set[str] = set()
        allowed_path_nodes: set[int] = set()
        bootstrap = [node for node in tree.body if ast.dump(node) == ast.dump(BOOTSTRAP)] if module == "qv_verifier.__main__" else []
        if len(bootstrap) == 1:
            allowed_path_nodes = {id(node) for node in ast.walk(bootstrap[0])}

        for node in ast.walk(tree):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            if isinstance(node, ast.Import):
                targets = [(alias.name, None) for alias in node.names]
                for alias in node.names:
                    aliases[alias.asname or alias.name.split(".")[0]] = alias.name if alias.asname else alias.name.split(".")[0]
                    imported_modules.add(alias.name)
            else:
                if node.level > len(package_parts):
                    add(path, "RELATIVE_IMPORT_ESCAPE", node.lineno)
                    continue
                prefix = package_parts[:len(package_parts) - node.level + 1] if node.level else []
                target = ".".join(prefix + ([node.module] if node.module else []))
                targets = [(target, alias.name) for alias in node.names]
                for alias in node.names:
                    aliases[alias.asname or alias.name] = target + "." + alias.name
                    if alias.name == "*":
                        wildcard_roots.add(target)
            for target, name in targets:
                head = target.split(".")[0]
                if head == "qv_verifier":
                    if target not in trees:
                        add(path, "LOCAL_MODULE_MISSING", node.lineno, target)
                    elif name not in {None, "*"} and name not in exports[target] and target + "." + name not in trees:
                        add(path, "LOCAL_IMPORT_MISSING", node.lineno, target + "." + name)
                elif head not in stdlib:
                    add(path, "EXTERNAL_IMPORT", node.lineno, target)
                if name is not None and execution_bridge(target + "." + name):
                    add(path, "EXECUTION_BRIDGE_REFERENCE", node.lineno, target + "." + name)
                absolute_roots.add(head)

        # Over-approximate simple aliases; this is deliberately not a data-flow proof.
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and isinstance(node.value, (ast.Name, ast.Attribute)):
                target = qualified(node.value, aliases)
                if target and target.split(".")[0] in stdlib:
                    for assigned in node.targets:
                        if isinstance(assigned, ast.Name):
                            aliases[assigned.id] = target
        for node in ast.walk(tree):
            name = qualified(node, aliases)
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in DYNAMIC_NAMES:
                add(path, "DYNAMIC_CODE_REFERENCE", node.lineno, node.id)
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                for origin in wildcard_roots:
                    if execution_bridge(origin + "." + node.id):
                        add(path, "EXECUTION_BRIDGE_REFERENCE", node.lineno, origin + "." + node.id)
            if execution_bridge(name):
                add(path, "EXECUTION_BRIDGE_REFERENCE", getattr(node, "lineno", 0), name)
            target = qualified(node.value, aliases) if isinstance(node, ast.Subscript) else name
            if isinstance(node, (ast.Attribute, ast.Subscript)) and isinstance(node.ctx, (ast.Store, ast.Del)) and target in IMPORT_STATE and id(node) not in allowed_path_nodes:
                add(path, "IMPORT_STATE_MUTATION", node.lineno, target)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                base = qualified(node.func.value, aliases)
                if base in IMPORT_STATE and node.func.attr in MUTATORS and id(node) not in allowed_path_nodes:
                    add(path, "IMPORT_STATE_MUTATION", node.lineno, base)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "getattr" and len(node.args) >= 2:
                base = qualified(node.args[0], aliases)
                field = node.args[1]
                if base in imported_modules and isinstance(field, ast.Constant) and isinstance(field.value, str) and execution_bridge(base + "." + field.value):
                    add(path, "EXECUTION_BRIDGE_REFERENCE", node.lineno, base + "." + field.value)

    findings.sort(key=lambda item: (item["path"], item["line"], item["code"], item.get("module", "")))
    return {"format": "qv-python-import-boundary/v1", "ok": not findings and not truncated,
            "runtime_files": len(trees), "source_bytes": total_bytes, "absolute_import_roots": sorted(absolute_roots),
            "scope": "static import/dependency/obvious-bridge checks only; authorship and semantic independence are not assessed",
            "findings": findings, "findings_truncated": truncated}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    result = check_tree(args.root)
    print(json.dumps(result, sort_keys=True, ensure_ascii=True, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
