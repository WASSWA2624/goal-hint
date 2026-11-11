"""Prime the owned local Matches page and its browser startup assets."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from http.client import HTTPConnection, HTTPException
from time import monotonic
from urllib.parse import unquote, urlsplit


class _StartupScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = {}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script":
            source = values.get("src")
        elif tag == "link" and values.get("rel") in ("preload", "modulepreload"):
            source = values.get("href")
        else:
            return
        if not source or len(self.paths) >= 48:
            return
        try:
            parts = urlsplit(source)
        except ValueError:
            return
        decoded_path = unquote(parts.path)
        if (parts.scheme or parts.netloc or parts.fragment or not decoded_path.startswith("/_next/static/")
                or not decoded_path.endswith(".js") or ".." in decoded_path.split("/") or "\\" in decoded_path):
            return
        self.paths.setdefault(parts.geturl(), None)


def _read_loopback(port, path, deadline):
    remaining = deadline - monotonic()
    if remaining <= 0:
        return None
    connection = HTTPConnection("127.0.0.1", port, timeout=remaining)
    try:
        connection.request("GET", path)
        with connection.getresponse() as response:
            return response.read(8 * 1024 * 1024) if response.status == 200 else None
    except (OSError, HTTPException, ValueError):
        return None
    finally:
        connection.close()


def warm_football_matches(port):
    print("Warming the local Matches page and browser scripts…", flush=True)
    deadline = monotonic() + 60
    document = _read_loopback(port, "/en/matches", deadline)
    if document:
        scripts = _StartupScripts()
        scripts.feed(document.decode("utf-8", errors="replace"))
        with ThreadPoolExecutor(max_workers=4) as workers:
            warmed = sum(content is not None for content in workers.map(
                lambda path: _read_loopback(port, path, deadline), scripts.paths))
        if warmed:
            print(f"Matches browser scripts warmed ({warmed}/{len(scripts.paths)}).", flush=True)
            return
    print("Matches warm-up did not finish. The development server is available.", flush=True)
