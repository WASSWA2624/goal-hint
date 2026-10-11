"""Shared native Python production-rendering acceptance utilities."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
from uuid import uuid4
import threading
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.error import HTTPError

from .runtime import ROOT, CommandError, hidden_process, node_binary


def environment(**overrides: str) -> dict[str, str]:
    return {**os.environ, "NEXT_TELEMETRY_DISABLED": "1", "FORCE_COLOR": "0", **overrides}


def parse_args(name: str, extra: tuple[str, ...] = ()) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=f"Verify production {name} rendering.")
    parser.add_argument("--serve", action="store_true", help="Keep the fixture available for browser checks.")
    for option in extra:
        parser.add_argument(option, action="store_true" if option in ("--detail", "--history", "--live") else "store")
    return parser.parse_args()


def local_origin(value: str = "http://127.0.0.1:3106") -> str:
    parsed = urlsplit(value)
    assert parsed.hostname in ("127.0.0.1", "localhost", "::1"), "Use a local acceptance server."
    assert parsed.scheme in ("http", "https"), "Use an HTTP acceptance server."
    return f"{parsed.scheme}://{parsed.netloc}"


@dataclass
class Response:
    status: int
    headers: http.client.HTTPMessage
    text: str


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(origin: str, path: str = "/", *, headers: dict | None = None,
            redirect: bool = False, timeout: float = 20) -> Response:
    opener = build_opener() if redirect else build_opener(NoRedirect())
    try:
        response = opener.open(Request(urljoin(origin + "/", path), headers=headers or {}), timeout=timeout)
    except HTTPError as error:
        response = error
    with response:
        return Response(response.status, response.headers, response.read().decode("utf-8", errors="replace"))


def visible_html(value: str, *, comments: bool = True) -> str:
    value = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?</\1>", "", value)
    return re.sub(r"<!--[\s\S]*?-->", "", value) if comments else value


def match(pattern: str, value: str, message: str = "", flags: int = 0) -> re.Match:
    result = re.search(pattern, value, flags)
    assert result, message or f"Expected pattern: {pattern}"
    return result


def no_match(pattern: str, value: str, message: str = "", flags: int = 0) -> None:
    assert not re.search(pattern, value, flags), message or f"Unexpected pattern: {pattern}"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def create_fixture(name: str, *, directory: Path | None = None) -> Path:
    temporary = ROOT / ".tmp"
    temporary.mkdir(exist_ok=True)
    directory = directory or temporary / (name + "-" + uuid4().hex[:8])
    directory.mkdir(exist_ok=True)
    template = ROOT / "tests/helpers/rendering" / name
    if template.exists():
        shutil.copytree(template, directory, dirs_exist_ok=True)
    relative = Path(os.path.relpath(ROOT, directory)).as_posix()
    write_json(directory / "package.json", {"private": True, "type": "module"})
    (directory / "next.config.mjs").write_text(
        "export default { agentRules: false, compiler: { styledComponents: true }, turbopack: { root: "
        + json.dumps(str(ROOT)) + " } };\n", encoding="utf-8")
    write_json(directory / "tsconfig.json", {"extends": relative + "/tsconfig.json",
        "compilerOptions": {"paths": {"@/*": [relative + "/src/*"]}},
        "include": ["app/**/*.tsx", "app/**/*.ts", ".next/types/**/*.ts", relative + "/src/styles/styled.d.ts"],
        "exclude": ["node_modules"]})
    (directory / "app").mkdir(exist_ok=True)
    (directory / "app/layout.tsx").write_text('export { default, metadata } from "@/app/layout";\n', encoding="utf-8")
    shutil.copytree(ROOT / "public/brand", directory / "public/brand", dirs_exist_ok=True)
    if (ROOT / "public/flags").exists():
        shutil.copytree(ROOT / "public/flags", directory / "public/flags", dirs_exist_ok=True)
    return directory


def run_node(args: list[str], directory: Path = ROOT, logfile: Path | None = None,
             env: dict | None = None, timeout: int = 120) -> subprocess.CompletedProcess:
    process = subprocess.Popen([node_binary(), *map(str, args)], cwd=directory,
        env=env or environment(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        encoding="utf-8", errors="replace", creationflags=hidden_process())
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=hidden_process())
        else:
            process.kill()
        stdout, stderr = process.communicate()
        if logfile:
            logfile.write_text(stdout + "\n" + stderr, encoding="utf-8")
        raise CommandError(f"Acceptance command timed out; see {logfile}.") from None
    result = subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)
    if logfile:
        logfile.write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    if result.returncode:
        raise CommandError(f"Acceptance command failed; see {logfile or 'process output'}.")
    return result


def build_fixture(directory: Path, env: dict | None = None, timeout: int = 120) -> None:
    run_node([str(ROOT / "node_modules/next/dist/bin/next"), "build", str(directory)],
        directory, directory / "build.log", env, timeout)


class Server:
    def __init__(self, directory: Path, env: dict | None = None, ready: str = "/"):
        self.directory, self.environment, self.ready = directory, env or environment(), ready
        self.child = None
        self.log = ""
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            self.port = reservation.getsockname()[1]
        self.origin = f"http://127.0.0.1:{self.port}"

    def __enter__(self):
        self.child = subprocess.Popen([node_binary(), str(ROOT / "node_modules/next/dist/bin/next"),
            "start", str(self.directory), "--hostname", "127.0.0.1", "--port", str(self.port)],
            cwd=self.directory, env=self.environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", creationflags=hidden_process())
        def collect():
            for line in self.child.stdout:
                self.log = (self.log + line)[-65536:]
        threading.Thread(target=collect, daemon=True).start()
        deadline = time.monotonic() + 30
        try:
            while time.monotonic() < deadline:
                assert self.child.poll() is None, "Fixture server stopped before readiness. " + self.log
                try:
                    if request(self.origin, self.ready, timeout=1).status == 200:
                        return self
                except (OSError, http.client.HTTPException):
                    pass
                time.sleep(0.1)
            raise CommandError("Fixture server did not become ready. " + self.log)
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def serve(self) -> None:
        print(f"Fixture browser URL: {self.origin}", flush=True)
        print("Server remains available for browser acceptance checks; Ctrl+C stops it.", flush=True)
        try:
            self.child.wait()
        except KeyboardInterrupt:
            pass

    def __exit__(self, *_):
        if self.child and self.child.poll() is None:
            self.child.terminate()
            try:
                self.child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait()
