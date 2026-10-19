"""Verify a local production privacy page without live provider calls."""
from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import match
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["privacyNotice"]
    for path in ["/en/privacy", "/en/privacy?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E"]:
        visible = policy_document(origin, path, page="privacy", title="Privacy and data handling",
            notice=notice, sections=["access", "payments", "requests", "search", "storage", "tracking", "images", "football", "retention", "choices", "release"],
            patterns=["not a completed, effective privacy notice", "not a legal approval or an effective date",
                "cached pagination links can contain your search text", "not necessarily erased at that exact time",
                "Wilson Wasswa", "Uganda", "aged 18 and over", "Namecheap",
                "Sunday, November 1, 2026", "server country and log and backup retention periods are not yet known",
                "handles privacy requests through the email on the Contact page",
                r"Gmail \(Google\) handles your sender address, message and any attachments",
                "adopted an email retention policy starting Sunday, November 1, 2026",
                "Routine support and correction correspondence will be kept for up to six months after resolution",
                "minimal record of privacy requests will be kept for up to twelve months after closure",
                "Unnecessary identity documents will be deleted promptly",
                "documented dispute or legal obligation, with each exception reviewed every ninety days",
                "correspondence under the operator's control, including sent replies and saved attachments",
                "first-party analytics only if you allow it in the consent banner", "never stores your IP address",
                "Your browser requests those versions from Goal Hint",
                "essential, HttpOnly, SameSite=Lax member cookie", "full pasted SMS is parsed in this browser",
                "90 days by default", "rejected and superseded screenshots after 7 days",
                "WhatsApp is provided by Meta", "no automatic deletion period", "PDPO registration",
                "Current responses can be reused for up to 5 seconds.*up to 6 hours",
                "At most 20 navigation records.*older than 30 minutes"],
            forbidden=r"TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{(?:date|minutes|seconds|hours|entries|operator|country|audience|minimumAge|requestsOwner)\}",
            forms=r"<form|<iframe|<input")
        match(r'href="/en/help"', visible)
        print(f"PASS production privacy HTML: {path}")
    print("PASS initial privacy content, honest publication gate, review date, storage/cache disclosures, navigation and anonymous metadata.")


if __name__ == "__main__":
    main_guard(main)
