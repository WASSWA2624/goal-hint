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
    articles = re.findall(r'<article\b[^>]*data-fixture-id="([^"]+)"[^>]*>([\s\S]*?)</article>', visible)
    assert len(articles) == 12
    by_id = dict(articles)
    assert 0 <= html.find("data-styled=") < html.find("<main")
    for _, article in articles:
        order = ["<header", 'data-team-side="home"', 'data-team-side="away"', "data-prediction=", "View analysis"]
        positions = [article.find(item) for item in order]
        assert all(position >= 0 and (index == 0 or position > positions[index - 1])
            for index, position in enumerate(positions)), "Card reading order"
        match(r'<svg[^>]*aria-hidden="true"[^>]*focusable="false"', article)
        assert len(re.findall(r"<a\b", article)) == 1, "One keyboard destination per card"
        match(r"prediction: [^<]+, estimated probability|prediction unavailable", article)
        match(r'data-outcome="(?:correct|incorrect|pending|void|unavailable)"', article)
        no_match(r"\s(?:\$[\w-]+|tone|variant|loaded)=", article)
    for card, status in [("card-correct", "correct"), ("card-incorrect", "incorrect"), ("card-pending", "pending"),
        ("card-void", "void"), ("card-unavailable", "unavailable"), ("card-missing-family", "unavailable")]:
        match(f'data-outcome="{status}"', by_id[card])
    for card, status, label in [("card-correct", "correct", "Won"), ("card-incorrect", "incorrect", "Lost"),
        ("card-pending", "pending", "Pending")]:
        article = by_id[card]
        assert article.count(f'data-result-badge="{status}"') == 1
        match(rf'data-result-badge="{status}"[^>]*>[\s\S]*?<span data-pick-value[^>]*>{label}</span></span>', article)
    for card in ["card-unavailable", "card-missing-family"]:
        match(r'data-result-badge="unavailable"[^>]*>[\s\S]*?<span data-pick-value[^>]*>—</span></span>', by_id[card])
        no_match(r'data-pick-value[^>]*>(?:0%|Pending)</span>', by_id[card])
        match(r'data-pick-value[^>]*>Unavailable</span>', by_id[card])
        match(r'data-pick-state="none"', by_id[card])
        match(r'<b data-mobile-only=""[^>]*>No pick</b>', by_id[card])
    for card, state in [("card-correct", "settled"), ("card-incorrect", "settled"), ("card-void", "settled"), ("card-pending", "open")]:
        match(f'data-pick-state="{state}"', by_id[card])
    match(r'data-mobile-only=""[^>]*>Home win</span>', by_id["card-correct"])
    match(r'data-mobile-only=""[^>]*>1X2</span>', by_id["card-unavailable"])
    match(r'data-desktop-only=""[^>]*>Match result</span>', by_id["card-unavailable"])
    match(r'data-selected-odds[^>]*>Odds 1\.85</span>', by_id["card-correct"])
    no_match(r"Odds 2\.10", by_id["card-correct"])
    no_match(r"Odds 2\.10|Odds 2\.25|data-selected-odds=", by_id["card-incorrect"])
    no_match(r"Final score:|Live score:|data-live-minute=", by_id["card-delayed"])
    no_match(r">0</span><span>–</span><span>0<", by_id["card-delayed"])
    match(r'data-live-minute="67"[\s\S]*?<span aria-hidden="true">67′</span>', by_id["card-pending"])
    no_match(r">(?:vs|VS)<", by_id["card-pending"])
    checks = {
        "card-correct": ["Final score: Example Home FC 2, Example Away FC 1", "Match result prediction: Home win, estimated probability 54%", ">FT<", "AI prediction"],
        "card-pending": ['data-live-minute="67"', "Live, 2nd half, 67 minutes played", "Live score: Example Home FC 2, Example Away FC 0"],
        "card-delayed": ['data-match-state="scheduled"', "Update delayed", "Oct 9, 2026, 00:18 EAT"],
        "card-incorrect": ["API-Football fallback"], "card-limited": ["Limited news coverage"],
        "card-partial": ["Partial coverage"], "card-void": ["Postponed before play"],
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
        for pattern in [r'src="https://static\.match-card\.test/', 'alt=""', 'width="32"', 'height="32"']:
            match(pattern, tag)
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
