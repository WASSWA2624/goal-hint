"""Build and serve independent synthetic website deployments for native acceptance."""
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
    parser.add_argument("--generation", choices=("A", "B"))
    parser.add_argument("--port", type=int, default=3194)
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
        marker = directory / ".release-fixture.json"
        if not directory.is_relative_to((WEB_ROOT / ".tmp").resolve()) or not marker.is_file():
            parser.error("reuse needs an owned release fixture inside next-js/.tmp")
        saved = json.loads(marker.read_text(encoding="utf-8"))
        generation = saved.get("generation")
        if (saved.get("schemaVersion") != 1 or generation not in ("A", "B")
                or options.generation not in (None, generation)):
            parser.error("reuse generation does not match the owned fixture")
        if not options.rebuild and not (directory / ".next/BUILD_ID").is_file():
            parser.error("reuse requires a completed build or --rebuild")
    else:
        if not options.generation:
            parser.error("a new fixture requires --generation A or B")
        generation = options.generation
        directory = create_fixture("release")
    if not options.reuse or options.rebuild:
        shutil.copytree(REPOSITORY / "flutter/integration_test/support/release_fixture", directory,
                        dirs_exist_ok=True)
        (directory / "app/release-generation.json").write_text(
            json.dumps({"generation": generation}) + "\n", encoding="utf-8")
        (directory / ".release-fixture.json").write_text(
            json.dumps({"schemaVersion": 1, "generation": generation}) + "\n", encoding="utf-8")
        print(f"Building independent website generation {generation}: {directory}", flush=True)
        build_fixture(directory, env=environment(GOAL_HINT_DATABASE_ENABLED="false"), timeout=300)
        (directory / "public/release-metadata.json").write_text(json.dumps({
            "schemaVersion": 1, "generation": generation,
            "buildId": (directory / ".next/BUILD_ID").read_text(encoding="utf-8").strip(),
        }) + "\n", encoding="utf-8")
    metadata = json.loads((directory / "public/release-metadata.json").read_text(encoding="utf-8"))
    expected = {"schemaVersion": 1, "generation": generation,
                "buildId": (directory / ".next/BUILD_ID").read_text(encoding="utf-8").strip()}
    if metadata != expected:
        parser.error("public metadata does not match this completed fixture build")
    print(json.dumps({"fixture": str(directory), **metadata}), flush=True)
    if options.build_only:
        return
    server = Server(directory, env=environment(GOAL_HINT_DATABASE_ENABLED="false"))
    server.port, server.origin = options.port, f"http://127.0.0.1:{options.port}"
    with server:
        print(json.dumps({"ready": True, "origin": server.origin, "pid": server.child.pid,
                          **metadata}), flush=True)
        server.serve()


if __name__ == "__main__":
    main_guard(main, "Website-update fixture failed; inspect its local build log.")
