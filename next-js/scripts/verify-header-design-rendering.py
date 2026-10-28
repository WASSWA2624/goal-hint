"""Build and inspect the isolated compact-header design review without application data."""
from collections import Counter
from html.parser import HTMLParser
import json
import os
from pathlib import Path

from lib.rendering import Server, build_fixture, create_fixture, parse_args, request, visible_html, write_json
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

const manrope = localFont({
  src: __FONT_SOURCE__,
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export default function HeaderReviewLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}>
    <body><StyleProvider>{children}</StyleProvider></body>
  </html>;
}
'''
    (directory / "app/layout.tsx").write_text(layout.replace("__FONT_SOURCE__", json.dumps(source)), encoding="utf-8")


def verify(origin, directory):
    response = request(origin, "/en/header/designs")
    assert response.status == 200, "Header review must return HTTP 200."
    assert response.headers.get("set-cookie") is None, "The review must not create an account session."
    (directory / "header-designs.html").write_text(response.text, encoding="utf-8")
    document = ReviewDocument(response.text)
    options = document.with_attribute("data-header-option")
    samples = document.with_attribute("data-header-sample")
    assert len(options) == 10, "All ten design options must be present before hydration."
    assert all(tag == "section" for tag, _ in options), "Each option needs a semantic section."
    assert len({attrs["data-header-option"] for _, attrs in options}) == 10, "Design identifiers must be unique."
    assert len(samples) == 20, "Every option needs both desktop and mobile samples."
    sample_types = Counter(attrs["data-header-sample"] for _, attrs in samples)
    assert sample_types == {"desktop": 10, "mobile": 10}, "Every viewport must render ten samples."
    assert sum(tag == "main" for tag, _ in document.elements) == 1, "The review needs one main landmark."
    assert sum(tag == "h1" for tag, _ in document.elements) == 1, "The review needs one page heading."
    robots = [attrs.get("content", "") for tag, attrs in document.elements
              if tag == "meta" and attrs.get("name") == "robots"]
    assert any("noindex" in value and "nofollow" in value for value in robots), "Review routes must not be indexed."
    assert "data-styled=" in response.text, "The initial response must contain real component styles."
    ids = [attrs["id"] for _, attrs in document.elements if "id" in attrs]
    assert len(ids) == len(set(ids)), "Repeated previews must not create duplicate element identifiers."
    assets = sorted({attrs.get("src", "") for tag, attrs in document.elements
                     if tag == "img" and attrs.get("src", "").startswith("/brand/")})
    assert assets, "The review must use the application's brand artwork."
    for asset in assets:
        assert request(origin, asset).status == 200, f"Brand asset is unavailable: {asset}"
    result = {"options": len(options), "samples": dict(sample_types), "brandAssets": assets,
              "robots": "noindex, nofollow", "uniqueIds": True, "sessionCookieAbsent": True}
    write_json(directory / "verification.json", result)
    print(f"Header review SSR passed: {result}", flush=True)


def main():
    args = parse_args("compact header designs", extra=("--fixture",))
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp"), "Use a fixture beneath the application's .tmp directory."
        assert (directory / ".next/BUILD_ID").is_file(), "The selected fixture needs a successful production build."
    else:
        directory = create_fixture("header-designs")
        write_preview_layout(directory)
        print(f"Building isolated header review fixture: {directory}", flush=True)
        build_fixture(directory, timeout=300)
    with Server(directory, ready="/en/header/designs") as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Header review: {server.origin}/en/header/designs", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Header design rendering verification failed; inspect the fixture artifacts and build.log.")
