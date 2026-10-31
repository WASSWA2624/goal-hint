"""Verify bounded stored match-data display with synthetic production fixtures."""
import json
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, run_node, visible_html, write_json
from lib.runtime import ROOT, main_guard


def main():
    args = parse_args("live match statistics and events", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("live-match")
        result = run_node(["--conditions=react-server", "--input-type=module", "--eval",
            "import {liveMatchViewScenarios,liveMatchViewNow} from './tests/helpers/live-match-view-fixtures.mjs'; process.stdout.write(JSON.stringify({snapshots:liveMatchViewScenarios,asOf:liveMatchViewNow}));"])
        write_json(directory / "app/scenarios.json", json.loads(result.stdout))
        build_fixture(directory, env, timeout=300)
    with Server(directory, env, ready="/en/live-match") as server:
        for state in ["live", "partial", "stale", "empty", "unavailable", "final", "missing"]:
            response = request(server.origin, f"/en/live-match?state={state}")
            assert response.status == 200, (state, response.status)
            html = visible_html(response.text)
            (directory / f"{state}.html").write_text(response.text, encoding="utf-8")
            assert "Match statistics &amp; events" in html and "Source: API-Football" in html
            assert "separate from the original pre-match forecast" in html
            if state == "missing":
                assert "Match statistics and events are currently unavailable" in html and "data-match-statistic" not in html
                continue
            assert "Statistics" in html and "Events" in html
            if state in ["live", "stale", "final"]:
                assert "57%" in html and "43%" in html and 'data-match-statistic="corners"' in html
                assert "<td>0</td>" in html and "Synthetic Player" in html and "Synthetic Assist" in html
                assert "45+2′" in html and "Goal" in html and "Yellow card" in html
                assert "Data retrieved" in html
            if state == "live":
                assert "Live match data" in html and "Provider updated" in html and "Updates are delayed" not in html
            elif state == "partial":
                assert "Some Statistics are missing" in html and "<td>0</td>" in html and "<td>—</td>" in html
            elif state == "stale":
                assert "Updates are delayed" in html and "Some Statistics are missing" in html
            elif state == "empty":
                assert "No match events have been reported" in html and "Statistics coverage has not been confirmed" in html
            elif state == "unavailable":
                assert "Statistics are not available" in html and "Events coverage has not been confirmed" in html
                assert "No match events have been reported" not in html
            elif state == "final":
                assert "Final match data" in html and "Updates are delayed" not in html
        for state in ["live", "partial", "stale", "empty", "unavailable", "final", "missing"]:
            response = request(server.origin, f"/en/live-match?state={state}&section=events")
            assert response.status == 200, ("events", state, response.status)
            html = visible_html(response.text)
            assert "Statistics" not in html and "data-match-statistic" not in html, state
            if state == "missing":
                assert "Match events are currently unavailable" in html and "data-match-event-timeline" not in html
                continue
            assert "Event data &amp; source" in html and "Source: API-Football" in html
            if state in ["live", "partial", "stale", "final"]:
                assert html.index('data-match-event="2"') < html.index('data-match-event="1"'), state
                assert 'data-event-symbol="yellow-card"' in html and 'data-event-symbol="goal"' in html
            if state == "empty":
                assert "No match events have been reported" in html and "data-match-event-timeline" not in html
            elif state == "unavailable":
                assert "Events coverage has not been confirmed" in html and "No match events have been reported" not in html
            elif state == "stale":
                assert "Updates are delayed" in html
            elif state == "final":
                assert "Final match data" in html and "Updates are delayed" not in html
        print("PASS 14 production match-data states: combined panel and dedicated events, including source chronology, delayed/empty/unavailable data and retained finals.", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
