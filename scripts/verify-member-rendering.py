"""Verify the account's initial production HTML using the shared rendering harness."""
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, urlopen
from lib.rendering import NoRedirect, Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def auth_card(html):
    return match(r'<section\b[^>]*data-account-auth[^>]*>([\s\S]*?)</section>', html).group(1)


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


def default_sms(html):
    channels = [tag for tag in re.findall(r'<input\b[^>]*>', html) if 'name="channel"' in tag]
    assert channels
    checked = [tag for tag in channels if re.search(r'\bchecked(?:=|\s|>)', tag)]
    assert len(checked) == 1 and 'value="sms"' in checked[0], "SMS starts selected and exactly one available delivery choice is active."
    assert all('type="radio"' in tag for tag in channels), "Delivery choices must remain mutually exclusive native radios."


def send_button(html):
    form = match(r'<form\b[^>]*data-account-step-form="delivery"[^>]*>([\s\S]*?)</form>', html).group(1)
    button = match(r'<button\b(?=[^>]*\btype="submit")([^>]*)>([\s\S]*?)</button>', form)
    checked = [tag for tag in re.findall(r'<input\b[^>]*>', form)
        if 'name="channel"' in tag and re.search(r'\bchecked(?:=|\s|>)', tag)]
    selected = match(r'\bvalue="(sms|whatsapp)"', checked[0]).group(1) if checked else None
    expected = "Send by SMS" if selected == "sms" else "Send by WhatsApp" if selected == "whatsapp" else "Send code"
    label = re.sub(r'<svg\b[\s\S]*?</svg>|<!--[\s\S]*?-->|<[^>]+>', "", button.group(2)).strip()
    assert label == expected, "The request button must name the selected delivery channel."
    return button


def disabled_send(html):
    button = send_button(html)
    match(r'\bdisabled(?:=|\s|$)', button.group(1))


def delivery_step(html):
    match(r'data-verification-step="delivery"', html)
    match(r'data-account-step-form="delivery"', html)
    no_match(r'data-account-step-form="code"|name="code"|autoComplete="one-time-code"', html)
    support = match(r'<nav\b[^>]*data-account-support[^>]*>([\s\S]*?)</nav>', html).group(1)
    for label in ["Contact support", "Back to log in"]:
        match(label, support)
    no_match(r'data-verification-help|data-verification-tracker|<ol\b|up to 3 messages|Codes expire after', auth_card(html))
    no_match(r'256 700 000 101', auth_card(html))
    no_match(r'only the latest code works', html, flags=re.IGNORECASE)
    send_button(html)
    match(r'Have a code\?', html)
    default_sms(html)


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
    for action, body in [("verification", {"channel": "sms"}), ("forgot", {"phone": "256700000101", "channel": "whatsapp"})]:
        for scenario, expected in [("success", 200), ("send-failed", 503), ("rate-limited", 429), ("unavailable", 503)]:
            status, reply, headers = post_fixture(origin, action, body, scenario)
            assert status == expected, (action, scenario, status, reply)
            if scenario == "success":
                assert reply["status"] == "requested"
                assert "123456" not in json.dumps(reply), "Delivery never returns a verification code."
            if scenario == "rate-limited":
                assert headers.get("Retry-After") == "60"
    for action, fields in [("verify", {}), ("reset-code", {"phone": "256700000101"})]:
        for scenario, code in [("success", "000000"), ("invalid-code", "123456")]:
            status, reply, _ = post_fixture(origin, action, {**fields, "code": code}, scenario)
            assert status == 400 and "invalid" in reply["message"], (action, scenario, reply)
    for phone, channel, expected in [("447700900123", "sms", 200), ("447700900123", "whatsapp", 400), ("5511999999999", "sms", 400)]:
        status, _, _ = post_fixture(origin, "forgot", {"phone": phone, "channel": channel})
        assert status == expected, (phone, channel, status)
    status, logged_in, _ = post_fixture(origin, "login", {"phone": "256700000101", "password": "Synthetic password", "return": "/en/matches"})
    assert status == 200 and logged_in["next"] == "/en"
    status, registered, headers = post_fixture(origin, "register", {"phone": "256700000101", "password": "Synthetic password", "return": "/en/matches"})
    assert status == 200 and registered["next"] == "/en/account?view=verify&return=%2Fen"
    assert "HttpOnly" in headers.get("Set-Cookie", "")
    status, verified, _ = post_fixture(origin, "verify", {"code": "123456", "return": "/en"})
    assert status == 200 and verified["next"] == "/en"
    match("data-fixture-home", request(origin, verified["next"]).text)
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
        assert response.status == 303 and response.headers["Location"] == "/en/account?view=login&status=signed-out"
        assert "Max-Age=0" in response.headers["Set-Cookie"]
    match(r'<h1[^>]*>Log in</h1>', request(origin, "/en/account?view=login&status=signed-out").text)


def unified_login(origin):
    admin_phone, admin_password = "256700000991", "Synthetic admin password"
    owner = "goal-hint-analytics=" + "o" * 43
    for path in ["/admin", "/analytics"]:
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
    for scenario, next_path in [("pending-verification", "/en/account?view=verify&return=%2Fen"), ("password-reset", "/en/account?view=new-password&return=%2Fen")]:
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


def main():
    options = parse_args("member account", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
        GOAL_HINT_ADMIN_PASSWORD="Synthetic admin password", GOAL_HINT_ADMIN_PASSWORD_HASH="")
    if options.fixture:
        directory = Path(options.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file(), "Reuse a built acceptance fixture inside .tmp."
    else:
        directory = create_fixture("members")
        print(f"Building member acceptance fixture: {directory}", flush=True)
        build_fixture(directory, env=env, timeout=240)
    with Server(directory, env=env, ready="/en/account") as server:
        for state, expected in [("off", "Log in"), ("signed-out", "Phone number"),
                ("signed-in", "256 700 000 101"), ("unavailable", "Member access is unavailable."),
                ("active", "Access until"), ("ended", "Your access ended on"), ("blocked", "We couldn&#x27;t complete this.")]:
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
                login_html = auth_card(visible_html(response.text))
                assert len(re.findall(r'<form\b', login_html)) == 1
                match(r'action="/api/account/login"', login_html)
                no_match(r'Analytics sign-in|Admin sign-in|Owner username', login_html)
                phone_field(login_html)
                notice = match(r'<details\b([^>]*)>([\s\S]*?Signing in signs out your other device\.[\s\S]*?)</details>', login_html)
                no_match(r'\bopen(?:\s|=|$)', notice.group(1))
                match(r'<summary[^>]*aria-label="Signing in signs out your other device\."', notice.group(2))
                match(r'<button[^>]*type="submit"[^>]*>Log in</button>', login_html)
                match(r'18\+', login_html)
                match(r'href="/en/terms"[^>]*>Terms', login_html)
                no_match(r'account-single-device-notice|By signing in|Use 8–128 characters', login_html)
            if state == "signed-in":
                no_match(r'Access until|days left|payment status|accessCodeId|tokenHash', response.text)
            if state in ("signed-in", "active", "ended"):
                match("Change phone", response.text)
                match("Change password", response.text)
                match("Log out", response.text)
            if state in ("active", "ended"):
                match("Sign out others", response.text)
        register = request(server.origin, "/en/account?view=register")
        match("Create account", register.text)
        match(r'<h1[^>]*>Sign up</h1>', register.text)
        match(r'autoComplete="new-password"', register.text)
        register_html = auth_card(visible_html(register.text))
        phone_field(register_html)
        no_match(r'Use 8–128 characters|Use the number you pay from|By signing in|Signing in signs out your other device', register_html)
        login = visible_html(request(server.origin, "/en/account?return=%2Fen%2Fmatches").text)
        match(r'href="/en/account\?view=forgot&amp;return=%2Fen%2Fmatches"', login)
        for state in ["signed-out", "signed-in", "unverified"]:
            forgot = visible_html(request(server.origin, f"/en/account?state={state}&view=forgot&return=%2Fen%2Fmatches").text)
            delivery_step(forgot)
            for text in ["Reset password", "Registered number", "SMS", "WhatsApp"]:
                match(text, forgot)
            match(r'action="/api/account/forgot"', forgot)
            match(r'name="channel"', forgot)
            disabled_send(forgot)
            no_match(r'name="code"|temporary password|request to the admin', forgot)
            phone_field(auth_card(forgot))
            match(r'href="/en/account\?view=login&amp;return=%2Fen%2Fmatches"', forgot)
        verify = visible_html(request(server.origin, "/en/account?state=unverified&view=verify").text)
        delivery_step(verify)
        for text in ["Verify phone", "SMS", "WhatsApp"]:
            match(text, verify)
        match(r'action="/api/account/verification"', verify)
        no_match(r'action="/api/account/verify"', verify)
        match(r'action="/api/account/sign-out"', verify)
        no_match(r'value="[0-9]{6}"', verify)
        sms_only = visible_html(request(server.origin, "/en/account?state=sms-only").text)
        default_sms(sms_only)
        match(r'value="sms"', sms_only)
        no_match(r'value="whatsapp"', sms_only)
        unsupported = visible_html(request(server.origin, "/en/account?state=unsupported").text)
        match("Messaging is unavailable for this country", unsupported)
        no_match(r'name="channel"', unsupported)
        disabled_send(unsupported)
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
        print("Member HTML and synthetic APIs: shared member/admin login, private-page redirects and role gates, legacy endpoint redirects, restricted sessions, cookie clearing, phone/OTP controls and home destinations pass.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
