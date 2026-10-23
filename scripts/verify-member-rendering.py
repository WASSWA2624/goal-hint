"""Verify the account's initial production HTML using the shared rendering harness."""
from lib.rendering import Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, visible_html
from lib.runtime import main_guard


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
        login = visible_html(request(server.origin, "/en/account?return=%2Fen%2Fmatches").text)
        match(r'href="/en/account\?view=forgot&amp;return=%2Fen%2Fmatches"', login)
        for state in ["signed-out", "signed-in", "unverified"]:
            forgot = visible_html(request(server.origin, f"/en/account?state={state}&view=forgot&return=%2Fen%2Fmatches").text)
            for text in ["Reset password", "Registered number", "SMS", "WhatsApp", "24 hours", "up to 3 messages", "Only the latest code works", "Contact the admin"]:
                match(text, forgot)
            match(r'action="/api/account/forgot"', forgot)
            match(r'name="channel"', forgot)
            no_match(r'<input[^>]+type="radio"[^>]+checked', forgot)
            no_match(r'name="code"|temporary password|request to the admin', forgot)
            match(r'href="/en/account\?view=login&amp;return=%2Fen%2Fmatches"', forgot)
        verify = visible_html(request(server.origin, "/en/account?state=unverified&view=verify").text)
        for text in ["Verify account", "256 700 000 101", "SMS", "WhatsApp", "Verification code", "6-digit", "up to 3 messages", "Only the latest code works"]:
            match(text, verify)
        match(r'action="/api/account/verification"', verify)
        match(r'action="/api/account/verify"', verify)
        match(r'autoComplete="one-time-code"', verify)
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
        print("Member HTML: account states, recovery navigation, unselected delivery channels, pending verification, code privacy, country coverage and reset-only forms pass.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
