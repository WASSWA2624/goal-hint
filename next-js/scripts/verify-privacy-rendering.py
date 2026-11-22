"""Verify a local production privacy page without live provider calls."""
from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import match
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["privacyNotice"]
    assert notice["releaseReady"] and notice["publication"] == "published" and notice["effectiveOn"] == "2026-11-22"
    for path in ["/en/privacy", "/en/privacy?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E"]:
        visible = policy_document(origin, path, page="privacy", title="Privacy and data handling",
            notice=notice, sections=["access", "payments", "requests", "search", "storage", "tracking", "images", "football", "retention", "choices"],
            patterns=[r'<time[^>]*datetime="2026-11-22"[^>]*data-notice-effective[^>]*>Effective from Sunday, November 22, 2026',
                "cached pagination links can contain your search text", "not necessarily erased at that exact time",
                "Wilson Wasswa", "Uganda", "aged 18 and over", "provider-managed copies remain unverified",
                "handles privacy requests through the email on the Contact page",
                r"Gmail \(Google\) handles your sender address, message and any attachments",
                "routine support and correction correspondence is kept for up to six months after resolution",
                "minimal record of privacy requests is kept for up to twelve months after closure",
                "Unnecessary identity documents are deleted promptly",
                "documented dispute or legal obligation, with each exception reviewed every ninety days",
                "correspondence under the operator's control, including sent replies and saved attachments",
                "first-party analytics only if you allow it in the consent banner", "never stores your IP address",
                "Your browser requests those versions from Goal Hint",
                "essential, HttpOnly, SameSite=Lax member cookie", "Confirming control of the registered number requires separate proof",
                "finished-match predictions with their probabilities can be browsed without an account",
                "text read from the image, extracted details and the uploaded screenshot",
                "90 days by default", "Rejected and superseded screenshots are deleted after 7 days",
                "a unique payment reference and the return URL", "leaves it out of your account, payment records and saved checkout draft",
                "YoolaSMS to deliver requested password recovery codes", "Payment decisions, credit updates and renewals appear in Goal Hint",
                "Meta provides WhatsApp", "Registration requires a phone number and password", "Analytics participation is optional",
                "request access to it, request a correction", "Uganda’s Personal Data Protection Office",
                r'href="https://pdpo\.go\.ug/"', "24 months of inactivity", "12-month target",
                "five years after the relevant tax period ends", "targets 30 days for expiry", "exact retention and removal periods remain unverified",
                "Current responses can be reused for up to 5 seconds.*up to 6 hours",
                "At most 20 navigation records.*older than 30 minutes"],
            forbidden=r'prelaunch data-handling summary|id="privacy-release"|TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{(?:date|minutes|seconds|hours|entries|operator|country|audience|minimumAge|requestsOwner)\}',
            forms=r"<form|<iframe|<input")
        match(r'href="/en/help"', visible)
        print(f"PASS production privacy HTML: {path}")
    print("PASS published privacy content, effective date, inputs, rights, retention, navigation and anonymous metadata.")


if __name__ == "__main__":
    main_guard(main)
