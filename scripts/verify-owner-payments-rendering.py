"""Manual owner payments and access in the production chrome with synthetic services only."""
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request as HttpRequest, urlopen
from lib.rendering import Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request as raw_request, visible_html
from lib.runtime import ROOT, main_guard

FIXTURE_COOKIE = "goal-hint-member=" + "z" * 43


def Request(url, *, headers=None, **kwargs):
    return HttpRequest(url, headers={"Cookie": FIXTURE_COOKIE, **(headers or {})}, **kwargs)


def request(origin, path="/", *, headers=None, **kwargs):
    return raw_request(origin, path, headers={"Cookie": FIXTURE_COOKIE, **(headers or {})}, **kwargs)


def fixture_json(origin, path, body=None, method=None):
    outgoing = Request(origin + path, data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}, method=method or ("GET" if body is None else "POST"))
    try:
        response = urlopen(outgoing, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        assert response.headers.get("Cache-Control") == "no-store"
        return response.status, json.loads(response.read())


def subscriber_directory(origin):
    response = request(origin, "/admin/subscribers")
    html = visible_html(response.text)
    directory = match(r'<section\b[^>]*data-subscriber-directory[^>]*>([\s\S]*?)</section>', html).group(1)
    match(r'<form\b[^>]*data-subscriber-search', directory)
    match(r'action="/api/admin/subscribers"', directory)
    match("Search by phone", directory)
    match(r'type="tel"', directory)
    match(r'data-subscriber-count', directory)
    assert len(re.findall(r'data-subscriber-row="[^"]+"', directory)) == 6
    assert sorted(re.findall(r'data-subscriber-status="([^"]+)"', directory)) == ["blocked", "erased", "open", "open", "open", "open"]
    for label in ["Open", "Blocked", "Erased", "Last sign-in", "EAT"]:
        match(label, directory)
    no_match(r'Active access|Queued access|days left|passwordHash|tokenHash|ownerNote', directory)
    empty = visible_html(request(origin, "/admin/subscribers?fixture=empty").text)
    match(r'data-subscriber-empty', empty)
    match("No subscriber accounts yet.", empty)
    no_match(r'data-subscriber-row=', empty)
    selected = visible_html(request(origin, "/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100").text)
    row = match(r'<a\b[^>]*data-subscriber-row="00000000-0000-4000-8000-000000000100"[^>]*>', selected).group(0)
    match(r'aria-current="page"', row)
    match(r'data-subscriber-workspace', selected)
    match(r'data-subscriber-compact="true"', selected)
    match(r'data-subscriber-detail="00000000-0000-4000-8000-000000000100"', selected)
    toolbar = match(r'<div\b[^>]*data-subscriber-actions[^>]*>([\s\S]*?)</div>', selected).group(1)
    assert len(re.findall(r'<button\b', toolbar)) == 6
    for label in ["Grant access", "Change number", "Reset password", "Block account", "Sign out devices", "Delete account"]:
        match(label, toolbar)
    tabs = match(r'<div\b[^>]*role="tablist"[^>]*>([\s\S]*?)</div>', selected).group(1)
    assert len(re.findall(r'role="tab"', tabs)) == 4
    assert len(re.findall(r'aria-selected="true"', tabs)) == 1
    panels = re.findall(r'<[^>]+\brole="tabpanel"[^>]*>', selected)
    assert len(panels) == 4 and sum(bool(re.search(r'\bhidden(?:=""|\s|>)', panel)) for panel in panels) == 3
    for target in re.findall(r'aria-controls="([^"]+)"', tabs):
        assert any(f'id="{target}"' in panel for panel in panels), target
    match(r'data-subscriber-tab="overview"', selected)
    no_match(r'data-subscriber-action-panel|data-subscriber-removal|data-subscriber-add', selected)
    no_match(r'name="(?:reason|newPhone|verifiedBy|confirmed|planId|amount|days)"|Permanently delete account|Set temporary password', selected)
    for query, expected in [("", 6), ("0700000101", 1), ("+256 700 000 204", 1), ("+44 7700 900123", 1), ("256700000999", 0), ("invalid", 0), ("", 6)]:
        outgoing = Request(origin + "/api/admin/subscribers", data=json.dumps({"search": query}).encode(),
            headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}, method="POST")
        with urlopen(outgoing, timeout=20) as reply:
            payload = json.loads(reply.read())
            assert reply.status == 200 and len(payload["accounts"]) == expected, (query, payload)
            assert reply.headers.get("Cache-Control") == "no-store"
            for account in payload["accounts"]:
                assert set(account) == {"id", "phone", "status", "lastSignInAt"}
                assert account["status"] in {"open", "blocked", "erased"}
            if query == "+256 700 000 204":
                assert payload["accounts"][0]["status"] == "blocked"
    refused = Request(origin + "/api/admin/subscribers", data=b'{"search":""}',
        headers={"Content-Type": "application/json", "Sec-Fetch-Site": "cross-site"}, method="POST")
    try:
        urlopen(refused, timeout=20)
    except HTTPError as reply:
        assert reply.code == 403
    else:
        raise AssertionError("Cross-site fixture searches must use the production admin guard.")


def subscriber_mutations(origin):
    account_id = "00000000-0000-4000-8000-000000000100"
    endpoint = "/api/admin/subscribers/" + account_id
    state_path = "/api/fixture/subscribers"
    def snapshot():
        status, state = fixture_json(origin, state_path)
        assert status == 200
        return state
    def account(state, target=account_id):
        return next(row for row in state["accounts"] if row["id"] == target)
    def action(body, expected=200, path=endpoint):
        status, reply = fixture_json(origin, path, body)
        assert status == expected, (body.get("action"), status, reply)
        return reply
    fixture_json(origin, state_path, {})
    baseline = snapshot()
    try:
        action({"action": "note", "value": "x" * 501}, 400)
        action({"action": "note", "value": "Synthetic updated private note"})
        assert account(snapshot())["ownerNote"] == "Synthetic updated private note"
        action({"action": "block", "value": "Verified synthetic restriction"})
        assert account(snapshot())["status"] == "blocked" and account(snapshot())["devices"] == 0
        action({"action": "unblock", "value": "Verified synthetic caller"})
        assert account(snapshot())["status"] == "open"
        action({"action": "temporary-password", "confirmed": False}, 400)
        fixture_json(origin, state_path, {})
        reset = action({"action": "temporary-password", "confirmed": True})
        assert reset["status"] == "reset" and reset["sessionsDeleted"] == 2 and reset["expiresAt"]
        assert reset["temporaryPassword"] not in json.dumps(snapshot()), "The temporary password exists only in its one reply."
        fixture_json(origin, state_path, {})
        action({"action": "sign-out-all"})
        assert account(snapshot())["devices"] == 0
        fixture_json(origin, state_path, {})
        action({"action": "manual", "phone": "0700000101", "amount": 0, "days": 7}, 400, "/api/admin/codes")
        grant = action({"action": "manual", "phone": "0700000101", "amount": 0, "days": 7, "note": "Synthetic grant"}, 201, "/api/admin/codes")
        assert grant["status"] == "granted" and grant["devicesUnlocked"] == 2 and grant["endsAt"]
        assert not {"code", "delivery", "sms", "whatsapp"}.intersection(grant)
        code = next(row for row in snapshot()["codes"] if row["source"] == "manual")
        action({"action": "extend", "id": code["id"], "days": 2}, path="/api/admin/codes")
        assert next(row for row in snapshot()["codes"] if row["id"] == code["id"])["endsAt"] != code["endsAt"]
        action({"action": "revoke", "id": code["id"], "reason": "owner-revoked"}, path="/api/admin/codes")
        assert next(row for row in snapshot()["codes"] if row["id"] == code["id"])["status"] == "revoked"
        action({"action": "manual", "phone": "256700000999", "amount": 0, "days": 3, "note": "Synthetic new account"}, 201, "/api/admin/codes")
        assert len(fixture_json(origin, "/api/admin/subscribers", {"search": "256700000999"})[1]["accounts"]) == 1
        transfer = {"action": "change-number", "newPhone": "256700000777", "verifiedBy": "payment-details"}
        action({**transfer, "confirmed": False}, 400)
        action({**transfer, "confirmed": True}, 201)
        assert account(snapshot())["devices"] == 0
        assert any(row["source"] == "number-change" and row["phone"] == "256700000777" for row in snapshot()["codes"])
        action({"action": "erase", "confirmed": False}, 400)
        codes_before = [row for row in snapshot()["codes"] if row["accountId"] == account_id]
        action({"action": "erase", "confirmed": True})
        erased = snapshot()
        assert account(erased)["status"] == "erased" and account(erased)["phone"] is None and account(erased)["ownerNote"] is None
        assert len([row for row in erased["codes"] if row["accountId"] == account_id]) == len(codes_before)
        action({"action": "delete", "confirmed": False}, 400)
        action({"action": "delete", "confirmed": True})
        deleted = snapshot()
        for table in ["accounts", "codes", "payments", "audits"]:
            assert not any(row.get("accountId", row.get("id")) == account_id for row in deleted[table]), table
        other_id = "00000000-0000-4000-8000-000000000102"
        assert account(deleted, other_id) == account(baseline, other_id) and deleted["plans"] == baseline["plans"]
        action({"action": "note", "value": "Missing account"}, 409)
    finally:
        fixture_json(origin, state_path, {})


def main():
    args=parse_args("owner payments",extra=("--fixture",))
    env=environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
        GOAL_HINT_ADMIN_PASSWORD="Synthetic owner fixture password", GOAL_HINT_ADMIN_PASSWORD_HASH="")
    if args.fixture:
        directory=Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT/".tmp") and (directory/".next/BUILD_ID").is_file(), "Reuse a built acceptance fixture inside .tmp."
    else:
        directory=create_fixture("owner-payments")
        config=directory/"next.config.mjs"
        config.write_text(config.read_text(encoding="utf-8").replace("export default {",'import production from "../../next.config.ts";\nexport default { headers: production.headers,'),encoding="utf-8")
        print(f"Building owner acceptance fixture: {directory}",flush=True)
        build_fixture(directory,env,timeout=300)
    with Server(directory,env,ready="/api/fixture/health") as server:
        subscriber_directory(server.origin)
        for path,labels in [("/admin/payments",["Subscriber says","Automatic checks","Paste my SMS","Access goes to account","I found this payment in my account","Grant free trial","Dismiss"]),("/admin/codes",["Grant access manually","Extend","Revoke","Phone or P-/C-reference"]),("/admin",["Active paid subscribers","Revenue · EAT week","Payment numbers updated"]),("/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100",["Search by phone","Add subscriber","Change number","Reset password","Save note","Delete account"]),("/admin/password-resets",["Password requests","generate a temporary password","expire after 15 minutes","Call member","View account"]),("/admin/audit",["code_created","Action","Subscriber"])]:
            response=request(server.origin,path);html=visible_html(response.text)
            assert response.status==200,(path,response.status)
            for label in labels:assert label in html,(path,label)
            assert "no-store" in response.headers.get("Cache-Control","")
            assert "data-analytics-ignore" in html
            for removed in ["#code=", 'href="sms:', 'href="https://wa.me/', "Reissue"]:
                assert removed not in html, (path, removed)
            if path=="/admin/payments":assert "(1) Payments" in response.text
        for action in ["approve", "trial", "manual"]:
            endpoint = "/api/admin/payments/00000000-0000-4000-8000-000000000200" if action == "approve" else "/api/admin/codes"
            body = {"action": action, "id": "00000000-0000-4000-8000-000000000100", "phone": "256700000101", "planId": "00000000-0000-4000-8000-000000000001", "amount": 0, "note": "Synthetic acceptance grant"}
            outgoing = Request(server.origin + endpoint, data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}, method="POST")
            with urlopen(outgoing, timeout=20) as reply:
                payload = json.loads(reply.read())
                assert reply.status == 201
                assert reply.headers.get("Cache-Control") == "no-store"
                assert payload["status"] == ("approved" if action == "approve" else "granted")
                assert payload["devicesUnlocked"] >= 0 and payload["endsAt"]
                assert not {"delivery", "code", "sms", "whatsapp"}.intersection(payload)
        subscriber_mutations(server.origin)
        print("PASS production owner pages; compact subscriber summary/toolbar/tabs, inactive forms unmounted, search, persisted synthetic account/access actions, confirmation guards and private credential replies.",flush=True)
        if args.serve:
            print(f"Synthetic administrator browser entry: {server.origin}/api/fixture/session", flush=True)
            server.serve()
if __name__=="__main__":main_guard(main)
