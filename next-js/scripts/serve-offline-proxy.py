"""Loopback-only fault proxy for an owned, synthetic offline-rendering fixture.

Control and counters are host files, never production routes. Generation B is a
derived acceptance bundle, not a second production build or an auth service.
"""
import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import select
import socket
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler as UrlProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
NEW_ASSET = "/_next/static/chunks/offline-fixture-b.js"
MAX_BYTES = 4 * 1024 * 1024
TARGETS = {"manifest", "snapshot", "asset", "entry", "document", "private"}
MODES = {"503", "401", "captive", "redirect", "missing", "truncate", "delay-headers", "stall-body", "disconnect"}
PRIVATE_HEADERS = {"cache-control": "private, no-store", "vary": "Cookie", "content-type": "application/json"}


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def atomic_json(path, value):
    temporary = path.with_name(f"{path.name}.{threading.get_ident()}.tmp")
    temporary.write_bytes(json_bytes(value) + b"\n")
    for attempt in range(10):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 9:
                raise
            # A concurrent Windows counter reader may briefly omit delete sharing.
            time.sleep(0.01)


def load_control(path):
    for attempt in range(3):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            break
        except (OSError, ValueError):
            if attempt == 2:
                raise ValueError("Control file must contain complete JSON.") from None
            time.sleep(0.01)
    if not isinstance(value, dict) or set(value) - {"generation", "fault", "authState"}:
        raise ValueError("Unknown fixture control field.")
    if value.get("generation", "A") not in {"A", "B"} or value.get("authState", "active") not in {"active", "expired"}:
        raise ValueError("Invalid fixture generation or auth state.")
    fault = value.get("fault")
    if fault is not None:
        if not isinstance(fault, dict) or set(fault) - {"target", "mode", "delayMs"}:
            raise ValueError("Unknown fixture fault field.")
        if fault.get("target") not in TARGETS or fault.get("mode") not in MODES:
            raise ValueError("Invalid fixture fault target or mode.")
        delay = fault.get("delayMs", 12000)
        if type(delay) is not int or not 0 <= delay <= 30000:
            raise ValueError("Fixture delay must be between zero and 30000 ms.")
        fault = {**fault, "delayMs": delay}
    return {"generation": value.get("generation", "A"), "fault": fault, "authState": value.get("authState", "active")}


@dataclass(frozen=True)
class Resource:
    body: bytes
    headers: dict
    status: int = 200


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def fetch_backend(origin, path, method="GET", body=None, headers=None):
    forwarded = {key: value for key, value in (headers or {}).items()
                 if key.lower() not in {"host", "connection", "content-length", "accept-encoding", "authorization"}}
    forwarded["Accept-Encoding"] = "identity"
    request = Request(origin + path, data=body, method=method, headers=forwarded)
    try:
        response = build_opener(UrlProxyHandler({}), NoRedirect).open(request, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        content = response.read(MAX_BYTES + 1)
        if len(content) > MAX_BYTES:
            raise ValueError("Fixture response exceeds its bound.")
        copied = {key.lower(): value for key, value in response.headers.items()
                  if key.lower() not in {"connection", "transfer-encoding", "content-length", "content-encoding"}}
        return Resource(content, copied, response.status)


def canonical_manifest(manifest):
    return {"schemaVersion": 1, "entry": manifest["entry"], "assets": manifest["assets"]}


def category_for(path, headers):
    fixed = {"/offline-manifest.json": "manifest", "/api/offline/snapshot": "snapshot",
             "/offline": "entry", NEW_ASSET: "asset", "/api/account/fixture": "private"}
    if path in fixed:
        return fixed[path]
    if path.startswith(("/_next/static/", "/brand/", "/flags/")):
        return "static"
    if headers.get("RSC"):
        return "rsc"
    return "document" if path in {"/", "/en"} or path.startswith("/en/") else "other"


def derive_bundles(origin, epoch):
    document = fetch_backend(origin, "/en")
    if document.status != 200 or b"data-offline-fixture" not in document.body:
        raise ValueError("Backend is not the isolated synthetic offline fixture.")
    response = fetch_backend(origin, "/offline-manifest.json")
    manifest = json.loads(response.body)
    if response.status != 200 or response.headers.get("x-goalhint-offline-manifest") != "1" or manifest.get("schemaVersion") != 1:
        raise ValueError("Missing fixture manifest.")
    if set(manifest) != {"schemaVersion", "version", "createdAt", "entry", "assets"} or manifest["version"] != digest(json_bytes(canonical_manifest(manifest))):
        raise ValueError("Invalid fixture manifest identity.")
    resources = {}
    for entry in [manifest["entry"], *manifest["assets"]]:
        path = entry["url"]
        if not re.fullmatch(r"/(?:offline|_next/static/[A-Za-z0-9_./-]+|brand/goal-hint-(?:logo-inverse|mark-primary)\.svg)", path) or ".." in path:
            raise ValueError("Unapproved fixture resource.")
        resource = fetch_backend(origin, path)
        if resource.status != 200 or len(resource.body) != entry["bytes"] or digest(resource.body) != entry["sha256"]:
            raise ValueError("Fixture build and served resource disagree.")
        resources[path] = resource
    source = fetch_backend(origin, "/api/offline/snapshot")
    snapshot = json.loads(source.body)
    if source.status != 200 or source.headers.get("x-goalhint-offline-snapshot") != "1" or set(snapshot) != {"schemaVersion", "capturedAt", "expiresAt", "reportingDate", "records"}:
        raise ValueError("Invalid anonymous fixture snapshot.")
    if not isinstance(snapshot["records"], list) or len(snapshot["records"]) > 30:
        raise ValueError("Invalid anonymous fixture record count.")
    expected = {"fixtureId", "dataVersion", "homeTeam", "awayTeam", "competition", "kickoffAt", "syncedAt", "status", "score", "scorePeriod"}
    for record in snapshot["records"]:
        if set(record) != expected or any(set(record[key]) != {"id", "name", "code"} for key in ["homeTeam", "awayTeam"]) or set(record["competition"]) != {"id", "name", "country"}:
            raise ValueError("Fixture snapshot contains unapproved fields.")
    result = {}
    for generation, offset in [("A", 0), ("B", 1000)]:
        current = json.loads(json_bytes(manifest))
        assets = dict(resources)
        if generation == "B":
            if NEW_ASSET in assets or len(current["assets"]) >= 256:
                raise ValueError("Cannot add a distinct bounded generation-B asset.")
            body = b"/* Derived offline acceptance generation B; not executed by the app. */\n"
            assets[NEW_ASSET] = Resource(body, {"content-type": "application/javascript", "cache-control": "public, max-age=31536000, immutable"})
            current["assets"] = sorted([*current["assets"], {"url": NEW_ASSET, "sha256": digest(body), "bytes": len(body)}], key=lambda value: value["url"])
            current["createdAt"] += 1
            current["version"] = digest(json_bytes(canonical_manifest(current)))
        data = json.loads(json_bytes(snapshot))
        data["capturedAt"], data["expiresAt"] = epoch + offset, epoch + offset + 86400000
        data["reportingDate"] = datetime.fromtimestamp((epoch + offset) / 1000, timezone(timedelta(hours=3))).strftime("%Y-%m-%d")
        for record in data["records"]:
            version = int(record["dataVersion"]) + (generation == "B")
            if not 1 <= version <= 18446744073709551615:
                raise ValueError("Cannot advance fixture version.")
            record["dataVersion"] = str(version)
            if record["kickoffAt"] is not None:
                record["kickoffAt"] = epoch - 3600000
            if record["syncedAt"] is not None:
                record["syncedAt"] = epoch + offset
        assets["/offline-manifest.json"] = Resource(json_bytes(current), {"content-type": "application/json", "cache-control": "public, max-age=0, must-revalidate", "x-goalhint-offline-manifest": "1"})
        assets["/api/offline/snapshot"] = Resource(json_bytes(data), {"content-type": "application/json", "cache-control": "public, max-age=0, must-revalidate", "x-goalhint-offline-snapshot": "1"})
        result[generation] = assets
    return result


class FixtureState:
    def __init__(self, backend, fixture, port, control, stats):
        self.backend, self.control, self.stats_path = backend, control, stats
        self.lock, self.stopping = threading.Lock(), threading.Event()
        now = int(time.time() * 1000)
        previous = json.loads(stats.read_text(encoding="utf-8")) if stats.exists() else None
        if previous and (previous.get("schemaVersion") != 1 or previous.get("backend") != backend or previous.get("port") != port or previous.get("fixture") != str(fixture)):
            raise ValueError("Counters belong to another owned fixture.")
        self.stats = previous or {"schemaVersion": 1, "backend": backend, "port": port, "fixture": str(fixture), "createdAtMs": now,
            "fixtureEpochMs": now - 2000, "boots": 0, "sequence": 0, "requests": {}, "writes": 0, "active": 0, "peakActive": 0, "events": []}
        for event in self.stats["events"]:
            if event.get("finishedAtMs") is None:
                event.update({"finishedAtMs": now, "aborted": True, "restartAborted": True})
        self.stats.update({"startedAtMs": now, "boots": self.stats["boots"] + 1, "active": 0})
        self.bundles = derive_bundles(backend, self.stats["fixtureEpochMs"])
        if not control.exists():
            atomic_json(control, {"generation": "A", "fault": None, "authState": "active"})
        load_control(control)
        self.flush()

    def flush(self):
        atomic_json(self.stats_path, self.stats)

    def begin(self, method, path, category, control):
        with self.lock:
            self.stats["sequence"] += 1
            self.stats["active"] += 1
            self.stats["peakActive"] = max(self.stats["peakActive"], self.stats["active"])
            counts = Counter(self.stats["requests"])
            counts[category] += 1
            self.stats["requests"] = dict(counts)
            self.stats["writes"] += method not in {"GET", "HEAD"}
            self.stats["generation"] = control["generation"]
            event = {"sequence": self.stats["sequence"], "atMs": int(time.time() * 1000), "category": category, "path": path,
                "method": method, "generation": control["generation"], "fault": control["fault"], "status": None, "finishedAtMs": None, "aborted": False}
            self.stats["events"] = [*self.stats["events"][-1999:], event]
            self.flush()
            return event

    def finish(self, event, status, aborted, started):
        with self.lock:
            event.update({"status": status, "finishedAtMs": int(time.time() * 1000), "elapsedMs": round((time.monotonic() - started) * 1000), "aborted": aborted})
            self.stats["active"] = max(0, self.stats["active"] - 1)
            self.flush()


class ClientDisconnected(Exception):
    pass


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass  # Counters omit cookies, bodies and query strings.

    def wait(self, milliseconds):
        deadline = time.monotonic() + milliseconds / 1000
        while time.monotonic() < deadline:
            if self.server.fixture.stopping.is_set():
                raise ClientDisconnected()
            ready, _, _ = select.select([self.connection], [], [], min(0.05, max(0, deadline - time.monotonic())))
            if ready and not self.connection.recv(1, socket.MSG_PEEK):
                raise ClientDisconnected()

    def send_resource(self, resource, mode=None, delay=0):
        self.send_response(resource.status)
        for name, value in resource.headers.items():
            if name.lower() not in {"server", "date", "content-length", "connection", "transfer-encoding"}:
                if name.lower() == "location" and value.startswith(self.server.fixture.backend):
                    value = value.removeprefix(self.server.fixture.backend)
                self.send_header(name, value)
        self.send_header("Content-Length", str(len(resource.body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        if self.command == "HEAD":
            return
        if mode == "stall-body":
            self.wfile.write(resource.body[:1])
            self.wfile.flush()
            self.wait(delay)
            self.wfile.write(resource.body[1:])
        elif mode == "truncate":
            self.wfile.write(resource.body[:max(1, len(resource.body) // 2)])
            self.wfile.flush()
            self.connection.shutdown(socket.SHUT_WR)
        else:
            self.wfile.write(resource.body)

    def handle_request(self):
        started, event, status, aborted = time.monotonic(), None, 0, False
        state = self.server.fixture
        try:
            url = urlsplit(self.path)
            if url.scheme or url.netloc or url.fragment or "\\" in unquote(url.path):
                raise ValueError("Invalid fixture URL.")
            path = url.path
            category = category_for(path, self.headers)
            control = load_control(state.control)
            event = state.begin(self.command, path, category, control)
            resource = state.bundles[control["generation"]].get(path)
            allowed = self.command in {"GET", "HEAD"} or self.command == "POST" and path == "/api/account/fixture"
            if not allowed:
                resource = Resource(b'{"error":"fixture-method-not-allowed"}', PRIVATE_HEADERS, 405)
            elif category == "private" and self.command == "GET" and control["authState"] == "expired":
                resource = Resource(b'{"error":"synthetic-session-expired"}', PRIVATE_HEADERS, 401)
            elif resource is None:
                permitted = path in {"/", "/en", "/offline-worker.js", "/api/account/fixture"} or path.startswith(("/en/", "/_next/static/", "/brand/", "/flags/"))
                if permitted and path != NEW_ASSET:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 <= length <= 65536:
                        raise ValueError("Fixture body exceeds bound.")
                    body = self.rfile.read(length) if self.command == "POST" else None
                    resource = fetch_backend(state.backend, self.path, self.command, body, dict(self.headers))
                else:
                    resource = Resource(b'{"error":"fixture-not-found"}', PRIVATE_HEADERS, 404)
            fault = control["fault"]
            mode, delay = (fault["mode"], fault["delayMs"]) if fault and fault["target"] == category else (None, 0)
            if mode == "disconnect":
                self.close_connection, aborted = True, True
                self.connection.shutdown(socket.SHUT_RDWR)
                return
            if mode == "delay-headers":
                self.wait(delay)
            if mode in {"503", "401", "missing"}:
                resource = Resource(b'{"error":"synthetic-fixture-fault"}', PRIVATE_HEADERS, 404 if mode == "missing" else int(mode))
            elif mode == "captive":
                resource = Resource(b"<html><body>Synthetic captive portal; not the app.</body></html>", {"content-type": "text/html", "cache-control": "no-store"})
            elif mode == "redirect":
                resource = Resource(b"", {"location": "/en/account?fixture=portal", "cache-control": "no-store"}, 302)
            status = resource.status
            self.send_resource(resource, mode, delay)
            aborted = mode == "truncate"
        except (BrokenPipeError, ConnectionError, ClientDisconnected, socket.timeout):
            aborted, self.close_connection = True, True
        except (ValueError, OSError, URLError):
            status = 503
            try:
                self.send_resource(Resource(b'{"error":"synthetic-fixture-unavailable"}', PRIVATE_HEADERS, 503))
            except (OSError, ConnectionError):
                aborted = True
        finally:
            if event is not None:
                state.finish(event, status, aborted, started)

    do_GET = do_HEAD = do_POST = do_PUT = do_DELETE = do_PATCH = handle_request


def owned_path(value):
    path = value.resolve()
    if not path.is_relative_to((ROOT / ".tmp").resolve()):
        raise ValueError("Control, counters and fixture paths must stay under next-js/.tmp.")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", default="http://127.0.0.1:3189")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--fixture-dir", type=Path, required=True)
    parser.add_argument("--control", type=Path, required=True)
    parser.add_argument("--stats", type=Path, required=True)
    options = parser.parse_args()
    try:
        origin = urlsplit(options.backend)
        if origin.scheme != "http" or origin.hostname not in {"127.0.0.1", "localhost", "::1"} or origin.username or origin.password or origin.path not in {"", "/"} or origin.query or origin.fragment or not 1 <= options.port <= 65535 or (origin.port or 80) == options.port:
            raise ValueError("Use distinct loopback HTTP backend/proxy ports.")
        fixture, control, stats = map(owned_path, [options.fixture_dir, options.control, options.stats])
        if not (fixture / ".offline-fixture").is_file() or control == stats:
            raise ValueError("Select an owned offline fixture and separate control/counter files.")
        control.parent.mkdir(parents=True, exist_ok=True)
        stats.parent.mkdir(parents=True, exist_ok=True)
        state = FixtureState(options.backend.rstrip("/"), fixture, options.port, control, stats)
    except (ValueError, OSError, URLError) as error:
        parser.error(str(error))
    server = ThreadingHTTPServer(("127.0.0.1", options.port), ProxyHandler)
    server.daemon_threads, server.fixture = True, state
    print(json.dumps({"ready": True, "pid": os.getpid(), "origin": f"http://127.0.0.1:{options.port}", "control": str(control), "stats": str(stats), "derivedGenerations": ["A", "B"]}), flush=True)
    try:
        server.serve_forever(poll_interval=0.1)
    except KeyboardInterrupt:
        pass
    finally:
        state.stopping.set()
        server.server_close()


if __name__ == "__main__":
    main()
