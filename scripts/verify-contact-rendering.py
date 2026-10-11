"""Verify the actual local contact response without contacting recipients."""
from html import unescape
import re
from urllib.parse import urljoin, urlsplit

from lib.policy_rendering import acceptance_origin, notices, policy_document
from lib.rendering import match, request, visible_html
from lib.runtime import main_guard


def main() -> None:
    origin = acceptance_origin(__doc__)
    notice = notices()["contactNotice"]
    paths = ["/en/contact",
        "/en/contact?email=untrusted-query%40invalid.test&subject=%0D%0ABcc%3Auntrusted-query%40invalid.test",
        "/en/contact?body=%3Cscript%3Euntrusted-query%3C%2Fscript%3E&returnTo=javascript%3Auntrusted-query",
        "/en/contact?destination=https%3A%2F%2Finvalid.test%2Funtrusted-query&operator=untrusted-query"]
    for path in paths:
        visible = policy_document(origin, path, page="contact", title="Contact and corrections",
            notice=notice, sections=["report", "corrections", "policies"], patterns=[
                "Public contact is not yet available", "Public release is blocked",
                "does not collect or send reports", "no response time is promised",
                "Once a verified route is published", "Goal Hint match URL",
                "supporting public source link", "same locked forecast",
                "do not replace the pick with a more favorable revision"],
            forbidden=r"TODO|TBD|Lorem ipsum|example\.com|mailto:|tel:|untrusted-query|\{date\}",
            forms=r"<form|<iframe|<input|<textarea")
        expected = urlsplit(origin)
        for href in re.findall(r'<a\b[^>]*\bhref="([^"]+)"', visible):
            target = urlsplit(urljoin(origin, unescape(href)))
            assert (target.scheme, target.netloc) == (expected.scheme, expected.netloc), "Only fixed, same-origin navigation is available."
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
