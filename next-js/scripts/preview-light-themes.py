"""Build an isolated, synthetic light-theme review using the real shared interface."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from lib.rendering import ROOT, Server, build_fixture, create_fixture, request
from lib.runtime import main_guard


def prepare(directory: Path) -> None:
    source = ROOT / "design/light-theme-samples"
    create_fixture("light-theme-review", directory=directory)
    shutil.copytree(source / "app", directory / "app", dirs_exist_ok=True)
    shutil.copyfile(source / "palettes.json", directory / "palettes.json")
    session = directory / "app/api/account/session/route.ts"
    session.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "tests/helpers/rendering/theme/app/api/account/session/route.ts", session)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the isolated review server running.")
    parser.add_argument("--port", type=int, help="Use a fixed local port; otherwise reserve an available port.")
    parser.add_argument("--reuse", action="store_true", help="Reuse a previously built review fixture.")
    args = parser.parse_args()
    directory = ROOT / ".tmp/light-theme-review"
    directory.parent.mkdir(exist_ok=True)
    if not args.reuse:
        prepare(directory)
        print(f"Building isolated light-theme review: {directory}", flush=True)
        build_fixture(directory, timeout=360)
    server = Server(directory)
    if args.port is not None:
        if not 1 <= args.port <= 65535:
            parser.error("--port must be between 1 and 65535")
        server.port = args.port
        server.origin = f"http://127.0.0.1:{server.port}"
    with server:
        response = request(server.origin)
        assert response.status == 200 and "data-review-theme=" in response.text
        assert "data-fixture-id=" in response.text and "data-slip-id=" in response.text
        print("PASS: synthetic shared feed, performance summary, and slip render successfully.", flush=True)
        print(f"Light-theme review URL: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Light-theme review failed; inspect .tmp/light-theme-review/build.log.")
