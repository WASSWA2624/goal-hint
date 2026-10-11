"""Shared assertions for the public policy production-response checks."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import re

from .rendering import local_origin, match, no_match, request, visible_html
from .runtime import service


def acceptance_origin(description: str) -> str:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("origin", nargs="?", default="http://127.0.0.1:3106")
    return local_origin(parser.parse_args().origin)


def notices() -> dict:
    return service("rendering-notices")


class _NavigationParser(HTMLParser):
    """Inspect active links within each navigation landmark separately."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.landmarks = {}
        self.stack = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "nav":
            active = []
            self.landmarks.setdefault(attributes.get("aria-label"), []).append(active)
            self.stack.append(active)
        elif tag == "a" and self.stack and attributes.get("aria-current") == "page":
            self.stack[-1].append(attributes.get("href"))

    def handle_endtag(self, tag):
        if tag == "nav" and self.stack:
            self.stack.pop()


def assert_navigation(visible: str, *, primary: str, mobile: str | None, footer: str | None = None) -> None:
    parser = _NavigationParser()
    parser.feed(visible)
    for label, expected in [("Main navigation", primary), ("Information", footer), ("App sections", mobile)]:
        landmarks = parser.landmarks.get(label, [])
        assert len(landmarks) == 1, f"One {label} landmark"
        active = landmarks[0]
        assert len(active) <= 1, f"{label}: at most one current destination link"
        assert active == ([expected] if expected else []), f"{label}: current destination should be {expected}"


def policy_document(origin: str, path: str, *, page: str, title: str,
                    notice: dict, sections: list[str], patterns: list[str],
                    forbidden: str, forms: str) -> str:
    response = request(origin, path, redirect=True)
    assert response.status == 200, path
    assert response.headers.get("set-cookie") is None
    html, visible = response.text, visible_html(response.text, comments=False)
    match(r'<html[^>]*lang="en"', html)
    match(rf'<title>{re.escape(title)} \| Goal Hint</title>', html)
    match(rf'rel="canonical" href="https://goalhint\.com/en/{page}"', html)
    match(r'name="robots" content="noindex, follow"', html)
    assert 0 <= html.find("data-styled=") < html.find("<header"), "Initial shell CSS"
    assert len(re.findall(r"<main[\s>]", visible)) == 1
    assert len(re.findall(r"<h1[\s>]", visible)) == 1
    ids = re.findall(r'\bid="([^"]+)"', visible)
    assert len(ids) == len(set(ids)), "Unique semantic anchors"
    for section in sections:
        assert f'id="{page}-{section}"' in visible
        assert f'aria-labelledby="{page}-{section}-heading"' in visible
        if page != "contact":
            assert f'href="#{page}-{section}"' in visible
    assert f'data-{page}-status="{notice["publication"]}"' in visible
    match(rf'data-{page}-release-ready="false"', visible)
    match(rf'datetime="{re.escape(notice["reviewedOn"])}"', visible, flags=re.I)
    for pattern in patterns:
        match(pattern, visible)
    assert_navigation(visible, primary=f"/en/{page}", footer=f"/en/{page}", mobile=None)
    no_match(r'(?:href|action)="[^"\s]*how-it-works', visible)
    no_match(forbidden, visible, flags=re.I)
    main = match(r"<main\b[^>]*>([\s\S]*?)</main>", visible).group(1)
    no_match(forms, main, flags=re.I)
    return visible
