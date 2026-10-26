"""Serve shared Goal Hint controls for Windows native UI acceptance."""
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
    parser.add_argument("--port", type=int, default=3195)
    parser.add_argument("--reuse", type=Path)
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--build-only", action="store_true")
    options = parser.parse_args()
    if not 1 <= options.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if options.rebuild and not options.reuse:
        parser.error("--rebuild requires an owned --reuse directory")
    if options.reuse:
        directory = options.reuse.resolve()
        marker = directory / ".windows-ui-fixture-version"
        if (not directory.is_relative_to((WEB_ROOT / ".tmp").resolve())
                or not marker.is_file() or marker.read_text(encoding="utf-8").strip() != "1"
                or (not options.rebuild and not (directory / ".next/BUILD_ID").is_file())):
            parser.error("reuse needs an owned built Windows UI fixture under next-js/.tmp")
    else:
        directory = create_fixture("windows-ui")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if not options.reuse or options.rebuild:
        shutil.copytree(REPOSITORY / "flutter/integration_test/support/windows_ui_fixture", directory,
                        dirs_exist_ok=True)
        (directory / ".windows-ui-fixture-version").write_text("1\n", encoding="utf-8")
        print(f"Building Windows UI fixture: {directory}", flush=True)
        build_fixture(directory, env=env, timeout=300)
    print(json.dumps({"fixture": str(directory),
                      "buildId": (directory / ".next/BUILD_ID").read_text(encoding="utf-8").strip()}), flush=True)
    if options.build_only:
        return
    server = Server(directory, env=env)
    server.port, server.origin = options.port, f"http://127.0.0.1:{options.port}"
    with server:
        # Probe readiness through numeric loopback; Chromium resolves the dedicated
        # .localhost names for actual app/browser traffic without OS DNS changes.
        probe_origin = server.origin
        server.origin = f"http://windows-ui.localhost:{options.port}"
        print(json.dumps({"ready": True, "origin": server.origin, "probeOrigin": probe_origin,
                          "pid": server.child.pid,
                          "external": f"http://windows-handler.localhost:{options.port}/native-handler"}), flush=True)
        server.serve()


if __name__ == "__main__":
    main_guard(main, "Windows UI fixture failed; inspect its local build log.")
