"""Manual owner payments and access in the production chrome with synthetic services only."""
import json
import re
from html import unescape
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


def fixture_json(origin, path, body=None, method=None, headers=None):
    outgoing = Request(origin + path, data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", **(headers or {})}, method=method or ("GET" if body is None else "POST"))
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
    assert len(re.findall(r'<button\b', toolbar)) == 5
    for label in ["Grant access", "Change number", "Reset password", "Block account", "Sign out devices"]:
        match(label, toolbar)
    no_match("Delete", toolbar, "Removal lives in its own danger drawer, not among the everyday actions.")
    removal = match(r'<details\b([^>]*)>\s*<summary[^>]*>(?:(?!</summary>)[\s\S])*Delete or erase', selected)
    no_match(r'\bopen(?:=""|\s|$)', removal.group(1))
    tabs = match(r'<div\b[^>]*role="tablist"[^>]*>([\s\S]*?)</div>', selected).group(1)
    assert len(re.findall(r'role="tab"', tabs)) == 5
    for label in ["Overview", "Access", "Payments", "Credit", "Devices"]:
        match(label, tabs)
    assert len(re.findall(r'aria-selected="true"', tabs)) == 1
    panels = re.findall(r'<[^>]+\brole="tabpanel"[^>]*>', selected)
    assert len(panels) == 5 and sum(bool(re.search(r'\bhidden(?:=""|\s|>)', panel)) for panel in panels) == 4
    match(r'<dt>Credit</dt><dd data-subscriber-credit="true">UGX 0</dd>', selected)
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
        # The historical baseline expires; transfer checks need their own live period.
        action({"action": "manual", "phone": "0700000101", "amount": 0, "days": 7, "note": "Synthetic transferable access"}, 201, "/api/admin/codes")
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
        # A number change keeps both accounts for accounting: they can be erased, never deleted.
        refused = action({"action": "delete", "confirmed": True}, 409)
        assert "can't be deleted" in refused["message"]
        assert account(snapshot())["status"] == "erased"
        fresh_id = fixture_json(origin, "/api/admin/subscribers", {"search": "256700000999"})[1]["accounts"][0]["id"]
        fresh_endpoint = "/api/admin/subscribers/" + fresh_id
        action({"action": "delete", "confirmed": True}, path=fresh_endpoint)
        deleted = snapshot()
        for table in ["accounts", "codes", "payments", "audits"]:
            assert not any(row.get("accountId", row.get("id")) == fresh_id for row in deleted[table]), table
        other_id = "00000000-0000-4000-8000-000000000102"
        assert account(deleted, other_id) == account(baseline, other_id) and deleted["plans"] == baseline["plans"]
        action({"action": "note", "value": "Missing account"}, 409, fresh_endpoint)
    finally:
        fixture_json(origin, state_path, {})


def settings_api(origin):
    scenarios = ["writable", "managed", "missing", "requirements-race", "save-failed", "saved-without-requirements"]
    def api(scenario, body=None, path="/api/admin/settings"):
        return fixture_json(origin, path, body, headers={"X-Settings-Fixture-Scenario": scenario})
    def snapshot(scenario):
        status, reply = api(scenario, path="/api/fixture/settings")
        assert status == 200
        return reply
    def reset(scenario):
        status, _ = api(scenario, {}, "/api/fixture/settings")
        assert status == 200
    for scenario in scenarios:
        reset(scenario)
    try:
        status, baseline = api("writable")
        assert status == 200 and baseline["environmentFields"] == [] and baseline["requirements"] == {"test": [], "on": []}
        status, saved = api("writable", {"action": "save", "changes": {"paymentNote": "Synthetic saved note", "reviewTime": "Within 20 minutes", "trialDays": 3, "screenshotRetentionDays": 30}})
        assert status == 200 and saved["settings"]["trialDays"] == 3 and saved["settings"]["paymentNote"] == "Synthetic saved note"
        assert snapshot("writable")["auditCount"] == 1
        status, invalid = api("writable", {"action": "save", "changes": {"screenshotRetentionDays": 6}})
        assert status == 400 and "screenshotRetentionDays" in invalid["errors"]
        assert snapshot("writable")["settings"]["screenshotRetentionDays"] == 30
        status, normalized = api("writable", {"action": "save", "changes": {"mtnNumber": "+256 700 000 905"}})
        assert status == 200 and normalized["settings"]["mtnNumber"] == "256700000905"
        assert normalized["cleared"] == ["mtnMenuShortcut"] and normalized["settings"]["mtnMenuShortcut"] is None
        for mode in ["test", "on"]:
            status, changed = api("writable", {"action": "mode", "mode": mode})
            assert status == 200 and changed["settings"]["paywallMode"] == mode
        before = snapshot("writable")
        status, refused = api("writable", {"action": "save", "changes": {"mtnNumber": None, "airtelNumber": None, "contactPhone": None, "whatsappPhone": None}})
        assert status == 409 and {row["key"] for row in refused["missing"]} == {"payment-number", "contact"}
        assert snapshot("writable") == before, "A refused settings change rolls back its row and audit."
        status, managed = api("managed")
        assert status == 200 and len(managed["environmentFields"]) == 8
        before = snapshot("managed")
        status, refused = api("managed", {"action": "save", "changes": {"mtnNumber": "256700000905"}})
        assert status == 400 and "mtnNumber" in refused["errors"] and snapshot("managed") == before
        status, missing = api("missing")
        assert status == 200 and {item["key"] for item in missing["requirements"]["test"]} == {"plan", "payment-number", "contact"}
        status, refused = api("missing", {"action": "mode", "mode": "on"})
        assert status == 409 and len(refused["missing"]) == 5 and snapshot("missing")["settings"]["paywallMode"] == "off"
        status, ready = api("requirements-race")
        assert status == 200 and ready["requirements"] == {"test": [], "on": []}
        status, refused = api("requirements-race", {"action": "mode", "mode": "test"})
        assert status == 409 and [item["key"] for item in refused["missing"]] == ["plan"]
        before = snapshot("save-failed")
        status, failed = api("save-failed", {"action": "save", "changes": {"trialDays": 3}})
        assert status == 503 and "Synthetic settings storage failure" not in json.dumps(failed) and snapshot("save-failed") == before
        status, committed = api("saved-without-requirements", {"action": "save", "changes": {"trialDays": 4}})
        assert status == 200 and committed["settings"]["trialDays"] == 4
        assert "source" not in committed and "requirements" not in committed
        assert snapshot("saved-without-requirements")["settings"]["trialDays"] == 4
        assert api("saved-without-requirements")[1]["requirements"] == {"test": [], "on": []}
        status, committed_mode = api("saved-without-requirements", {"action": "mode", "mode": "test"})
        assert status == 200 and committed_mode["settings"]["paywallMode"] == "test" and "requirements" not in committed_mode
        for headers, expected in [({"Cookie": "synthetic-owner=legacy-token"}, 401), ({"Sec-Fetch-Site": "cross-site"}, 403)]:
            status, _ = fixture_json(origin, "/api/admin/settings", {"action": "save", "changes": {"trialDays": 3}}, headers=headers)
            assert status == expected
    finally:
        for scenario in scenarios:
            reset(scenario)


def settings_rendering(origin):
    for scenario in ["writable", "managed", "missing"]:
        response = request(origin, "/admin/settings?fixture=" + scenario)
        html = visible_html(response.text)
        assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "")
        match(r'data-settings-editor', html)
        navigation = match(r'<(?:nav|div)\b[^>]*data-settings-nav[^>]*>([\s\S]*?)</(?:nav|div)>', html).group(1)
        assert len(re.findall(r'<button\b', navigation)) == 4
        assert len(re.findall(r'aria-current="page"', navigation)) == 1
        assert re.findall(r'data-settings-section="([^"]+)"', html) == ["payments"]
        save = match(r'<button\b(?=[^>]*data-settings-save)[^>]*>', html).group(0)
        match(r'\bdisabled(?:=""|\s|>)', save)
        no_match(r'type="password"', html)
        text = unescape(re.sub(r'<[^>]+>', " ", html))
        no_match(r'GOAL_HINT_|X-Forwarded-For|X-Real-IP|settingsRules|screenshotRetentionDays|paymentNumbersChangedAt|synthetic-administrator|\{amount\}', text)
        if scenario == "managed":
            match(r'data-settings-managed="true"', html)
            for field in re.findall(r'<(?:input|select|textarea)\b(?=[^>]*id="setting-(?:mtn|airtel)[^"]*")[^>]*>', html):
                match(r'\b(?:disabled|readonly)(?:=""|\s|>)', field, "Managed payment fields must not be editable.", flags=re.IGNORECASE)
        else:
            match(r'id="setting-mtnName"', html)


def audit_rendering(origin):
    expected = ["8", "7", "2", "5", "4", "13", "9", "3", "6", "10", "16", "14", "11", "15", "12", "1", "17"]
    for action, ids in [("", expected), ("payment_approved", ["2"]), ("member_blocked", ["3"]), ("code_created", ["1"]),
            ("owner_signed_out", []), ("future_feature_event", expected)]:
        path = "/admin/audit" + ("?action=" + action if action else "")
        response = request(origin, path)
        html = visible_html(response.text)
        assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "")
        match(r'data-audit-report', html)
        for control in ["audit-search", "audit-category", "audit-action", "audit-period"]:
            match(rf'id="{control}"', html)
        match(r'data-audit-count', html)
        export = match(r'<button\b(?=[^>]*data-audit-export)[^>]*>', html).group(0)
        found = re.findall(r'<details\b[^>]*data-audit-event="([^"]+)"', html)
        assert found == ids, (action, found)
        if not ids:
            match(r'data-audit-empty', html)
            match(r'\bdisabled(?:=""|\s|>)', export)
        summaries = re.findall(r'<details\b[^>]*data-audit-event="([^"]+)"[^>]*>[\s\S]*?<summary\b[^>]*>([\s\S]*?)</summary>', html)
        summary_text = {key: unescape(re.sub(r'<[^>]+>', " ", summary)) for key, summary in summaries}
        for value in summary_text.values():
            no_match(r'member-admin:|code_created|payment_approved|member_blocked|future_feature_event|owner_signed_in|owner_sign_in_refused|member-session|access-code', value)
            no_match(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', value, flags=re.IGNORECASE)
        text = unescape(re.sub(r'<[^>]+>', " ", html))
        no_match("f" * 64, text, "Device/session hashes must not appear in the audit interface.")
        if not action:
            match(r'\b100\b', text, "The audit window limit should be visible.")
            match(r'payment[\s\S]*approv|approv[\s\S]*payment', summary_text["2"], flags=re.IGNORECASE)
            match(r'\bAdmin(?:istrator)?\b', summary_text["7"], flags=re.IGNORECASE)
            match(r'\bSystem\b', summary_text["12"], flags=re.IGNORECASE)


def payments_api(origin):
    endpoint = "/api/fixture/payments"
    payment = lambda suffix: "00000000-0000-4000-8000-0000000002" + suffix
    def queue(tab="pending"):
        status, result = fixture_json(origin, "/api/admin/payments?tab=" + tab)
        assert status == 200, result
        return result
    def decide(suffix, body, expected):
        status, result = fixture_json(origin, "/api/admin/payments/" + payment(suffix), body)
        assert status == expected, (status, result)
        return result
    fixture_json(origin, endpoint, {"scenario": "review"})
    try:
        expected = {"pending": [payment("00"), payment("01"), payment("02")],
            "approved": [payment("06"), payment("03")], "rejected": [payment("04")], "superseded": [payment("05")]}
        for tab, ids in expected.items():
            result = queue(tab)
            assert [row["id"] for row in result["payments"]] == ids, (tab, result)
            assert result["pendingCount"] == 3
            assert set(result) == {"pendingCount", "payments"}, "Automatic trials never enter the payment-review queue."
        assert [row["id"] for row in queue("invalid")["payments"]] == expected["pending"]
        pending = queue()["payments"]
        assert [(row["amount"], row["durationDays"]) for row in pending] == [(4500, 7), (15000, 30), (1000, 1)]
        assert [row["hasImage"] for row in pending] == [False, True, False]
        assert fixture_json(origin, "/api/admin/payments?count")[1] == {"pendingCount": 3}
        screenshot = "/api/admin/payments/" + payment("01") + "/screenshot"
        with urlopen(Request(origin + screenshot), timeout=20) as response:
            image = response.read()
            assert response.headers.get("Content-Type") == "image/jpeg" and image[:2] == b"\xff\xd8" and image[-2:] == b"\xff\xd9"
            assert response.headers.get("Cache-Control") == "no-store"
            assert response.headers.get("X-Content-Type-Options") == "nosniff"
            assert "frame-ancestors 'none'" in response.headers.get("Content-Security-Policy", "")
            assert response.headers.get("Cross-Origin-Resource-Policy") == "same-origin"
        assert fixture_json(origin, screenshot, headers={"Cookie": ""})[0] == 401
        decision = {"action": "approve", "network": "airtel", "transactionId": "AIR2026102301", "amount": 15000,
            "planId": "00000000-0000-4000-8000-000000000003"}
        assert decide("01", {**decision, "transactionId": ""}, 400)["status"] == "invalid"
        assert queue()["pendingCount"] == 3
        reply = decide("01", decision, 201)
        assert reply["status"] == "approved" and reply["reference"] == "PDEMO01" and reply["endsAt"]
        assert not {"code", "password", "sms", "whatsapp", "delivery"}.intersection(reply)
        assert queue()["pendingCount"] == 2 and payment("01") not in [row["id"] for row in queue()["payments"]]
        assert any(row["id"] == payment("01") and row["final"]["amount"] == 15000 for row in queue("approved")["payments"])
        duplicate = decide("00", decision, 409)
        assert duplicate["status"] == "duplicate" and duplicate["submissionId"] == payment("01")
        decide("01", {"action": "reverse", "reason": "network-reversal"}, 200)
        assert any(row["id"] == payment("01") and row["status"] == "reversed" for row in queue("approved")["payments"])
        granted = [row for row in fixture_json(origin, endpoint)[1]["codes"]
            if row["accountId"] == "00000000-0000-4000-8000-000000000102" and row["source"] == "payment"]
        assert len(granted) == 1 and granted[0]["status"] == "revoked"
        decide("02", {"action": "reject", "reason": "not-received", "text": "No matching synthetic receipt.", "deleteImage": False}, 200)
        assert queue()["pendingCount"] == 1 and payment("02") in [row["id"] for row in queue("rejected")["payments"]]
        decide("02", decision, 409)
        fixture_json(origin, endpoint, {"scenario": "review"})
        decide("01", {"action": "reject", "reason": "unreadable", "text": "", "deleteImage": True}, 200)
        assert fixture_json(origin, screenshot)[0] == 404
        assert fixture_json(origin, "/api/admin/payments/" + payment("00"), decision, headers={"Sec-Fetch-Site": "cross-site"})[0] == 403
        for suffix in ["00", "02"]:
            decide(suffix, {"action": "reject", "reason": "not-received", "text": "", "deleteImage": False}, 200)
        empty = visible_html(request(origin, "/admin/payments").text)
        match(r'data-payment-empty', empty)
        no_match(r'data-payment-row=|data-payment-approval', empty)
    finally:
        fixture_json(origin, endpoint, {"scenario": "baseline"})


def payments_rendering(origin):
    fixture_json(origin, "/api/fixture/payments", {"scenario": "review"})
    try:
        session_status, session = fixture_json(origin, "/api/account/session")
        assert session_status == 200 and session["administrator"] is True
        assert session["subscription"]["canSubscribe"] is False
        for tab, suffixes in [("pending", ["00", "01", "02"]), ("approved", ["06", "03"]), ("rejected", ["04"]), ("superseded", ["05"]), ("invalid", ["00", "01", "02"])]:
            response = request(origin, "/admin/payments?tab=" + tab)
            html = visible_html(response.text)
            assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "")
            match(r'data-payments-editor', html)
            badge = match(r'<a\b(?=[^>]*data-admin-payments-link)[^>]*>', html).group(0)
            match(r'href="/admin/payments\?tab=pending"', badge)
            match(r'id="payment-search"', html)
            match("Refresh queue", html)
            expected = ["00000000-0000-4000-8000-0000000002" + suffix for suffix in suffixes]
            assert re.findall(r'data-payment-row="([^"]+)"', html) == expected, tab
            rows = re.findall(r'<button\b[^>]*data-payment-row="[^"]+"[^>]*>([\s\S]*?)</button>', html)
            for row in rows:
                row_text = unescape(re.sub(r'<[^>]+>', " ", row))
                match(r'\+\d|Payer not provided', row_text, "Queue rows identify the payer or a missing payer.")
                match(r'UGX\s+[\d,]+', row_text)
                match(r'\bP(?:TEST|DEMO\d+)\b', row_text, "Queue tickets lead with the payment reference.")
                no_match(r'Expected|EAT|No screenshot|<time\b', row)
            assert re.findall(r'data-payment-review="([^"]+)"', html) == expected[:1], "Only one review should mount."
            assert len(re.findall(r'<form\b[^>]*data-payment-approval', html)) == (1 if tab in ["pending", "superseded", "invalid"] else 0)
            if tab == "superseded":
                match("AIR2026102301", html, "The replaced report's review prefills its reported transaction ID.")
            if tab in ["pending", "invalid"]:
                for value in ["7 days", "TEST1234", "Expected payment", "UGX 5,000", "Reported amount: UGX 4,500"]:
                    match(value, html)
                first_row = unescape(re.sub(r'<[^>]+>', " ", rows[0]))
                assert "256 700 000 118" in first_row and "4,500" in first_row
                assert "256 700 000 101" not in first_row, "Queue identifies the payer, not the subscriber account."
                approve = match(r'<button\b(?=[^>]*data-payment-approve)[^>]*>', html).group(0)
                no_match(r'\bdisabled(?:=""|\s|>)', approve)
                for field, value in [("payment-confirmed-id", "TEST1234"), ("payment-confirmed-amount", "4500")]:
                    control = match(rf'<input\b(?=[^>]*id="{field}")[^>]*>', html).group(0)
                    match(rf'value="{value}"', control, "Reported values prefill the editable approval fields.")
                    match(r'\brequired(?:=""|\s|>)', control)
                no_match(r'payment-wallet-confirmed|Verify in your wallet|Received in my wallet', html)
                for label in ["Paste wallet SMS", "Change network or plan", "Reject"]:
                    disclosure = match(rf'<details\b([^>]*)>\s*<summary[^>]*>(?:(?!</summary>)[\s\S])*{label}', html)
                    no_match(r'\bopen(?:=""|\s|$)', disclosure.group(1))
                warning = "Payer has its own Goal Hint account"
                assert html.count(warning) == 1, "Warnings stay visible without being repeated inside checks."
                match(r'aria-label="Payment warnings"', html)
                no_match(r'No screenshot available', html)
            no_match(r'data-payment-trials|Free trial requests|Grant free trial', html)
            no_match(r'<img\b[^>]*src="/api/admin/payments/', html, "The first report in these tab fixtures has no image.")
    finally:
        fixture_json(origin, "/api/fixture/payments", {"scenario": "baseline"})


def overview_notices(origin):
    """The Overview lists SMS notices to check only when some exist; acceptance is never shown as receipt or the text sent."""
    html = visible_html(request(origin, "/admin").text)
    for label in ["SMS notices to check", "data-payment-notices", "Send again"]:
        assert label not in html, label
    fixture_json(origin, "/api/fixture/payments", {"scenario": "notices"})
    try:
        response = request(origin, "/admin")
        assert response.status == 200
        html = visible_html(response.text)
        match(r"<dt>SMS notices to check</dt><dd>1</dd>", html)
        panel = match(r'<section\b[^>]*data-payment-notices[^>]*>([\s\S]*?)</section>', html).group(1)
        for label in ["SMS notices", "PTEST", "Payment decision", "Not confirmed", "View subscriber", "Send again", "Dismiss",
                "The member may receive this notice twice"]:
            assert label in panel, label
        match(r'href="/admin/subscribers\?accountId=00000000-0000-4000-8000-000000000100"', panel)
        for leaked in ["Your account has been updated", "Sign in to view"]:
            assert leaked not in html, leaked
        for claim in ["proof of receipt", "delivered", "received"]:
            assert claim not in panel, claim
        assert html.count("data-payment-notices") == 1
    finally:
        fixture_json(origin, "/api/fixture/payments", {"scenario": "baseline"})


def owner_navigation(origin):
    """All owner routes share regular navigation and preserve the production private gate."""
    routes = ["/admin", "/admin/payments", "/admin/codes", "/admin/subscribers", "/admin/password-resets",
        "/admin/plans", "/admin/settings", "/admin/audit", "/analytics"]
    for path in routes:
        response = request(origin, path)
        assert response.status == 200, (path, response.status)
        html = visible_html(response.text)
        assert html.count('href="#main-content"') == 1, f"{path}: one shared shell"
        assert len(re.findall(r"<main(?:\s|>)", html)) == 1, path
        assert len(re.findall(r"<h1(?:\s|>)", html)) == 1, path
        for layout in ["desktop", "mobile"]:
            match(rf'data-responsive-navigation="{layout}"', html, path)
        for destination in ["/en", "/en/matches", "/en/matches?status=live", "/en/slips", "/en/help",
                "/en/privacy", "/en/terms", "/en/contact", "/admin/payments"]:
            match(rf'href="{re.escape(destination)}"', html, f"{path}: regular destination {destination}")
        for destination in routes:
            match(rf'href="{re.escape(destination)}"', html, f"{path}: owner destination {destination}")
        signed_out = request(origin, path, headers={"Cookie": ""})
        assert signed_out.status == 307 and "/en/account" in signed_out.headers.get("Location", ""), path
    for path in ["/api/analytics/report?from=2026-10-19&to=2026-10-25", "/api/analytics/live"]:
        status, report = fixture_json(origin, path)
        assert status == 200 and report["generatedAt"]
        assert fixture_json(origin, path, headers={"Cookie": ""})[0] == 401
    assert fixture_json(origin, "/api/analytics/settings")[1]["retention"]["retentionDays"] == 395
    assert fixture_json(origin, "/api/analytics/settings", headers={"Cookie": ""})[0] == 401


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
        owner_navigation(server.origin)
        overview_notices(server.origin)
        subscriber_directory(server.origin)
        for path,labels in [("/admin/payments",["Payments"]),("/admin/codes",["Grant access manually","Extend","Revoke","Phone or reference"]),("/admin",["Active paid subscribers","Revenue · EAT week","Payment numbers updated"]),("/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100",["Search by phone","Grant access / add subscriber","Change number","Reset password","Save note","Delete or erase"]),("/admin/password-resets",["Password requests","set a temporary password","on a call with the member","Call member","View account"]),("/admin/audit",["Audit"])]:
            response=request(server.origin,path);html=visible_html(response.text)
            assert response.status==200,(path,response.status)
            for label in labels:assert label in html,(path,label)
            assert "no-store" in response.headers.get("Cache-Control","")
            assert "data-analytics-ignore" in html
            for removed in ["#code=", 'href="sms:', 'href="https://wa.me/', "Reissue"]:
                assert removed not in html, (path, removed)
            if path=="/admin/payments":assert "(1) Payments" in response.text
        for action in ["approve", "manual"]:
            endpoint = "/api/admin/payments/00000000-0000-4000-8000-000000000200" if action == "approve" else "/api/admin/codes"
            body = {"action": action, "id": "00000000-0000-4000-8000-000000000100", "phone": "256700000101", "planId": "00000000-0000-4000-8000-000000000001", "amount": 0, "note": "Synthetic acceptance grant"}
            if action == "approve":
                body.update(network="mtn", transactionId="TEST1234", amount=5000)
            outgoing = Request(server.origin + endpoint, data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}, method="POST")
            with urlopen(outgoing, timeout=20) as reply:
                payload = json.loads(reply.read())
                assert reply.status == 201
                assert reply.headers.get("Cache-Control") == "no-store"
                assert payload["status"] == ("approved" if action == "approve" else "granted")
                assert payload["devicesUnlocked"] >= 0 and payload["endsAt"]
                assert not {"delivery", "code", "sms", "whatsapp"}.intersection(payload)
        for action in ["trial", "dismiss-trial"]:
            status, _ = fixture_json(server.origin, "/api/admin/codes", {"action": action, "id": "00000000-0000-4000-8000-000000000100"})
            assert status == 400, "Former manual trial actions must not grant or dismiss access."
        subscriber_mutations(server.origin)
        settings_api(server.origin)
        settings_rendering(server.origin)
        audit_rendering(server.origin)
        payments_rendering(server.origin)
        payments_api(server.origin)
        print("PASS all nine owner routes and regular navigation; subscriber actions, Settings saves/modes, audit filters, payment queue/history decisions, private attachments and confirmation guards.",flush=True)
        if args.serve:
            print(f"Synthetic administrator browser entry: {server.origin}/api/fixture/session", flush=True)
            print(f"Settings browser entry: {server.origin}/api/fixture/session?page=settings&scenario=writable", flush=True)
            print(f"Audit browser entry: {server.origin}/api/fixture/session?page=audit", flush=True)
            print(f"Payments browser entry: {server.origin}/api/fixture/session?page=payments", flush=True)
            server.serve()
if __name__=="__main__":main_guard(main)
