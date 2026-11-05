"""Verify the brief contact response and published links without contacting recipients."""
from html import unescape
import json
import re
from urllib.parse import unquote, urlsplit

from lib.policy_rendering import acceptance_origin
from lib.rendering import match, no_match, request, visible_html
from lib.runtime import main_guard


def main(*, indexable: bool = False) -> None:
    origin = acceptance_origin(__doc__)
    published = request(origin, "/api/contact")
    settings = json.loads(published.text) if published.status == 200 else None
    if settings is not None:
        assert published.headers.get("cache-control") == "no-store"
    paths = ["/en/contact",
        "/en/contact?email=untrusted-query%40invalid.test&subject=%0D%0ABcc%3Auntrusted-query%40invalid.test",
        "/en/contact?body=%3Cscript%3Euntrusted-query%3C%2Fscript%3E&returnTo=javascript%3Auntrusted-query",
        "/en/contact?destination=https%3A%2F%2Finvalid.test%2Funtrusted-query&operator=untrusted-query"]
    for path in paths:
        response = request(origin, path, redirect=True)
        assert response.status == 200, path
        assert response.headers.get("set-cookie") is None
        html = response.text
        visible = unescape(visible_html(html, comments=False))
        main = match(r"<main\b[^>]*>([\s\S]*?)</main>", visible).group(1)
        match(r"<title>Contact \| Goal Hint</title>", html)
        match(r'rel="canonical" href="https://goalhint\.com/en/contact"', html)
        match(rf'name="robots" content="{"index" if indexable and "?" not in path else "noindex"}, follow"', html)
        assert len(re.findall(r"<h1[\s>]", main)) == 1
        match("For support, questions or corrections, contact us below.", main)
        match("data-contact-page", main)
        no_match(r"<form|<iframe|<input|<textarea|untrusted-query|contact-report|contact-corrections|Technical review:", main, flags=re.I)
        email_links = []
        phone_links = []
        for href in re.findall(r'<a\b[^>]*\bhref="([^"]+)"', main):
            target = urlsplit(href)
            assert not target.query and not target.fragment, "Contact destinations cannot add headers or query values."
            if target.scheme == "mailto":
                email_links.append(unquote(target.path))
            elif target.scheme == "tel":
                assert re.fullmatch(r"\+\d{10,15}", target.path)
                phone_links.append(("calls", target.path[1:]))
            else:
                assert target.scheme == "https" and target.netloc == "wa.me"
                assert re.fullmatch(r"/\d{10,15}", target.path)
                phone_links.append(("whatsapp", target.path[1:]))
        if settings is None:
            assert email_links == [] and phone_links == []
            match("Contact details are temporarily unavailable", main)
        else:
            assert email_links == ([settings["email"]] if settings["email"] else [])
            expected = [(method, item["phone"]) for item in settings["supportContacts"]
                        for method in ("calls", "whatsapp") if item[method]]
            assert phone_links == expected, "Initial links match the same public projection used for refresh."
            if not settings["email"] and not settings["supportContacts"]:
                match("No public contact details are available", main)
        print(f"PASS brief contact HTML and safe query handling: {path}")
    for path, section in [("/en/privacy", "privacy-choices"), ("/en/terms", "terms-outcomes"), ("/en/help", "results")]:
        response = request(origin, path, redirect=True)
        assert response.status == 200, path
        visible = visible_html(response.text, comments=False)
        content = match(rf'<section\b(?=[^>]*\bid="{section}")[^>]*>[\s\S]*?</section>', visible).group()
        match(r'href="/en/contact"', content)
        print(f"PASS contextual contact link: {path}#{section}")
    print("PASS brief contact page, published safe links, query isolation and policy integration.")


if __name__ == "__main__":
    main_guard(main)
