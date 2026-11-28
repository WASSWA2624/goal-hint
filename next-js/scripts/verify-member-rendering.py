"""Verify the account's initial production HTML using the shared rendering harness."""
import http.client
import json
import re
import time
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit
from urllib.error import HTTPError
from urllib.request import Request, build_opener, urlopen
from lib.rendering import NoRedirect, Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def verify_deferred_account(origin):
    def stream(path, marker):
        connection = http.client.HTTPConnection(urlsplit(origin).netloc, timeout=10)
        start = time.monotonic()
        connection.request("GET", path, headers={"Accept-Encoding": "identity"})
        with connection.getresponse() as response:
            assert response.status == 200
            chunks, first = [], None
            while chunk := response.read1(65536):
                chunks.append(chunk)
                if first is None and marker in b"".join(chunks):
                    first = time.monotonic() - start
        connection.close()
        return first, time.monotonic() - start, visible_html(b"".join(chunks).decode())

    guest, complete, html = stream("/en/account?state=signed-out&deferred=settings", b"data-account-auth")
    assert guest is not None and guest < complete - 1, (guest, complete)
    authentication_form(html, "login", "Login")

    workspace, complete, html = stream("/en/account?state=signed-in&deferred=settings", b"data-account-workspace")
    assert workspace is not None and workspace < complete - 1, (workspace, complete)
    match("Change password", html)

    unavailable = request(origin, "/en/account?state=signed-in&deferred=identity&section=payments")
    html = visible_html(unavailable.text)
    assert unavailable.status == 200 and unavailable.headers.get("Set-Cookie") is None
    match(r'data-account-unavailable', html)
    match(r'href="/en/account\?[^"]*section=payments', html)
    no_match(r'data-account-workspace|data-account-auth|256 700 000 101', html)
    print(f"Account controls precede delayed settings and panels ({guest:.2f}s guest, {workspace:.2f}s member). Identity failure offers a private-safe retry.", flush=True)


def auth_card(html):
    return match(r'<section\b[^>]*data-account-auth[^>]*>([\s\S]*?)</section>', html).group(1)


def authentication_form(html, view, label):
    """Canonical labels keep their established form endpoints and header destinations."""
    card = auth_card(html)
    match(rf'<h1[^>]*>{re.escape(label)}</h1>', card)
    forms = re.findall(r'<form\b[^>]*>', card)
    assert len(forms) == 1, f"{label}: one credential form."
    match(r'method="post"', forms[0])
    match(rf'action="/api/account/{view}"', forms[0])
    submits = re.findall(r'<button\b[^>]*type="submit"[^>]*>([\s\S]*?)</button>', card)
    assert len(submits) == 1 and unescape(re.sub(r'<[^>]+>', "", submits[0])).strip() == label, \
        f"{label}: one consistently named submit action."
    header = match(r'<header\b[^>]*data-app-header[^>]*>([\s\S]*?)</header>', html).group(1)
    for destination, action_label in [("login", "Login"), ("register", "Register")]:
        link = match(rf'<a\b(?=[^>]*data-header-auth="{destination}")([^>]*)>([\s\S]*?)</a>', header)
        href = unescape(match(r'href="([^"]+)"', link.group(1)).group(1))
        target = urlsplit(href)
        assert target.path == "/en/account" and parse_qs(target.query).get("view") == [destination], \
            f"{action_label}: the header retains its account view."
        assert unescape(re.sub(r'<[^>]+>', "", link.group(2))).strip() == action_label, \
            f"{action_label}: header and form use the same vocabulary."
    return card


def phone_field(html, name="phone"):
    inputs = re.findall(r'<input\b[^>]*>', html)
    named = [tag for tag in inputs if re.search(rf'\bname="{re.escape(name)}"', tag)]
    assert len(named) == 1, "Only the canonical hidden input may carry the submitted phone field name."
    match(r'type="hidden"', named[0])
    match(r'data-phone-canonical', named[0])
    national = match(r'<input\b[^>]*data-phone-input[^>]*>', html).group(0)
    match(r'autoComplete="tel-national"', national)
    no_match(r'\bname=', national)
    match(r'data-phone-country-trigger', html)
    no_match(r'data-phone-country-picker|data-phone-country-search', html)


def recovery_dialog(html):
    dialog = match(r'<dialog\b[^>]*data-criteria-dialog[^>]*>([\s\S]*?)</dialog>', html).group(1)
    for text in [r'Do you want to request a password reset\?', "Registered number", "Yes, continue", "Use a previously received code"]:
        match(text, dialog)
    match(r'action="/api/account/forgot"', dialog)
    no_match(r'name="channel"|name="code"', dialog)
    phone_field(dialog)


def post_fixture(origin, action, body, scenario="success", cookie=""):
    outgoing = Request(f"{origin}/api/account/{action}", data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin",
            "X-Member-Fixture-Scenario": scenario, "Cookie": cookie})
    try:
        response = urlopen(outgoing, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        assert response.headers.get("Cache-Control") == "no-store"
        return response.status, json.loads(response.read()), response.headers


def verify_synthetic_api(origin):
    legacy = "goal-hint-member=" + "v" * 43
    status, retired, headers = post_fixture(origin, "verification", {"channel": "sms"}, cookie=legacy)
    assert status == 400 and "Forgot password" in retired["message"] and not headers.get("Set-Cookie")
    body = {"phone": "256700000101"}
    for scenario, expected in [("success", 200), ("existing-request", 200), ("send-failed", 503), ("rate-limited", 429), ("unavailable", 503)]:
        status, reply, headers = post_fixture(origin, "forgot", body, scenario)
        assert status == expected, (scenario, status, reply)
        if scenario == "success":
            assert reply["status"] == "requested"
            assert "token" not in reply, "A request never returns a reset link."
        if scenario == "existing-request":
            assert reply["status"] == "existing"
        if scenario == "rate-limited":
            assert headers.get("Retry-After") == "60"
    for action, fields, cookie in [("verify", {}, legacy), ("reset-code", {"phone": "256700000101"}, "")]:
        for scenario, code in [("success", "000000"), ("invalid-code", "123456")]:
            status, reply, _ = post_fixture(origin, action, {**fields, "code": code}, scenario, cookie)
            assert status == 400 and "invalid" in reply["message"], (action, scenario, reply)
    status, _, _ = post_fixture(origin, "forgot", {"phone": "447700900123", "channel": "sms"})
    assert status == 400
    status, valid, _ = post_fixture(origin, "password-reset/validate", {"token": "p" * 43})
    assert status == 200 and valid == {"status": "valid"}
    status, unusable, _ = post_fixture(origin, "password-reset/validate", {"token": "x" * 43})
    assert status == 410 and unusable["status"] == "unusable"
    status, logged_in, _ = post_fixture(origin, "login", {"phone": "256700000101", "password": "Synthetic password", "return": "/en/matches"})
    assert status == 200 and logged_in["next"] == "/en/matches"
    for scenario in ("success", "automatic-trial"):
        status, registered, headers = post_fixture(origin, "register",
            {"phone": "256700000101", "password": "Synthetic password", "return": "/en/matches"}, scenario)
        assert status == 200 and registered["next"] == "/en/matches" and "requiresVerification" not in registered
        assert "HttpOnly" in headers.get("Set-Cookie", "")
        cookie = "; ".join(value.split(";", 1)[0] for value in headers.get_all("Set-Cookie")
            if value.startswith(("goal-hint-member=", "member-fixture-subscription=")))
        account = visible_html(request(origin, "/en/account?section=subscription", headers={"Cookie": cookie}).text)
        match('data-account-workspace', account)
        no_match(r'data-account-auth|Activate free trial|WhatsApp updates', account)
        overview = visible_html(request(origin, "/en/account", headers={"Cookie": cookie}).text)
        no_match(r'data-account-referral-summary|Referral details are temporarily unavailable|WhatsApp updates', account_workspace(overview))
        referrals = visible_html(request(origin, "/en/account?section=referrals", headers={"Cookie": cookie}).text)
        match("Referral rewards require a verified phone number.", account_workspace(referrals))
        no_match(r'data-account-referrals|temporarily unavailable|view=forgot', account_workspace(referrals))
        if scenario == "automatic-trial":
            assert registered["trial"]["active"] is True and registered["trial"]["days"] == 2
            assert registered["trial"]["startsAt"] < registered["trial"]["endsAt"]
            match(r'data-free-trial="active"', account)
        else:
            assert "trial" not in registered
            no_match(r'data-free-trial=', account)
    phone_change = {"phone": "256700000103", "currentPassword": "Synthetic current password"}
    for token in ("n", "a"):
        status, changed, _ = post_fixture(origin, "phone", phone_change, cookie="goal-hint-member=" + token * 43)
        assert status == 200 and changed["next"] == "/en/account?view=forgot" and changed["requiresVerification"] is True
    status, verified, _ = post_fixture(origin, "verify", {"code": "123456", "return": "/en"}, cookie=legacy)
    assert status == 200 and verified["next"] == "/en/matches"
    match("data-fixture-feed", request(origin, verified["next"]).text)
    status, reset, headers = post_fixture(origin, "reset-code", {"phone": "256700000101", "code": "123456"})
    assert status == 200 and reset["next"] == "/en/account?view=new-password"
    reset_page = visible_html(request(origin, reset["next"], headers={"Cookie": headers["Set-Cookie"].split(";", 1)[0]}).text)
    match("Choose a new password", reset_page)
    outgoing = Request(origin + "/api/account/sign-out", data=b"", method="POST",
        headers={"Cookie": "goal-hint-member=" + "v" * 43, "Sec-Fetch-Site": "same-origin"})
    try:
        response = build_opener(NoRedirect()).open(outgoing, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == 303 and response.headers["Location"] == "/en/matches", "Sign-out keeps the visitor browsing matches"
        assert "Max-Age=0" in response.headers["Set-Cookie"]
    match(r'<h1[^>]*>Login</h1>', request(origin, "/en/account?view=login&status=signed-out").text)


def unified_login(origin):
    admin_phone, admin_password = "256700000991", "Synthetic admin password"
    owner = "goal-hint-analytics=" + "o" * 43
    for path in ["/admin", "/admin/payments", "/analytics"]:
        for member in [None, "a", "v", "r", "b", "e", "x", "s", "m"]:
            cookie = owner + ("; goal-hint-member=" + member * 43 if member else "")
            response = request(origin, path, headers={"Cookie": cookie})
            assert response.status == 307 and response.headers.get("Location") == "/en/account?view=login", (path, member, response.status)
            no_match(r'Analytics sign-in|Admin sign-in|Owner username|type="password"', visible_html(response.text))
        accepted = request(origin, path, headers={"Cookie": "goal-hint-member=" + "d" * 43})
        assert accepted.status == 200 and "data-fixture-" in accepted.text and "Log out" in accepted.text
    for token, administrator in [("a", False), ("v", False), ("r", False), ("b", False), ("d", True)]:
        cookie = owner + "; goal-hint-member=" + token * 43
        status = request(origin, "/api/admin/fixture", headers={"Cookie": cookie})
        assert status.status == (200 if administrator else 401), (token, status.status)
        session = json.loads(request(origin, "/api/account/session", headers={"Cookie": cookie}).text)
        assert session["administrator"] is administrator
    for view in ["login", "register", "forgot"]:
        existing = request(origin, "/en/account?view=" + view, headers={"Cookie": "goal-hint-member=" + "d" * 43})
        assert existing.status == 307 and existing.headers.get("Location") == "/admin", view
    for scenario, expected in [("denied", 401), ("missing", 401), ("blocked", 401), ("rate-limited", 429), ("unavailable", 503)]:
        status, reply, headers = post_fixture(origin, "login", {"phone": admin_phone, "password": admin_password}, scenario)
        assert status == expected and "next" not in reply and not headers.get("Set-Cookie"), (scenario, status, reply)
    for scenario, next_path in [("pending-verification", "/en/account?view=verify&return=%2Fen%2Fmatches"), ("password-reset", "/en/account?view=new-password&return=%2Fen%2Fmatches")]:
        status, reply, headers = post_fixture(origin, "login", {"phone": "256700000101", "password": "Synthetic password"}, scenario)
        assert status == 200 and reply["next"] == next_path
        assert not any("analytics-exclude=1" in value for value in headers.get_all("Set-Cookie"))
    status, reply, headers = post_fixture(origin, "login", {"phone": admin_phone, "password": admin_password, "return": "https://outside.example"})
    assert status == 200 and reply["next"] == "/admin"
    cookies = headers.get_all("Set-Cookie")
    assert any("goal-hint-analytics-exclude=1;" in value for value in cookies)
    assert any("goal-hint-analytics=;" in value and "Max-Age=0" in value for value in cookies)
    assert not any(admin_password in value for value in cookies)
    for path in ["/api/admin/login", "/api/analytics/login"]:
        outgoing = Request(origin + path, data=b"username=owner&password=private", method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded", "Sec-Fetch-Site": "same-origin"})
        try:
            response = build_opener(NoRedirect()).open(outgoing, timeout=20)
        except HTTPError as error:
            response = error
        with response:
            assert response.status == 303 and response.headers.get("Location") == "/en/account?view=login"
            assert not response.headers.get("Set-Cookie")


def subscription_discovery(origin):
    """The navigation session and visible account summary must agree for every access source."""
    active = {"active", "manual", "trial", "pending-renewal", "off-active"}
    scenarios = ["free", "active", "manual", "trial", "pending", "pending-renewal", "expired", "off", "off-active"]
    for scenario in scenarios:
        response = request(origin, "/api/account/session", headers={"Cookie": "goal-hint-member=" + "a" * 43,
            "X-Subscription-Fixture-State": scenario})
        assert response.status == 200 and response.headers.get("Cache-Control") == "no-store"
        session = json.loads(response.text)
        status = session["subscription"]
        assert session["phone"] == "256700000101" and session["administrator"] is False
        assert bool(status["activeUntil"]) is (scenario in active), (scenario, status)
        assert status["paymentPending"] is (scenario in {"pending", "pending-renewal"})
        assert status["canSubscribe"] is (not scenario.startswith("off"))
        if scenario == "off":
            continue  # The existing sales-off account fixture deliberately represents a guest.
        html = visible_html(request(origin, f"/en/account?state={scenario}", timeout=60).text)
        summary = match(r'<section\b[^>]*data-subscription-summary="(?:active|inactive)"[^>]*>([\s\S]*?)</section>', html)
        no_match(r'<details\b', summary.group(1))
        if scenario in active:
            match(r'<time dateTime="[^"]+">\d{1,2} \w+ \d{4}, \d{2}:\d{2} EAT</time>', summary.group(1))
            assert summary.group(1).count("<time ") == 1
        else:
            match("Expired" if scenario == "expired" else "Inactive", summary.group(1))
        if status["canSubscribe"]:
            match(r'href="/en/subscribe[^\"]*"', html)
            match("View payment" if status["paymentPending"] else "Extend" if scenario in active else "Renew" if scenario == "expired" else "Subscribe", html)
        else:
            no_match(r'href="/en/subscribe', html)
    for token, scenario, can_subscribe in [(None, "free", True), (None, "off", False), ("d", "active", False), ("b", "free", False)]:
        response = request(origin, "/api/account/session", headers={"Cookie": "goal-hint-member=" + token * 43 if token else "",
            "X-Subscription-Fixture-State": scenario})
        assert response.status == 200 and response.headers.get("Cache-Control") == "no-store"
        status = json.loads(response.text)
        assert status["administrator"] is (token == "d")
        assert status["subscription"] == {"activeUntil": None, "paymentPending": False, "canSubscribe": can_subscribe,
            "creditUgx": 0, "autoRenew": False, "renewsFromCredit": False}


def trial_visibility(origin):
    for route in ("account", "subscribe"):
        for state in ("trial-eligible", "trial-disabled", "off-trial-eligible", "legacy-free-flag", "off-trial-active"):
            html = visible_html(request(origin, f"/en/{route}?state={state}").text)
            if state in ("trial-eligible", "legacy-free-flag"):
                match(r'data-free-trial="available"', html)
                match("Your one-time trial runs for 30 days from account creation", html)
                match("Activate free trial", html)
            else:
                no_match("Activate free trial", html)
                if state == "off-trial-active":
                    match(r'data-free-trial="active"', html)
                    match("Trial ends" if route == "account" else "Your free trial is active until", html)
                else:
                    no_match("data-free-trial", html)


def account_workspace(html):
    content = match(r'<article\b[^>]*data-account-details[^>]*>([\s\S]*?)</main>', html).group(1)
    # The streamed panel is emitted after the shell. Reconstruct only the
    # fragments assigned to boundaries inside the Account article.
    for boundary in re.findall(r'<template id="B:([\w-]+)"></template>', content):
        start = match(rf'<div hidden id="S:{re.escape(boundary)}">', html).end()
        depth = 1
        for tag in re.finditer(r'</?div(?=[\s>])[^>]*>', html[start:]):
            depth += -1 if tag[0].startswith("</") else 1
            if depth == 0:
                content += html[start:start + tag.start()]
                break
        assert depth == 0, "The streamed Account boundary did not complete."
    return content


def user_dashboard(origin):
    """Focused Account sections retain real auth/renewal paths without the old text stack."""
    for state, package in [("active", "Weekly"), ("trial", "Free trial"), ("off-active", "Weekly"),
            ("queued", "Weekly"), ("free", None), ("expired", None), ("pending", None)]:
        html = visible_html(request(origin, f"/en/account?state={state}").text)
        body = account_workspace(html)
        summary = match(r'<section\b[^>]*data-subscription-summary[^>]*>([\s\S]*?)</section>', html).group(1)
        if package:
            match(rf'<dd\b[^>]*data-active-package[^>]*>{re.escape(package)}</dd>', summary)
        else:
            no_match("data-active-package", summary)
        match(r'<h1[^>]*data-account-page-heading[^>]*>Overview</h1>', body)
        identity = match(r'data-account-sidebar-identity[^>]*>([^<]+)<', html).group(1)
        assert body.count(identity) == 1
        match("Login details", body)
        match("Phone", body)
        no_match(r'data-account-activity|data-payment-status|type="password"|Your access|You have access|saved-slip-configurations', body)
        no_match(r'data-subscription-status-bar', html)
        html = visible_html(request(origin, f"/en/account?state={state}&section=activity").text)
        activity = account_workspace(html)
        match(r'<div\b[^>]*data-account-activity', activity)
        match("Recent activity", activity)
        no_match(r'Best slips|Custom Filters|saved-slip-configurations|codeHash|passwordHash|payerPhone|transactionRef', activity)
        if state == "queued":
            subscription_html = visible_html(request(origin, "/en/account?state=queued&section=subscription").text)
            match("Upcoming packages", subscription_html)
            match("Next package", subscription_html)
            no_match(r'data-active-package[^>]*>Next package', subscription_html)
        if state == "free":
            match("No activity yet", activity)
        elif state == "pending":
            match("Payment submitted", activity)
        else:
            match("Access added", activity)
            match(r'<time dateTime="[^"]+">[^<]*\d{4}[^<]* EAT</time>', activity)
    history = visible_html(request(origin, "/en/account?state=history&section=activity").text)
    activity = account_workspace(history)
    match(r'<div\b[^>]*data-account-activity', activity)
    rows = match(r'<ol\b[^>]*data-record-list-scroll[^>]*>([\s\S]*?)</ol>', activity).group(1)
    assert len(re.findall(r'<li\b', rows)) == 10
    for label in ["Payment reversed", "Payment approved", "Payment declined", "Payment replaced", "Payment submitted", "Account credit"]:
        match(label, activity)
    unavailable = visible_html(request(origin, "/en/account?state=dashboard-unavailable&section=activity").text)
    match("Recent activity is temporarily unavailable", unavailable)
    no_match("No activity yet", unavailable)
    unavailable = visible_html(request(origin, "/en/account?state=subscription-unavailable").text)
    match("Subscription details are unavailable", unavailable)
    for state in ["signed-out", "blocked", "unverified", "password-reset"]:
        for section in ["overview", "phone", "password", "payments", "devices"]:
            html = visible_html(request(origin, f"/en/account?state={state}&section={section}").text)
            no_match(r'data-account-workspace|data-account-details|data-account-activity|data-active-package', html)
    headings = {"overview": "Overview", "subscription": "Subscription", "wallet": "Wallet", "referrals": "Referrals", "payments": "Payments", "phone": "Change phone",
        "password": "Change password", "devices": "Devices", "notifications": "Notifications", "activity": "Activity"}
    for section, heading in headings.items():
        html = visible_html(request(origin, f"/en/account?state=active&section={section}&return=%2Fen%2Fslips").text)
        body = account_workspace(html)
        match(rf'<h1[^>]*data-account-page-heading[^>]*>{heading}</h1>', body)
        match(rf'data-account-section="{section}"', html)
        match(r'aria-label="Account sections"', html)
        match(r'href="/en/account\?section=password&amp;return=%2Fen%2Fslips"', html)
        if section == "subscription":
            assert len(re.findall(r'<h[1-6][^>]*>Subscription</h[1-6]>', body)) == 1
        if section in ["phone", "password"]:
            match(rf'action="/api/account/{section}"', body)
            if section == "phone":
                match(r'name="currentPassword"', body)
            else:
                no_match(r'name="currentPassword"|view=forgot', body)
        if section == "devices":
            match(r'action="/api/account/devices"', body)
            signed_in = account_workspace(visible_html(request(origin, "/en/account?state=free&section=devices").text))
            match("This device", signed_in)
            no_match(r'action="/api/account/devices"', signed_in)
        if section == "notifications":
            match(r'data-account-notification-feed', body)
            for label in ["Inbox", "Payment approved", "Payment rejected", "Access activated", "Access ends soon", "Access expired", "1 free day earned", "Mark all as read", "Dismiss"]:
                match(label, body)
            match(r'data-unread="true"', body)
            footer = match(r'<[^>]+data-record-footer[^>]*>([\s\S]*?)</[^>]+>', body).group(1)
            match("View payments", footer)
            no_match(r'eventKey|accountId|tokenHash|WhatsApp preferences|/api/account/preferences', body)
        if section == "referrals":
            match(r'data-account-referrals', body)
            for label in ["Copy link", "WhatsApp", "Telegram"]:
                match(label, body)
            match(r'data-invite-friends', body)
            match(r'https://wa.me/\?text=', body)
            match(r'https://t.me/share/url\?url=', body)
            match(r'https://goalhint.com/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', body)
            match(r'Awaiting verification', body)
            match(r'2 days 5 hours', body)
            no_match(r'phoneKey|inviterId|private-digest', body)
    overview = visible_html(request(origin, "/en/account?state=ended").text)
    match(r'Invite friends', overview)
    match(r'data-nav-key="invite-friends"', overview)
    guest = visible_html(request(origin, "/en/account?section=referrals").text)
    no_match(r'data-invite-friends|name="referralLink"', guest)
    empty = visible_html(request(origin, "/en/account?state=referral-empty&section=referrals").text)
    match(r'No referrals yet', empty)
    failed = visible_html(request(origin, "/en/account?state=referral-unavailable&section=referrals").text)
    match(r'Referral details are temporarily unavailable', failed)
    empty_notifications = visible_html(request(origin, "/en/account?state=notifications-empty&section=notifications").text)
    match(r'No notifications\.', empty_notifications)
    unavailable_notifications = visible_html(request(origin, "/en/account?state=notifications-unavailable&section=notifications").text)
    match(r'Notifications are temporarily unavailable', unavailable_notifications)
    no_match(r'WhatsApp preferences', unavailable_notifications)
    for view in ["forgot", "reset"]:
        response = request(origin, f"/en/account?state=active&view={view}")
        assert response.status == 307 and response.headers["location"] == "/en/account?section=password"
    for query in ["section=unknown", "section=phone&section=password"]:
        html = visible_html(request(origin, f"/en/account?state=active&{query}").text)
        match(r'data-account-section="overview"', html)
    payments = visible_html(request(origin, "/en/account?state=pending&section=payments").text)
    match(r'data-payment-status="pending"', payments)
    for state, action, anchor in [("free", "Subscribe", "plans"), ("expired", "Renew", "plans"),
            ("active", "Extend", "plans"), ("pending", "View payment", "report"), ("wallet-only", "Subscribe", "plans")]:
        html = visible_html(request(origin, f"/en/account?state={state}&section=subscription&return=%2Fen%2Fmatches").text)
        match(rf'href="/en/subscribe\?return=%2Fen%2Fmatches#{anchor}"[^>]*>{action}</a>', account_workspace(html))
    closed = account_workspace(visible_html(request(origin, "/en/account?state=off-inactive&section=subscription").text))
    no_match(r'/en/subscribe', closed)
    match(r"Subscription purchases are temporarily unavailable\.", closed)
    print("Account workspace: all sections, concise facts, renewal/payment paths, bounded activity and private guards pass.", flush=True)


def checkout_journey(origin):
    """An inactive member can open checkout and return to the canonical match in every availability state."""
    path = "/en/matches/0b9b7a29-6eea-434b-8d30-48ce38147fc8/synthetic-club-10-vs-synthetic-club-20"
    headers = {"Cookie": "goal-hint-member=" + "a" * 43 + "; member-fixture-subscription=free"}
    match_page = visible_html(request(origin, path, headers=headers).text)
    destination = f"/en/subscribe?return={quote(path, safe='')}"
    unlock = re.escape(destination + "&amp;checkout=1")
    match(rf'<a\b(?=[^>]*\bdata-unlock-link)(?=[^>]*\bhref="{unlock}")[^>]*>', match_page)
    for state, label in [("free", "Restoring checkout"), ("wallet-only", "Restoring checkout"),
            ("off-inactive", "Subscriptions are not open yet"), ("no-plan", "Plans are unavailable"),
            ("no-payment-method", "No payment method is available")]:
        checkout = visible_html(request(origin, destination + "&state=" + state, headers=headers).text)
        match(label, checkout)
        match(rf'<a\b[^>]*href="{re.escape(path)}"[^>]*>Back to match</a>', checkout)
        if state not in ("free", "wallet-only"):
            no_match("Restoring checkout", checkout)
    topup = visible_html(request(origin, "/en/subscribe?add=credit&state=wallet-only", headers=headers).text)
    match("No payment method is available", topup)
    no_match("Restoring checkout", topup)
    for invalid in ("https://invalid.example" + path, "//invalid.example" + path, "/en/matches"):
        checkout = visible_html(request(origin, f"/en/subscribe?return={quote(invalid, safe='')}", headers=headers).text)
        no_match(r'Back to match|href="(?:https:)?//invalid\.example', checkout)
    print("Checkout journey: canonical match unlock and return, paused sales, missing methods or plans, wallet-only availability and external return rejection pass.", flush=True)


def authentication_routes(origin):
    home = request(origin, "/en")
    assert home.status == 307 and home.headers.get("Location") == "/en/matches"
    for state in ["signed-out", "off", "unavailable"]:
        response = request(origin, f"/en/subscribe?state={state}&return=%2Fen%2Fbest-slips")
        assert response.status == 307 and response.headers.get("Location") == "/en/account?view=login&return=%2Fen%2Fbest-slips", state
    for state, view in [("unverified", "verify"), ("password-reset", "new-password")]:
        response = request(origin, f"/en/subscribe?state={state}")
        assert response.status == 307 and response.headers.get("Location") == f"/en/account?view={view}"
    for state in ["session-unavailable", "reset-unavailable", "verification-unavailable"]:
        for path in ["account", "subscribe"]:
            response = request(origin, f"/en/{path}?state={state}")
            assert response.status == 200
            html = visible_html(response.text)
            match("Member access is unavailable", html)
            no_match("data-account-auth", html)
    for view in ["login", "register", "verify", "new-password"]:
        response = request(origin, f"/en/account?state=active&view={view}")
        assert response.status == 307 and response.headers.get("Location") == "/en/matches"
    pending = visible_html(request(origin, "/en/account?state=unverified&view=forgot").text)
    recovery_dialog(pending)
    reset_only = visible_html(request(origin, "/en/account?state=password-reset&view=forgot").text)
    match('action="/api/account/reset"', reset_only)
    no_match('action="/api/account/forgot"', reset_only)
    outgoing = Request(origin + "/api/account/sign-out?destination=login", data=b"", method="POST",
        headers={"Cookie": "goal-hint-member=" + "v" * 43, "Sec-Fetch-Site": "same-origin"})
    try:
        response = build_opener(NoRedirect()).open(outgoing, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == 303 and response.headers["Location"] == "/en/account?view=login"
        assert "Max-Age=0" in response.headers["Set-Cookie"]
    print("Authentication routing: canonical login, restricted-session priority, explicit return to login, Matches home and failed-session reads pass.", flush=True)


def main():
    options = parse_args("member account", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
        GOAL_HINT_ADMIN_PASSWORD="Synthetic admin password")
    if options.fixture:
        directory = Path(options.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file(), "Reuse a built acceptance fixture inside .tmp."
    else:
        directory = create_fixture("members")
        print(f"Building member acceptance fixture: {directory}", flush=True)
        # Root typecheck validates production source; keep the isolated acceptance
        # build from repeating that whole-source check on memory-constrained hosts.
        config = directory / "next.config.mjs"
        config.write_text(config.read_text().replace("agentRules: false,", "agentRules: false, typescript: { ignoreBuildErrors: true },"))
        build_fixture(directory, env=env, timeout=600)
    with Server(directory, env=env, ready="/en/account") as server:
        verify_deferred_account(server.origin)
        for state, expected in [("off", "Login"), ("signed-out", "Phone number"),
                ("signed-in", "256 700 000 101"), ("unavailable", "Login"),
                ("active", "Expires"), ("ended", "Expired"), ("blocked", "We couldn&#x27;t complete this.")]:
            response = request(server.origin, f"/en/account?state={state}")
            assert response.status == 200
            match(expected, response.text)
            match(r'<meta name="robots" content="noindex, follow"', response.text)
            assert response.headers.get("Set-Cookie") is None
            if state not in ("signed-in", "active", "ended"):
                no_match("256 700 000 101", response.text)
            if state == "signed-out":
                match(r'type="tel"', response.text)
                match(r'type="password"', response.text)
                match(r'autoComplete="current-password"', response.text)
                login_html = authentication_form(visible_html(response.text), "login", "Login")
                no_match(r'Analytics sign-in|Admin sign-in|Owner username', login_html)
                phone_field(login_html)
                notice = match(r'<details\b([^>]*)>([\s\S]*?You can stay logged in on two devices\.[\s\S]*?)</details>', login_html)
                no_match(r'\bopen(?:\s|=|$)', notice.group(1))
                match(r'<summary[^>]*aria-label="You can stay logged in on two devices\.', notice.group(2))
                match(r'<button[^>]*type="submit"[^>]*>Login</button>', login_html)
                match(r'18\+', login_html)
                match(r'href="/en/terms"[^>]*>Terms', login_html)
                no_match(r'account-single-device-notice|By logging in|Use 8–128 characters', login_html)
            if state == "signed-in":
                no_match(r'Access until|days left|payment status|accessCodeId|tokenHash', response.text)
            if state in ("signed-in", "active", "ended"):
                match("Change phone", response.text)
                match("Change password", response.text)
                match("Log out", response.text)
            if state in ("signed-in", "active", "ended"):
                devices = visible_html(request(server.origin, f"/en/account?state={state}&section=devices").text)
                match("Signed-in devices", devices)
                if state == "active":
                    match("Log out others", devices)
                else:
                    no_match("Log out others", devices)
        register = request(server.origin, "/en/account?view=register")
        match(r'<button[^>]*type="submit"[^>]*>Register</button>', register.text)
        match(r'<h1[^>]*>Register</h1>', register.text)
        match(r'autoComplete="new-password"', register.text)
        register_html = authentication_form(visible_html(register.text), "register", "Register")
        phone_field(register_html)
        match("Create your account with your phone number and a password.", register_html)
        no_match(r'Use 8–128 characters|By logging in|You can stay logged in on two devices|name="code"|name="channel"|name="whatsappNotifications"', register_html)
        login = visible_html(request(server.origin, "/en/account?return=%2Fen%2Fmatches").text)
        match(r'href="/en/account\?view=forgot&amp;return=%2Fen%2Fmatches"', login)
        forgot = visible_html(request(server.origin, "/en/account?state=signed-out&view=forgot&return=%2Fen%2Fmatches").text)
        recovery_dialog(forgot)
        match(r'href="/en/account\?view=reset-code&amp;return=%2Fen%2Fmatches"', forgot)
        verify = visible_html(request(server.origin, "/en/account?state=unverified&view=verify&return=%2Fen%2Fmatches").text)
        match('data-verification-step="code"', verify)
        match("Verify phone", verify)
        match("Use the code already sent to this number", verify)
        match(r'action="/api/account/verify"', verify)
        match(r'name="code"[^>]*autoComplete="one-time-code"|autoComplete="one-time-code"[^>]*name="code"', verify)
        match(r'href="/en/account\?view=forgot&amp;return=%2Fen%2Fmatches"', verify)
        match(r'action="/api/account/sign-out\?destination=login"', verify)
        no_match(r'action="/api/account/verification"|name="channel"|name="whatsappNotifications"|value="[0-9]{6}"', verify)
        reset_link = request(server.origin, "/en/account/reset-password")
        match(r'<meta name="referrer" content="no-referrer"', reset_link.text)
        match("Checking the password reset link", visible_html(reset_link.text))
        reset = visible_html(request(server.origin, "/en/account?state=password-reset&view=new-password").text)
        for text in ["Choose a new password", "Verification accepted", "once every 24 hours", "Contact the admin"]:
            match(text, reset)
        match(r'action="/api/account/reset"', reset)
        no_match(r'Your account|action="/api/account/verification"', reset)
        probe = visible_html(request(server.origin, "/en/phone-fields").text)
        phone_field(probe, "memberPhone")
        for field in ["memberPhone", "searchPhone"]:
            canonical = match(rf'<input\b(?=[^>]*name="{field}")[^>]*>', probe).group(0)
            match(r'type="hidden"', canonical)
            match(r'value=""', canonical)
        verify_synthetic_api(server.origin)
        unified_login(server.origin)
        subscription_discovery(server.origin)
        user_dashboard(server.origin)
        trial_visibility(server.origin)
        authentication_routes(server.origin)
        checkout_journey(server.origin)
        print("Member HTML and synthetic APIs: private subscription status, visible expiry and renewal summaries, shared member/admin login, private-page redirects and role gates, legacy endpoint redirects, restricted sessions, cookie clearing, phone/OTP controls and home destinations pass.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
