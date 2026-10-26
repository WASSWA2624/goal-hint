"""Serve the isolated Next.js member fixture for native shell acceptance.

This reuses the web application's rendering fixtures and real HTTP adapters.
It never loads private environment files, connects a database, or sends messages.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

REPOSITORY = Path(__file__).resolve().parents[2]
WEB_ROOT = REPOSITORY / "next-js"
sys.path.insert(0, str(WEB_ROOT / "scripts"))

from lib.rendering import build_fixture, create_fixture, environment  # noqa: E402
from lib.runtime import CommandError, hidden_process, main_guard, node_binary  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1",
                        help="Use 0.0.0.0 only for a physical device on the private development LAN.")
    parser.add_argument("--port", type=int, default=0, help="Default: an available local port.")
    parser.add_argument("--reuse", type=Path, help="Reuse a previously built member fixture inside next-js/.tmp.")
    options = parser.parse_args()
    if not 0 <= options.port <= 65535:
        parser.error("port must be between 0 and 65535")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
                      GOAL_HINT_ADMIN_PASSWORD="Synthetic admin password", GOAL_HINT_ADMIN_PASSWORD_HASH="")
    if options.reuse:
        directory = options.reuse.resolve()
        version = directory / ".shell-fixture-version"
        if (not directory.is_relative_to(WEB_ROOT / ".tmp")
                or not (directory / ".next/BUILD_ID").is_file()
                or not version.is_file() or version.read_text(encoding="utf-8").strip() != "2"):
            parser.error("reuse must select a current built shell acceptance fixture inside next-js/.tmp")
    else:
        directory = create_fixture("members")
        shutil.copytree(REPOSITORY / "flutter/integration_test/support/web_fixture", directory,
                        dirs_exist_ok=True)
        (directory / "app/page.tsx").write_text(
            'import { redirect } from "next/navigation";\nexport default function Page() { redirect("/en"); }\n',
            encoding="utf-8",
        )
        probe = directory / "app/en/account/refresh-probe.tsx"
        source = probe.read_text(encoding="utf-8")
        boundary = "  const router = useRouter();"
        if source.count(boundary) != 1:
            raise CommandError("The web member fixture changed; update its shell hydration probe.")
        # Confined to the copied fixture. This effect runs after account-client
        # hydration; tests must not submit SSR forms before their handlers exist.
        source = source.replace(boundary,
            '  useEffect(() => { document.documentElement.dataset.shellFixtureReady = "true"; '
            'return () => { delete document.documentElement.dataset.shellFixtureReady; }; }, []);\n' + boundary)
        probe.write_text(source, encoding="utf-8")
        (directory / ".shell-fixture-version").write_text("2\n", encoding="utf-8")
        print(f"Building isolated member fixture: {directory}", flush=True)
        build_fixture(directory, env=env, timeout=240)

    port = options.port
    if not port:
        with socket.socket() as reservation:
            reservation.bind((options.host, 0))
            port = reservation.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    log_path = directory / "shell-server.log"
    with log_path.open("w", encoding="utf-8") as log:
        child = subprocess.Popen(
            [node_binary(), str(WEB_ROOT / "node_modules/next/dist/bin/next"), "start", str(directory),
             "--hostname", options.host, "--port", str(port)],
            cwd=directory, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            creationflags=hidden_process(),
        )
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise CommandError(f"Fixture server stopped; inspect {log_path}.")
                try:
                    with urlopen(origin + "/en/account", timeout=1) as response:
                        if response.status == 200:
                            break
                except (URLError, TimeoutError, OSError):
                    pass
                time.sleep(0.1)
            else:
                raise CommandError(f"Fixture server did not become ready; inspect {log_path}.")
            print(json.dumps({"ready": True, "origin": origin, "host": options.host,
                              "port": port, "fixture": str(directory), "pid": child.pid}), flush=True)
            print("Synthetic accounts only. Ctrl+C stops the fixture server.", flush=True)
            child.wait()
        except KeyboardInterrupt:
            pass
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()


if __name__ == "__main__":
    main_guard(main)
