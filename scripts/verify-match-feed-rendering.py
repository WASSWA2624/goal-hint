"""Build and inspect SQL-backed feed, detail, revision and live-clock fixtures."""
from copy import deepcopy
from datetime import datetime, timezone
import html as html_module
import json
import re
import shutil
from urllib.parse import urljoin, urlsplit

from lib.capture_rendering import captured_directory, unique_options
from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, run_node, visible_html, write_json
from lib.runtime import main_guard

PREDICTION_LABELS = {
    "home-win": "Home win", "draw": "Draw", "away-win": "Away win",
    "home-or-draw": "Home or draw", "away-or-draw": "Away or draw", "home-or-away": "Home or away",
    "over-2.5": "Over 2.5", "under-2.5": "Under 2.5",
    "yes": "Both teams to score", "no": "Not both teams to score",
}


def iso(value):
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def prepare(args):
    include_history = args.history or args.live
    include_detail = args.detail or include_history
    if args.reuse:
        directory = captured_directory(args.reuse, "match-feed")
        log = (directory / "database.log").read_text(encoding="utf-8")
        match(r"\bfail 0\b", log)
        no_match(r"\bfail [1-9]", log)
    else:
        directory = create_fixture("match-feed")
        env = environment(MATCH_FEED_PAGE_CAPTURE=str(directory / "scenarios.json"))
        files = ["tests/feed-page.integration.mjs"]
        if include_detail:
            env["MATCH_DETAIL_PAGE_CAPTURE"] = str(directory / "detail-scenarios.json")
            files.append("tests/match-detail.integration.mjs")
        run_node(["--conditions=react-server", "--test", "--test-concurrency=1", *files],
            ROOT, directory / "database.log", env, 360)
    scenarios = json.loads((directory / "scenarios.json").read_text(encoding="utf-8"))
    details = json.loads((directory / "detail-scenarios.json").read_text(encoding="utf-8")) if include_detail else None
    assert len(scenarios["today"]["result"]["data"]["records"]) == 30, "Real MySQL acceptance cannot be skipped."
    if details:
        assert len(details["open"]["data"]["snapshot"]["markets"]) == 4 and details["navigation"]["data"], "Genuine detail projections required."
        long = deepcopy(details["open"])
        long["data"]["fixture"]["homeTeam"]["name"] = "InternationalHomeIdentifier" * 18
        long["data"]["fixture"]["awayTeam"]["name"] = "InternationalAwayIdentifier" * 18
        details["long-names"] = long
        unsafe = deepcopy(details["open"])
        url = "https://localhost/private?token=synthetic-secret"
        unsafe["data"]["snapshot"]["analysis"]["sources"][0].update(url=url, title="<script>window.sourceExecuted=true</script>")
        unsafe["data"]["snapshot"]["analysis"]["reasons"][0]["sourceUrls"] = [url]
        details["unsafe-links"] = unsafe
        delayed = deepcopy(details["open"])
        delayed["data"]["fixture"]["update"].update(prediction="delayed", result="delayed")
        delayed["data"]["fixture"]["forecast"]["updateDelayed"] = True
        delayed["data"]["fixture"]["partialCoverage"] = True
        details["delayed-partial-coverage"] = delayed
        details["failure"], details["busy"] = {"data": None, "error": "unavailable"}, {"data": None, "error": "rate-limited"}
    create_fixture("match-feed", directory=directory)
    for variant, enabled in [("match-feed-detail", include_detail), ("match-feed-live", args.live)]:
        if enabled:
            shutil.copytree(ROOT / "tests/helpers/rendering" / variant, directory, dirs_exist_ok=True)
    write_json(directory / "app/scenarios.json", scenarios)
    if details:
        write_json(directory / "app/detail-scenarios.json", details)
    if args.live:
        write_json(directory / "live-clock.json", {"now": 1791536400000})
        for target in (directory / "app").rglob("*"):
            if target.suffix in (".ts", ".tsx"):
                target.write_text(target.read_text(encoding="utf-8").replace('"__LIVE_CLOCK_PATH__"',
                    json.dumps(str(directory / "live-clock.json"))), encoding="utf-8")
    return directory, scenarios, details


def get(origin, path):
    response = request(origin, path)
    assert response.status == 200, path
    assert response.headers.get("set-cookie") is None
    return response.text, visible_html(response.text)


def verify_feed(origin, directory, scenarios):
    empty_titles = {
        "no-fixtures": "No fixtures confirmed",
        "no-filter-matches": "No matches for these filters",
        "data-unavailable": "Fixture data unavailable",
        "page-out-of-range": "Match page unavailable",
    }
    for name, scenario in scenarios.items():
        html, visible = get(origin, f"/cases/{name}")
        (directory / f"{name}.html").write_text(html, encoding="utf-8")
        assert 0 <= html.find("data-styled=") < html.find("<main"), name + ": CSS before content"
        assert len(re.findall(r"<h1[\s>]", visible)) == 1
        # Expanding filters needs no extra fetch: range fields render once in the initial document.
        assert len(re.findall(r'<input\b[^>]*type="date"', visible)) == 2
        time_inputs = re.findall(r'<input\b[^>]*type="time"[^>]*>', visible)
        assert len(time_inputs) == 2
        time_range = scenario["query"].get("time") or {"from": "00:00", "to": "23:59"}
        for field, bound in zip(time_inputs, ("from", "to")):
            match(r'\bvalue="' + re.escape(time_range[bound]) + r'"', field)
        for label in ["From date", "To date", "From time", "To time"]:
            match(label, visible)
        match(r'aria-label="Reset filters"', visible)
        match(r'aria-label="Advanced filters(?:, [^"]+ active)?"', visible)
        no_match("Clear filters", visible)
        filter_form = match(r'<form\b[^>]*aria-label="Search and filter matches"[\s\S]*?</form>', visible).group()
        form_id = match(r'\bid="([^"]+)"', filter_form).group(1)
        submit_buttons = [button for button in re.findall(r'<button\b[^>]*>', visible)
            if 'type="submit"' in button and f'form="{form_id}"' in button]
        # The existing chrome has desktop actions and the phone sheet footer, sharing one form.
        assert len(submit_buttons) == 2
        assert all('aria-label="Apply filters"' in button for button in submit_buttons)
        no_match('role="slider"|With predictions|Any time|Specific time', visible)
        # 062 supplies this control in both layouts; these fixtures have full access.
        picks_filters = re.findall(r'<label\b[^>]*>(<input\b[^>]*type="checkbox"[^>]*>)Predictions only</label>', visible)
        assert len(picks_filters) == 2 and all('disabled' not in field for field in picks_filters)
        articles = re.findall(r'(<article\b[^>]*data-fixture-id="([^"]+)"[^>]*>)([\s\S]*?)</article>', visible)
        data = scenario["result"].get("data")
        if data and data["state"] not in ("ready", "insufficient-data"):
            heading = match(r'<h2\b[^>]*>' + re.escape(empty_titles[data["state"]]) + r'</h2>', visible)
            assert visible.index(submit_buttons[0]) < heading.start(), name + ": filter actions before empty state"
        records = data["records"] if data else []
        assert [article[1] for article in articles] == [record["fixtureId"] for record in records]
        for (tag, _, article), record in zip(articles, records):
            no_match(r'\baria-describedby=', tag)
            no_match(r'<(?:ul|ol)\b|\bid="[^"]*-notes"|\baria-describedby="[^"]*-notes', article)
            no_match("Update delayed|Limited news coverage|Partial coverage|Prediction update in progress|"
                     "No prediction was locked for this market", article)
            assert record["homeTeam"]["name"] in article and record["awayTeam"]["name"] in article
            match("Kickoff: |Kickoff unavailable", article)
            match("prediction: |prediction unavailable", article)
            for pick in re.findall(r'data-pick-selection=""[^>]*>([^<]+)</span>', article):
                assert pick in PREDICTION_LABELS.values(), name + ": generic full-word prediction"
            no_match(r'>(?:1X2|DC|BTTS|O/U 2\.5)</span>', article)
            assert len(re.findall(r"<a\b", article)) == 1
            if record["kickoffAt"] is not None:
                assert iso(record["kickoffAt"]) in article
            if record.get("forecast"):
                match(r"Published: [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{2}:\d{2} EAT", article)
            no_match(r"/_next/image|\s\$[\w-]+=", article)
        # The ascending cohort contains the two published fixtures; the latest-first page does not.
        if name == "earliest":
            match(r'data-prediction="(?!none)', visible)
            match("No prediction locked", visible)
        no_match("prediction jobs completed|Partial fixture coverage|Prediction data unavailable|Score and result updates delayed", visible)
        if name == "historical":
            for pattern in ["Locked prediction", "Final score", 'data-outcome="correct"']:
                match(pattern, visible)
        if name == "empty":
            match("No fixtures confirmed", visible)
        if name in ("partial", "partial-empty", "failed-import", "unknown"):
            no_match("No fixtures confirmed", visible)
        if name == "failure":
            match("Matches temporarily unavailable", visible)
            match("Try again", visible)
            no_match("No fixtures confirmed|prediction jobs completed", visible)
        if name == "outside":
            match("Predictions start within 7 days", visible)
            match("Predictions become available within seven days of the match", visible)  # Accessible full reason.
        else:
            no_match("Predictions become available within seven days of the match", visible)
        if name in ("not-started", "selecting"):
            no_match(r"of \d+ prediction jobs completed", visible)
    print(f"PASS {len(scenarios)} anonymous server-rendered scenarios: stored cards/clocks, initial CSS, coverage/errors, current/locked forecasts and EAT window.")


def verify_detail(origin, directory, scenarios):
    def escape(value):
        return html_module.escape(value, quote=True)
    count = 0
    for name, scenario in scenarios.items():
        if name.startswith("history-"):
            continue
        count += 1
        html, visible = get(origin, f"/detail-cases/{name}")
        no_match("Score and result updates delayed", visible)
        (directory / f"detail-{name}.html").write_text(html, encoding="utf-8")
        assert 0 <= html.find("data-styled=") < html.find("<main"), name + ": CSS before content"
        assert len(re.findall(r"<h1[\s>]", visible)) == 1
        if not scenario.get("data"):
            match("Match temporarily unavailable", visible)
            match("Try again", visible)
            continue
        fixture, snapshot = scenario["data"]["fixture"], scenario["data"]["snapshot"]
        assert escape(fixture["homeTeam"]["name"]) in visible and escape(fixture["awayTeam"]["name"]) in visible
        assert visible.count("data-detail-market=") == 4, name
        match('data-match-detail', visible)
        match('data-section="markets"', visible)
        match('All Markets &amp; Odds', visible)
        no_match(r"/_next/image|\s\$[\w-]+=", visible)
        if snapshot:
            assert f'data-detail-revision="{snapshot["revisionId"]}"' in visible
            record = match(r'<p\b[^>]*data-prediction-record="true"[^>]*>([\s\S]*?)</p>', visible).group(1)
            for source in {item["source"]["kind"] for item in snapshot["markets"]}:
                match("AI prediction" if source == "ai" else "API-Football", record)
            if any(item["source"]["provisional"] for item in snapshot["markets"]):
                match("Provisional estimate", record)
            statuses = {"current": "Current prediction", "locked": "Locked prediction", "historical": "Historical publication", "void": "Void cycle"}
            match(statuses[snapshot["applicability"]], record)
            for item in snapshot["markets"]:
                family = item["market"]["family"]
                assert item["market"]["period"] == "regulation-including-stoppage-time"
                _, panel = get(origin, f"/detail-cases/{name}?market={family}")
                match(f'data-market-panel="{family}"', panel)
                prediction = re.escape(PREDICTION_LABELS[item["market"]["selection"]])
                match(r'>Our prediction</dt><dd><strong>' + prediction + r'(?:<|$)', panel)
                rounded = int(item["market"]["selectedProbability"] * 100 + 0.5)
                match(r'>Estimated probability</dt><dd><b>' + str(rounded) + r'%</b>', panel)
                for selection in item["market"]["probabilities"]:
                    match(r'<li\b[^>]*><span>' + re.escape(PREDICTION_LABELS[selection]) + r'(?:<| ·)', panel)
                assert iso(snapshot["publishedAt"]) in panel
                outcome = next((entry for entry in snapshot["outcomes"] if entry["family"] == family), None)
                if snapshot["applicability"] != "historical":
                    status = outcome["status"] if outcome else "pending"
                    match(f'data-outcome="{status}"', panel)
                if name == "unsafe-links":
                    no_match(r'href="https://localhost|href="javascript:|<script>', panel)
                    match("original explanation is unavailable", panel)
                elif snapshot["analysis"]["state"] == "available":
                    for reason in snapshot["analysis"]["reasons"]:
                        assert escape(reason["text"]) in panel, name + ": original reason text"
                else:
                    match("original explanation is unavailable", panel)
        else:
            match('data-detail-revision=""', visible)
            match('data-featured-pick="none"', visible)
        if name == "closed-without-lock":
            match('data-featured-pick="none"', visible)
    data = scenarios["open"]["data"]
    assert request(origin, "/en/matches/00000000-0000-4000-8000-000000000000/unknown").status == 404
    stale = request(origin, f'/en/matches/{data["fixture"]["fixtureId"]}/old-name')
    assert stale.status == 308
    assert urlsplit(urljoin(origin, stale.headers.get("location"))).path == data["route"]["path"]
    html, _ = get(origin, data["route"]["path"])
    assert "https://goalhint.com" + data["route"]["path"] in html
    match('property="og:title"', html)
    match("noindex, follow", html)
    _, stats = get(origin, data["route"]["path"] + "?section=stats")
    match('data-section="stats"', stats)
    match("Team Comparison", stats)
    print(f"PASS {count} stored detail HTML scenarios, canonical metadata/redirect and unknown-fixture 404.")


def verify_history(origin, directory, scenarios):
    current, old, partial = (scenarios[name]["data"] for name in ["history-current", "history-old", "history-partial"])
    path = current["route"]["path"]
    _, primary = get(origin, path + "?section=history")
    match("data-revision-history", primary)
    no_match("data-history-snapshot=", primary)
    for name, data in [("old", old), ("partial", partial)]:
        html, visible = get(origin, path + f'?revision={data["snapshot"]["revisionId"]}&limit=1&section=history')
        (directory / f"history-{name}.html").write_text(html, encoding="utf-8")
        assert f'data-detail-revision="{current["snapshot"]["revisionId"]}"' in visible
        assert f'data-history-snapshot="{data["snapshot"]["revisionId"]}"' in visible
        match("Historical prediction snapshot", visible)
        match("Historical publication", visible)
        assert visible.count("data-detail-market=") == 8
        history = visible[visible.index('data-history-snapshot="'):]
        for item in data["snapshot"]["markets"]:
            prediction = re.escape(PREDICTION_LABELS[item["market"]["selection"]])
            match(r'>Prediction: <strong>' + prediction + r'</strong>', history)
            for alternative in item["alternatives"]:
                match(r'>' + re.escape(PREDICTION_LABELS[alternative["selection"]]) + r'</p>', history)
        assert len(re.findall(r"<article\b", visible)) == 1
        match("noindex, follow", html)
        assert f'href="https://goalhint.com{path}"' in html
        no_match("candidateJson|promptVersion|private-void-proof|rawJson", visible)
        if name == "partial":
            match("does not contain a supported probability group", visible)
        ids = re.findall(r'\sid="([^"]+)"', visible)
        assert len(ids) == len(set(ids))
    revision = old["snapshot"]["revisionId"]
    for query in [f'revision={scenarios["open"]["data"]["snapshot"]["revisionId"]}',
        "revision=00000000-0000-4000-8000-000000000000", "revision=bad", f'revision={revision}&cycle={old["snapshot"]["cycleId"]}',
        "limit=21", "revisionBefore=1", f"revision={revision}&revision={revision}"]:
        assert request(origin, path + "?" + query).status == 404, query
    _, failed = get(origin, path + f"?revision={revision}&limit=20&section=history")
    match("data-history-error", failed)
    assert f'data-detail-revision="{current["snapshot"]["revisionId"]}"' in failed
    match("Try again", failed)
    match("data-history-revision=", failed)
    _, retried = get(origin, path + f"?revision={revision}&limit=20&section=history")
    match("data-history-snapshot=", retried)
    no_match("data-history-error", retried)
    print("PASS revision history: primary/historical/partial snapshots, fixture-scoped 404, canonical noindex, unique IDs and inline failure/retry.")


def main():
    unique_options("--reuse")
    args = parse_args("match feed", ("--detail", "--history", "--live", "--reuse"))
    directory, scenarios, details = prepare(args)
    print(f"Building isolated match feed: {directory}", flush=True)
    build_fixture(directory)
    with Server(directory, ready="/en") as server:
        verify_feed(server.origin, directory, scenarios)
        if details:
            verify_detail(server.origin, directory, details)
        if args.history or args.live:
            verify_history(server.origin, directory, details)
        label = "037" if args.live else "036" if args.history else "035" if args.detail else "032"
        write_json(ROOT / f".tmp/{label}-rendering-target.json", {"directory": str(directory), "origin": server.origin})
        print(f"Fixture artifacts: {directory}\nFixture browser URL: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
