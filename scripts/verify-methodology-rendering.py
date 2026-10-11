"""Build and verify isolated methodology pages backed by genuine SQL captures."""
from copy import deepcopy
import re

from lib.capture_rendering import assert_database_capture, captured_cases, captured_directory, unique_options
from lib.rendering import (ROOT, Server, build_fixture, create_fixture, environment,
    match, no_match, parse_args, request, run_node, write_json)
from lib.runtime import main_guard


def prepare(args):
    directory = captured_directory(args.reuse, "methodology") if args.reuse else create_fixture("methodology")
    if not args.reuse:
        run_node(["--conditions=react-server", "--test", "--test-concurrency=1", "tests/performance.integration.mjs"],
            logfile=directory / "database.log", env=environment(PERFORMANCE_PAGE_CAPTURE=str(directory / "scenarios.json")), timeout=360)
    assert_database_capture(directory)
    cases = captured_cases(directory)
    assert cases["mixed"]["data"]["cells"][0]["coverage"]["settled"] == 4, "Genuine SQL preparation must not be skipped."
    cases["failure"] = {"data": None, "error": "unavailable"}
    cases["busy"] = {"data": None, "error": "rate-limited"}
    cases["long-labels"] = deepcopy(cases["mixed"])
    for cell in cases["long-labels"]["data"]["cells"]:
        for version in cell["versions"]:
            version["version"] = "LongVersionIdentifier" * 10
        for link in cell["evidence"]["links"]:
            link["matchLabel"] = "<script>window.unsafeReport=true</script>" + "LongTeamIdentifier" * 35
    create_fixture("methodology", directory=directory)
    write_json(directory / "app/cases.json", cases)
    return directory, cases


def verify(origin, cases):
    def page(path):
        response = request(origin, path, redirect=True, timeout=30)
        assert response.status == 200, path
        assert response.headers.get("set-cookie") is None
        return response.text

    scenarios, reconciled = 0, 0
    for name, result in cases.items():
        if name.startswith("detail:"):
            continue
        html = page(f"/case/{name}")
        match("<style data-styled", html)
        assert len(re.findall(r"<h1[\s>]", html)) == 1
        for pattern in [r'data-correction-policy="unresolved"', "late lineup news may be absent",
                "strictly before scheduled kickoff minus five minutes", r'<form[^>]*method="get"']:
            match(pattern, html)
        data = result.get("data")
        if data:
            match("data-stored-performance", html)
            assert len(re.findall(r'data-performance-cell="', html)) == len(data["cells"])
            for cell in data["cells"]:
                identifier = f'{cell["family"]}:{cell["source"]}:{(cell.get("horizon") or {}).get("id", "overall")}'
                section = html.split(f'data-performance-cell="{identifier}"', 1)[1].split("</section>", 1)[0]
                for key in ["total", "available", "settled", "pending", "unavailable", "void", "filteredOut"]:
                    match(rf'data-count="{key}"[^>]*>{cell["coverage"][key]:,}</dd>', section)
                    reconciled += 1
                assert ("data-performance-metrics" in section) == (cell["metrics"]["state"] == "available"), f"{name}:{identifier}"
                if cell["metrics"]["state"] != "available":
                    match("withheld for this group", section)
                for link in cell["evidence"]["links"]:
                    assert 'href="' + link["pageHref"].replace("&", "&amp;") + '"' in section
        else:
            match("data-performance-error", html)
            no_match("data-stored-performance", html)
        if name == "empty":
            match("not a 0% hit rate", html)
        if name == "long-labels":
            assert "&lt;script&gt;window.unsafeReport=true" in html
        scenarios += 1
    html = page("/en/how-it-works")
    match(r'rel="canonical" href="https://goalhint\.com/en/how-it-works"', html)
    match(r'<meta name="robots" content="noindex, follow"', html)
    no_match("data-performance-metrics", html)
    match("No performance report was read", page("/en/how-it-works?from=bad&to=bad"))
    match("Retry this performance report", page("/en/how-it-works?from=2026-10-09&to=2026-10-12&version=server-failure"))
    print(f"PASS {scenarios} SQL-backed presentation scenarios; {reconciled} counts reconciled; initial CSS, gates, locked links, clocks, errors, canonical/noindex and truthful policy.")


def main():
    unique_options("--reuse")
    args = parse_args("methodology", ("--reuse",))
    directory, cases = prepare(args)
    print(f"Building isolated methodology app: {directory}", flush=True)
    build_fixture(directory, timeout=240)
    server = Server(directory, ready="/en/how-it-works")
    try:
        with server:
            verify(server.origin, cases)
            write_json(ROOT / ".tmp/038-rendering-target.json", {"directory": str(directory), "origin": server.origin})
            print(f"Fixture browser URL: {server.origin}", flush=True)
            if args.serve:
                server.serve()
    finally:
        if server.log:
            (ROOT / ".tmp/038-rendering-server.log").write_text(server.log, encoding="utf-8")


if __name__ == "__main__":
    main_guard(main)
