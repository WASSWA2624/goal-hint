"""Inspect production performance HTML from synthetic counts, reviewed metrics and archived outcomes."""
import json
import re
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, run_node, visible_html, write_json
from lib.runtime import ROOT, main_guard


def main():
    args = parse_args("public performance", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("performance")
        result = run_node(["--conditions=react-server", "--input-type=module", "--eval",
            "import {performancePageScenarios} from './tests/helpers/performance-page-fixtures.mjs'; process.stdout.write(JSON.stringify(performancePageScenarios));"])
        write_json(directory / "app/scenarios.json", json.loads(result.stdout))
        build_fixture(directory, env, timeout=300)
    with Server(directory, env, ready="/en/performance") as server:
        for state in ["unapproved", "reviewed", "second", "outside", "empty", "unavailable", "pinned", "leagues", "league-outside", "returns"]:
            response = request(server.origin, f"/en/performance?state={state}")
            assert response.status == 200, (state, response.status)
            html = visible_html(response.text)
            (directory / f"{state}.html").write_text(response.text, encoding="utf-8")
            assert 'data-performance-dashboard' in html and "Results &amp; performance" in html
            assert "Filter performance" in html and 'method="get"' in html
            assert "From date" in html and "Prediction market" in html and "Prediction source" in html
            form = re.search(r'<form\b[^>]*aria-label="Filter performance"[\s\S]*?</form>', html).group()
            assert not re.search(r'<input\b[^>]*name="(?:model|version)"', form), "native Apply must not retain hidden advanced constraints"
            assert "999999.99" not in response.text and "private-pending" not in response.text, "active quotes/identities leaked"
            assert "987.65" not in response.text, "void/pending prediction quotes must never reach a price aggregate"
            if state in ["unapproved", "reviewed", "second"]:
                assert "Illustrative ROI" in html and "17.5%" in html
                assert "Illustration only" in html and "no refund or adjusted payout is assumed" in html
                assert "Historical slip win rate" in html and "50%" in html
                assert "Published slips" in html and "Pending" in html
            if state == "unapproved":
                assert "Quality metrics awaiting review" in html and "Reviewed sample metrics" not in html
                assert "Illustrative returns" in html and "Original odds are not published beside individual predictions yet" in html
                assert 'data-prediction-returns="unavailable"' in html and "Longest losing streak" in html
                assert "Calibration by probability band" not in html
                assert "Won" in html and "Lost" in html and "2.35" in html
                assert html.count('data-published-slip=') == 2
            elif state == "reviewed":
                assert "Reviewed sample metrics" in html and "Calibration by probability band" in html and "Confidence interval" in html
            elif state == "second":
                assert html.count('data-published-slip=') == 1 and "No settled score" in html and "Void" in html
            elif state == "outside":
                assert "This publication page is outside the selected period" in html and "View first page" in html
            elif state == "empty":
                assert "No predictions in this period" in html and "No completed publications in this period" in html
            elif state == "unavailable":
                assert "Prediction performance is temporarily unavailable" in html and "Published-slip history is temporarily unavailable" in html
            elif state == "leagues":
                assert "Results by league" in html and "Unknown league" in html and "League result pages" in html
                assert html.count('data-league-performance=') == 3 and "the same source, market and review rules" in html
                assert "leaguePage=1" not in html and "leaguePage=2" in html
                assert "&lt;script&gt;synthetic-league-marker&lt;/script&gt;" in html, "competition names must render as escaped text"
            elif state == "league-outside":
                assert "This league page is outside the selected period" in html and "View first league page" in html
            elif state == "returns":
                block = re.search(r'<div data-prediction-returns="available">[\s\S]*?</div></div>', html)
                assert block and "Illustrative returns" in block.group(), "available individual returns render"
                assert "30%" in html and "0.6 units" in html and "2.6 units" in html and "2.05" in html
                assert "1 settled predictions have no odds recorded at publication" in html
                assert "1 settled predictions had no current public odds when published" in html
                assert "Original odds are not published beside individual predictions yet" not in html
            assert 'href="/en/performance' in html
        print("PASS 10 production performance states: reviewed/unapproved metrics, full-period slip and individual returns, slip/league pagination, unknown league, empty/outage states, active-quote omission and native filter reset.", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
