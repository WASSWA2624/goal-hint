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


def verify_frame(document, path, total="21.95", average="72.4%", count=3):
    wrapper = single(document.nodes(attr="data-production-desktop-slip"), f"{path}: one selected desktop layout")
    assert wrapper.attrs["data-desktop-design"] == "aligned-ledger", f"{path}: selected variant 01"
    disclosure = single(wrapper.nodes("details", "data-slip-disclosure"), f"{path}: native disclosure")
    assert "open" not in disclosure.attrs, f"{path}: desktop starts collapsed before hydration"
    summary = single(disclosure.nodes("summary", "data-slip-summary"), f"{path}: one compact summary")
    assert not summary.nodes("a") and not summary.nodes("button"), f"{path}: no competing summary controls"
    assert all(value in summary.text for value in ["Slip 1", total, average, f"{count} selections"]), f"{path}: correct aggregate facts"
    assert "Win probability" not in summary.text, f"{path}: average replaces whole-slip estimate"
    rows = disclosure.nodes(attr="data-desktop-row")
    assert len(rows) == count, f"{path}: all original selections survive SSR"
    fields = ("data-row-date", "data-row-time", "data-row-country", "data-row-league", "data-row-teams", "data-row-market", "data-row-odds", "data-row-probability", "data-row-status")
    for row in rows:
        children = [child for child in row.children if isinstance(child, Element)]
        ordered = [next((field for field in fields if field in child.attrs), None) for child in children]
        assert [field for field in ordered if field] == list(fields), f"{path}: one-line logical field order"
        date_cell = single(row.nodes(attr="data-row-date"), f"{path}: date cell")
        date = date_cell if date_cell.tag == "time" else single(date_cell.nodes("time"), f"{path}: date")
        clock = single(row.nodes("time", "data-row-time"), f"{path}: kickoff")
        assert re.fullmatch(r"\d{1,2}-[A-Z][a-z]{2}", date.text.strip()), f"{path}: short hyphenated date omits weekday"
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
        assert row.nodes(attr="data-centre") and row.nodes(attr="data-score") and row.nodes(attr="data-clock"), f"{path}: dedicated score and clock anchors"
        assert single(row.nodes(attr="data-row-odds"), f"{path}: original odds").nodes("strong"), f"{path}: numerical price"
        assert single(row.nodes(attr="data-row-probability"), f"{path}: original probability").nodes("strong"), f"{path}: numerical forecast"
        status = single(row.nodes(attr="data-match-status"), f"{path}: one clear match status")
        assert ("data-match-label" in status.attrs) != ("data-outcome-label" in status.attrs), f"{path}: show progress or outcome once"
    return rows


def verify_desktop(document, path, saved=False):
    rows = verify_frame(document, path)
    assert all(row.attrs.get("data-status") == "unknown" for row in rows), f"{path}: no invented fixture observation"
    assert all(row.attrs.get("data-match-state") == ("snapshot" if saved else "unknown") for row in rows), f"{path}: no invented live/final state"
    assert rows[1].nodes(attr="data-row-date")[0].nodes("time")[0].text.strip() == "30-Oct" and rows[1].nodes(attr="data-row-time")[0].text.strip() == "00:00 EAT", f"{path}: EAT midnight rollover"
    assert rows[1].nodes(attr="data-row-odds")[0].nodes("strong")[0].text == "7.73", f"{path}: original alternative price"
    assert rows[1].nodes(attr="data-row-probability")[0].nodes("strong")[0].text == "61.7%", f"{path}: original forecast precision"
    assert rows[1].nodes(attr="data-pick-label")[0].text == "U 2.5", f"{path}: original alternative selection"
    assert "synthetic-metropolitan-international-athletic-football-club" in rows[2].nodes("a")[0].attrs["href"], f"{path}: original full-name canonical slug"
    if saved:
        assert [row.attrs["data-outcome"] for row in rows] == ["correct", "incorrect", "void"], f"{path}: original saved outcomes"
        scores = [row.nodes(attr="data-score")[0].text for row in rows]
        assert "2–1" in scores[0] and "4–0" in scores[1] and "VS" in scores[2], f"{path}: supplied regulation scores only"
        assert all(not row.nodes(attr="data-clock")[0].text.strip() for row in rows), f"{path}: saved result does not invent FT or elapsed minutes"
        assert all(not row.nodes(attr="data-match-label") for row in rows), f"{path}: saved outcomes have no redundant progress label"
        assert [row.nodes(attr="data-outcome-label")[0].text.strip() for row in rows] == ["Won", "Lost", "Void"], f"{path}: explicit saved selection labels"
    else:
        assert all("VS" in row.nodes(attr="data-score")[0].text and row.nodes(attr="data-match-label")[0].text.strip() == "Unknown" for row in rows), f"{path}: original snapshot has no assumed upcoming/live state"
        assert all(not row.nodes(attr="data-outcome-label") for row in rows), f"{path}: unknown matches do not show prediction Pending"


def verify_states(document):
    rows = verify_frame(document, "states", total="62.35", average="74.5%", count=5)
    assert [row.attrs["data-match-state"] for row in rows] == ["upcoming", "live", "halftime", "finished", "finished"], "states: supplied fixture phases"
    assert [row.attrs["data-outcome"] for row in rows] == ["pending", "pending", "pending", "correct", "incorrect"], "states: original selection outcomes"
    assert [row.nodes(attr="data-clock")[0].text.strip() for row in rows] == ["", "30′", "HT", "FT", "FT"], "states: supplied minute, halftime and final labels"
    for row, score in zip(rows, ["VS", "1–0", "1–1", "2–1", "0–1"]):
        assert score in row.nodes(attr="data-score")[0].text, "states: actual supplied score"
    assert [row.nodes(attr="data-match-status")[0].text.strip() for row in rows] == ["Upcoming", "Live", "Live", "Won", "Lost"], "states: progress takes precedence until the final outcome"
    assert [bool(row.nodes(attr="data-match-live-dot")) for row in rows] == [False, True, True, False, False], "states: only live fixtures have a glowing dot, including halftime"


def verify(origin, directory):
    scenarios = ["desktop", "saved", "states", "locked", "locked-member", "responsive", "best-locked", "best-locked-member", "best-full", "builder", "best-auto", "builder-auto"]
    for scenario in scenarios:
        response = request(origin, f"/{scenario}")
        assert response.status == 200, f"{scenario}: HTTP 200"
        (directory / f"{scenario}.html").write_text(response.text, encoding="utf-8")
        document = Document(response.text).root
        assert len(document.nodes("h1")) == 1 and len(document.nodes("main")) == 1, f"{scenario}: one page heading/landmark"
        if scenario in {"desktop", "saved"}:
            verify_desktop(document, scenario, saved=scenario == "saved")
        elif scenario == "states":
            verify_states(document)
        elif scenario in {"locked", "locked-member", "best-locked", "best-locked-member"}:
            if scenario.startswith("best-locked"):
                assert not document.nodes("details", "data-slip-disclosure"), f"{scenario}: free viewers only see completed public slips"
                assert not document.nodes(attr="data-fixture-id") and not document.nodes(attr="data-slip-id"), f"{scenario}: no unreleased private identities"
                assert document.nodes(attr="data-best-slips-access"), f"{scenario}: appropriate access message"
                print(f"PASS desktop slip SSR: {scenario}", flush=True)
                continue
            disclosure = single(document.nodes("details", "data-slip-disclosure"), f"{scenario}: native locked disclosure")
            assert "open" not in disclosure.attrs
            assert not document.nodes(attr="data-fixture-id") and not document.nodes(attr="data-slip-id"), f"{scenario}: no private identities"
            assert not re.search(r"desktop-(?:fixture|state|best)-|Ajax|Original Inter|home-win|7\.73|0\.6173", response.text), f"{scenario}: no private HTML or flight values"
            summary = single(disclosure.nodes("summary"), f"{scenario}: summary")
            assert all(value in summary.text for value in ["21.95", "72.4%", "3 selections"]), f"{scenario}: public aggregate facts"
            content = single(disclosure.nodes(attr="data-slip-content"), f"{scenario}: locked body")
            action = single(content.nodes("a"), f"{scenario}: one relevant action")
            expected = "Subscribe" if scenario.endswith("member") else "Sign in to access"
            assert action.text.strip() == expected, f"{scenario}: correct access action"
        else:
            assert not document.nodes(attr="data-desktop-row"), "Responsive SSR retains the existing mobile fallback"
            count = 3 if scenario == "responsive" else 6 if scenario.endswith("-auto") else 10
            assert len(document.nodes("li", "data-slip-selection")) == count, "Responsive SSR sends one original selection set per slip"
            if scenario.endswith("-auto"):
                assert "00000000-0000-4000-8000-00000000a001" in response.text, "Automatic fixture retains valid original UUID identities"
                cards = document.nodes(attr="data-compact-slip")
                assert len(cards) == 2 and all(card.attrs["data-compact-slip"] == "clean-ledger" for card in cards), "Automatic fixture retains unchanged mobile SSR slips"
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
        print(f"Browser routes: {server.origin}/desktop, /saved, /states, /locked, /locked-member, /responsive, /best-locked, /best-locked-member, /best-full, /builder, /best-auto, /builder-auto", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
