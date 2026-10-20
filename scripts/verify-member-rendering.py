"""Verify the account's initial production HTML using the shared rendering harness."""
from lib.rendering import Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request
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
                match(r'name="code"', response.text)
                match(r'autoComplete="off"', response.text)
                match("Change phone", response.text)
                match("Change password", response.text)
                match("Log out", response.text)
            if state in ("active", "ended"):
                match("Sign out others", response.text)
        register = request(server.origin, "/en/account?view=register")
        match("Create account", register.text)
        match(r'autoComplete="new-password"', register.text)
        print("Member initial HTML: seven states pass; Login/Register, account changes and bottom logout render; subscription codes require sign-in.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
