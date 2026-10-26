"""Serve the real shared branding/theme UI without accounts or private services."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys

REPOSITORY = Path(__file__).resolve().parents[2]
WEB_ROOT = REPOSITORY / "next-js"
sys.path.insert(0, str(WEB_ROOT / "scripts"))

from lib.rendering import Server, build_fixture, create_fixture, environment  # noqa: E402
from lib.runtime import main_guard  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3193)
    parser.add_argument("--reuse", type=Path)
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--build-only", action="store_true")
    options = parser.parse_args()
    if not 1 <= options.port <= 65535:
        parser.error("port must be between 1 and 65535")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if options.reuse:
        directory = options.reuse.resolve()
        marker = directory / ".identity-fixture-version"
        if (not directory.is_relative_to((WEB_ROOT / ".tmp").resolve())
                or (not options.rebuild and not (directory / ".next/BUILD_ID").is_file())
                or not marker.is_file() or marker.read_text(encoding="utf-8").strip() != "1"):
            parser.error("reuse needs an owned identity fixture inside next-js/.tmp and a build or --rebuild")
    else:
        directory = create_fixture("identity")
    if not options.reuse or options.rebuild:
        shutil.copytree(REPOSITORY / "flutter/integration_test/support/identity_fixture", directory,
                        dirs_exist_ok=True)
        (directory / ".identity-fixture-version").write_text("1\n", encoding="utf-8")
        print(f"Building isolated identity fixture: {directory}", flush=True)
        build_fixture(directory, env=env, timeout=300)
    print(json.dumps({"fixture": str(directory)}), flush=True)
    if options.build_only:
        return
    server = Server(directory, env=env)
    server.port, server.origin = options.port, f"http://127.0.0.1:{options.port}"
    with server:
        print(json.dumps({"ready": True, "origin": server.origin, "pid": server.child.pid}), flush=True)
        server.serve()


if __name__ == "__main__":
    main_guard(main, "Identity fixture failed; inspect its local build log.")
