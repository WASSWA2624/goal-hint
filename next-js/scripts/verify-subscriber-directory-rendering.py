"""Production Balanced compact Subscribers acceptance with isolated owner fixtures."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from lib.rendering import Server, build_fixture, create_fixture, environment, local_origin, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard

COOKIE = "goal-hint-member=" + "z" * 43
PRIMARY = "00000000-0000-4000-8000-000000000100"
BLOCKED = "00000000-0000-4000-8000-000000000103"
BASE_QUERY = {"search": "", "status": "all", "access": "all", "plan": "all", "recent": "all"}
VOID_ELEMENTS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


@dataclass
class Element:
    tag: str
    attributes: dict[str, str | None] = field(default_factory=dict)
    children: list[Element | str] = field(default_factory=list)

    def all(self, tag: str | None = None, attribute: str | None = None) -> list[Element]:
        result = []
        for child in self.children:
            if isinstance(child, Element):
                if (tag is None or child.tag == tag) and (attribute is None or attribute in child.attributes):
                    result.append(child)
                result.extend(child.all(tag, attribute))
        return result

    def one(self, *, tag: str | None = None, attribute: str | None = None) -> Element:
        matches = self.all(tag, attribute)
        assert len(matches) == 1, f"Expected one {tag or 'element'} with {attribute}; found {len(matches)}."
        return matches[0]

    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(child.text() if isinstance(child, Element) else child for child in self.children)).strip()


class Document(HTMLParser):
    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]
        self.feed(visible_html(html))

    def handle_starttag(self, tag, attrs):
        element = Element(tag, dict(attrs))
        self.stack[-1].children.append(element)
        if tag not in VOID_ELEMENTS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, dict(attrs)))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack = self.stack[:index]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def fixture_json(origin: str, path: str, body=None, *, headers=None):
    outgoing = Request(origin + path, data=None if body is None else json.dumps(body).encode(),
        headers={"Cookie": COOKIE, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", **(headers or {})},
        method="GET" if body is None else "POST")
    try:
        response = urlopen(outgoing, timeout=30)
    except HTTPError as error:
        response = error
    with response:
        assert response.headers.get("Cache-Control") == "no-store", (path, response.status)
        return response.status, json.loads(response.read())


def page(origin: str, query=None) -> Element:
    path = "/admin/subscribers" + ("?" + urlencode(query) if query else "")
    response = request(origin, path, headers={"Cookie": COOKIE}, timeout=30)
    assert response.status == 200, (path, response.status)
    assert "no-store" in response.headers.get("Cache-Control", ""), path
    return Document(response.text).root


def directory_rendering(origin: str) -> None:
    document = page(origin, {"accountId": PRIMARY})
    workspace = document.one(attribute="data-subscriber-workspace")
    assert workspace.one(tag="h1").text() == "Subscribers"
    add = [button for button in workspace.all("button") if button.text() == "Grant access / add subscriber"]
    assert len(add) == 1 and add[0].attributes.get("aria-haspopup") == "dialog"
    directory = workspace.one(attribute="data-subscriber-directory")
    filters = directory.one(attribute="data-subscriber-review-filters")
    assert filters.attributes.get("role") == "search"
    assert [label.text() for label in filters.all("label")] == ["Search subscribers", "Account status", "Access", "Package", "Last sign-in"]
    search = filters.one(tag="input")
    assert search.attributes.get("type") == "search" and search.attributes.get("placeholder") == "Phone, package, code or note"
    assert len(filters.all("select")) == 4 and not filters.all("button") and not filters.all("form")
    for control in filters.all("input") + filters.all("select"):
        assert "disabled" not in control.attributes
        assert any(label.attributes.get("for") == control.attributes.get("id") for label in filters.all("label"))
    results = directory.one(attribute="data-subscriber-results")
    assert results.attributes.get("aria-busy") == "false" and results.attributes.get("tabindex") == "0"
    rows = results.all(attribute="data-subscriber-row")
    assert len(rows) == 6 and all(row.tag == "a" for row in rows)
    assert sorted(row.one(attribute="data-subscriber-status").attributes["data-subscriber-status"] for row in rows) == ["blocked", "erased", "open", "open", "open", "open"]
    for row in rows:
        assert row.attributes["data-review-subscriber-row"] == row.attributes["data-subscriber-row"]
        assert row.one(attribute="data-review-network").attributes.get("aria-label") == "Network unknown"
        assert not row.all(attribute="data-payment-logo"), "Unknown carriers must not borrow a payment network logo."
        row.one(attribute="data-review-phone")
        row.one(attribute="data-review-row-meta").one(tag="time")
    selected = next(row for row in rows if row.attributes["data-subscriber-row"] == PRIMARY)
    assert selected.attributes.get("aria-current") == "page"
    count = directory.one(attribute="data-subscriber-count")
    assert count.attributes.get("aria-live") == "polite" and count.text() == "6 accounts shown · up to 100"
    detail = workspace.one(attribute="data-subscriber-detail")
    assert detail.attributes.get("data-subscriber-presentation") == "compact-dialog"
    summary = detail.one(attribute="data-subscriber-summary")
    stats = summary.one(attribute="data-subscriber-stats")
    assert [term.text() for term in stats.all("dt")] == ["Unlocked devices", "Access periods", "Unlocks · 30 days", "Credit"]
    actions = summary.one(attribute="data-subscriber-actions").all("button")
    assert [button.text() for button in actions] == ["Grant access", "Change number", "Block account", "Sign out devices"]
    assert all(button.attributes.get("aria-haspopup") == "dialog" and button.attributes.get("aria-expanded") == "false" for button in actions)
    tabs = detail.one(attribute="data-subscriber-tabs")
    assert [re.sub(r" \(\d+\)$", "", button.text()) for button in tabs.all("button")] == ["Overview", "Access", "Payments", "Credit", "Devices"]
    assert sum(button.attributes.get("aria-selected") == "true" for button in tabs.all("button")) == 1
    assert not detail.all(attribute="data-subscriber-action-panel") and not detail.all(attribute="data-subscriber-action-dialog")
    assert not document.all(attribute="data-subscriber-dialog"), "Action dialogs start closed."
    assert not re.search(r"Reset password|Set temporary password|temporary-password", detail.text(), re.I)
    assert not any(control.attributes.get("name") in {"reason", "newPhone", "verifiedBy", "planId", "days"} for control in detail.all("input") + detail.all("select"))
    filtered = page(origin, {"status": "blocked"}).one(attribute="data-subscriber-directory")
    assert [row.attributes["data-subscriber-row"] for row in filtered.all(attribute="data-subscriber-row")] == [BLOCKED]
    assert filtered.one(attribute="data-subscriber-count").text() == "1 account shown · up to 100"
    assert any(option.attributes.get("value") == "blocked" and "selected" in option.attributes for option in filtered.all("option"))
    empty = page(origin, {"search": "NoMatchingSubscriberFixture"}).one(attribute="data-subscriber-directory")
    assert empty.one(attribute="data-subscriber-empty").text() == "No matching subscribers."
    assert not empty.all(attribute="data-subscriber-row")


def directory_api(origin: str) -> None:
    def accounts(**query):
        status, reply = fixture_json(origin, "/api/admin/subscribers", {**BASE_QUERY, **query})
        assert status == 200 and isinstance(reply.get("accounts"), list), (query, status, reply)
        for account in reply["accounts"]:
            assert set(account) == {"id", "phone", "status", "lastSignInAt", "access", "planNames", "network"}
            assert account["status"] in {"open", "blocked", "erased"} and account["access"] in {"active", "queued", "none"}
            assert isinstance(account["planNames"], list) and account["network"] is None
        return reply["accounts"]

    def ids(**query):
        return {account["id"] for account in accounts(**query)}

    baseline = accounts()
    assert len(baseline) == 6
    assert [row["lastSignInAt"] for row in baseline] == sorted((row["lastSignInAt"] for row in baseline), reverse=True)
    for query in ["0700000101", "+256 700 000 101", "0000101", PRIMARY, "Synthetic owner", "Weekly", "C-CODE", "P-TEST"]:
        assert ids(search=query) == {PRIMARY}, query
    assert ids(search="blocked") == {BLOCKED}
    assert ids(search="+44 7700 900123") == {"00000000-0000-4000-8000-000000000105"}
    assert not ids(search="NoMatchingSubscriberFixture")
    for status in ["open", "blocked", "erased"]:
        assert ids(status=status) == {row["id"] for row in baseline if row["status"] == status}
    assert ids(access="none") == {row["id"] for row in baseline} and not ids(access="active") and not ids(access="queued")
    assert not ids(plan="Weekly"), "Expired packages are searchable but are not current package filters."
    for days in [1, 7, 30]:
        now = datetime.now(timezone.utc)
        expected = {row["id"] for row in baseline if now - timedelta(days=days) <= datetime.fromisoformat(row["lastSignInAt"].replace("Z", "+00:00")) <= now}
        assert ids(recent=str(days)) == expected, days
    # These are the fixture's actual accepted manual-grant keys; the collection query itself remains flat.
    for plan in ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003"]:
        status, grant = fixture_json(origin, "/api/admin/codes", {"action": "manual", "phone": "0700000101", "planId": plan, "amount": 0, "note": "Synthetic directory acceptance grant"})
        assert status == 201 and grant.get("status") == "granted", (status, grant)
    enriched = next(row for row in accounts() if row["id"] == PRIMARY)
    assert enriched["access"] == "active" and enriched["planNames"] == ["Weekly", "Monthly"]
    assert ids(access="active") == ids(plan="Weekly") == ids(plan="Monthly") == {PRIMARY}
    assert PRIMARY not in ids(access="none") and PRIMARY not in ids(plan="none")
    assert not ids(access="queued"), "A queued renewal does not override an active period."
    assert ids(search="active", status="open", access="active", plan="Monthly") == {PRIMARY}
    assert not ids(search="active", status="blocked")
    for invalid in [{"status": "online"}, {"access": "online"}, {"recent": "3"}, {"search": "x" * 121}, {"query": BASE_QUERY}]:
        status, _ = fixture_json(origin, "/api/admin/subscribers", {**BASE_QUERY, **invalid})
        assert status == 400, invalid
    assert fixture_json(origin, "/api/admin/subscribers", BASE_QUERY, headers={"Sec-Fetch-Site": "cross-site"})[0] == 403
    assert fixture_json(origin, "/api/admin/subscribers", BASE_QUERY, headers={"Cookie": ""})[0] == 401


def verify(origin: str) -> None:
    """Verify a running production owner-payments fixture without starting another build."""
    origin = local_origin(origin)
    assert fixture_json(origin, "/api/fixture/subscribers", {})[0] == 200
    try:
        directory_rendering(origin)
        directory_api(origin)
    finally:
        assert fixture_json(origin, "/api/fixture/subscribers", {})[0] == 200
    print("PASS Balanced compact Subscribers: shared floating search and filters, native account rows, live count, compact stats and dialog triggers; enriched API search/filter combinations and administrator/cross-site guards.", flush=True)


def main():
    args = parse_args("subscriber directory", extra=("--fixture", "--origin"))
    if args.origin:
        verify(args.origin)
        return
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
        GOAL_HINT_ADMIN_PASSWORD="Synthetic owner fixture password", GOAL_HINT_ADMIN_PASSWORD_HASH="")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file(), "Reuse a built acceptance fixture inside .tmp."
    else:
        directory = create_fixture("owner-payments")
        print(f"Building Subscribers acceptance fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=300)
    with Server(directory, env, ready="/api/fixture/health") as server:
        verify(server.origin)
        if args.serve:
            print(f"Synthetic administrator browser entry: {server.origin}/api/fixture/session", flush=True)
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Subscribers acceptance failed; run verify(origin) directly for assertion diagnostics.")
