"""Build and inspect the isolated desktop banner review without application data."""
from collections import Counter
from html.parser import HTMLParser
import json
import os
from pathlib import Path

from lib.rendering import Server, build_fixture, create_fixture, parse_args, request, visible_html, write_json
from lib.runtime import ROOT, main_guard


class ReviewDocument(HTMLParser):
    """Retain element relationships and accessible action names for the rendered review."""

    VOID_ELEMENTS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.stack = []
        self.feed(visible_html(markup))

    def handle_starttag(self, tag, attrs):
        element = {"tag": tag, "attrs": dict(attrs), "parent": self.stack[-1] if self.stack else None, "children": [], "text": []}
        self.elements.append(element)
        if self.stack:
            self.stack[-1]["children"].append(element)
        if tag not in self.VOID_ELEMENTS:
            self.stack.append(element)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        for element in self.stack:
            element["text"].append(data)

    def with_attribute(self, attribute):
        return [element for element in self.elements if attribute in element["attrs"]]

    def descendants(self, element):
        for child in element["children"]:
            yield child
            yield from self.descendants(child)


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

export default function BannerReviewLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}>
    <body><StyleProvider>{children}</StyleProvider></body>
  </html>;
}
'''
    (directory / "app/layout.tsx").write_text(layout.replace("__FONT_SOURCE__", json.dumps(source)), encoding="utf-8")


def action_names(document, element):
    return [" ".join((node["attrs"].get("aria-label") or "".join(node["text"])).split()).casefold()
            for node in document.descendants(element) if node["tag"] in ("a", "button")]


def verify(origin, directory):
    response = request(origin, "/en/banner/designs")
    assert response.status == 200, "Banner review must return HTTP 200."
    assert response.headers.get("set-cookie") is None, "The review must not create an account session."
    (directory / "banner-designs.html").write_text(response.text, encoding="utf-8")
    document = ReviewDocument(response.text)
    options = document.with_attribute("data-banner-option")
    samples = document.with_attribute("data-banner-sample")
    assert len(options) == 10, "All ten design options must be present before hydration."
    assert all(node["tag"] == "section" for node in options), "Each option needs a semantic section."
    assert len({node["attrs"]["data-banner-option"] for node in options}) == 10, "Design identifiers must be unique."
    sample_states = Counter(node["attrs"]["data-banner-sample"] for node in samples)
    assert sample_states == {"signed-out": 10, "unsubscribed": 10, "active": 10}, "Every design needs all three account states."
    for option in options:
        state_counts = Counter(node["attrs"]["data-banner-sample"] for node in document.descendants(option)
                               if "data-banner-sample" in node["attrs"])
        assert state_counts == {"signed-out": 1, "unsubscribed": 1, "active": 1}, "Each design must show each account state once."
    for sample in samples:
        descendants = list(document.descendants(sample))
        headers = [node for node in descendants if "data-banner-header" in node["attrs"]]
        banners = [node for node in descendants if "data-banner-message" in node["attrs"]]
        assert len(headers) == len(banners) == 1, "Each preview must include one header and one banner."
        header, banner = headers[0], banners[0]
        assert header["parent"] is banner["parent"], "The banner must share its header's parent."
        siblings = header["parent"]["children"]
        assert siblings.index(banner) == siblings.index(header) + 1, "The banner must immediately follow the app header."
        state = sample["attrs"]["data-banner-sample"]
        actions = action_names(document, banner)
        auth_actions = {name for name in actions if name in ("sign in", "sign up")}
        if state == "signed-out":
            assert auth_actions == {"sign in", "sign up"}, "Signed-out visitors need both authentication actions in the message."
            assert "subscribe" not in actions, "Signed-out visitors must authenticate before subscribing."
        elif state == "unsubscribed":
            assert "subscribe" in actions, "Signed-in users without access need a subscription action."
            assert not auth_actions, "Signed-in users must not be asked to authenticate again."
        else:
            assert not auth_actions and "subscribe" not in actions, "Active subscribers must not receive acquisition actions."
        assert not any(name in ("login", "log in", "register") for name in actions), "Review actions must use consistent Sign in / Sign up terminology."
    assert sum(node["tag"] == "main" for node in document.elements) == 1, "The review needs one main landmark."
    assert sum(node["tag"] == "h1" for node in document.elements) == 1, "The review needs one page heading."
    robots = [node["attrs"].get("content", "") for node in document.elements
              if node["tag"] == "meta" and node["attrs"].get("name") == "robots"]
    assert any("noindex" in value and "nofollow" in value for value in robots), "Review routes must not be indexed."
    assert "data-styled=" in response.text, "The initial response must contain component styles."
    ids = [node["attrs"]["id"] for node in document.elements if "id" in node["attrs"]]
    assert len(ids) == len(set(ids)), "Repeated previews must not create duplicate element identifiers."
    assets = sorted({node["attrs"].get("src", "") for node in document.elements
                     if node["tag"] == "img" and node["attrs"].get("src", "").startswith("/brand/")})
    assert assets, "The review must use the application's brand artwork."
    for asset in assets:
        assert request(origin, asset).status == 200, f"Brand asset is unavailable: {asset}"
    result = {"options": len(options), "samples": dict(sample_states), "brandAssets": assets,
              "robots": "noindex, nofollow", "uniqueIds": True, "sessionCookieAbsent": True,
              "adjacentHeaderAndBanner": True, "stateAppropriateActions": True}
    write_json(directory / "verification.json", result)
    print(f"Banner review SSR passed: {result}", flush=True)


def main():
    args = parse_args("desktop banner designs", extra=("--fixture",))
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp"), "Use a fixture beneath the application's .tmp directory."
        assert (directory / ".next/BUILD_ID").is_file(), "The selected fixture needs a successful production build."
    else:
        directory = create_fixture("banner-designs")
        write_preview_layout(directory)
        print(f"Building isolated banner review fixture: {directory}", flush=True)
        build_fixture(directory, timeout=300)
    with Server(directory, ready="/en/banner/designs") as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Banner review: {server.origin}/en/banner/designs", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Banner design rendering verification failed; inspect the fixture artifacts and build.log.")
