"""Verify isolated SEO production/staging responses from genuine SQL captures."""
from datetime import datetime, timezone
import json
import os
import re
import shutil
from urllib.parse import urljoin, urlsplit

from lib.capture_rendering import assert_database_capture, captured_cases, captured_directory, unique_options
from lib.rendering import (ROOT, Server, build_fixture, create_fixture, environment,
    match, no_match, parse_args, request, run_node, visible_html, write_json)
from lib.runtime import main_guard


def prepare(args):
    assert not (args.reuse and args.capture), "Use either --capture or --reuse."
    if args.reuse:
        directory = captured_directory(args.reuse, "seo")
        assert_database_capture(directory)
        return directory, captured_cases(directory)
    directory = create_fixture("seo")
    capture = directory / "scenarios.json"
    if args.capture:
        source = captured_directory(args.capture, "seo-capture")
        log = assert_database_capture(source)
        shutil.copyfile(source / "scenarios.json", capture)
        (directory / "database.log").write_text(log, encoding="utf-8")
    else:
        result = run_node(["--conditions=react-server", "--test", "tests/discovery.integration.mjs"],
            logfile=directory / "database.log", env=environment(SEO_PAGE_CAPTURE=str(capture)), timeout=300)
        match(r"\bskipped 0\b", result.stdout, "Real MySQL acceptance may not be skipped.")
    cases = captured_cases(directory)
    assert cases["inventory"]["matches"] == 35
    assert cases["details"][cases["publishedId"]]["current"]["data"]["snapshot"]
    relative = os.path.relpath(ROOT / "next.config", directory).replace(os.sep, "/")
    # Reuse the application's real image policy and framework configuration.
    (directory / "next.config.mjs").unlink()
    (directory / "next.config.ts").write_text(
        f"import config from {json.dumps('./' + relative)};\n"
        + "export default {...config,turbopack:{root:" + json.dumps(str(ROOT)) + "}};\n", encoding="utf-8")
    return directory, cases


def metadata(html, name, *, property=False):
    found = re.search(rf'<meta {"property" if property else "name"}="{re.escape(name)}" content="([^"]*)"', html)
    return found.group(1) if found else None


def locations(xml):
    return [value.replace("&amp;", "&") for value in re.findall(r"<loc>([^<]+)</loc>", xml)]


def iso_timestamp(value):
    if isinstance(value, (float, int)):
        timestamp = datetime.fromtimestamp(value / 1000, timezone.utc)
    else:
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return timestamp.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def verify(origin, cases, *, staging):
    checks, fixed = 0, "https://goalhint.com"

    def anonymous(path, headers=None):
        response = request(origin, path, headers=headers)
        assert response.headers.get("set-cookie") is None
        return response

    def page(path, canonical, index):
        nonlocal checks
        response = anonymous(path)
        assert response.status == 200, path
        html = response.text
        match(r'<html[^>]*lang="en"', html)
        assert metadata(html, "robots") == f'{"index" if index else "noindex"}, follow', path
        assert response.headers.get("x-robots-tag") == ("noindex, follow" if staging else None), path
        canonical_url = fixed + canonical.replace("&", "&amp;")
        assert f'<link rel="canonical" href="{canonical_url}"' in html, path
        assert metadata(html, "og:url", property=True) == canonical_url
        assert metadata(html, "og:site_name", property=True) == "Goal Hint"
        assert metadata(html, "og:image", property=True) == fixed + "/brand/goal-hint-open-graph.png"
        assert metadata(html, "twitter:card") == "summary_large_image"
        assert len(metadata(html, "description") or "") > 30
        assert len(re.findall(r"<h1\b", visible_html(html, comments=False))) == 1
        no_match(r'rel="alternate"[^>]*hreflang=', html)
        checks += 1
        return html

    root = anonymous("/")
    assert root.status == 308
    assert urlsplit(urljoin(origin, root.headers.get("location"))).path == "/en"
    checks += 1
    www = anonymous("/en/predictions/2026-10-09?page=2", {"host": "www.goalhint.com"})
    assert www.status == 308
    assert www.headers.get("location") == fixed + "/en/predictions/2026-10-09?page=2"
    checks += 1
    home = page("/en", "/en", not staging)
    match(r"<title>Goal Hint \| Daily Football Predictions</title>", home)
    structured = json.loads(match(r'<script type="application/ld\+json">([^<]+)</script>', home).group(1))
    assert structured["@type"] == "WebSite"
    assert structured["url"] == fixed + "/en"
    checks += 1
    archive = "/en/predictions/2026-10-09"
    first = page(archive, archive, not staging)
    second = page(archive + "?page=2", archive + "?page=2", not staging)
    assert match(r"<title>(.*?)</title>", first).group(1) != match(r"<title>(.*?)</title>", second).group(1)
    assert "page=2" in visible_html(first, comments=False)
    match("Page 2", second)
    checks += 1
    for path in ["/en?page=2", "/en?q=Discovery+Home+1", "/en?when=next-7-days", "/en?page=10000"]:
        canonical = archive + path[len("/en"):] if path in ("/en?page=2", "/en?page=10000") else path
        page(path, canonical, path == "/en?page=2" and not staging)
    detail = cases["details"][cases["publishedId"]]["current"]["data"]
    html = page(detail["route"]["path"], detail["route"]["path"], not staging)
    match("Renamed Discovery Club", visible_html(html, comments=False))
    match("data-detail-market=", html)
    checks += 1
    page(detail["route"]["path"] + "?revision=" + cases["revision"], detail["route"]["path"], False)
    assert anonymous("/en/matches/00000000-0000-4000-8000-000000000000/unknown").status == 404
    checks += 1
    assert anonymous("/en/predictions/not-a-date").status == 404
    checks += 1
    stale = anonymous(cases["oldPath"] + "?revision=" + cases["revision"])
    assert stale.status == 308
    assert stale.headers.get("location") == detail["route"]["path"] + "?revision=" + cases["revision"] + "#revision-history"
    checks += 1
    for name in ["privacy", "terms", "contact"]:
        page(f"/en/{name}", f"/en/{name}", False)
    page("/en/help", "/en/help", not staging)
    legacy = anonymous("/en/how-it-works")
    assert legacy.status == 308 and legacy.headers.get("location") == "/en/help"
    robots = anonymous("/robots.txt").text
    match(r"Allow: /", robots)
    match(r"Disallow: /api/", robots)
    no_match(r"Disallow:.*(?:revision|\?|predictions|matches|/en)", robots)
    sitemap = anonymous("/sitemap.xml").text
    matches = anonymous("/matches/sitemap/0.xml").text
    dates = anonymous("/archive/sitemap/0.xml").text
    if staging:
        no_match("Sitemap:", robots)
        assert locations(sitemap) == []
        assert locations(matches) == []
        assert locations(dates) == []
    else:
        match(r"Sitemap: https://goalhint\.com/matches/sitemap/0\.xml", robots)
        assert locations(sitemap) == [fixed + "/en", fixed + "/en/help"]
        assert locations(matches) == [fixed + row["path"] for row in cases["matches"]]
        assert locations(dates) == [fixed + archive]
        for row in cases["matches"]:
            assert f'<lastmod>{iso_timestamp(row["lastModified"])}</lastmod>' in matches
        no_match("<lastmod>", dates)
        no_match("<lastmod>", sitemap)
        for url in locations(matches) + locations(dates):
            path = urlsplit(url).path
            page(path, path, True)
        links = set(re.findall(r'href="(/en/matches/[^"?#]+)"', visible_html(first + second, comments=False)))
        assert len(links) == 35
        for url in locations(matches):
            assert urlsplit(url).path in links
        assert anonymous("/matches/sitemap/1.xml").status == 404
        assert anonymous("/matches/sitemap/01.xml").status == 404
    checks += 1
    for asset in ["/brand/goal-hint-open-graph.png", "/brand/goal-hint-favicon.svg", "/brand/goal-hint-favicon.ico"]:
        assert anonymous(asset).status == 200, asset
        checks += 1
    mode = "staging" if staging else "synthetic approved production"
    print(f"PASS {mode}: {checks} HTTP/HTML checks, fixed canonical origin, crawlable noindex variants and native XML.")


def main():
    unique_options("--reuse", "--capture")
    args = parse_args("SEO", ("--capture", "--reuse"))
    directory, cases = prepare(args)
    print(f"Building isolated SEO acceptance: {directory}", flush=True)
    if not args.reuse:
        build_fixture(directory, env=environment(SEO_ACCEPTANCE_ENVIRONMENT="staging"))
    logs = []
    try:
        for deployment in ("staging", "production"):
            server = Server(directory, env=environment(SEO_ACCEPTANCE_ENVIRONMENT=deployment), ready="/robots.txt")
            try:
                with server:
                    verify(server.origin, cases, staging=deployment == "staging")
                    if deployment == "production":
                        write_json(ROOT / ".tmp/042-rendering-target.json", {"directory": str(directory), "origin": server.origin})
                        print(f"SEO browser target: {server.origin}; artifacts: {directory}", flush=True)
                        if args.serve:
                            server.serve()
            finally:
                logs.append(server.log)
    finally:
        if any(logs):
            (ROOT / ".tmp/042-isolated-server.log").write_text("\n".join(logs), encoding="utf-8")


if __name__ == "__main__":
    main_guard(main)
