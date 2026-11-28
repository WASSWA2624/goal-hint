"""Verify early production HTML, independent reports and stable summary content with delayed synthetic reads."""
import http.client
import json
import time
from pathlib import Path
from urllib.parse import urlsplit
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, run_node, visible_html, write_json
from lib.runtime import ROOT, main_guard


def stream(origin, path, headers=None):
    connection = http.client.HTTPConnection(urlsplit(origin).netloc, timeout=15)
    started = time.monotonic()
    connection.request("GET", path, headers={"Accept-Encoding": "identity", **(headers or {})})
    response = connection.getresponse()
    chunks, events = [], []
    while chunk := response.read1(65536):
        chunks.append(chunk.decode("utf-8", errors="replace"))
        events.append((time.monotonic() - started, "".join(chunks)))
    connection.close()
    return response.status, events


def verify_matches_document(origin):
    browser = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
    }
    crawler = {"User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"}
    failure = {"Cookie": "synthetic-feed-unavailable=1"}
    status, healthy = stream(origin, "/browser-matches", browser)
    assert status == 200
    shell_at, shell = next((at, html) for at, html in healthy if "data-app-loading" in html)
    list_at = next(at for at, html in healthy if "data-feed-match-results" in html)
    assert "data-feed-match-results" not in shell
    assert list_at >= 1.7 and list_at - shell_at > 1, (shell_at, list_at)
    assert healthy[-1][0] < list_at + 2, (list_at, healthy[-1][0])
    assert 'rel="canonical" href="https://goalhint.com/en/matches"' in healthy[-1][1]
    assert 'data-feed-performance-state="loading"' in healthy[-1][1]
    assert 'data-feed-performance-deferred="true"' in healthy[-1][1]
    assert 'data-feed-performance-state="ready"' not in healthy[-1][1]
    status, filtered = stream(origin, "/browser-matches?country=England", browser)
    assert status == 200 and "data-feed-match-results" in filtered[-1][1]
    assert any("data-app-loading" in html and "data-feed-match-results" not in html for _, html in filtered)
    assert 'content="noindex, follow"' in filtered[-1][1]
    worker_browser = {
        **browser, "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "same-origin", "Sec-Fetch-Site": "same-origin",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    status, worker = stream(origin, "/browser-matches?result=won&when=today&sort=live-first&picks=all", worker_browser)
    assert status == 200
    worker_shell_at = next(at for at, html in worker if "data-app-loading" in html)
    worker_list_at = next(at for at, html in worker if "data-feed-match-results" in html)
    assert worker_list_at >= 1.7 and worker_list_at - worker_shell_at > 1, (worker_shell_at, worker_list_at)
    status, outage = stream(origin, "/browser-matches", {**browser, **failure})
    assert status == 200 and 'data-feed-initial-retry="true"' in outage[-1][1]
    assert "data-feed-list-recovery" not in outage[-1][1]
    assert any("data-app-loading" in html and "data-feed-initial-retry" not in html for _, html in outage)
    assert "data-feed-match-results" not in outage[-1][1]
    status, crawler_healthy = stream(origin, "/browser-matches", crawler)
    assert status == 200 and 'data-feed-performance-state="ready"' in crawler_healthy[-1][1]
    assert crawler_healthy[-1][0] > list_at + 4, (list_at, crawler_healthy[-1][0])
    status, robot = stream(origin, "/browser-matches", {**crawler, **failure})
    assert status >= 500 and robot[0][0] >= 1.7, status
    return {"browser_shell_ms": round(shell_at * 1000), "browser_list_ms": round(list_at * 1000),
        "browser_document_complete_ms": round(healthy[-1][0] * 1000),
        "worker_browser_shell_ms": round(worker_shell_at * 1000), "worker_browser_list_ms": round(worker_list_at * 1000),
        "crawler_document_complete_ms": round(crawler_healthy[-1][0] * 1000),
        "crawler_outage_ms": round(robot[0][0] * 1000), "crawler_outage_status": status}


def main():
    args = parse_args("application loading", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("app-loading")
        result = run_node(["--conditions=react-server", "--input-type=module", "--eval",
            "import {performancePageScenarios as performance} from './tests/helpers/performance-page-fixtures.mjs';"
            "import {liveFeed} from './tests/helpers/live-refresh-fixtures.mjs';"
            "process.stdout.write(JSON.stringify({performance,feed:liveFeed(),summary:{access:{tier:'full',signedIn:false},asOf:1,paginationVersion:'a'.repeat(64),"
            "performance:{total:16,won:10,lost:3,pending:2,void:1,cancelled:0,unavailable:0}}}));"])
        write_json(directory / "app/scenarios.json", json.loads(result.stdout))
        build_fixture(directory, env, timeout=300)
    with Server(directory, env) as server:
        status, events = stream(server.origin, "/en/performance?stream=1")
        assert status == 200
        shell_at = next(at for at, html in events if 'data-performance-dashboard' in html)
        history_at = next(at for at, html in events if 'data-published-slip=' in html)
        report_at = next(at for at, html in events if 'data-prediction-performance=' in html)
        assert shell_at < 1.3 and history_at < report_at, (shell_at, history_at, report_at)
        early = visible_html(next(html for _, html in events if 'data-performance-dashboard' in html))
        for text in ["Individual predictions", "Published Best Slips", "Results by league", "Apply"]:
            assert text in early, text
        assert 'aria-busy="true"' in early
        _, blocked = stream(server.origin, "/en/performance?stream=1&blocking=1")
        blocked_at = next(at for at, html in blocked if 'data-performance-dashboard' in html)
        assert blocked_at > 1.6 and shell_at < blocked_at / 2, (shell_at, blocked_at)
        status, events = stream(server.origin, "/en/matches")
        assert status == 200
        early = next(html for at, html in events if at < 1.3 and 'data-performance-summary="matches"' in html)
        for text in ["Today’s performance", "Won", "Lost", "Pending", "Void", "Cancelled"]:
            assert text in visible_html(early), text
        assert 'aria-busy="true"' in early
        ready = visible_html(events[-1][1])
        assert 'data-summary-count="all">55<' in ready
        assert "data-summary-predicted" not in ready and "data-summary-unavailable" not in ready
        assert request(server.origin, "/en/matches?page=0").status == 404
        status, home = stream(server.origin, "/en/best-slips")
        assert status == 200
        home_early = next(html for at, html in home if at < 1.3 and 'data-best-slips-loading' in html)
        assert 'data-slip-result="won"' in home_early and 'data-performance-period' in home_early
        assert 'data-best-slips-page' in home[-1][1]
        assert request(server.origin, "/en?when=today").status == 308
        for state in ["unapproved", "reviewed", "priced-picks", "second", "outside", "empty", "unavailable", "pinned", "leagues", "league-outside"]:
            response = request(server.origin, f"/en/performance?state={state}")
            assert response.status == 200 and 'data-performance-dashboard' in response.text
            assert "999999.99" not in response.text and "private-pending" not in response.text
        measurements = {"streamed_shell_ms": round(shell_at * 1000), "blocking_shell_ms": round(blocked_at * 1000),
            "history_ms": round(history_at * 1000), "predictions_ms": round(report_at * 1000),
            **verify_matches_document(server.origin)}
        write_json(directory / "loading-measurements.json", measurements)
        print(f"PASS production loading and 10 complete dashboard states: {json.dumps(measurements)}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
