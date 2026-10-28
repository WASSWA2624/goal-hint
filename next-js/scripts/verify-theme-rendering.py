"""Build the shared UI with synthetic records and expose rendered theme acceptance checks."""
import shutil

from lib.rendering import ROOT, Server, build_fixture, create_fixture, match, no_match, parse_args, request, visible_html
from lib.runtime import main_guard


def verify(origin, directory):
    response = request(origin)
    assert response.status == 200
    assert response.headers.get("set-cookie") is None
    html = response.text
    (directory / "initial.html").write_text(html, encoding="utf-8")
    visible = visible_html(html)
    for selector in ["data-theme-fixture", 'data-theme-mode="light"', "data-theme-toggle", "data-app-header",
                     'id="theme-phone-header"', 'id="theme-controls"', 'id="theme-member-step"',
                     'id="theme-matches"', 'id="theme-slips"', 'id="theme-dialog"', "data-run-theme-checks",
                     "data-fixture-id", "data-slip-id", "data-responsive-navigation"]:
        match(selector, visible)
    match(r'goal-hint-logo-primary\.svg', visible)
    match(r'goal-hint-mark-primary\.svg', visible)
    match(r'<div\b[^>]*data-summary-predicted[^>]*>\s*<dt\b[^>]*>Predicted</dt>\s*<dd\b[^>]*>116</dd>', visible)
    for outcome, percentage in [("correct", r"62\.1%"), ("incorrect", r"20\.7%"), ("pending", r"15\.5%")]:
        match(rf'<span\b[^>]*data-summary-percentage="{outcome}"[^>]*>\({percentage}\)</span>', visible)
    no_match(r'https?://[^"<>]*(?:match-card\.test|synthetic\.test)', visible)
    assert 0 <= html.find("data-styled=") < html.find("<main"), "Theme styles must be server rendered."
    session = request(origin, "/api/account/session")
    assert session.status == 200 and '"phone":null' in session.text
    print("Theme SSR verification passed: real shared components, predicted-match totals and outcome shares, adaptive light branding, isolated anonymous synthetic records.", flush=True)


def main():
    args = parse_args("theme")
    directory = create_fixture("theme")
    shutil.copyfile(ROOT / "tests/helpers/rendering/slips/app/stored.ts", directory / "app/synthetic-slips.ts")
    print(f"Building theme fixture: {directory}", flush=True)
    build_fixture(directory, timeout=360)
    with Server(directory) as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Theme rendering verification failed; inspect the fixture artifacts and build.log.")
