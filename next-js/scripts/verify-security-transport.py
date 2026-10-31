"""Exercise the real production Next/Node instrumentation boundary without a database."""
import json
from lib.rendering import Server, build_fixture, create_fixture, environment, request
from lib.runtime import main_guard


def main():
    directory = create_fixture("security")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_TRUSTED_PROXY_CIDRS="")
    build_fixture(directory, env=env, timeout=240)
    with Server(directory, env=env) as server:
        baseline = json.loads(request(server.origin, "/api/probe").text)
        assert baseline["address"] == "127.0.0.1", baseline
        for headers in [
            {"X-Forwarded-For": "198.51.100.9"},
            {"X-Forwarded-For": "malformed, 198.51.100.10", "X-Real-IP": "198.51.100.10", "CF-Connecting-IP": "198.51.100.11"},
            {"X-Goal-Hint-Client-Address": "forged"},
        ]:
            result = json.loads(request(server.origin, "/api/probe", headers=headers).text)
            assert result["address"] == baseline["address"], result
        forged_origin = json.loads(request(server.origin, "/api/probe", headers={"Origin": "https://evil.test", "X-Forwarded-Host": "evil.test"}).text)
        assert forged_origin["sameOrigin"] is False
    print("Production Next/Node transport: real peer preserved; forged forwarding/proof/host headers refused.", flush=True)


if __name__ == "__main__":
    main_guard(main)
