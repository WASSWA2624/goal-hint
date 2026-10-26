"""Production-rendered payment steps and private headers with synthetic services only."""
import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
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


def package_step_rendering(html, state):
    """The first plan-payment screen contains packages, progress and Continue only."""
    assert 'data-subscribe-layout="stepwise"' in html and 'data-payment-step="1"' in html, state
    assert "data-payment-progress" in html, "The four-stage journey remains visible."
    text = unescape(re.sub(r'<[^>]+>', " ", html))
    for label in ["Choose a package", "Continue", "Package", "Pay", "Proof", "Review", "1,000", "5,000", "20,000"]:
        assert label in text, (state, label)
    fields = PaymentFields(html).inputs
    choices = [field for field, _ in fields if field.get("name") == "plan"]
    assert [field.get("value") for field in choices] == [f"00000000-0000-4000-8000-00000000000{index}" for index in range(3)], \
        "Package choices retain their configured order."
    assert all(field.get("type") == "radio" for field in choices), "Packages use native radio controls."
    assert not any(field.get("name") == "amount" or field.get("type") == "number" for field, _ in fields), \
        "The plan determines the amount."
    for gone in ["data-payment-logo", "data-transaction-input", 'type="file"', "data-payment-confirmation", "data-credit-purchase", "Add credit instead",
                 "0700000901", "0700000902", "TEST MTN PAYEE", "TEST AIRTEL PAYEE", "18 or older"]:
        assert gone not in html, (state, gone)
    assert not any("data-phone-input" in field for field, _ in fields), "Payer details belong to the proof step."
    assert 'aria-label="Confirm payment"' not in html, "Plan payments use an inline review stage."
    assert "Enter your code" not in html and "We sent your code" not in html, state


def proof_fields_rendering(html):
    """The unchanged top-up still renders the production proof fields together."""
    fields = PaymentFields(html).inputs
    transaction = [(field, depth) for field, depth in fields if "data-transaction-input" in field]
    assert len(transaction) == 1 and "required" in transaction[0][0] and transaction[0][1] == 0, \
        "Transaction ID remains required and outside disclosures."
    assert "maxlength" not in transaction[0][0], "A whole SMS inserted from the keyboard's clipboard must reach the field uncut."
    payer = [(field, depth) for field, depth in fields if "data-phone-input" in field]
    assert len(payer) == 1 and "required" in payer[0][0] and payer[0][1] == 0, "The sending number remains required."
    assert payer[0][0].get("value") == "700000101", "The signed-in account number prefills the payer field."
    order = [html.index(marker) for marker in ("data-phone-input", "data-transaction-input", 'type="file"')]
    assert order == sorted(order), "Payer comes first, then transaction ID and screenshots."
    screenshots = [(field, depth) for field, depth in fields if field.get("type") == "file"]
    assert len(screenshots) == 2 and all("required" not in field and depth == 0 for field, depth in screenshots), \
        "Screenshot and camera controls remain optional and outside disclosures."
    assert re.search(r'<legend\b[^>]*>Screenshot \(optional\)</legend>', html), "Screenshot controls have an explicit optional label."


def compact_status_rendering(origin):
    states = ["pending", "pending-active", "pending-terms-required", "pending-call-only", "pending-whatsapp-only", "pending-no-contact",
        "rejected", "rejected-active", "rejected-fallback", "rejected-terms-required",
        "reversed", "reversed-terms-required", "reversed-active"]
    for state in states:
        response = request(origin, f"/en/subscribe?state={state}")
        html = visible_html(response.text)
        assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "")
        status = state.split("-")[0]
        assert f'data-payment-status="{status}"' in html
        assert ("Submit another payment" if status == "reversed" else "Update payment details") in html and "PFAKE" in html
        assert 'name="plan"' not in html and 'data-payment-logo' not in html and 'type="file"' not in html
        assert not any("data-transaction-input" in field for field, _ in PaymentFields(html).inputs), "A payment status must not expose its correction form automatically."
        assert "18 or older" not in html
        disclosure = re.search(r'<details\b([^>]*data-payment-details[^>]*)>([\s\S]*?)</details>', html)
        assert disclosure and not re.search(r'\bopen(?:=""|\s|$)', disclosure.group(1)), "Payment details starts collapsed."
        visible_status = unescape(re.sub(r'<details\b[^>]*>[\s\S]*?</details>', "", html))
        summary = visible_status
        assert 'data-payment-summary' in summary, "Payment reference, plan and amount remain visible."
        for value in ["PFAKE", "Weekly", "5,000"]:
            assert value in summary, (state, value)
        assert ("Sent" in visible_status) == (status == "pending"), "Pending reports show their sent date upfront."
        assert ("Sent" in disclosure.group(2)) == (status != "pending"), "Only rejected/reversed reports keep their sent date in More details."
        assert ("a synthetic review interval" in disclosure.group(2)) == (status == "pending"), "Review timing applies only to pending reports."
        assert "a synthetic review interval" not in visible_status
        links = [(unescape(href), unescape(re.sub(r'<[^>]+>', "", re.sub(r'<svg\b[\s\S]*?</svg>', "", body))).strip())
            for href, body in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', html)]
        calls = [href for href, label in links if label == "Call"]
        chats = [href for href, label in links if label == "WhatsApp"]
        assert calls == ([] if state in ["pending-whatsapp-only", "pending-no-contact"] else ["tel:+256700000903"]), state
        assert len(chats) == (0 if state in ["pending-call-only", "pending-no-contact"] else 1), state
        if chats:
            chat = urlsplit(chats[0])
            assert chat.scheme == "https" and chat.netloc == "wa.me" and chat.path == "/256700000904"
            text = parse_qs(chat.query)["text"][0]
            context = ["5000", "Weekly"] if status == "pending" else ["was not approved" if status == "rejected" else "was reversed"]
            assert all(value in text for value in ["PFAKE", "256 700 000 101", *context]), text
        assert html.count("Contact support") == (1 if state == "pending-no-contact" else 0), "Report cards expose the configured contact channels directly."
        if state == "pending-no-contact": assert ("/en/contact", "Contact support") in links
        if status == "rejected":
            reason = "We couldn't find this payment in our wallet." if state == "rejected-fallback" else "Synthetic rejection reason"
            assert reason in visible_status, "The rejection reason must remain visible without opening details."
        if status == "reversed": assert "Access from this payment has ended." in visible_status
        assert re.sub(r'<[^>]+>', "", html).count("More details") == 1, "One visible More details entry is enough."
        assert "Need help?" not in html, "The compact status must not repeat the support entry below the card."
        assert not re.search(r'<button\b[^>]*>\s*Change\s*</button>', html), "Account controls do not belong in the payment status."


def add_credit_rendering(origin):
    """Add credit is three numbered steps under the title and the member's credit, without a way to plans, the money-menu link,
    the payment note or the terms checkbox; members who haven't accepted the terms read that Submit payment accepts them."""
    android = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"}
    for state, accepted in [("credit", True), ("signed-in", False)]:
        html = visible_html(request(origin, f"/en/subscribe?state={state}&add=credit", headers=android).text)
        text = unescape(re.sub(r'<[^>]+>', "", html))
        assert 'data-subscribe-layout="plain-steps"' in html and 'data-subscribe-layout="stepwise"' not in html, state
        steps = re.search(r'<ol\b[^>]*data-subscribe-layout="plain-steps"[^>]*>([\s\S]*?)</ol>\s*<footer', html)
        assert steps and [unescape(re.sub(r'<[^>]+>', "", title)) for title in re.findall(r'<h3\b[^>]*>([\s\S]*?)</h3>', steps.group(1))] \
            == ["Choose amount", "Send the money", "Confirm with the payment message"], state
        for label in ["Add credit", "Amount to add (UGX)", "UGX 1,000 to 500,000", "Pay to", "Copy number", "Submit payment", "Safety tips", "Need help?"]:
            assert label in text, (state, label)
        # The top-up has no amount on its initial render. Plan payments reveal money-menu actions only in stage two.
        for gone in ["Pay for a plan instead", "Choose plan", "Choose a package", "Synthetic fixture: never send money.", "I'm 18 or older"]:
            assert gone not in text, (state, gone)
        assert "data-credit-purchase" not in html and not re.search(r'<input\b[^>]*type="checkbox"', html), state
        proof_fields_rendering(html)
        assert ("Your credit" in text and "UGX 12,000" in text) == (state == "credit"), state
        consent = "By clicking Submit payment, you confirm that you're 18 or older and accept the Terms."
        assert (consent in text) == (not accepted), state
        if not accepted:
            form = steps.group(1)
            assert form.index("data-payment-consent") < form.index(re.search(r'<button\b[^>]*type="submit"', form).group(0)), "The consent sits above the button it describes."
            assert re.search(r'href="/en/terms"', html)
    plans = visible_html(request(origin, "/en/subscribe?state=signed-in", headers=android).text)
    package_step_rendering(plans, "signed-in Android")
    assert "Add credit instead" not in plans, "Credit alternatives belong to the payment-method step."
    assert "Open MoMo menu" not in plans and "*000*1000#" not in plans, "Money-menu instructions belong to the payment step."


def account_reports(origin):
    """The account page states each waiting, refused or reversed report as one sentence with its contact links."""
    for state in ["pending", "pending-active", "pending-call-only", "pending-no-contact", "rejected", "rejected-fallback", "reversed"]:
        html = visible_html(request(origin, f"/en/account?state={state}").text)
        status = state.split("-")[0]
        notice = re.search(rf'<section\b[^>]*data-payment-status="{status}"[^>]*>([\s\S]*?)</section>', html)
        assert notice, state
        text = unescape(re.sub(r'<[^>]+>', "", notice.group(1)))
        assert "UGX 5,000" in text and "ref PFAKE" in text, (state, text)
        if status == "pending": assert "for the Weekly plan is waiting for approval" in text and "Checking usually takes a synthetic review interval" in text, text
        if status == "rejected": assert "was not approved" in text and ("We couldn't find this payment in our wallet." if state == "rejected-fallback" else "Synthetic rejection reason") in text, text
        if status == "reversed": assert "was reversed. Access from this payment has ended." in text, text
        links = [(unescape(href), unescape(re.sub(r'<[^>]+>', "", body)).strip()) for href, body in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', notice.group(1))]
        labels = [label for _, label in links]
        if state == "pending-no-contact": assert links == [("/en/contact", "Contact support")], links
        elif state == "pending-call-only": assert links == [("tel:+256700000903", "Call admin")], links
        else: assert labels == ["Call admin", "WhatsApp"] and links[0][0] == "tel:+256700000903" and links[1][0].startswith("https://wa.me/256700000904?text="), links
        summary = re.search(r'<section\b[^>]*data-subscription-summary="(active|inactive)"[^>]*>([\s\S]*?)</section>', html)
        assert summary and summary.group(1) == ("active" if state.endswith("-active") else "inactive"), state
        assert re.search(r'href="/en/subscribe#report"[^>]*>\s*View payment\s*<', summary.group(2)), "A report sends the member back to it, not to a second payment."
        assert html.index("data-subscription-summary") < notice.start() < html.index("Change phone"), "Access, then the report, then sign-in."


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
        for state in ["signed-out", "signed-in", "active", "approved", "blocked", "off"]:
            response = request(server.origin, f"/en/subscribe?state={state}")
            html = visible_html(response.text)
            assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "") and "noindex" in response.headers.get("X-Robots-Tag", "")
            assert ">Subscribe</h1>" in html
            if state == "off": assert "Subscriptions are not open yet" in html and "TEST MTN" not in html
            elif state == "blocked": assert "We couldn" in html and "TEST MTN" not in html
            elif state == "signed-out":
                assert 'action="/api/account/login"' in html and 'method="post"' in html and 'data-account-auth' in html
                assert "Phone number" in html and "Forgot password?" in html and "Request 2-day free trial" not in html
                for gone in ["data-subscribe-layout", "data-payment-progress", 'name="plan"', "data-payment-logo", "data-transaction-input", 'type="file"', "0700000901", "0700000902"]:
                    assert gone not in html, (state, gone)
            else:
                package_step_rendering(html, state)
                assert "momoapi" not in html and "airtelstream" not in html
                assert "Request 2-day free trial" not in html, "Alternative actions belong after package selection."
                assert not re.search(r'<button\b[^>]*>\s*Change\s*</button>', html)
                if state == "approved": assert 'data-payment-status="approved"' not in html and "Payment approved" not in html, "An approval shows no card on the subscribe page."
        compact_status_rendering(server.origin)
        account = visible_html(request(server.origin, "/en/account?state=active").text)
        assert 'data-subscription-summary="active"' in account and "You have access until" in account and "Extend" in account
        assert re.search(r'<time\b[^>]*datetime="[^"]+"[^>]*>[^<]*\b\d{4}\b[^<]*\d{2}:\d{2} EAT</time>', account, re.I), "The active account must show its full expiry date and time."
        assert 'data-payment-status="approved"' not in account, "The account must not repeat its active subscription summary as an approval card."
        # Account credit: pay for a plan from credit, add credit (a top-up report), and the account's balance, auto-renewal and history.
        credit = visible_html(request(server.origin, "/en/subscribe?state=credit").text)
        package_step_rendering(credit, "credit")
        assert "Credit: UGX 12,000" not in credit and "Pay UGX 1,000 from credit" not in credit, \
            "The initial credit-member screen remains focused on package selection."
        add_credit_rendering(server.origin)
        account_credit = visible_html(request(server.origin, "/en/account?state=credit").text)
        for label in ["data-account-credit", "Your credit is", "UGX 12,000", "Auto-renew from credit is off", "Turn on", "Top-up · PCRED", "Add credit"]:
            assert label in account_credit, label
        account_reports(server.origin)
        assert "Add credit instead" not in visible_html(request(server.origin, "/en/subscribe?state=signed-out").text), "Signed-out visitors see sign-in only."
        assert "data-account-credit" not in account, "An account without credit shows no credit section."
        for agent in ["Android Chrome", "iPhone Safari", "Android; wv) Chrome", "Android FBAN", "Android Instagram"]:
            html = visible_html(request(server.origin, "/en/subscribe?state=signed-in", headers={"User-Agent": agent}).text)
            package_step_rendering(html, agent)
            assert "Open MoMo menu" not in html and "*000*1000#" not in html and "tel:*000*1000%23" not in html, \
                "The package screen never exposes payment instructions, regardless of user agent."
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
        print("PASS server-rendered payment states, package-only wizard entry, shared sign-in without payment fields, compact pending/rejected/reversed status, contact fallbacks, unchanged credit/top-up paths, 5 user agents, package order and private headers. Later wizard stages require browser acceptance checks.", flush=True)
        if args.serve: server.serve()


if __name__ == "__main__": main_guard(main)
