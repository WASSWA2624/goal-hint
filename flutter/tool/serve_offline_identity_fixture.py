"""Build the shared offline worker/UI with isolated synthetic member sessions."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys

REPOSITORY = Path(__file__).resolve().parents[2]
WEB_ROOT = REPOSITORY / "next-js"
sys.path.insert(0, str(WEB_ROOT / "scripts"))

from lib.rendering import Server, build_fixture, create_fixture, environment, run_node  # noqa: E402
from lib.runtime import main_guard  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3196)
    parser.add_argument("--reuse", type=Path)
    parser.add_argument("--build-only", action="store_true")
    options = parser.parse_args()
    if not 1 <= options.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if options.reuse:
        directory = options.reuse.resolve()
        marker = directory / ".offline-identity-fixture"
        if (not directory.is_relative_to((WEB_ROOT / ".tmp").resolve()) or not marker.is_file()
                or marker.read_text(encoding="utf-8").strip() != "1"
                or not (directory / ".next/BUILD_ID").is_file()):
            parser.error("reuse requires a built owned offline-identity fixture under next-js/.tmp")
    else:
        directory = create_fixture("offline-identity")
        relative = Path(os.path.relpath(WEB_ROOT, directory)).as_posix()
        (directory / "next.config.mjs").write_text(
            f'import base from "{relative}/next.config.ts";\n'
            'export default {...base, experimental: {cpus: 1}, turbopack: {root: '
            + json.dumps(str(WEB_ROOT)) + '}};\n', encoding="utf-8")
        shutil.copytree(WEB_ROOT / "tests/helpers/rendering/offline", directory, dirs_exist_ok=True)
        shutil.copytree(REPOSITORY / "flutter/integration_test/support/offline_identity_fixture", directory,
                        dirs_exist_ok=True)
        (directory / ".offline-identity-fixture").write_text("1\n", encoding="utf-8")
        (directory / "offline-identity-state.json").write_text(
            json.dumps({"schemaVersion": 1, "active": {"A": False, "B": False}, "writeAttempts": 0}) + "\n",
            encoding="utf-8")
        print(f"Building isolated offline identity fixture: {directory}", flush=True)
        build_fixture(directory, env=environment(GOAL_HINT_DATABASE_ENABLED="false"), timeout=300)
        shutil.copy2(WEB_ROOT / "public/offline-worker.js", directory / "public/offline-worker.js")
        run_node([str(WEB_ROOT / "scripts/build-offline-manifest.mjs"), str(directory)],
                 WEB_ROOT, directory / "offline-manifest.log")
    print(json.dumps({"fixture": str(directory)}), flush=True)
    if options.build_only:
        return
    server = Server(directory, env=environment(GOAL_HINT_DATABASE_ENABLED="false"), ready="/en")
    server.port, server.origin = options.port, f"http://127.0.0.1:{options.port}"
    with server:
        # Chromium recognizes *.localhost as loopback. Ports alone do not
        # isolate cookies from the normal app, so use a dedicated host name.
        # Startup readiness above still uses the bound 127.0.0.1 listener.
        server.origin = f"http://offline-identity.localhost:{options.port}"
        print(json.dumps({"ready": True, "origin": server.origin, "pid": server.child.pid}), flush=True)
        server.serve()


if __name__ == "__main__":
    main_guard(main, "Offline identity fixture failed; inspect its local build log.")
