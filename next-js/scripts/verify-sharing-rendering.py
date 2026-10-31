"""Production sharing/recipient fixture; all storage and access states are synthetic."""
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def verify(origin):
    token = "a" * 32
    for viewer, expected in [("guest", "Sign in"), ("member", "Check access"), ("eligible", "Arsenal")]:
        response = request(origin, "/s/" + token, headers={"Cookie": "fixture-sharing-viewer=" + viewer})
        assert response.status == 200
        assert expected in visible_html(response.text)
        if viewer != "eligible":
            for private in ["Arsenal", "home-win", "Premier League", "fixtureId", "totalOdds", "averageProbability"]:
                assert private not in response.text, (viewer, private)
            assert "return=%2Fs%2F" + token in response.text
        # Generic metadata is independent of entitlement and never includes slip facts.
        head = response.text.split("</head>", 1)[0]
        assert 'noindex' in head and 'og:description' in head
        assert 'Arsenal' not in head and 'Total odds' not in head
    assert "Arsenal" in request(origin, "/s/" + "c" * 32).text
    for address in ["invalid", "0" * 32]:
        response = request(origin, "/s/" + address)
        assert response.status == 404 and "Slip not found" in response.text
        assert "Arsenal" not in response.text
    private_flight = request(origin, "/s/" + token, headers={"RSC": "1", "Cookie": "fixture-sharing-viewer=guest"})
    assert not any(value in private_flight.text for value in ["Arsenal", "home-win", "fixtureId", "totalOdds"])
    subscription = request(origin, "/en/subscribe?return=%2Fs%2F" + token, headers={"Cookie": "fixture-sharing-viewer=member"})
    assert 'href="/s/' + token + '"' in subscription.text and "Return to shared slip" in subscription.text
    unsafe = request(origin, "/en/subscribe?return=https%3A%2F%2Fexample.test", headers={"Cookie": "fixture-sharing-viewer=member"})
    assert "Return to shared slip" not in unsafe.text
    failure = request(origin, "/s/" + "f" * 32)
    assert "Slip unavailable" in failure.text and "Synthetic storage failure" not in failure.text
    for scenario in ["builder", "best"]:
        html = request(origin, "/" + scenario).text
        assert 'data-share-slip' in html
        assert 'data-slip-disclosure="" open=' not in html
    print("Sharing HTML: restricted privacy/metadata, safe return links, completed/eligible access, missing/unavailable states and collapsed phone actions pass.", flush=True)


def main():
    options = parse_args("phone sharing", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if options.fixture:
        directory = Path(options.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("slip-sharing")
        config = directory / "next.config.mjs"
        config.write_text(config.read_text().replace("agentRules: false,", "agentRules: false, typescript: { ignoreBuildErrors: true },"))
        print("Building sharing fixture: " + str(directory), flush=True)
        build_fixture(directory, env=env, timeout=240)
    with Server(directory, env=env) as server:
        verify(server.origin)
        if options.serve:
            server.serve()

if __name__ == "__main__":
    main_guard(main)
