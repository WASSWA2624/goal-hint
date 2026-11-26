"""Verify the Best Slips filter/results shell with isolated, multi-day stored fixtures."""
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, match, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def verify(origin):
    archive = "?period=custom&from=2026-10-12&to=2026-10-12&probMin=80&matchesMin=2&status=lost"
    legacy = "?period=custom&from=2026-10-11&to=2026-10-11"
    empty = "?oddsBand=100-200"
    for suffix in ("", "?period=yesterday", "?period=all", archive, legacy, empty):
        response = request(origin, "/best-slips/browse" + suffix)
        assert response.status == 200
        html = visible_html(response.text)
        assert html.count("data-best-slips-filter-trigger") == 1
        assert html.count("data-best-slips-applied") == 1
        date_navigation = match(r'<nav\b[^>]*aria-label="Slip date"[^>]*>[\s\S]*?</nav>', html)
        date_strip = date_navigation.group()
        assert date_strip.count('aria-haspopup="dialog"') == 2
        assert date_strip.index("data-date-strip-days") < date_strip.index("data-date-strip-calendar") < date_strip.index("data-best-slips-filter-trigger")
        assert '/en/best-slips?period=custom&amp;' in date_strip
        assert '&amp;from=2026-10-12&amp;to=2026-10-12' in date_strip
        assert date_strip.count('aria-current="date"') == (0 if suffix == "?period=all" else 1)
        assert "data-best-slips-publication" not in html
        assert html.count("data-best-slips-summary") == 1
        assert "data-list-divider" not in html
        assert html.index("data-performance-heading") < date_navigation.start()
        trigger = match(r'<button\b[^>]*data-best-slips-filter-trigger="[^"]*"[^>]*>[\s\S]*?</button>', html).group()
        assert ">Filters</span>" in trigger and ">Advanced Filters</span>" in trigger
        if suffix == "?period=all":
            assert "data-best-slips-band-count" not in html
        elif suffix == legacy:
            assert "3 slips published" in html and "of 10 slips published" not in html
        elif suffix == empty:
            assert "0 of 10 slips published" in html and "every 30 minutes" in html
        else:
            assert "3 of 10 slips published" in html
        if not suffix:
            assert "Average pick probability" in html and "Whole-slip win probability" not in html
        elif suffix == archive:
            assert '&amp;probMin=80&amp;matchesMin=2' in date_strip and 'status=lost&amp;page=1' in date_strip
            assert "12-Oct-2026" in html
            assert html.count("data-slip-key=") == 1
            assert "1 of 1 slip" in html
            assert "Average pick probability" in html and "Whole-slip win probability" in html
    limited = request(origin, "/best-slips/limited")
    assert limited.status == 200
    limited_html = visible_html(limited.text)
    assert limited_html.count("data-slip-key=") == 3
    assert "qualifying slips undiscovered" not in limited_html
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
