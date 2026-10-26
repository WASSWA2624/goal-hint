"""Serve the real built offline UI/worker with an isolated anonymous projection."""
import argparse
import json
import os
from pathlib import Path
import shutil

from lib.rendering import ROOT, Server, build_fixture, create_fixture, run_node
from lib.runtime import main_guard


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3189)
    parser.add_argument("--reuse", type=Path)
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--rebuild", action="store_true")
    options = parser.parse_args()
    if options.reuse:
        directory = options.reuse.resolve()
        if not directory.is_relative_to((ROOT / ".tmp").resolve()) or not (directory / ".offline-fixture").is_file():
            parser.error("reuse must select an owned offline fixture under next-js/.tmp")
    else:
        directory = create_fixture("offline")
        relative = Path(os.path.relpath(ROOT, directory)).as_posix()
        (directory / "next.config.mjs").write_text(
            f'import base from "{relative}/next.config.ts";\n'
            'export default {...base, experimental: {cpus: 1}, turbopack: {root: '
            + json.dumps(str(ROOT)) + '}};\n', encoding="utf-8")
        (directory / ".offline-fixture").write_text("1\n", encoding="utf-8")
    if not options.reuse or options.rebuild:
        shutil.copytree(ROOT / "tests/helpers/rendering/offline", directory, dirs_exist_ok=True)
        print(f"Building offline fixture: {directory}", flush=True)
        build_fixture(directory, timeout=300)
        shutil.copy2(ROOT / "public/offline-worker.js", directory / "public/offline-worker.js")
        run_node([str(ROOT / "scripts/build-offline-manifest.mjs"), str(directory)],
                 ROOT, directory / "offline-manifest.log")
    print(json.dumps({"fixture": str(directory)}), flush=True)
    if options.build_only:
        return
    server = Server(directory, ready="/en")
    server.port, server.origin = options.port, f"http://127.0.0.1:{options.port}"
    with server:
        print(json.dumps({"ready": True, "origin": server.origin, "pid": server.child.pid}), flush=True)
        server.serve()


if __name__ == "__main__":
    main_guard(main, "Offline fixture failed; inspect its local build log.")
