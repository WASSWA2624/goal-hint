"""Production-rendered payment steps and private headers with synthetic services only."""
import re
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import main_guard


def main():
    args = parse_args("payment steps")
    directory = create_fixture("payments")
    config = directory / "next.config.mjs"
    config.write_text(config.read_text(encoding="utf-8").replace("export default {", 'import production from "../../next.config.ts";\nexport default { headers: production.headers,'), encoding="utf-8")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    build_fixture(directory, env, timeout=240)
    with Server(directory, env, ready="/en/subscribe") as server:
        for state in ["signed-out", "signed-in", "active", "pending", "approved", "rejected", "blocked", "off"]:
            response = request(server.origin, f"/en/subscribe?state={state}")
            html = visible_html(response.text)
            assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "") and "noindex" in response.headers.get("X-Robots-Tag", "")
            assert "Get access" in html
            if state == "off": assert "Subscriptions are not open yet" in html and "TEST MTN" not in html
            elif state == "blocked": assert "We couldn" in html and "TEST MTN" not in html
            else:
                assert ">MTN</span>" in html and ">airtel</span>" in html and "momoapi" not in html and "airtelstream" not in html
                for label in ["Pick a plan", "Send exactly", "to one of these numbers", "256 700 000 901", "256 700 000 902", "TEST MTN PAYEE",
                              "Daily", "Weekly", "Monthly", "Safety tips", "Need help?", "1,000", "5,000", "20,000"]: assert label in html, (state, label)
                assert ("Tell us the Transaction ID and add a screenshot" in html) != (state in ["pending", "approved"]), state
                assert ("Enter your code" in html) == (state in ["pending", "approved"]), state
                if state == "signed-out":
                    assert 'action="/api/account/sign-in"' in html and 'method="post"' in html and "Have a code?" in html
                    assert "Continue with your number above" in html and "Try 2 days free" not in html and "Signed in as" not in html
                else: assert "Signed in as" in html and "256 700 000 101" in html and ("New here?" in html) == (state != "active"), state
                if state in ["signed-in", "active", "rejected"]:
                    sms = re.search(r'<input[^>]*value=""[^>]*maxlength="12000"[^>]*>|<input[^>]*maxlength="12000"[^>]*>', html, re.I)
                    assert sms and 'name=' not in sms.group(0)
                    assert "This form needs JavaScript" in html
                    assert ("18 or older" in html) == (state != "active")
                if state == "pending": assert "Checking your payment" in html and "P-FAKE" in html
                if state == "approved": assert "Access until" in html and "We sent your code" in html
                if state == "rejected": assert "Synthetic rejection reason" in html
        for agent, allowed in [("Android Chrome", True), ("iPhone Safari", False), ("Android; wv) Chrome", False), ("Android FBAN", False), ("Android Instagram", False)]:
            html = visible_html(request(server.origin, "/en/subscribe", headers={"User-Agent": agent}).text)
            assert ("Open MoMo menu" in html) == allowed
            assert "*000*1000#" in html
            if allowed: assert 'href="tel:*000*1000%23"' in html
        phone = visible_html(request(server.origin, "/en/phone-input").text)
        assert phone.count('data-phone-input="true"') == 4
        assert 'autocomplete="tel"' in phone.lower() and 'inputmode="tel"' in phone.lower()
        print("PASS 8 server-rendered payment states, 5 user agents, hidden SMS fields, assent, plan order and private headers.", flush=True)
        if args.serve: server.serve()


if __name__ == "__main__": main_guard(main)
