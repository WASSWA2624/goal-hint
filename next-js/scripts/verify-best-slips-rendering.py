"""Verify the Best Slips filter/results shell with isolated, multi-day stored fixtures."""
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, match, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def verify(origin):
    for suffix in ("", "?period=yesterday", "?period=all", "?period=custom&from=2026-10-12&to=2026-10-12&probMin=80&matchesMin=2&status=lost"):
        response = request(origin, "/best-slips/browse" + suffix)
        assert response.status == 200
        html = visible_html(response.text)
        assert html.count("data-best-slips-filter-trigger") == 1
        assert html.count("data-best-slips-applied") == 1
        assert "data-best-slips-publication" not in html
        assert html.count("data-best-slips-summary") == 1
        assert "data-list-divider" not in html
        assert "data-performance-heading" in html
        trigger = match(r'<button\b[^>]*data-best-slips-filter-trigger="[^"]*"[^>]*>[\s\S]*?</button>', html).group()
        assert ">Filters</span>" in trigger
        if "period=custom" in suffix:
            assert "12-Oct-2026" in html
            assert html.count("data-slip-key=") == 1
            assert "Average pick probability" in html and "Whole-slip win probability" in html
    print("Best Slips SSR passed for defaults, dated filters, numeric and result filters, and bounded All dates browsing.", flush=True)


def main():
    args = parse_args("Best Slips", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("slips")
        print(f"Building Best Slips fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=360)
    with Server(directory, env) as server:
        verify(server.origin)
        print(f"Browser origin: {server.origin}; path: /best-slips/browse", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
