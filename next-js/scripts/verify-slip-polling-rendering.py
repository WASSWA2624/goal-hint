"""Build the production Builder polling fixture; all storage and access states are synthetic."""
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request
from lib.runtime import ROOT, main_guard


def main():
    options = parse_args("phone Builder polling", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if options.fixture:
        directory = Path(options.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("slip-polling")
        config = directory / "next.config.mjs"
        config.write_text(config.read_text().replace("agentRules: false,", "agentRules: false, typescript: { ignoreBuildErrors: true },"))
        print("Building polling fixture: " + str(directory), flush=True)
        build_fixture(directory, env=env, timeout=240)
    with Server(directory, env=env) as server:
        path = "/en/slips?build=1&markets=match-result"
        html = request(server.origin, path).text
        assert 'data-slip-disclosure' in html and 'data-share-slip' in html, "Generated fixture must render production cards and Share"
        assert 'data-slip-disclosure="" open=' not in html
        guest = request(server.origin, path, headers={"Cookie": "fixture-polling-viewer=guest"}).text
        assert 'Arsenal' not in guest, "A guest must not receive the generated selection snapshots"
        print("Polling fixture HTML: collapsed ordinary cards, Share action and guest isolation pass.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
