"""Verify the selected desktop slip component against isolated original snapshots."""
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit

from lib.rendering import Server, build_fixture, create_fixture, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


class Element:
    def __init__(self, tag="document", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def nodes(self, tag=None, attr=None):
        found = []
        for child in self.children:
            if isinstance(child, Element):
                if (tag is None or child.tag == tag) and (attr is None or attr in child.attrs):
                    found.append(child)
                found.extend(child.nodes(tag, attr))
        return found

    @property
    def text(self):
        return "".join(child.text if isinstance(child, Element) else child for child in self.children)


class Document(HTMLParser):
    void = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.root, self.stack = Element(), []
        self.stack.append(self.root)
        self.feed(visible_html(markup))

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in self.void:
            self.stack.append(element)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def single(nodes, message):
    assert len(nodes) == 1, message
    return nodes[0]


def verify_desktop(document, path, saved=False):
    wrapper = single(document.nodes(attr="data-desktop-design"), f"{path}: one selected desktop layout")
    assert wrapper.attrs["data-desktop-design"] == "subtle-dividers", f"{path}: selected variant 09"
    disclosure = single(wrapper.nodes("details", "data-slip-disclosure"), f"{path}: native disclosure")
    assert "open" not in disclosure.attrs, f"{path}: desktop starts collapsed before hydration"
    summary = single(disclosure.nodes("summary", "data-slip-summary"), f"{path}: one compact summary")
    assert not summary.nodes("a") and not summary.nodes("button"), f"{path}: no competing summary controls"
    assert all(value in summary.text for value in ["Slip 1", "21.95", "72.4%", "3 selections"]), f"{path}: correct aggregate facts"
    assert "Win probability" not in summary.text, f"{path}: average replaces whole-slip estimate"
    rows = disclosure.nodes(attr="data-desktop-row")
    assert len(rows) == 3, f"{path}: all original selections survive SSR"
    fields = ("data-row-date", "data-row-time", "data-row-league", "data-row-country", "data-row-teams", "data-row-market", "data-row-odds", "data-row-probability")
    for index, row in enumerate(rows):
        children = [child for child in row.children if isinstance(child, Element)]
        ordered = [next((field for field in fields if field in child.attrs), None) for child in children]
        assert [field for field in ordered if field] == list(fields), f"{path}: one-line logical field order"
        assert row.attrs.get("data-status") == "unknown" and row.attrs.get("data-match-state") == "snapshot", f"{path}: no invented live/final state"
        date = single(row.nodes("time", "data-row-date"), f"{path}: date")
        clock = single(row.nodes("time", "data-row-time"), f"{path}: kickoff")
        assert re.fullmatch(r"\d{1,2} [A-Z][a-z]{2}", date.text.strip()), f"{path}: short date omits weekday"
        assert re.fullmatch(r"\d{2}:\d{2} EAT", clock.text.strip()), f"{path}: 24-hour reporting timezone"
        assert date.attrs.get("datetime", "").endswith("Z"), f"{path}: canonical source instant"
        assert single(row.nodes("img", "data-country-flag"), f"{path}: local country flag").attrs["src"].startswith("/flags/")
        home = single(row.nodes(attr="data-home"), f"{path}: home")
        away = single(row.nodes(attr="data-away"), f"{path}: away")
        assert home.nodes(attr="data-team-logo") and away.nodes(attr="data-team-logo"), f"{path}: tiny team crest slots"
        assert [child for child in home.children if isinstance(child, Element)][-1].attrs.get("data-team-logo") == "", f"{path}: home crest after its name"
        assert "data-team-logo" in [child for child in away.children if isinstance(child, Element)][0].attrs, f"{path}: away crest before its name"
        analysis = single(row.nodes("a", "data-match-analysis-link"), f"{path}: one accessible analysis link")
        assert analysis.attrs.get("aria-label") and urlsplit(analysis.attrs["href"]).path.startswith("/en/matches/"), f"{path}: canonical analysis destination"
        assert not analysis.nodes("button"), f"{path}: analysis never nests tooltip buttons"
        assert single(row.nodes(attr="data-row-odds"), f"{path}: original odds").nodes("strong"), f"{path}: numerical price"
        assert single(row.nodes(attr="data-row-probability"), f"{path}: original probability").nodes("strong"), f"{path}: numerical forecast"
        if not saved:
            assert not row.nodes(attr="data-row-result"), f"{path}: no invented saved outcome"
    assert rows[1].nodes(attr="data-row-date")[0].text.strip() == "30 Oct" and rows[1].nodes(attr="data-row-time")[0].text.strip() == "00:00 EAT", f"{path}: EAT midnight rollover"
    assert rows[1].nodes(attr="data-row-odds")[0].nodes("strong")[0].text == "7.73", f"{path}: original alternative price"
    assert rows[1].nodes(attr="data-row-probability")[0].nodes("strong")[0].text == "61.7%", f"{path}: original forecast precision"
    assert rows[1].nodes(attr="data-pick-label")[0].text == "U 2.5", f"{path}: original alternative selection"
    assert "synthetic-metropolitan-international-athletic-football-club" in rows[2].nodes("a")[0].attrs["href"], f"{path}: original full-name canonical slug"
    if saved:
        assert [row.attrs["data-outcome"] for row in rows] == ["correct", "incorrect", "void"], f"{path}: original saved outcomes"
        scores = [row.nodes(attr="data-saved-score") for row in rows]
        assert "2–1" in scores[0][0].text and "4–0" in scores[1][0].text and not scores[2], f"{path}: supplied regulation scores only"


def verify(origin, directory):
    for scenario in ["desktop", "saved", "locked", "locked-member", "responsive", "best-locked", "best-locked-member"]:
        response = request(origin, f"/{scenario}")
        assert response.status == 200, f"{scenario}: HTTP 200"
        (directory / f"{scenario}.html").write_text(response.text, encoding="utf-8")
        document = Document(response.text).root
        assert len(document.nodes("h1")) == 1 and len(document.nodes("main")) == 1, f"{scenario}: one page heading/landmark"
        if scenario in {"desktop", "saved"}:
            verify_desktop(document, scenario, saved=scenario == "saved")
        elif scenario in {"locked", "locked-member", "best-locked", "best-locked-member"}:
            disclosure = single(document.nodes("details", "data-slip-disclosure"), f"{scenario}: native locked disclosure")
            assert "open" not in disclosure.attrs
            assert not document.nodes(attr="data-fixture-id") and not document.nodes(attr="data-slip-id"), f"{scenario}: no private identities"
            assert not re.search(r"desktop-fixture-|Ajax|Original Inter|home-win|7\.73|0\.6173", response.text), f"{scenario}: no private HTML or flight values"
            summary = single(disclosure.nodes("summary"), f"{scenario}: summary")
            assert all(value in summary.text for value in ["21.95", "72.4%", "3 selections"]), f"{scenario}: public aggregate facts"
            content = single(disclosure.nodes(attr="data-slip-content"), f"{scenario}: locked body")
            action = single(content.nodes("a"), f"{scenario}: one relevant action")
            expected = "Subscribe" if scenario.endswith("member") else "Log in to access"
            assert action.text.strip() == expected, f"{scenario}: correct access action"
        else:
            assert not document.nodes(attr="data-desktop-row"), "Responsive SSR retains the existing mobile fallback"
            assert len(document.nodes("li", "data-slip-selection")) == 3, "Responsive SSR sends one original selection set"
        print(f"PASS desktop slip SSR: {scenario}", flush=True)


def main():
    args = parse_args("selected desktop slips", extra=("--fixture",))
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("desktop-slips")
        shutil.copytree(ROOT / "public/design/slip-desktop", directory / "public/design/slip-desktop", dirs_exist_ok=True)
        print(f"Building isolated selected-desktop fixture: {directory}", flush=True)
        build_fixture(directory, timeout=300)
    with Server(directory) as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Browser routes: {server.origin}/desktop, /saved, /locked, /locked-member, /responsive, /best-locked, /best-locked-member", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
