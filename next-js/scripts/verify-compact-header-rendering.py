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
        response = request(server.origin, "/" + surface)
        assert response.status == 200, f"{surface}: header fixture must render successfully."
        assert response.headers.get("set-cookie") is None, f"{surface}: ordinary page requests must not set a session."
        (directory / f"{surface}.html").write_text(response.text, encoding="utf-8")
        visible = visible_html(response.text)
        for pattern in [f'data-compact-header-fixture="{surface}"', "data-app-header", "data-account-actions", "data-theme-toggle",
                        "data-header-brand", r'goal-hint-header-primary\.svg', 'name="robots" content="noindex, nofollow"']:
            match(pattern, visible, f"{surface}: expected {pattern}")
        assert 0 <= response.text.find("data-styled=") < response.text.find("<header"), f"{surface}: header styles must arrive before content."
        if surface == "admin":
            match("data-admin-payments-link", visible)
        else:
            match(r'href="/en/account\?view=login"', visible)
            match(r'href="/en/account\?view=register"', visible)
    session = request(server.origin, "/api/account/session")
    assert session.status == 200 and json.loads(session.text) == {"phone": None, "administrator": False, "subscription": None}
    payments = request(server.origin, "/api/admin/payments?count=1")
    assert payments.status == 200 and json.loads(payments.text)["pendingCount"] == 3
    for asset in ("primary", "inverse"):
        assert request(server.origin, f"/brand/goal-hint-header-{asset}.svg").status == 200
    write_json(directory / "verification.json", {"surfaces": ["public", "app", "admin", "detail"], "sharedHeaders": True,
        "serverStyles": True, "anonymousSession": True, "syntheticPaymentCount": 3})
    print("Compact header SSR passed: public/app/admin/detail real shells, new branding, server styles and isolated session APIs.", flush=True)


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
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Compact header verification failed; inspect the fixture artifacts and build.log.")
