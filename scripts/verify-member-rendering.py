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
        for state, expected in [("off", "Subscriptions are not open yet."), ("signed-out", "Your number"),
                ("signed-in", "Signed in as 256 700 000 101"), ("unavailable", "Member access is unavailable.")]:
            response = request(server.origin, f"/en/account?state={state}")
            assert response.status == 200
            match(expected, response.text)
            match(r'<meta name="robots" content="noindex, follow"', response.text)
            assert response.headers.get("Set-Cookie") is None
            if state != "signed-in":
                no_match("256 700 000 101", response.text)
            if state == "signed-out":
                match(r'type="tel"', response.text)
                match(r'autoComplete="tel"', response.text)
                match(r'value="256"', response.text)
            if state == "signed-in":
                no_match(r'Access until|days left|payment status|accessCodeId|tokenHash', response.text)
        print("Member initial HTML: four states pass; no anonymous cookies or subscription details.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
