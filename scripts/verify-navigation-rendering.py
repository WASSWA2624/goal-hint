"""Inspect anonymous navigation from the actual local production build."""
import re
from urllib.parse import parse_qs, urljoin, urlsplit

from lib.policy_rendering import acceptance_origin, assert_navigation, notices
from lib.rendering import match, no_match, request, visible_html
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    data = notices()
    today_path, results_path, information_pages = data["todayPath"], data["resultsPath"], data["informationPages"]

    def anonymous(path):
        response = request(origin, path, headers={"Accept-Language": "fr-FR,sw;q=0.8"})
        assert response.headers.get("set-cookie") is None, f"{path}: no visitor cookie"
        return response

    root = anonymous("/")
    assert root.status == 308
    assert urlsplit(urljoin(origin, root.headers.get("location"))).path == "/en"
    paths = ["/en", today_path, results_path, "/en?status=live", "/en/predictions/2020-02-29?status=finished",
        "/en?sort=probability", "/en?from=2026-10-09&to=2026-10-16",
        "/en?when=tomorrow&status=scheduled&market=total-goals&sort=probability",
        "/en/predictions/2020-02-29?to=2020-03-06&q=Synthetic&league=league-a&page=2&pageSize=40",
        *[f"/en/{page}" for page in information_pages]]
    for path in paths:
        response = anonymous(path)
        assert response.status == 200, path
        html = response.text
        for pattern in [r'<html[^>]*lang="en"', r'<meta name="robots" content="noindex, follow"',
                r"<header[\s>]", r'<main[^>]*id="main-content"[^>]*tabindex="-1"', r"<footer[\s>]", r'href="#main-content"']:
            match(pattern, html)
        assert len(re.findall(r"<main[\s>]", html)) == 1
        assert len(re.findall(r"<h1[\s>]", html)) == 1
        match(r"<style data-styled[=\s]", html, f"{path}: server-rendered styled-components CSS")
        assert 0 <= html.find("data-styled=") < html.find("<header"), f"{path}: initial shell CSS"
        visible = visible_html(html, comments=False)
        target = urlsplit(path)
        information = next((page for page in information_pages if target.path == f"/en/{page}"), None)
        if information:
            expected = f"/en/{information}"
            assert_navigation(visible, primary=expected, footer=expected, mobile=expected if information == "help" else None)
            if information == "help":
                for section in ["dates", "filters", "browsing", "cards", "predictions", "updates", "results"]:
                    assert f'id="{section}"' in visible
                    assert f'href="#{section}"' in visible
                for phrase in ["Choose a day or range", "Your device’s time zone", "Earliest first",
                        "elapsed minutes in the top-right badge", "A live 1X2 prediction remains Pending"]:
                    assert phrase in visible
                no_match(r'data-stored-performance|data-performance-cell|action="[^"\s]*#performance', visible)
        else:
            status = parse_qs(target.query).get("status", ["all"])[0]
            expected = results_path if status == "finished" else today_path + "?status=live" if status == "live" else today_path
            assert_navigation(visible, primary=expected, mobile=expected)
        assert f'href="{today_path}"' in visible, f"{path}: Today target"
        assert f'href="{results_path}"' in visible, f"{path}: Results target"
        no_match(r'(?:href|action)="[^"\s]*/(?:sign[-_]?in|log[-_]?in|auth)(?:[/?#]|"|$)', visible, flags=re.I)
        no_match(r'<(?:button|a)\b[^>]*>\s*(?:sign[ -]?in|log[ -]?in)\s*<', visible, flags=re.I)
        no_match("Brand styling preview", visible, flags=re.I)
        no_match(r'(?:href|action)="[^"\s]*how-it-works', visible)
        for page in information_pages:
            assert f'href="/en/{page}"' in visible
        if "to=2020-03-06" in path:
            # The initial GET search retains the selected range while the range picker is closed.
            match(r'<form\b[^>]*action="/en/predictions/2020-02-29"', visible)
            match(r'<input\b(?=[^>]*name="to")(?=[^>]*value="2020-03-06")[^>]*>', visible)
        print(f"PASS initial anonymous HTML: {path}")
    for path, expected in [("/fr", "/en"), ("/sw/privacy", "/en/privacy"),
            ("/en-US/predictions/2020-02-29?status=finished", "/en/predictions/2020-02-29?status=finished")]:
        response = anonymous(path)
        assert response.status == 307, path
        target = urlsplit(urljoin(origin, response.headers.get("location")))
        assert target.path + ("?" + target.query if target.query else "") == expected
    legacy = anonymous("/en/how-it-works?from=2026-10-09&to=2026-10-11")
    assert legacy.status == 308
    assert urlsplit(urljoin(origin, legacy.headers.get("location"))).path == "/en/help"
    for path in ["/en/predictions/2026-02-29", "/en/predictions/2026-1-01",
            "/en/predictions/2026-10-09?status=correct", "/en/predictions/2026-10-09?status=all&status=finished",
            "/en?sort=unsupported", "/en?market=total-goals&sort=probability&sortMarket=match-result",
            "/en?unknown=x", "/en?page=0", "/en?q=a&q=b", "/en?from=2026-10-09",
            "/en/matches/unknown/home-v-away", "/en/results", "/en/not-a-page"]:
        response = anonymous(path)
        assert response.status == 404, path
        match("Page not found", response.text)
        match("noindex", response.text)
    print("PASS root redirect, path/query-preserving English fallback, and invalid/unknown-route 404s.")


if __name__ == "__main__":
    main_guard(main)
