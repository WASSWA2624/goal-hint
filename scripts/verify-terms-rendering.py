"""Verify the actual production terms response and linked policy anchors."""
from urllib.parse import urlsplit

from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import request, visible_html
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["termsNotice"]
    policy_links = ["/en/how-it-works#probabilities", "/en/how-it-works#evidence", "/en/how-it-works#performance",
        "/en/how-it-works#schedule", "/en/how-it-works#settlement", "/en/how-it-works#corrections", "/en/privacy"]
    for path in ["/en/terms", "/en/terms?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E"]:
        visible = policy_document(origin, path, page="terms", title="Terms of use", notice=notice,
            sections=["service", "estimates", "updates", "outcomes", "use", "sources", "privacy", "release"],
            patterns=["not completed, effective terms of use", "public release remain blocked",
                "not legal approval or an effective date",
                "does not offer betting, accept stakes, process payments or sell visitor subscriptions",
                "does not guarantee wins, prediction accuracy",
                "Public correction and dispute submissions are not yet available", "draft grants no content licence"],
            forbidden=r"TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{date\}", forms=r"<form|<iframe|<input")
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
    print("PASS actual methodology, performance, settlement/correction anchors and privacy destination.")


if __name__ == "__main__":
    main_guard(main)
