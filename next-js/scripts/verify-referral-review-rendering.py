"""Production referral review components with synthetic UI-only state; no account/reward writes or delivery."""
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import main_guard


def main():
    options = parse_args("referral review")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    directory = create_fixture("referral-reviews")
    build_fixture(directory, env=env, timeout=300)
    with Server(directory, env=env) as server:
        admin = request(server.origin).text
        member = request(server.origin, "/member").text
        assert "Referral review" in visible_html(admin) and "Add new case" in visible_html(admin)
        member_html = visible_html(member)
        assert "Reward reviews" in member_html and "Awaiting decision" in member_html
        assert "Unused reward removed" in member_html and 'id="review-10000000-0000-4000-8000-000000000002"' in member_html
        assert 'data-record-details' in member_html and ">Appeal</button>" not in member_html
        for private in ["support:DEMO-7", "Technical duplicate confirmed", "synthetic reviewer", "grantId", "tokenHash"]:
            assert private not in member, private
        print("Referral review HTML: member list, selected detail, review deep link and private evidence separation pass.", flush=True)
        if options.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
