"""Shared cookie-less GET and response checks; no authenticated browser or cookie jar."""
import argparse
from urllib.parse import urlsplit

from .rendering import request

CANONICAL_ORIGIN = "https://goalhint.com"


def origin_argument(description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--origin", default=CANONICAL_ORIGIN, help="HTTP origin; use loopback for local acceptance.")
    value = parser.parse_args().origin.rstrip("/")
    parsed = urlsplit(value)
    assert parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username and not parsed.password
    assert not parsed.path and not parsed.query and not parsed.fragment
    assert parsed.scheme == "https" or parsed.hostname in ("localhost", "127.0.0.1", "::1")
    return value


def get(origin, path):
    response = request(origin, path, timeout=40)
    assert response.headers.get_all("Set-Cookie") is None, f"Anonymous response set a cookie: {path}"
    return response


def private_response(response, path, *, require_private=True):
    directives = {part.strip().lower() for part in response.headers.get("Cache-Control", "").split(",")}
    required = {"private", "no-store"} if require_private else {"no-store"}
    assert required <= directives, f"Uncacheable response required: {path}"
    for name in ("x-litespeed-cache", "cf-cache-status", "x-cache", "x-proxy-cache"):
        assert response.headers.get(name) is None, f"Unexpected intermediary cache header {name}: {path}"
    for name in ("cdn-cache-control", "surrogate-control"):
        value = response.headers.get(name)
        if value is not None:
            assert "no-store" in {part.strip().lower() for part in value.split(",")}, f"Shared cache enabled by {name}: {path}"
    assert int(response.headers.get("Age", "0")) == 0, f"Cached response: {path}"
