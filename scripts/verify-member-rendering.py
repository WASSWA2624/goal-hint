"""Verify the account's initial production HTML using the shared rendering harness."""
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from lib.rendering import Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, visible_html
from lib.runtime import main_guard


def delivery_step(html):
    match(r'data-verification-step="delivery"', html)
    match(r'data-account-step-form="delivery"', html)
    no_match(r'data-account-step-form="code"|name="code"|autoComplete="one-time-code"', html)
    help_section = match(r'<details\b([^>]*data-verification-help[^>]*)>([\s\S]*?)</details>', html)
    no_match(r'\bopen(?:\s|=|$)', help_section.group(1))
    for text in ["Need help?", "24 hours", "up to 3 messages", "Contact the admin"]:
        match(re.escape(text), help_section.group(2))
    active = html[:help_section.start()] + html[help_section.end():]
    no_match(r'up to 3 messages|Contact the admin', active)
    no_match(r'only the latest code works', html, flags=re.IGNORECASE)
    match(r'>Send code</button>', active)
    match("I already have a code", active)


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


def main():
    options = parse_args("member account")
    directory = create_fixture("members")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    print(f"Building member acceptance fixture: {directory}", flush=True)
    build_fixture(directory, env=env, timeout=240)
    with Server(directory, env=env, ready="/en/account") as server:
        for state, expected in [("off", "Login"), ("signed-out", "Phone number"),
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
                match(r'autoComplete="tel"', response.text)
                match(r'value="256"', response.text)
                match(r'type="password"', response.text)
                match(r'autoComplete="current-password"', response.text)
                login_html = visible_html(response.text)
                warning = match(r'<p[^>]*id="account-single-device-notice"[^>]*role="note"[^>]*>You can be signed in on only one device at a time\. Logging in here will sign you out on the other device\.</p>', login_html)
                login_button = match(r'<button[^>]*type="submit"[^>]*>Login</button>', login_html)
                assert warning.end() <= login_button.start(), "The one-device warning must be visible before the login button."
                match(r'<form[^>]*aria-describedby="account-single-device-notice"', login_html)
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
        match(r'autoComplete="new-password"', register.text)
        no_match(r'id="account-single-device-notice"|role="note"[^>]*>You can be signed in', visible_html(register.text))
        login = visible_html(request(server.origin, "/en/account?return=%2Fen%2Fmatches").text)
        match(r'href="/en/account\?view=forgot&amp;return=%2Fen%2Fmatches"', login)
        for state in ["signed-out", "signed-in", "unverified"]:
            forgot = visible_html(request(server.origin, f"/en/account?state={state}&view=forgot&return=%2Fen%2Fmatches").text)
            delivery_step(forgot)
            for text in ["Reset password", "Registered number", "SMS", "WhatsApp"]:
                match(text, forgot)
            match(r'action="/api/account/forgot"', forgot)
            match(r'name="channel"', forgot)
            no_match(r'<input[^>]+type="radio"[^>]+checked', forgot)
            no_match(r'name="code"|temporary password|request to the admin', forgot)
            match(r'href="/en/account\?view=login&amp;return=%2Fen%2Fmatches"', forgot)
        verify = visible_html(request(server.origin, "/en/account?state=unverified&view=verify").text)
        delivery_step(verify)
        for text in ["Verify account", "256 700 000 101", "SMS", "WhatsApp"]:
            match(text, verify)
        match(r'action="/api/account/verification"', verify)
        no_match(r'action="/api/account/verify"', verify)
        match(r'action="/api/account/sign-out"', verify)
        no_match(r'<input[^>]+type="radio"[^>]+checked', verify)
        no_match(r'value="[0-9]{6}"', verify)
        unsupported = visible_html(request(server.origin, "/en/account?state=unsupported").text)
        match("Messaging is unavailable for this country", unsupported)
        no_match(r'name="channel"', unsupported)
        reset = visible_html(request(server.origin, "/en/account?state=password-reset&view=new-password").text)
        for text in ["Choose a new password", "Verification accepted", "once every 24 hours", "Contact the admin"]:
            match(text, reset)
        match(r'action="/api/account/reset"', reset)
        no_match(r'Your account|action="/api/account/verification"', reset)
        verify_synthetic_api(server.origin)
        print("Member HTML and synthetic APIs: account states, login warning, single delivery step, collapsed help, code privacy, recovery navigation, country coverage, delivery failures and signup home destination pass.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
