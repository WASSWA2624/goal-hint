"""Render the approved shared header with isolated synthetic sessions and payment counts."""
import json
import os
from pathlib import Path

from lib.rendering import ROOT, Server, build_fixture, create_fixture, match, parse_args, request, visible_html, write_json
from lib.runtime import main_guard


def write_layout(directory):
    font = Path(os.path.relpath(ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2", directory / "app")).as_posix()
    source = '''import type { ReactNode } from "react";
import localFont from "next/font/local";
import { StyleProvider } from "@/styles/provider";

export const metadata = { title: "Quiet controls acceptance", robots: { index: false, follow: false },
  icons: { icon: "/brand/goal-hint-favicon.svg" } };
const manrope = localFont({ src: __FONT__, variable: "--font-manrope", weight: "200 800", display: "swap", fallback: ["Arial", "sans-serif"] });

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}><body><StyleProvider>{children}</StyleProvider></body></html>;
}
'''
    (directory / "app/layout.tsx").write_text(source.replace("__FONT__", json.dumps(font)), encoding="utf-8")


def verify(server, directory):
    for surface in ("public", "app", "admin", "detail"):
        for scale in (100, 200):
            path = "/" + surface + ("?textScale=200" if scale == 200 else "")
            context = f"{surface}, {scale}% text"
            response = request(server.origin, path)
            assert response.status == 200, f"{context}: header fixture must render successfully."
            assert response.headers.get("set-cookie") is None, f"{context}: ordinary page requests must not set a session."
            suffix = "-text-200" if scale == 200 else ""
            (directory / f"{surface}{suffix}.html").write_text(response.text, encoding="utf-8")
            visible = visible_html(response.text)
            for pattern in [f'data-compact-header-fixture="{surface}"', "data-app-header", "data-account-actions", "data-theme-toggle",
                            "data-header-brand", r'goal-hint-header-primary\.svg', 'name="robots" content="noindex, nofollow"',
                            'data-responsive-navigation="desktop"', 'data-responsive-navigation="mobile"', "data-nav-more"]:
                match(pattern, visible, f"{context}: expected {pattern}")
            match(rf'<style data-fixture-text-scale="{scale}">', response.text, f"{context}: reproducible fixture text scale")
            if scale == 200:
                match(r":root\s*\{\s*font-size:\s*200%;\s*\}", response.text, f"{context}: text doubles without changing viewport dimensions")
            assert 0 <= response.text.find("data-styled=") < response.text.find("<header"), f"{context}: header styles must arrive before content."
            if surface == "admin":
                match("data-admin-payments-link", visible)
            else:
                match(r'href="/en/account\?view=login"', visible)
                match(r'href="/en/account\?view=register"', visible)
    session = request(server.origin, "/api/account/session")
    assert session.status == 200 and json.loads(session.text) == {"phone": None, "administrator": False, "subscription": None}
    payments = request(server.origin, "/api/admin/payments?count=1")
    assert payments.status == 200 and json.loads(payments.text)["pendingCount"] == 3
    for state in ("guest", "member", "admin"):
        headers = {"Cookie": f"header-fixture-state={state}; header-fixture-pending=103"}
        session = request(server.origin, "/api/account/session", headers=headers)
        assert session.status == 200 and json.loads(session.text) == {
            "phone": "256700000000" if state == "member" else None,
            "administrator": state == "admin", "subscription": None,
        }, f"{state}: synthetic session supports hydrated header acceptance"
        assert session.headers.get("set-cookie") is None, f"{state}: reading a synthetic session is read-only"
        payments = request(server.origin, "/api/admin/payments?count=1", headers=headers)
        assert payments.status == 200 and json.loads(payments.text)["pendingCount"] == 103, f"{state}: capped payment badge fixture remains available"
    for asset in ("primary", "inverse"):
        assert request(server.origin, f"/brand/goal-hint-header-{asset}.svg").status == 200
    write_json(directory / "verification.json", {"surfaces": ["public", "app", "admin", "detail"], "sharedHeaders": True,
        "serverStyles": True, "anonymousSession": True, "syntheticPaymentCount": 3,
        "textScales": [100, 200], "syntheticSessions": ["guest", "member", "admin"],
        "browserWidths": [320, 360, 390, 768, 1024, 1440], "browserGeometryVerified": False})
    print("Compact header SSR passed: public/app/admin/detail at 100% and 200% text, both navigation menus, server styles and isolated guest/member/admin session APIs. Browser geometry requires separate acceptance.", flush=True)


def main():
    args = parse_args("compact production header", extra=("--fixture",))
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp"), "Use a fixture inside the application's .tmp directory."
        assert (directory / ".next/BUILD_ID").is_file(), "The fixture needs a successful production build."
    else:
        directory = create_fixture("compact-header")
        write_layout(directory)
        print(f"Building compact header fixture: {directory}", flush=True)
        build_fixture(directory, timeout=300)
    with Server(directory, ready="/app") as server:
        verify(server, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Compact header browser URL: {server.origin}/app", flush=True)
        print(f"200% text browser URL: {server.origin}/app?textScale=200", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Compact header verification failed; inspect the fixture artifacts and build.log.")
