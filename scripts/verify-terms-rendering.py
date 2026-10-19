"""Verify the actual production terms response and linked policy anchors."""
from urllib.parse import urlsplit

from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import request, visible_html
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["termsNotice"]
    policy_links = ["/en/help#predictions", "/en/help#updates", "/en/help#results", "/en/privacy", "/en/contact"]
    for path in ["/en/terms", "/en/terms?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E"]:
        visible = policy_document(origin, path, page="terms", title="Terms of use", notice=notice,
            sections=["service", "access", "estimates", "updates", "outcomes", "use", "sources", "privacy", "release"],
            patterns=["not completed, effective terms of use", "public release remain blocked",
                "not legal approval or an effective date",
                "does not offer betting or accept stakes", "payments buy access to information",
                "UGX 1,000", "UGX 5,000", "UGX 20,000", "one free trial", "2 days",
                "No approval or code-delivery turnaround is guaranteed", "East Africa Time",
                "personal and non-transferable", "does not verify that you control the number", "refund", "Ugandan governing law",
                "except picks and associated subscriber material for unfinished fixtures",
                "does not guarantee wins, prediction accuracy",
                "Wilson Wasswa", "Uganda", "aged 18 and over",
                "handles correction and dispute reports through the email on the Contact page",
                "copy, share, adapt and reuse original Goal Hint material for any purpose",
                "permission excludes third-party football data", "Sunday, November 1, 2026"],
            forbidden=r"TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{(?:date|operator|country|audience|minimumAge|requestsOwner)\}", forms=r"<form|<iframe|<input")
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
