#!/usr/bin/env python3
"""Build a deterministic Zotero .xpi package from the allowlisted plugin sources."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]


def collect_plugin_files(source_dir: Path) -> list[Path]:
    files: list[Path] = []
    for name in ("manifest.json", "bootstrap.js"):
        path = source_dir / name
        if path.is_symlink():
            raise ValueError(f"symlink not allowed in plugin source: {name}")
        if not path.is_file():
            raise ValueError(f"missing required plugin file: {name}")
        files.append(path)
    for dirname in ("content", "locale"):
        root = source_dir / dirname
        if root.is_symlink():
            raise ValueError(f"symlink not allowed in plugin source: {dirname}")
        if not root.is_dir():
            continue
        for entry in root.rglob("*"):
            rel_parts = entry.relative_to(source_dir).parts
            if any(part.startswith(".") for part in rel_parts):
                continue
            if entry.is_symlink():
                raise ValueError(
                    f"symlink not allowed in plugin source: {entry.relative_to(source_dir).as_posix()}"
                )
            if entry.is_file():
                files.append(entry)
    return sorted(files)


def main() -> int:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / f"zotero-extra-meta-{version}.xpi"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    files = collect_plugin_files(ROOT)
    with ZipFile(out_path, "w") as package:
        for file_path in files:
            rel = file_path.relative_to(ROOT).as_posix()
            info = ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            package.writestr(info, file_path.read_bytes())

    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
