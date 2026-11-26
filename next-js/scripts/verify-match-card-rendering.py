"""Build real card components and verify their anonymous production markup."""
from html import unescape
import re
import shutil
from urllib.parse import urlencode

from lib.rendering import ROOT, Server, build_fixture, create_fixture, match, no_match, parse_args, request, visible_html, write_json
from lib.runtime import main_guard, service


def verify(origin, directory):
    response = request(origin)
    assert response.status == 200
    assert response.headers.get("set-cookie") is None
    html = response.text
    (directory / "initial.html").write_text(html, encoding="utf-8")
    visible = visible_html(html)
    no_match("Score and result updates delayed", visible)
    articles = re.findall(r'(<article\b[^>]*data-fixture-id="([^"]+)"[^>]*>)([\s\S]*?)</article>', visible)
    assert len(articles) == 15
    by_id = {fixture_id: article for _, fixture_id, article in articles}
    assert len(by_id) == len(articles), "Responsive rendering must not duplicate fixture identities in server HTML."
    no_match("data-match-table-header", visible, "Matches no longer renders the former desktop-only column labels.")
    assert 0 <= html.find("data-styled=") < html.find("<main")
    for tag, fixture_id, article in articles:
        match(r'data-mobile-design="team-stack"', tag)
        no_match(r'\baria-describedby=', tag)
        no_match(r'<(?:ul|ol)\b|\bid="[^"]*-notes"|\baria-describedby="[^"]*-notes', article)
        no_match("Update delayed|Limited news coverage|Partial coverage|Prediction update in progress|"
                 "No prediction was locked for this market|Postponed before play", article)
        order = ["<header", 'data-team-side="home"', 'data-team-side="away"', "data-prediction=", "View analysis"]
        positions = [article.find(item) for item in order]
        assert all(position >= 0 and (index == 0 or position > positions[index - 1])
            for index, position in enumerate(positions)), "Card reading order"
        header = re.search(r"<header\b[^>]*>([\s\S]*?)</header>", article).group(1)
        assert header.find("data-kickoff") < header.find("data-ledger-competition"), "Compact kickoff precedes the league and country"
        match(r'<svg[^>]*aria-hidden="true"[^>]*focusable="false"', article)
        assert len(re.findall(r"<a\b", article)) == 1, "One keyboard destination per card"
        match(r"prediction: [^<]+, estimated probability|prediction unavailable", article)
        outcome = match(r'data-outcome="(correct|incorrect|pending|void|unavailable)"', article).group(1)
        fixture_status = match(r'data-status="([^"]+)"', tag).group(1)
        if fixture_status == "scheduled":
            result = "pending" if fixture_id == "card-overdue" else "upcoming"
        else:
            result = fixture_status if fixture_status in {"live", "postponed", "unknown"} or outcome == "unavailable" else outcome
        assert article.count(f'data-result-badge="{result}"') == 1, f"One truthful fixture/prediction result for {fixture_id}"
        if result != "live":
            label = {"upcoming": "Upcoming", "correct": "Won", "incorrect": "Lost", "pending": "Pending",
                "void": "Void", "finished-regulation": "Finished", "postponed": "Postponed", "unknown": "Unknown"}[result]
            match(rf'data-result-badge="{result}"[^>]*>[\s\S]*?<span data-pick-value[^>]*>{label}</span>', article)
        if fixture_status != "scheduled":
            no_match(r'data-result-badge="upcoming"', article)
        no_match(r"\s(?:\$[\w-]+|tone|variant|loaded)=", article)
        kickoff = re.findall(r'<time\b(?=[^>]*\bdata-kickoff(?:\s|=|>))([^>]*)>([\s\S]*?)</time>', article)
        if 'data-fixture-id="card-unknown"' in tag:
            assert not kickoff, "Unknown kickoff must not invent a time element"
            fallback = match(r'<p\b(?=[^>]*\bdata-kickoff-unknown(?:\s|=|>))([^>]*)>([\s\S]*?)</p>', article)
            match(r'\bdata-kickoff(?:\s|=|>)', fallback.group(1))
            no_match(r'\bdatetime=|\bdata-kickoff-(?:time|zone)(?:\s|=|>)', fallback.group(0), flags=re.IGNORECASE)
            match(r'data-kickoff-date[^>]*>Kickoff unavailable</span>', fallback.group(2))
        else:
            assert len(kickoff) == 1, "Known kickoff retains one semantic time element at every viewport"
            attributes, parts = kickoff[0]
            match(r'\bdatetime="2026-10-09T09:00:00\.000Z"', attributes, flags=re.IGNORECASE)
            match(r'\btitle="Oct 9, 2026, 12:00 EAT"', attributes)
            match(r'data-kickoff-date[^>]*><span data-mobile-only[^>]*>9-Oct</span><span data-desktop-only[^>]*>9-Oct-2026</span>', parts)
            match(r'data-kickoff-time[^>]*>12:00 EAT</span>', parts)
        if 'data-prediction="none"' in article:
            no_match(r"data-pick-odds=|data-pick-price=|data-probability-meter=", article)
        else:
            assert article.count('data-pick-odds=""') <= 1, "An available price appears once after the shown prediction"
            assert article.count('data-probability-meter=""') == 1, "One decorative meter for the shown probability"
            no_match(r"Odds", header)
            picks = re.findall(r'data-pick-selection=""[^>]*>([^<]+)</span>', article)
            assert len(picks) == 1 and re.fullmatch(r"1|X|2|1X|X2|12|[OU] \d+(?:\.\d+)?|Yes|No", picks[0]), "One recognized betting code per card, with the full meaning retained"
            match(r'data-pick-selection=""[^>]*title="[^\"]+"', article)
            match(r'<span\b[^>]*data-pick-line=""[^>]*><span\b[^>]*data-pick-selection=""[^>]*>[^<]+</span>'
                  r'<small\b[^>]*data-forecast-source="[^"]+"[^>]*title="[^"]+"[^>]*>\s*<svg\b', article)
        assert len(re.findall(r'\bdata-card-odds=', article)) == 1, "One price cell serves both phone and desktop layouts"
        match(r'data-ledger-field="odds"[^>]*data-stack-label="Odds:"', article)
        match(r'data-ledger-field="probability"[^>]*data-stack-label="Prob:"', article)
        no_match(r'data-pick-price=""[^>]*>@', article)
        no_match(r"\(—\)", article)
    for card, status in [("card-correct", "correct"), ("card-incorrect", "incorrect"), ("card-pending", "pending"),
        ("card-void", "void"), ("card-unavailable", "unavailable"), ("card-missing-family", "unavailable")]:
        match(f'data-outcome="{status}"', by_id[card])
    for card, status, label in [("card-correct", "correct", "Won"), ("card-incorrect", "incorrect", "Lost"),
        ("card-delayed", "upcoming", "Upcoming"),
        ("card-limited", "upcoming", "Upcoming")]:
        article = by_id[card]
        assert article.count(f'data-result-badge="{status}"') == 1
        match(rf'data-result-badge="{status}"[^>]*>[\s\S]*?<span data-pick-value[^>]*>{label}</span>', article)
    for card in ["card-delayed", "card-limited"]:
        match(r'data-outcome="pending"', by_id[card])
        no_match(r'data-result-badge="pending"|data-pick-value[^>]*>Pending</span>', by_id[card])
    for card in ["card-unavailable", "card-missing-family"]:
        match(r'data-result-badge="finished-regulation"[^>]*>[\s\S]*?<span data-pick-value[^>]*>Finished</span>', by_id[card])
        no_match(r'data-pick-value[^>]*>(?:0%|Pending)</span>', by_id[card])
        match(r'data-pick-value[^>]*>No prediction</span>', by_id[card])
        match(r'data-pick-state="none"', by_id[card])
        match(r'<b data-mobile-only=""[^>]*>No prediction</b>', by_id[card])
    for card, state in [("card-correct", "settled"), ("card-incorrect", "settled"), ("card-void", "settled"), ("card-pending", "open")]:
        match(f'data-pick-state="{state}"', by_id[card])
    match(r'data-pick-selection=""[^>]*>1</span>', by_id["card-correct"])
    match(r'data-mobile-only=""[^>]*>1X2</span>', by_id["card-unavailable"])
    match(r'data-desktop-only=""[^>]*>Match result</span>', by_id["card-unavailable"])
    match(r'data-card-odds[^>]*>1\.85</span>', by_id["card-correct"])
    match(r'data-card-odds="[^"]*"[^>]*data-pick-price=""[^>]*>1\.85</span>', by_id["card-correct"])
    assert by_id["card-correct"].count('data-pick-price=""') == 1, "One shared cell shows the original selected price"
    match(r'data-card-odds[^>]*>—</span>', by_id["card-incorrect"])
    match(r'data-pick-price=""[^>]*>—</span>', by_id["card-incorrect"])
    match(r'data-odds-kind="historical-pre-match"[^>]*>2\.0123</span>', by_id["card-recovered"])
    match(r'data-ledger-field="probability"[^>]*>[\s\S]*?data-pick-value[^>]*>54%</span>', by_id["card-incorrect"])
    no_match(r'data-caption=|>likely</span>', visible)
    match("Odds: 1.85", by_id["card-correct"])
    no_match(r"Odds 2\.10", by_id["card-correct"])
    no_match(r"Odds 2\.10|Odds 2\.25|data-selected-odds=", by_id["card-incorrect"])
    no_match(r"data-pick-odds=", by_id["card-incorrect"])
    match("Odds: Unavailable", by_id["card-incorrect"])
    match(r'data-pick-selection=""[^>]*>U 2\.5</span>', by_id["card-long"])
    match(r'data-pick-selection=""[^>]*>No</span>', by_id["card-limited"])
    match(r'<span\b(?=[^>]*data-country-name)(?=[^>]*title="Bosnia and Herzegovina")[^>]*><span data-mobile-only[^>]*>BIH</span><span data-desktop-only[^>]*>Bosnia &amp; Herz\.</span>',
          by_id["card-long"])
    match(r'data-card-odds[^>]*>9999\.99</span>', by_id["card-long"])
    match(r'<article[^>]*data-fixture-id="card-any"[^>]*data-market="double-chance"', visible)
    match("Double chance prediction: Home or draw, estimated probability 82%", by_id["card-any"])
    no_match(r"data-selected-odds=|Odds: 1\.85|Odds: 2\.10", by_id["card-any"])
    no_match(r"Final score:|Live score:|data-live-minute=", by_id["card-delayed"])
    no_match(r">0</span><span>–</span><span>0<", by_id["card-delayed"])
    # Mobile live badges show the observed clock, with the phase beside the scores.
    match(r'data-match-status="live"[^>]*>[\s\S]*?data-match-live-dot[\s\S]*?data-status-clock[^>]*>Live(?:\s|<!-- -->)*<span[^>]*data-live-elapsed[^>]*>67:00</span>', by_id["card-pending"])
    no_match(r'data-result-badge="pending"', by_id["card-pending"])
    no_match(r">(?:vs|VS)<", by_id["card-pending"])
    checks = {
        "card-correct": ["Final score: Example Home FC 2, Example Away FC 1", "Match result prediction: Home win, estimated probability 54%", ">FT<", "AI prediction"],
        "card-pending": ['data-live-minute="67"', "Live, 2nd half, 67 minutes played", "Live score: Example Home FC 2, Example Away FC 0"],
        "card-delayed": ["Oct 9, 2026, 00:18 EAT"],
        "card-incorrect": ["API-Football fallback"], "card-limited": ["AI prediction"],
        "card-partial": ["API-Football fallback"], "card-void": ['data-outcome="void"'],
    }
    for card, patterns in checks.items():
        for pattern in patterns:
            assert pattern in by_id[card], f"{card}: {pattern}"
    match("Less than 1%", visible)
    match("More than 99%", visible)
    no_match(r">0%<|>100%<|/_next/image", visible)
    images = re.findall(r"<img\b[^>]*>", visible)
    assert images
    for tag in images:
        if 'src="/flags/' in tag:
            for pattern in ['src="/flags/ba.svg"', 'alt=""', 'width="18"', 'height="12"', 'loading="lazy"']:
                match(pattern, tag)
            continue
        for pattern in [r'(?:data-logo-src|src)="https://static\.match-card\.test/', 'alt=""', 'width="32"', 'height="32"']:
            match(pattern, tag)
        if 'data-logo-src=' in tag:
            no_match(r'(?<![\w-])src=', tag)
        else:
            match('loading="eager"', tag)
    print(f"Match card SSR verification passed: {len(articles)} single-copy Team stack fallbacks, readable predictions, exact selected prices, every outcome/source, live minute and no former desktop column header.")


def verify_feed_cards(origin):
    response = request(origin, "/feed")
    assert response.status == 200
    no_match(r'\[data-phone-feed-card\]::?before\s*\{[^}]*background', response.text,
             "Mobile Matches cards leave the header on the card surface.")
    articles = re.findall(r'(<article\b[^>]*data-fixture-id="(feed-[^"]+)"[^>]*>)([\s\S]*?)</article>', visible_html(response.text))
    cards = {key: body for _, key, body in articles}
    tags = {key: tag for tag, key, _ in articles}
    assert len(cards) == 25
    header_results = {"correct": "won", "incorrect": "lost", "canceled": "cancelled"}
    for article, key, body in articles:
        status = match(r'data-match-status="([^"]+)"', body).group(1)
        header = "half-time" if key == "feed-halftime" else header_results.get(status, status)
        match(rf'data-match-header-result="{header}"', article)
    for key, label in {"live": "67:00", "stoppage": r"90\+04:00", "first-half-stoppage": r"45\+02:00", "halftime": "HT"}.items():
        card = cards[f"feed-{key}"]
        match(rf'data-status-clock[^>]*><span[^>]*>{label}</span>', card)
        no_match(r'data-match-live-dot|data-status-clock[^>]*>Live', card)
    match(r'data-score-home[^>]*>2</span>[\s\S]*?data-score-away[^>]*>1</span>', cards["feed-aet"])
    match(r'data-match-status="finished-extra-time"[^>]*>[\s\S]*?data-pick-value[^>]*>AET</span>', cards["feed-aet"])
    match(r'data-score-home[^>]*>1<span[^>]*data-shootout-score[^>]*>\(3\)</span>', cards["feed-pen"])
    match(r'data-score-away[^>]*>1<span[^>]*data-shootout-score[^>]*>\(4\)</span>', cards["feed-pen"])
    match(r'data-match-status="finished-penalties"[^>]*>[\s\S]*?data-pick-value[^>]*>PEN</span>', cards["feed-pen"])
    match("Penalty shootout score", cards["feed-pen"])
    match("Score after 90 minutes", cards["feed-incomplete"])
    no_match("data-shootout-score", cards["feed-incomplete"])
    match(r'data-match-status="correct"[^>]*>[\s\S]*?data-pick-value[^>]*>Won FT</span>', cards["feed-missing-odds"])
    for fixture_id, route, view in [("feed-gated", "/en/account", "login"), ("feed-expired", "/en/subscribe", None)]:
        body = cards[fixture_id]
        params = {"view": view} if view else {}
        params["return"] = f"/en/matches/{fixture_id}/example-home-v-away"
        params["checkout"] = "1"
        target = f"{route}?{urlencode(params)}"
        links = re.findall(r'<a\b([^>]*)>([\s\S]*?)</a>', body)
        assert links and all(unescape(match(r'\bhref="([^"]+)"', attrs).group(1)) == target for attrs, _ in links), (
            f"{fixture_id}: the unlock action and card share the access destination with a match return path"
        )
        match(r'\bdata-mobile-locked=', tags[fixture_id])
        unlocks = [contents for attrs, contents in links if "data-unlock-card" in attrs]
        assert len(unlocks) == 1, f"{fixture_id}: one visible unlock button"
        match(r'<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?</svg>[\s\S]*?>Unlock predictions</span>', unlocks[0])
        no_match(r'data-pick-selection=|data-pick-probability=|data-forecast-source=|data-prediction="home-win"', body)
    for fixture_id in ("feed-live", "feed-guest-completed", "feed-upcoming"):
        details_link = match(r'<a\b(?=[^>]*\bdata-match-open)(?=[^>]*\bhref="([^"]+)")[^>]*>', cards[fixture_id])
        assert details_link.group(1) == f"/en/matches/{fixture_id}/example-home-v-away"
        no_match(r'\bdata-mobile-locked=|\bdata-unlock-card=', tags[fixture_id] + cards[fixture_id])
    match(r'data-pick-selection', cards["feed-guest-completed"])
    match(r'data-match-status="delayed"[^>]*>[\s\S]*?data-pick-value[^>]*>Delayed</span>', cards["feed-overdue"])
    match(r'data-match-status="upcoming"', cards["feed-upcoming"])
    no_match(r'data-score-(?:home|away)|Final score:|Live score:', cards["feed-upcoming"])
    match(r'data-score-home[^>]*>2</span>[\s\S]*?data-score-away[^>]*>1</span>', cards["feed-live"])
    for key, market, selection, chance in [("missing-odds", "Match result", "Home win", "54%"),
            ("double-chance", "Double chance", "Home or draw", "82%"), ("btts", "Both teams to score", "No", "55%"),
            ("extended", "Full time · Home team goals 5.5", "Under 5.5", "96%"), ("replay-live", "Full time · Away team goals 5.5", "Under 5.5", "96%")]:
        body = cards[f"feed-{key}"]
        match(re.escape(market), body)
        engine = match(r'<small\b[^>]*data-forecast-source="[^"]+"[^>]*>\s*<svg\b[^>]*>[\s\S]*?</svg></small>', body)
        pick = match(rf'<span\b[^>]*data-pick-selection[^>]*>{re.escape(selection)}</span>', body)
        probability = match(rf'<span\b[^>]*data-pick-probability[^>]*>\({re.escape(chance)}\)</span>', body)
        assert engine.end() <= pick.start() < probability.start(), f"{key}: engine precedes the pick and its bracketed probability"
        assert body.count('data-forecast-source=') == 1, f"{key}: one forecast-icon marker"
    match("No qualifying pick", cards["feed-featured-abstained"])
    match("No forecast available", cards["feed-upcoming"])
    for key in ["feed-featured-abstained", "feed-upcoming"]:
        no_match(r'data-pick-probability=', cards[key])
    match(r'data-match-status="incorrect"[^>]*>[\s\S]*?Lost FT</span>', cards["feed-frozen-lost"])
    for fixture_id, body in cards.items():
        no_match(r'data-ledger-field="(?:odds|probability)"|data-card-odds|data-pick-price|data-probability-meter|'
                 r'data-public-probability|data-featured-tier|data-positive-value|estimated probability|Estimated return at these odds',
                 body, f"{fixture_id}: Matches omits odds, standalone probability and decorative forecast markers")
    print("Matches card score, stoppage clock, market/pick/engine, and access rendering passed.")


def main():
    args = parse_args("match card")
    directory = create_fixture("match-card")
    write_json(directory / "app/examples.json", service("rendering-fixtures")["cardExamples"])
    shutil.copyfile(ROOT / "tests/fixtures/match-card/preview.tsx", directory / "app/preview.tsx")
    print(f"Building match card fixture: {directory}", flush=True)
    build_fixture(directory, timeout=300)
    with Server(directory) as server:
        verify(server.origin, directory)
        verify_feed_cards(server.origin)
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
