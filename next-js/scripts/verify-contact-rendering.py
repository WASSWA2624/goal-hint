"""Verify the actual local contact response without contacting recipients."""
from html import unescape
import re
from urllib.parse import urljoin, urlsplit

from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import match, request, visible_html
from lib.runtime import main_guard


def main(*, indexable: bool = False) -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["contactNotice"]
    paths = ["/en/contact",
        "/en/contact?email=untrusted-query%40invalid.test&subject=%0D%0ABcc%3Auntrusted-query%40invalid.test",
        "/en/contact?body=%3Cscript%3Euntrusted-query%3C%2Fscript%3E&returnTo=javascript%3Auntrusted-query",
        "/en/contact?destination=https%3A%2F%2Finvalid.test%2Funtrusted-query&operator=untrusted-query"]
    for path in paths:
        visible = policy_document(origin, path, page="contact", title="Contact and corrections",
            notice=notice, sections=["report", "corrections", "policies"], patterns=[
                "Contact Goal Hint", "For subscriber plans, payment reports and access, use Get access",
                "Wilson Wasswa", "Uganda", "aged 18 and over",
                "no contact-form or email-sending system", "no response time is promised",
                "Goal Hint match URL",
                "supporting public source link", "same locked forecast",
                "do not replace the prediction with a more favorable revision"],
            forbidden=r"TODO|TBD|Lorem ipsum|example\.com|untrusted-query|\{(?:date|operator|country|audience|minimumAge|requestsOwner)\}",
            forms=r"<form|<iframe|<input|<textarea", indexable=indexable and "?" not in path)
        expected = urlsplit(origin)
        assert visible.count(f'href="{notice["destination"]}"') == 1, "Exactly one fixed owner-approved email link."
        for href in re.findall(r'<a\b[^>]*\bhref="([^"]+)"', visible):
            if unescape(href) == notice["destination"]:
                target = urlsplit(unescape(href))
                assert target.scheme == "mailto" and target.path == notice["email"]
                assert not target.query and not target.fragment and "\r" not in href and "\n" not in href
                continue
            target = urlsplit(urljoin(origin, unescape(href)))
            if target.scheme == "tel" or target.netloc == "wa.me":
                assert "data-desktop-support" in visible, "Phone links belong to the configured desktop support directory."
                assert not target.query and not target.fragment
                if target.scheme == "tel":
                    assert not target.netloc and re.fullmatch(r"\+\d{10,15}", target.path)
                else:
                    assert target.scheme == "https" and re.fullmatch(r"/\d{10,15}", target.path)
                continue
            assert (target.scheme, target.netloc) == (expected.scheme, expected.netloc), "Other links remain fixed same-origin navigation."
        print(f"PASS production contact HTML and safe query handling: {path}")
    for path, section in [("/en/privacy", "privacy-choices"), ("/en/terms", "terms-outcomes"), ("/en/help", "results")]:
        response = request(origin, path, redirect=True)
        assert response.status == 200, path
        visible = visible_html(response.text, comments=False)
        content = match(rf'<section\b(?=[^>]*\bid="{section}")[^>]*>[\s\S]*?</section>', visible, f"Existing policy section: {section}").group()
        match(r'href="/en/contact"', content)
        if path != "/en/help":
            match("Contact availability and correction guidance", content)
        print(f"PASS contextual contact link: {path}#{section}")
    print("PASS contact availability gate, correction guidance, anonymous metadata, safe links and policy integration.")


if __name__ == "__main__":
    main_guard(main)
