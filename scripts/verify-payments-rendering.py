"""Production-rendered payment steps and private headers with synthetic services only."""
import re
from html.parser import HTMLParser
from pathlib import Path
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


class PaymentFields(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.details = 0
        self.inputs = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "details": self.details += 1
        elif tag == "input": self.inputs.append((dict(attrs), self.details))

    def handle_endtag(self, tag):
        if tag == "details": self.details -= 1


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
            elif state == "pending":
                assert 'data-payment-status="pending"' in html and "PFAKE" in html and "Update payment details" in html
                assert 'name="plan"' not in html and 'data-payment-logo' not in html and 'type="file"' not in html, "Pending payments must show their status without new payment instructions."
            else:
                assert "MTN MoMo" in html and "Airtel Money" in html and "momoapi" not in html and "airtelstream" not in html
                for label in ["Choose plan", "Pay UGX 1,000", 'data-subscribe-layout="compact-stacked"', "Pay to:", "Names:", "0700000901", "0700000902", "TEST MTN PAYEE",
                              "Daily", "Weekly", "Monthly", "Safety tips", "Need help?", "1,000", "5,000", "20,000"]: assert label in html, (state, label)
                interactive = re.sub(r"<noscript\b[^>]*>[\s\S]*?</noscript>", "", html)
                assert "0700000901" in interactive and "0700000902" not in interactive, state
                assert 'aria-label="Confirm payment"' in html and ">Confirm payment</h2>" not in html, state
                assert "Enter your code" not in html and "We sent your code" not in html, state
                assert len(re.findall(r'<input\b[^>]*type="file"', html)) == (0 if state in ["signed-out", "pending"] else 2), state
                if state == "signed-out":
                    assert 'action="/api/account/login"' in html and 'method="post"' in html and 'data-account-auth' in html
                    assert "Phone number" in html and "Forgot password?" in html and "Request 2-day free trial" not in html
                else: assert "256 700 000 101" in html and ("Request 2-day free trial" in html) == (state != "active"), state
                if state in ["signed-in", "active", "approved", "rejected"]:
                    fields = PaymentFields(html).inputs
                    transaction = [(field, depth) for field, depth in fields if field.get("maxlength") == "40"]
                    assert len(transaction) == 1 and "required" in transaction[0][0] and transaction[0][1] == 0, "Transaction ID must be required and visible without opening details."
                    screenshots = [(field, depth) for field, depth in fields if field.get("type") == "file"]
                    assert len(screenshots) == 2 and all("required" not in field and depth > 0 for field, depth in screenshots), "Screenshots must be optional and inside details."
                    assert not any(field.get("name") == "amount" or field.get("type") == "number" for field, _ in fields), "The payment amount must remain read-only."
                    assert "Submit payment" in html and "Optional details" in html and "This form needs JavaScript" in html and "Optional screenshot or photo" in html
                    assert ("18 or older" in html) == (state != "active")
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
        print("PASS 8 server-rendered payment states, shared account login, 5 user agents, visible required transaction ID, optional screenshots, automatic amount, assent, plan order and private headers.", flush=True)
        if args.serve: server.serve()


if __name__ == "__main__": main_guard(main)
