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
    """Inspect links and native overflow menus within each navigation landmark."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.landmarks = {}
        self.structures = {}
        self.stack = []
        self.details, self.links, self.summaries, self.icons = [], [], [], []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "nav":
            active = []
            self.landmarks.setdefault(attributes.get("aria-label"), []).append(active)
            structure = {"active": active, "links": [], "menus": []}
            self.structures.setdefault(attributes.get("aria-label"), []).append(structure)
            self.stack.append(structure)
        elif tag == "details":
            menu = {"attributes": attributes, "summaries": []} if self.stack else None
            if menu is not None:
                self.stack[-1]["menus"].append(menu)
            self.details.append(menu)
        elif tag == "a":
            link = {"attributes": attributes, "overflow": any(menu is not None for menu in self.details), "icons": []} if self.stack else None
            if link is not None:
                self.stack[-1]["links"].append(link)
                if attributes.get("aria-current") == "page":
                    self.stack[-1]["active"].append(attributes.get("href"))
            self.links.append(link)
        elif tag == "summary":
            summary = {"attributes": attributes, "icons": []} if self.details and self.details[-1] is not None else None
            if summary is not None:
                self.details[-1]["summaries"].append(summary)
            self.summaries.append(summary)
        elif tag == "svg":
            icon = {"attributes": attributes, "circles": []}
            owner = self.links[-1] if self.links else None
            if owner is None and self.summaries:
                owner = self.summaries[-1]
            if owner is not None:
                owner["icons"].append(icon)
            self.icons.append(icon)
        elif tag == "circle" and self.icons:
            self.icons[-1]["circles"].append(attributes)

    def handle_endtag(self, tag):
        if tag == "nav" and self.stack:
            self.stack.pop()
        elif tag == "details" and self.details:
            self.details.pop()
        elif tag == "a" and self.links:
            self.links.pop()
        elif tag == "summary" and self.summaries:
            self.summaries.pop()
        elif tag == "svg" and self.icons:
            self.icons.pop()


def assert_navigation(visible: str, *, primary: str, mobile: str | None, footer: str | None = None) -> None:
    parser = _NavigationParser()
    parser.feed(visible)
    for label, expected in [("Main navigation", primary), ("Information", footer), ("App sections", mobile)]:
        landmarks = parser.landmarks.get(label, [])
        assert len(landmarks) == 1, f"One {label} landmark"
        active = landmarks[0]
        assert len(active) <= 1, f"{label}: at most one current destination link"
        assert active == ([expected] if expected else []), f"{label}: current destination should be {expected}"


def assert_navigation_overflow(visible: str, *, primary: list[str], overflow: list[str], footer: list[str]) -> None:
    """Both bars expose three primary links and the remaining destinations once in More."""
    assert len(primary) == 3 and len(set(primary + overflow)) == len(primary + overflow), "Distinct navigation destinations"
    parser = _NavigationParser()
    parser.feed(visible)
    for label in ["Main navigation", "App sections"]:
        landmarks = parser.structures.get(label, [])
        assert len(landmarks) == 1, f"One {label} landmark"
        structure = landmarks[0]
        direct = [link for link in structure["links"] if not link["overflow"]]
        hidden = [link for link in structure["links"] if link["overflow"]]
        assert [link["attributes"].get("href") for link in direct] == primary, f"{label}: exactly three primary destinations"
        assert [link["attributes"].get("href") for link in hidden] == overflow, f"{label}: remaining destinations occur once inside More"
        assert len(structure["menus"]) == 1, f"{label}: one native More menu"
        menu = structure["menus"][0]
        assert "open" not in menu["attributes"], f"{label}: More starts closed"
        assert len(menu["summaries"]) == 1, f"{label}: one native More trigger"
        summary = menu["summaries"][0]
        assert bool(summary["attributes"].get("aria-controls")), f"{label}: More trigger controls its popup"
        overflow_current = any(link["attributes"].get("aria-current") == "page" for link in hidden)
        assert (summary["attributes"].get("aria-current") == "page") == overflow_current, f"{label}: More identifies the active overflow destination"
        for owner in [summary, *hidden]:
            assert len(owner["icons"]) == 1, f"{label}: one icon per overflow destination/trigger"
            attributes = owner["icons"][0]["attributes"]
            assert attributes.get("aria-hidden") == "true" and attributes.get("focusable") == "false", f"{label}: overflow icons are decorative"
        circles = summary["icons"][0]["circles"]
        assert len(circles) == 3 and len({circle.get("cx") for circle in circles}) == 1 and len({circle.get("cy") for circle in circles}) == 3, f"{label}: vertical three-dot More icon"
    information = parser.structures.get("Information", [])
    assert len(information) == 1 and [link["attributes"].get("href") for link in information[0]["links"]] == footer, "Footer information destinations occur exactly once"


def policy_document(origin: str, path: str, *, page: str, title: str,
                    notice: dict, sections: list[str], patterns: list[str],
                    forbidden: str, forms: str, indexable: bool = False) -> str:
    response = request(origin, path, redirect=True)
    assert response.status == 200, path
    assert response.headers.get("set-cookie") is None
    html, visible = response.text, visible_html(response.text, comments=False)
    match(r'<html[^>]*lang="en"', html)
    match(rf'<title>{re.escape(title)} \| Goal Hint</title>', html)
    match(rf'rel="canonical" href="https://goalhint\.com/en/{page}"', html)
    match(rf'name="robots" content="{"index" if indexable else "noindex"}, follow"', html)
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
    match(rf'data-{page}-release-ready="{str(notice["releaseReady"]).lower()}"', visible)
    match(rf'datetime="{re.escape(notice["reviewedOn"])}"', visible, flags=re.I)
    for pattern in patterns:
        match(pattern, visible)
    assert_navigation(visible, primary=f"/en/{page}", footer=f"/en/{page}", mobile=f"/en/{page}")
    no_match(r'(?:href|action)="[^"\s]*how-it-works', visible)
    no_match(forbidden, visible, flags=re.I)
    main = match(r"<main\b[^>]*>([\s\S]*?)</main>", visible).group(1)
    no_match(forms, main, flags=re.I)
    return visible
