"""Production Subscribers rendering and management with isolated owner fixtures."""
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
    add = [button for button in workspace.all("button") if button.text() == "Grant access / add subscriber"]
    assert len(add) == 1 and add[0].attributes.get("aria-haspopup") == "dialog"
    directory = workspace.one(attribute="data-subscriber-directory")
    filters = workspace.one(attribute="data-subscriber-review-filters")
    assert filters.attributes.get("role") == "search"
    assert [label.text() for label in filters.all("label")] == ["Search subscribers"]
    search = filters.one(tag="input")
    assert search.attributes.get("type") == "search" and search.attributes.get("placeholder") == " "
    assert not filters.all("select") and not filters.all("form")
    assert filters.one(attribute="data-search-filters").attributes.get("aria-haspopup") == "dialog"
    for control in filters.all("input") + filters.all("select"):
        assert "disabled" not in control.attributes
        assert any(label.attributes.get("for") == control.attributes.get("id") for label in filters.all("label"))
    results = directory.one(attribute="data-subscriber-results")
    assert results.attributes.get("aria-busy") == "false" and results.attributes.get("tabindex") == "0"
    tools = directory.one(attribute="data-record-list-tools")
    toolbar = tools.one(attribute="data-subscriber-selection")
    assert directory.children.index(tools) < directory.children.index(results)
    assert toolbar.one(tag="label").text() == "Select all loaded"
    select_all = toolbar.one(tag="input")
    assert select_all.attributes.get("type") == "checkbox" and "checked" not in select_all.attributes
    manage = [button for button in toolbar.all("button") if button.text() == "Manage"]
    assert len(manage) == 1 and "disabled" in manage[0].attributes
    assert any(button.attributes.get("aria-label") == "Refresh subscriber list" for button in tools.all("button"))
    count = tools.one(attribute="data-subscriber-count")
    assert count.attributes.get("aria-live") == "polite" and count.text() == "6 subscribers"
    rows = results.all(attribute="data-subscriber-row")
    assert len(rows) == 6 and all(row.tag == "div" for row in rows)
    for row in rows:
        for removed in ("data-review-network", "data-subscriber-status"):
            assert not row.all(attribute=removed)
        assert "No access" in row.one(attribute="data-subscriber-row-meta").text()
        last_login = row.one(attribute="data-subscriber-last-sign-in")
        assert "Last login" in last_login.text() and last_login.one(tag="time").attributes.get("datetime")
        assert row.one(tag="input").attributes.get("type") == "checkbox"
        open_account = row.one(tag="a", attribute="data-subscriber-open")
        assert "Open" not in open_account.text() and row.attributes["data-subscriber-row"] in open_account.attributes["href"]
        assert not open_account.all("button") and not open_account.all("input"), "Account tools are sibling controls."
        more = row.one(tag="button")
        assert more.attributes.get("aria-expanded") == "false" and more.attributes.get("aria-label", "").startswith("More actions for")
        assert more.one(tag="svg")
    selected = next(row for row in rows if row.attributes["data-subscriber-row"] == PRIMARY)
    assert selected.one(attribute="data-subscriber-open").attributes.get("aria-current") == "true"
    erased = next(row for row in rows if row.attributes["data-subscriber-row"].endswith("104"))
    assert "Erased account" in erased.one(attribute="data-subscriber-open").text()
    detail = workspace.one(attribute="data-subscriber-detail")
    summary = detail.one(attribute="data-subscriber-summary")
    assert "Last login" in summary.text() and not summary.all(attribute="data-subscriber-stats")
    overview = [section for section in detail.all() if section.attributes.get("role") == "tabpanel" and "hidden" not in section.attributes]
    assert len(overview) == 1
    for label in ("Credit balance", "Account ID", PRIMARY):
        assert label in overview[0].text()
    assert "Synthetic owner note" not in overview[0].text()
    assert not any("Account ID" in disclosure.text() for disclosure in overview[0].all("summary"))
    assert len([button for button in detail.all("button") if button.text() == "Delete or erase"]) == 1
    actions = detail.one(attribute="data-record-footer").one(attribute="data-subscriber-actions").all("button")
    assert not summary.all(attribute="data-subscriber-actions")
    assert [button.text() for button in actions] == ["Grant access", "Change number", "Block account", "Log out devices", "Reset password"]
    assert all(button.attributes.get("aria-haspopup") == "dialog" and button.attributes.get("aria-expanded") != "true" for button in actions)
    tabs = detail.one(attribute="data-subscriber-tabs")
    assert [re.sub(r" \(\d+\)$", "", button.text()) for button in tabs.all("button")] == ["Overview", "Access", "Payments", "Credit", "Devices"]
    assert sum(button.attributes.get("aria-selected") == "true" for button in tabs.all("button")) == 1
    assert not detail.all(attribute="data-subscriber-action-panel") and not detail.all(attribute="data-subscriber-action-dialog")
    assert not document.all(attribute="data-subscriber-dialog"), "Action dialogs start closed."
    assert not re.search(r"Set temporary password|temporary-password", detail.text(), re.I)
    assert not any(control.attributes.get("name") in {"reason", "newPhone", "verifiedBy", "planId", "days"} for control in detail.all("input") + detail.all("select"))
    filtered = page(origin, {"status": "blocked"}).one(attribute="data-subscriber-workspace")
    assert [row.attributes["data-subscriber-row"] for row in filtered.all(attribute="data-subscriber-row")] == [BLOCKED]
    assert filtered.one(attribute="data-subscriber-count").text() == "1 subscriber"
    assert filtered.one(attribute="data-search-filters").one(tag="b").text() == "1"
    empty = page(origin, {"search": "NoMatchingSubscriberFixture"}).one(attribute="data-subscriber-directory")
    assert empty.one(attribute="data-subscriber-empty").text() == "No matching subscribers."
    assert not empty.all(attribute="data-subscriber-row")
    reset = page(origin, {"accountId": PRIMARY, "action": "password-reset"}).one(attribute="data-subscriber-action-dialog")
    assert reset.attributes.get("data-subscriber-action-dialog") == "password-reset" and "one-time reset link" in reset.text()
    assert not reset.all(tag="input")
    for value in ("erase", "delete"):
        removal = page(origin, {"accountId": PRIMARY, "action": value}).one(attribute="data-subscriber-removal")
        assert removal.attributes.get("data-subscriber-removal") == value and removal.one(tag="input").attributes.get("type") == "checkbox"


def directory_api(origin: str) -> None:
    def accounts(**query):
        status, reply = fixture_json(origin, "/api/admin/subscribers", {**BASE_QUERY, **query})
        assert status == 200 and isinstance(reply.get("accounts"), list), (query, status, reply)
        assert reply["page"] == reply["pages"] == 1 and reply["total"] == len(reply["accounts"])
        for account in reply["accounts"]:
            assert set(account) == {"id", "phone", "status", "lastSignInAt", "access"}
            assert account["status"] in {"open", "blocked", "erased"} and account["access"] in {"active", "queued", "none"}
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
    assert next(row for row in accounts() if row["id"] == PRIMARY)["access"] == "active"
    assert ids(access="active") == ids(plan="Weekly") == ids(plan="Monthly") == {PRIMARY}
    assert PRIMARY not in ids(access="none") and PRIMARY not in ids(plan="none")
    assert not ids(access="queued"), "A queued renewal does not override an active period."
    assert ids(search="active", status="open", access="active", plan="Monthly") == {PRIMARY}
    assert not ids(search="active", status="blocked")
    for invalid in [{"status": "online"}, {"access": "online"}, {"recent": "3"}, {"search": "x" * 121}, {"query": BASE_QUERY},
                    {"page": 0}, {"pageSize": 500}, {"after": {"id": PRIMARY, "lastSignInAt": "invalid"}}]:
        status, _ = fixture_json(origin, "/api/admin/subscribers", {**BASE_QUERY, **invalid})
        assert status == 400, invalid
    assert fixture_json(origin, "/api/admin/subscribers", BASE_QUERY, headers={"Sec-Fetch-Site": "cross-site"})[0] == 403
    assert fixture_json(origin, "/api/admin/subscribers", BASE_QUERY, headers={"Cookie": ""})[0] == 401


def page_and_action_api(origin: str) -> None:
    state = "/api/fixture/subscribers"
    assert fixture_json(origin, state, {"pagination": True})[0] == 200
    ids, batches = [], []
    for page_number, expected in [(1, 100), (2, 100), (3, 1)]:
        query = {"search": "Synthetic paging fixture", "page": page_number}
        status, reply = fixture_json(origin, "/api/admin/subscribers", {**BASE_QUERY, **query})
        assert status == 200 and reply["page"] == page_number and reply["pages"] == 3 and reply["total"] == 201
        assert len(reply["accounts"]) == expected
        batches.append(reply["accounts"])
        ids.extend(row["id"] for row in reply["accounts"])
        rendered = page(origin, {**query, "accountId": PRIMARY})
        assert len(rendered.all(attribute="data-subscriber-row")) == expected
        assert rendered.one(attribute="data-subscriber-count").text() == "201 subscribers"
        detail = rendered.one(attribute="data-subscriber-detail")
        assert PRIMARY in detail.text()
        show_more = rendered.all(attribute="data-show-more")
        assert len(show_more) == (1 if page_number < 3 else 0)
        if show_more:
            assert show_more[0].text() == "Show More"
    assert len(ids) == len(set(ids)) == 201
    def after(batch):
        anchor = {key: batch[-1][key] for key in ("id", "lastSignInAt")}
        status, reply = fixture_json(origin, "/api/admin/subscribers",
            {**BASE_QUERY, "search": "Synthetic paging fixture", "after": anchor})
        assert status == 200
        return reply["accounts"], reply["hasMore"]
    assert after(batches[0]) == (batches[1], True)
    assert after(batches[1]) == (batches[2], False)
    assert after(batches[2]) == ([], False)
    status, final = fixture_json(origin, "/api/admin/subscribers", {**BASE_QUERY, "search": "Synthetic paging fixture", "page": 100})
    assert status == 200 and final["page"] == 3 and len(final["accounts"]) == 1
    route = "/api/admin/subscribers/bulk"
    mutation = {"action": "delete", "accountIds": [PRIMARY, ids[0]], "count": 2}
    assert fixture_json(origin, route, {**mutation, "confirmed": False})[0] == 400
    status, reply = fixture_json(origin, route, {**mutation, "confirmed": True})
    assert status == 200 and reply["succeeded"] == reply["failed"] == 1
    assert reply["results"] == [{"accountId": PRIMARY, "status": "failed", "message": "Payment records must be retained for this account."},
                                {"accountId": ids[0], "status": "saved"}]
    assert after(batches[0]) == (batches[1], True), "Removing a loaded record must not move the append boundary."
    assert fixture_json(origin, route, {**mutation, "confirmed": True}, headers={"Cookie": ""})[0] == 401
    status, reply = fixture_json(origin, f"/api/admin/subscribers/{PRIMARY}", {"action": "password-reset"})
    assert status == 200 and set(reply) == {"status", "requestId"}
    request_id = reply["requestId"]
    status, details = fixture_json(origin, f"/api/admin/password-requests?id={request_id}")
    assert status == 200 and details["request"]["accountId"] == PRIMARY and details["request"]["link"] is None
    opened = request(origin, f"/admin/password-requests?requestId={request_id}", headers={"Cookie": COOKIE}, timeout=30)
    assert opened.status == 200 and "no-store" in opened.headers.get("Cache-Control", "") and 'data-password-requests' in opened.text


def scoped_failures(origin: str) -> None:
    fixture = "/api/fixture/subscribers"
    collection = "/api/admin/subscribers"
    detail = f"{collection}/{PRIMARY}"
    assert fixture_json(origin, detail, headers={"Cookie": ""})[0] == 401
    assert fixture_json(origin, f"{collection}/00000000-0000-4000-8000-000000000000")[0] == 404
    assert fixture_json(origin, fixture, {"failure": "list"})[0] == 200
    assert fixture_json(origin, collection, BASE_QUERY)[0] == 503
    assert fixture_json(origin, detail)[1]["detail"]["id"] == PRIMARY
    rendered = page(origin, {"accountId": PRIMARY})
    assert any(button.text() == "Retry" for button in rendered.one(attribute="data-subscriber-directory").all("button"))
    assert PRIMARY in rendered.one(attribute="data-subscriber-detail").text()

    assert fixture_json(origin, fixture, {"failure": "detail"})[0] == 200
    assert fixture_json(origin, detail)[0] == 503
    assert fixture_json(origin, collection, BASE_QUERY)[0] == 200
    rendered = page(origin, {"accountId": PRIMARY})
    assert len(rendered.all(attribute="data-subscriber-row")) == 6
    assert any(button.text() == "Retry" for button in rendered.one(attribute="data-subscriber-workspace").all("button"))
    assert fixture_json(origin, fixture, {"failure": None})[0] == 200
    assert fixture_json(origin, detail)[1]["detail"]["id"] == PRIMARY


def verify(origin: str) -> None:
    """Verify a running production owner-payments fixture without starting another build."""
    origin = local_origin(origin)
    assert fixture_json(origin, "/api/fixture/subscribers", {})[0] == 200
    try:
        directory_rendering(origin)
        directory_api(origin)
        assert fixture_json(origin, "/api/fixture/subscribers", {})[0] == 200
        scoped_failures(origin)
        page_and_action_api(origin)
    finally:
        assert fixture_json(origin, "/api/fixture/subscribers", {})[0] == 200
    print("PASS Subscribers rows, 100-record windows, stable Show More boundaries, scoped failures, secure reset entry, removal confirmation, partial bulk results, filters and administrator guards.", flush=True)


def main():
    args = parse_args("subscriber directory", extra=("--fixture", "--origin"))
    if args.origin:
        verify(args.origin)
        return
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
        GOAL_HINT_ADMIN_PASSWORD="Synthetic owner fixture password")
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
