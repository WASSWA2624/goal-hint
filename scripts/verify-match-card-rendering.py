"""Build real card components and verify their anonymous production markup."""
import re
import shutil

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
    assert len(articles) == 13
    by_id = {fixture_id: article for _, fixture_id, article in articles}
    assert 0 <= html.find("data-styled=") < html.find("<main")
    for tag, _, article in articles:
        no_match(r'\baria-describedby=', tag)
        no_match(r'<(?:ul|ol)\b|\bid="[^"]*-notes"|\baria-describedby="[^"]*-notes', article)
        no_match("Update delayed|Limited news coverage|Partial coverage|Prediction update in progress|"
                 "No prediction was locked for this market|Postponed before play", article)
        order = ["<header", 'data-team-side="home"', 'data-team-side="away"', "data-prediction=", "View analysis"]
        positions = [article.find(item) for item in order]
        assert all(position >= 0 and (index == 0 or position > positions[index - 1])
            for index, position in enumerate(positions)), "Card reading order"
        match(r'<svg[^>]*aria-hidden="true"[^>]*focusable="false"', article)
        assert len(re.findall(r"<a\b", article)) == 1, "One keyboard destination per card"
        match(r"prediction: [^<]+, estimated probability|prediction unavailable", article)
        outcome = match(r'data-outcome="(correct|incorrect|pending|void|unavailable)"', article).group(1)
        fixture_status = match(r'data-status="([^"]+)"', tag).group(1)
        result = "upcoming" if fixture_status == "scheduled" else outcome
        label = {"upcoming": "Upcoming", "correct": "Win", "incorrect": "Loss", "pending": "Pending",
            "void": "Void", "unavailable": "—"}[result]
        assert article.count(f'data-result-badge="{result}"') == 1, "One truthful fixture/prediction result"
        match(rf'data-result-badge="{result}"[^>]*>[\s\S]*?<span data-pick-value[^>]*>{label}</span></span>', article)
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
            match(r'data-kickoff-date[^>]*>Fri, Oct 9</span>', parts)
            match(r'data-kickoff-time[^>]*>12:00', parts)
            match(r'data-kickoff-zone[^>]*>\s*EAT</span>', parts)
        if 'data-prediction="none"' in article:
            no_match(r"data-pick-odds=|data-probability-meter=", article)
        else:
            assert article.count('data-pick-odds=""') <= 1, "An available price appears once after the shown prediction"
            assert article.count('data-probability-meter=""') == 1, "One decorative meter for the shown probability"
            no_match(r"Odds", re.search(r"<header\b[^>]*>([\s\S]*?)</header>", article).group(1))
            picks = re.findall(r'data-pick-selection=""[^>]*>([^<]+)</span>', article)
            assert len(picks) == 1 and not re.fullmatch(r"[12Xx]+|Yes|No", picks[0]), "One full-word generic prediction per card"
            no_match(r'>(?:1X2|DC|BTTS|O/U 2\.5)</span>', article)
        no_match(r"\(—\)", article)
    for card, status in [("card-correct", "correct"), ("card-incorrect", "incorrect"), ("card-pending", "pending"),
        ("card-void", "void"), ("card-unavailable", "unavailable"), ("card-missing-family", "unavailable")]:
        match(f'data-outcome="{status}"', by_id[card])
    for card, status, label in [("card-correct", "correct", "Win"), ("card-incorrect", "incorrect", "Loss"),
        ("card-pending", "pending", "Pending"), ("card-delayed", "upcoming", "Upcoming"),
        ("card-limited", "upcoming", "Upcoming")]:
        article = by_id[card]
        assert article.count(f'data-result-badge="{status}"') == 1
        match(rf'data-result-badge="{status}"[^>]*>[\s\S]*?<span data-pick-value[^>]*>{label}</span></span>', article)
    for card in ["card-delayed", "card-limited"]:
        match(r'data-outcome="pending"', by_id[card])
        no_match(r'data-result-badge="pending"|data-pick-value[^>]*>Pending</span>', by_id[card])
    for card in ["card-unavailable", "card-missing-family"]:
        match(r'data-result-badge="unavailable"[^>]*>[\s\S]*?<span data-pick-value[^>]*>—</span></span>', by_id[card])
        no_match(r'data-pick-value[^>]*>(?:0%|Pending)</span>', by_id[card])
        match(r'data-pick-value[^>]*>No pick</span>', by_id[card])
        match(r'data-pick-state="none"', by_id[card])
        match(r'<b data-mobile-only=""[^>]*>No pick</b>', by_id[card])
    for card, state in [("card-correct", "settled"), ("card-incorrect", "settled"), ("card-void", "settled"), ("card-pending", "open")]:
        match(f'data-pick-state="{state}"', by_id[card])
    match(r'data-pick-selection=""[^>]*>Home win</span>', by_id["card-correct"])
    match(r'data-mobile-only=""[^>]*>Match result</span>', by_id["card-unavailable"])
    match(r'data-desktop-only=""[^>]*>Match result</span>', by_id["card-unavailable"])
    match(r'data-selected-odds[^>]*>\(1\.85\)</span>', by_id["card-correct"])
    match("Odds: 1.85", by_id["card-correct"])
    no_match(r"Odds 2\.10", by_id["card-correct"])
    no_match(r"Odds 2\.10|Odds 2\.25|data-selected-odds=", by_id["card-incorrect"])
    no_match(r"data-pick-odds=", by_id["card-incorrect"])
    match("Odds: Unavailable", by_id["card-incorrect"])
    match(r'data-pick-selection=""[^>]*>Under 2\.5</span>', by_id["card-long"])
    match(r'data-pick-selection=""[^>]*>Not both teams to score</span>', by_id["card-limited"])
    match(r'<span\b[^>]*data-country-name[^>]*>Bosnia and Herzegovina</span>', by_id["card-long"])
    match(r'data-selected-odds[^>]*>\(9999\.99\)</span>', by_id["card-long"])
    match(r'<article[^>]*data-fixture-id="card-any"[^>]*data-market="double-chance"', visible)
    match("Double chance prediction: Home or draw, estimated probability 82%", by_id["card-any"])
    no_match(r"data-selected-odds=|Odds: 1\.85|Odds: 2\.10", by_id["card-any"])
    no_match(r"Final score:|Live score:|data-live-minute=", by_id["card-delayed"])
    no_match(r">0</span><span>–</span><span>0<", by_id["card-delayed"])
    match(r'data-live-minute="67"[\s\S]*?<span aria-hidden="true">67′</span>', by_id["card-pending"])
    no_match(r">(?:vs|VS)<", by_id["card-pending"])
    checks = {
        "card-correct": ["Final score: Example Home FC 2, Example Away FC 1", "Match result prediction: Home win, estimated probability 54%", ">FT<", "AI prediction"],
        "card-pending": ['data-live-minute="67"', "Live, 2nd half, 67 minutes played", "Live score: Example Home FC 2, Example Away FC 0"],
        "card-delayed": ['data-match-state="scheduled"', "Oct 9, 2026, 00:18 EAT"],
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
            for pattern in ['src="/flags/ba.svg"', 'alt=""', 'width="16"', 'height="12"', 'loading="lazy"']:
                match(pattern, tag)
            continue
        for pattern in [r'(?:data-logo-src|src)="https://static\.match-card\.test/', 'alt=""', 'width="32"', 'height="32"']:
            match(pattern, tag)
        if 'data-logo-src=' in tag:
            no_match(r'(?<![\w-])src=', tag)
        else:
            match('loading="eager"', tag)
    print(f"Match card SSR verification passed: {len(articles)} labeled examples, every outcome/source, live minute, coherent probability and direct remote image markup.")


def main():
    args = parse_args("match card")
    directory = create_fixture("match-card")
    write_json(directory / "app/examples.json", service("rendering-fixtures")["cardExamples"])
    shutil.copyfile(ROOT / "tests/fixtures/match-card/preview.tsx", directory / "app/preview.tsx")
    print(f"Building match card fixture: {directory}", flush=True)
    build_fixture(directory)
    with Server(directory) as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
