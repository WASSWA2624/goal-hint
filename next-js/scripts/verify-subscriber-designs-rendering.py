"""Build and inspect the shared Subscribers gallery using fictional records only."""
from html.parser import HTMLParser
import json
import os
from pathlib import Path

from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html, write_json
from lib.runtime import ROOT, main_guard


class ReviewDocument(HTMLParser):
    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.feed(visible_html(markup))

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def with_attribute(self, attribute):
        return [(tag, attrs) for tag, attrs in self.elements if attribute in attrs]


def write_preview_layout(directory):
    font = ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2"
    source = Path(os.path.relpath(font, directory / "app")).as_posix()
    layout = '''import type { ReactNode } from "react";
import localFont from "next/font/local";
import { StyleProvider } from "@/styles/provider";

const manrope = localFont({ src: __FONT_SOURCE__, variable: "--font-manrope",
  weight: "200 800", display: "swap", fallback: ["Arial", "sans-serif"] });

export default function SubscriberDesignLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}>
    <body><StyleProvider>{children}</StyleProvider></body>
  </html>;
}
'''
    (directory / "app/layout.tsx").write_text(layout.replace("__FONT_SOURCE__", json.dumps(source)), encoding="utf-8")


def verify(origin, directory):
    response = request(origin, "/admin-subscriber-designs")
    assert response.status == 200, "The Subscribers gallery must return HTTP 200."
    assert response.headers.get("set-cookie") is None, "A fictional review must not create an account session."
    (directory / "subscriber-designs.html").write_text(response.text, encoding="utf-8")
    document = ReviewDocument(response.text)
    options = document.with_attribute("data-subscriber-design-option")
    assert len(options) == 10, "All ten sample selectors must render before hydration."
    samples = [attrs["data-subscriber-design-option"] for _, attrs in options]
    assert len(set(samples)) == 10, "Each subscriber sample needs a unique identifier."
    assert len(document.with_attribute("data-subscriber-review-workspace")) == 1, "Render one shared subscriber workspace."
    assert len(document.with_attribute("data-subscriber-detail")) == 1, "Reuse the real SubscriberDetail for the selected account."
    assert document.with_attribute("data-subscriber-tabs"), "The real subscriber tabs must render."
    assert document.with_attribute("data-floating-field"), "Reuse the shared accessible floating fields."
    assert document.with_attribute("data-review-subscriber-row"), "The directory must show fictional subscriber records."
    assert any(tag == "input" and attrs.get("type") == "search" for tag, attrs in document.elements), "Provide general live search rather than a phone-only form."
    values = {attrs.get("value") for tag, attrs in document.elements if tag == "option"}
    assert {"open", "blocked", "erased", "active", "queued", "none"}.issubset(values), "Account and access filters must remain separate."
    assert {"1", "7", "30"}.issubset(values), "Offer honest recent-sign-in filters."
    assert any(tag == "textarea" and attrs.get("name") == "note" for tag, attrs in document.elements), "Reuse the subscriber's owner-note field."
    assert not document.with_attribute("data-subscriber-temporary-password"), "The review must not expose account credentials."
    assert "Reset password" not in visible_html(response.text), "The removed admin password action must stay out of the samples."
    assert not any(tag == "form" and attrs.get("action", "").startswith("/api/admin")
                   for tag, attrs in document.elements), "Preview forms must have no live mutation fallback."
    robots = [attrs.get("content", "") for tag, attrs in document.elements
              if tag == "meta" and attrs.get("name") == "robots"]
    assert any("noindex" in value and "nofollow" in value for value in robots), "The review gallery must not be indexed."
    assert "data-styled=" in response.text, "Shared styles must render on the server."
    ids = [attrs["id"] for _, attrs in document.elements if "id" in attrs]
    assert len(ids) == len(set(ids)), "Shared directory and account controls must have unique identifiers."
    provider_artwork = {attrs["data-payment-logo"] for _, attrs in document.with_attribute("data-payment-logo")}
    assert provider_artwork == {"mtn", "airtel"}, "Show both existing provider logo components with fictional network assignments."
    assets = sorted({attrs.get("src", "") for tag, attrs in document.elements if tag == "img"
                     and attrs.get("src", "").startswith(("/brand/", "/payment-networks/"))})
    assert any(asset.startswith("/brand/") for asset in assets), "Reuse the brand artwork."
    for asset in assets:
        assert request(origin, asset).status == 200, f"Shared artwork is unavailable: {asset}"
    result = {"samples": samples, "sharedWorkspace": True, "sharedSubscriberDetail": True,
              "searchAndFilters": True, "providerArtwork": sorted(provider_artwork),
              "uniqueIds": True, "passwordActionAbsent": True,
              "mutationFallbackAbsent": True, "artwork": assets}
    write_json(directory / "verification.json", result)
    print(f"Subscribers gallery SSR passed: {result}", flush=True)


def main():
    args = parse_args("Subscribers design gallery", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp"), "Use a fixture under the application's .tmp directory."
        assert (directory / ".next/BUILD_ID").is_file(), "The fixture needs a successful production build."
    else:
        directory = create_fixture("subscriber-designs")
        write_preview_layout(directory)
        print(f"Building isolated Subscribers gallery fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=300)
    with Server(directory, env, ready="/admin-subscriber-designs") as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Subscribers gallery: {server.origin}/admin-subscriber-designs", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Subscribers gallery verification failed; inspect the fixture HTML and build.log.")
