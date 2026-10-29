"""Build and inspect the real Codes design gallery with synthetic records only."""
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

export default function CodeDesignLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}>
    <body><StyleProvider>{children}</StyleProvider></body>
  </html>;
}
'''
    (directory / "app/layout.tsx").write_text(layout.replace("__FONT_SOURCE__", json.dumps(source)), encoding="utf-8")


def verify(origin, directory):
    response = request(origin, "/admin-code-designs")
    assert response.status == 200, "The Codes gallery must return HTTP 200."
    assert response.headers.get("set-cookie") is None, "A synthetic review must not create an account session."
    (directory / "code-designs.html").write_text(response.text, encoding="utf-8")
    document = ReviewDocument(response.text)
    options = document.with_attribute("data-code-design-option")
    assert len(options) == 10, "All ten sample selectors must be available before hydration."
    variants = [attrs["data-code-design-option"] for _, attrs in options]
    assert len(set(variants)) == 10, "Each sample needs a unique identifier."
    assert len(document.with_attribute("data-codes-workspace")) == 1, "Render the shared Codes workspace for the active sample."
    assert document.with_attribute("data-floating-field"), "The real shared floating field must render."
    assert document.with_attribute("data-phone-field"), "Reuse the validated phone input."
    assert document.with_attribute("data-network-choice"), "Reuse the accessible logo provider choice."
    provider_artwork = {attrs["data-payment-logo"] for _, attrs in document.with_attribute("data-payment-logo")}
    assert provider_artwork == {"mtn", "airtel"}, "Both providers need the existing logo components."
    assert any(tag == "textarea" and "required" in attrs for tag, attrs in document.elements), "A manual grant reason remains required."
    assert any(tag == "input" and attrs.get("data-phone-canonical") is not None
               and attrs.get("name") == "phone" for tag, attrs in document.elements), "Submit the canonical phone value."
    assert not any(tag == "form" and attrs.get("action", "").startswith("/api/admin")
                   for tag, attrs in document.elements), "Preview forms must not have a live mutation fallback."
    robots = [attrs.get("content", "") for tag, attrs in document.elements
              if tag == "meta" and attrs.get("name") == "robots"]
    assert any("noindex" in value and "nofollow" in value for value in robots), "Samples must not be indexed."
    assert "data-styled=" in response.text, "Real component styles must be present in the server response."
    ids = [attrs["id"] for _, attrs in document.elements if "id" in attrs]
    assert len(ids) == len(set(ids)), "Shared forms must not create duplicate element identifiers."
    assets = sorted({attrs.get("src", "") for tag, attrs in document.elements if tag == "img"
                     and attrs.get("src", "").startswith(("/brand/", "/payment-networks/"))})
    assert any(asset.startswith("/brand/") for asset in assets), "Use the real brand artwork."
    for asset in assets:
        assert request(origin, asset).status == 200, f"Shared artwork is unavailable: {asset}"
    result = {"samples": variants, "sharedWorkspace": True, "validatedPhone": True,
              "providers": sorted(provider_artwork), "requiredReason": True,
              "uniqueIds": True, "mutationFallbackAbsent": True, "artwork": assets}
    write_json(directory / "verification.json", result)
    print(f"Codes gallery SSR passed: {result}", flush=True)


def main():
    args = parse_args("Codes design gallery", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp"), "Use a fixture under the application's .tmp directory."
        assert (directory / ".next/BUILD_ID").is_file(), "The fixture needs a successful production build."
    else:
        directory = create_fixture("code-designs")
        write_preview_layout(directory)
        print(f"Building isolated Codes gallery fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=300)
    with Server(directory, env, ready="/admin-code-designs") as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Codes gallery: {server.origin}/admin-code-designs", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Codes gallery verification failed; inspect the fixture HTML and build.log.")
