"""Verify the Best Slips filter/results shell with isolated, multi-day stored fixtures."""
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def verify(origin):
    for suffix in ("", "?period=yesterday", "?period=all"):
        response = request(origin, "/best-slips/browse" + suffix)
        assert response.status == 200
        html = visible_html(response.text)
        assert html.count("data-best-slips-filter-trigger") == 1
        assert html.count("data-best-slips-applied") == 1
        assert html.count("data-best-slips-publication") == 1
        assert html.count("data-best-slips-summary") == 1
        assert "data-list-divider" not in html
        assert "data-performance-heading" in html and "Advanced filters" in html
    print("Best Slips SSR passed: one filter action and results bar across multi-day, single-day and bounded All dates views.", flush=True)


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
