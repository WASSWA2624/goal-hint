"""Verify the actual production terms response and linked policy anchors."""
from urllib.parse import urlsplit

from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import request, visible_html
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["termsNotice"]
    assert notice["releaseReady"] and notice["publication"] == "published" and notice["effectiveOn"] == "2026-11-22"
    policy_links = ["/en/help#predictions", "/en/help#updates", "/en/help#results", "/en/privacy", "/en/contact"]
    for path in ["/en/terms", "/en/terms?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E"]:
        visible = policy_document(origin, path, page="terms", title="Terms of use", notice=notice,
            sections=["service", "access", "estimates", "updates", "outcomes", "use", "sources", "privacy"],
            patterns=[r'<time[^>]*date[Tt]ime="2026-11-22"[^>]*data-notice-effective[^>]*>Effective from Sunday, November 22, 2026',
                "Wilson Wasswa supplies Goal Hint as an individual", "Hoima Road, Wakiso, Uganda",
                "does not offer betting or accept stakes", "payments buy access to information",
                "UGX 1,000", "UGX 5,000", "UGX 20,000", "registration starts a one-time free trial",
                "a locked feature leads to package selection after login", "complete the payment on Flutterwave’s hosted page",
                "expected payment reference, exact amount and currency", "direct checkout returns you to the feature you requested",
                "No approval turnaround is guaranteed", "East Africa Time", "Renewals appear in Account",
                "personal and non-transferable", "Confirming control of the registered number requires separate proof",
                "go back to make changes or leave before you pay", "save or print these terms using your browser",
                "Payments in Account to view recent payment records", "cancellation, refund and other consumer rights provided by applicable law",
                "Include your payment reference, purchase date and the reason",
                "except picks, odds and associated premium material", "fixtures and scores without an account",
                "Once a match has finished, its predictions, probabilities and results are public",
                "Saved slips become public after all their matches have finished", "saving a slip does not place a bet",
                "does not guarantee wins, prediction accuracy",
                "Wilson Wasswa", "Uganda", "aged 18 and over",
                "handles correction and dispute reports through the email on the Contact page",
                "copy, share, adapt and reuse original Goal Hint material for any purpose",
                "permission excludes third-party football data"],
            forbidden=r'prelaunch terms draft|id="terms-release"|TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{(?:date|operator|businessAddress|country|audience|minimumAge|requestsOwner)\}', forms=r"<form|<iframe|<input")
        for link in policy_links:
            assert f'href="{link}"' in visible, link
        print(f"PASS initial production terms HTML: {path}")
    documents = {}
    for link in policy_links:
        target = urlsplit(link)
        if target.path not in documents:
            response = request(origin, target.path, redirect=True)
            assert response.status == 200, f"Published destination: {link}"
            documents[target.path] = visible_html(response.text, comments=False)
        if target.fragment:
            assert f'id="{target.fragment}"' in documents[target.path], f"Existing section: {link}"
    print("PASS actual help anchors, privacy and contact destinations.")


if __name__ == "__main__":
    main_guard(main)
