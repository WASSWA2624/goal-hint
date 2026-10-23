"""Production-rendered payment steps and private headers with synthetic services only."""
import re
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def main():
    args = parse_args("payment steps", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file(), "Reuse a built acceptance fixture inside .tmp."
    else:
        directory = create_fixture("payments")
        config = directory / "next.config.mjs"
        config.write_text(config.read_text(encoding="utf-8").replace("export default {", 'import production from "../../next.config.ts";\nexport default { headers: production.headers,'), encoding="utf-8")
        build_fixture(directory, env, timeout=240)
    with Server(directory, env, ready="/en/subscribe") as server:
        for state in ["signed-out", "signed-in", "active", "pending", "approved", "rejected", "blocked", "off"]:
            response = request(server.origin, f"/en/subscribe?state={state}")
            html = visible_html(response.text)
            assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "") and "noindex" in response.headers.get("X-Robots-Tag", "")
            assert ">Subscribe</h1>" in html
            if state == "off": assert "Subscriptions are not open yet" in html and "TEST MTN" not in html
            elif state == "blocked": assert "We couldn" in html and "TEST MTN" not in html
            else:
                assert "MTN MoMo" in html and "Airtel Money" in html and "momoapi" not in html and "airtelstream" not in html
                for label in ["Choose access", "Send payment", 'data-subscribe-layout="compact-stacked"', "Pay to:", "Names:", "0700000901", "0700000902", "TEST MTN PAYEE",
                              "Daily", "Weekly", "Monthly", "Safety tips", "Need help?", "1,000", "5,000", "20,000"]: assert label in html, (state, label)
                interactive = re.sub(r"<noscript\b[^>]*>[\s\S]*?</noscript>", "", html)
                assert "0700000901" in interactive and "0700000902" not in interactive, state
                assert "Confirm payment" in html, state
                assert "Enter your code" not in html and "We sent your code" not in html, state
                assert len(re.findall(r'<input\b[^>]*type="file"', html)) == (0 if state in ["signed-out", "pending"] else 2), state
                if state == "signed-out":
                    assert 'action="/api/account/login"' in html and 'method="post"' in html and 'data-account-auth' in html
                    assert "Phone number" in html and "Forgot password?" in html and "Request 2-day free trial" not in html
                else: assert "256 700 000 101" in html and ("Request 2-day free trial" in html) == (state != "active"), state
                if state in ["signed-in", "active", "rejected"]:
                    transaction = re.search(r'<input\b[^>]*maxlength="40"[^>]*>', html, re.I)
                    assert transaction and 'name=' not in transaction.group(0)
                    assert "This form needs JavaScript" in html and "Prepared on this device" in html
                    assert ("18 or older" in html) == (state != "active")
                if state == "pending": assert 'data-payment-status="pending"' in html and "P-FAKE" in html
                if state == "approved": assert 'data-payment-status="approved"' in html and "Access active until" in html
                if state == "rejected": assert "Synthetic rejection reason" in html
        for agent, allowed in [("Android Chrome", True), ("iPhone Safari", False), ("Android; wv) Chrome", False), ("Android FBAN", False), ("Android Instagram", False)]:
            html = visible_html(request(server.origin, "/en/subscribe", headers={"User-Agent": agent}).text)
            assert ("Open MoMo menu" in html) == allowed
            if allowed: assert 'href="tel:*000*1000%23"' in html
            else: assert "*000*1000#" in html
        phone = visible_html(request(server.origin, "/en/phone-input").text)
        national_inputs = re.findall(r'<input\b[^>]*data-phone-input[^>]*>', phone)
        assert len(national_inputs) == 4
        for field in national_inputs:
            assert 'autocomplete="tel-national"' in field.lower() and 'inputmode="numeric"' in field.lower()
            assert not re.search(r'\bname=', field), "Visible national inputs must not submit incomplete phone values."
        canonical_inputs = re.findall(r'<input\b[^>]*data-phone-canonical[^>]*>', phone)
        assert canonical_inputs and all('type="hidden"' in field for field in canonical_inputs)
        named_phone = [field for field in canonical_inputs if 'name="phone"' in field]
        assert len(named_phone) == 1, "The native form must submit its canonical phone field exactly once."
        print("PASS 8 server-rendered payment states, shared account login, 5 user agents, screenshot/optional fields, assent, plan order and private headers.", flush=True)
        if args.serve: server.serve()


if __name__ == "__main__": main_guard(main)
