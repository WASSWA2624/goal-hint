"""Exercise the production subscription banner with isolated account-session responses."""
import json
import os
from pathlib import Path

from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html, write_json
from lib.runtime import ROOT, main_guard


SCENARIOS = ["signed-out", "member", "active", "pending", "expired", "active-pending", "sales-closed",
             "pending-closed", "active-closed", "no-price", "price-changed"]


def write_layout(directory):
    font = Path(os.path.relpath(ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2", directory / "app")).as_posix()
    source = '''import type { ReactNode } from "react";
import localFont from "next/font/local";
import { StyleProvider } from "@/styles/provider";

const manrope = localFont({ src: __FONT__, variable: "--font-manrope", weight: "200 800", display: "swap", fallback: ["Arial", "sans-serif"] });
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}><body><StyleProvider>{children}</StyleProvider></body></html>;
}
'''
    (directory / "app/layout.tsx").write_text(source.replace("__FONT__", json.dumps(font)), encoding="utf-8")


def verify(origin, directory):
    for state in SCENARIOS:
        response = request(origin, f"/en/matches?state={state}")
        assert response.status == 200, (state, "fixture page")
        assert response.headers.get("set-cookie") is None, "Rendering must never create a session."
        html = visible_html(response.text)
        assert "data-app-header" in html and "data-banner-fixture" in html, (state, "real shared header and probe")
        assert "data-desktop-subscription-status" not in html and "data-subscription-status-bar" not in html, \
            (state, "unresolved server sessions must not flash an account or acquisition banner")
        assert "256700000001" not in html, "Account identity must not enter shared server HTML."
        assert "data-styled=" in response.text, "Production component styles must be server-rendered."
        assert 'name="robots" content="noindex, nofollow"' in html, "The acceptance fixture must not be indexed."
        session_response = request(origin, f"/api/account/session?state={state}")
        assert session_response.status == 200 and "no-store" in session_response.headers.get("Cache-Control", ""), state
        assert session_response.headers.get("set-cookie") is None, "Session reads must remain read-only."
        session = json.loads(session_response.text)
        summary = session["subscription"]
        assert (session["phone"] is None) == (state in {"signed-out", "sales-closed"}), state
        assert bool(summary["activeUntil"]) == (state in {"active", "active-pending", "active-closed"}), state
        assert summary["paymentPending"] == (state in {"pending", "active-pending", "pending-closed"}), state
        assert summary["canSubscribe"] == (not state.endswith("closed")), state
        if state in {"active", "active-pending", "active-closed", "no-price"}:
            assert "offer" not in summary, state
        else:
            assert summary["offer"]["priceUgx"] == (2_750 if state == "price-changed" else 1_750), state
        if state == "expired":
            assert summary["expired"] is True
    failure = request(origin, "/api/account/session?state=failure")
    assert failure.status == 503, "The fixture supports temporary transport failures."
    write_json(directory / "verification.json", {"scenarios": SCENARIOS, "unresolvedBannerHidden": True,
        "privateSessionApi": True, "liveFixturePrices": [1750, 2750], "productionHeaderAndBanner": True,
        "browserTransitionsVerified": False})
    print("Subscription banner SSR/session checks passed: eleven scenarios, hidden unresolved banners, private identity and variable offer prices.", flush=True)


def main():
    args = parse_args("production subscription banner", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file(), "Reuse a built fixture beneath .tmp."
    else:
        directory = create_fixture("subscription-banner")
        write_layout(directory)
        print(f"Building production subscription banner fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=300)
    with Server(directory, env, ready="/en/matches") as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Subscription banner browser URL: {server.origin}/en/matches?state=signed-out", flush=True)
        print("Add &delay=1500 to inspect loading, then use Session scenario to exercise same-page transitions.", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Subscription banner verification failed; inspect the fixture artifacts and build.log.")
