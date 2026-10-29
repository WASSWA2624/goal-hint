"""Build and inspect the isolated mobile subscription banner design review."""
from collections import Counter
import importlib.util
from pathlib import Path
import re

from lib.rendering import Server, build_fixture, create_fixture, parse_args, request, write_json
from lib.runtime import ROOT, main_guard


PREVIEW_PATH = "/en/banner/designs/mobile"
specification = importlib.util.spec_from_file_location("desktop_banner_review", ROOT / "scripts/verify-banner-design-rendering.py")
assert specification and specification.loader, "The shared desktop review helpers must be available."
desktop_review = importlib.util.module_from_spec(specification)
specification.loader.exec_module(desktop_review)


def verify(origin, directory):
    response = request(origin, PREVIEW_PATH)
    assert response.status == 200, "The mobile banner review must return HTTP 200."
    assert response.headers.get("set-cookie") is None, "The review must not create an account session."
    (directory / "mobile-banner-designs.html").write_text(response.text, encoding="utf-8")
    document = desktop_review.ReviewDocument(response.text)
    options = document.with_attribute("data-mobile-banner-option")
    samples = document.with_attribute("data-mobile-banner-sample")
    assert len(options) == 10, "All ten designs must be present before hydration."
    assert all(node["tag"] == "section" for node in options), "Each option needs a semantic section."
    assert len({node["attrs"]["data-mobile-banner-option"] for node in options}) == 10, "Design identifiers must be unique."
    option_ids = [node["attrs"].get("id") for node in options]
    assert all(option_ids) and len(set(option_ids)) == 10, "Every design needs a unique section identifier."
    sample_states = Counter(node["attrs"]["data-mobile-banner-sample"] for node in samples)
    assert sample_states == {"signed-out": 10, "unsubscribed": 10, "active": 10}, "All thirty account-state samples must render."
    for option in options:
        states = Counter(node["attrs"]["data-mobile-banner-sample"] for node in document.descendants(option)
                         if "data-mobile-banner-sample" in node["attrs"])
        assert states == {"signed-out": 1, "unsubscribed": 1, "active": 1}, "Each design must show each account state once."
    for sample in samples:
        descendants = list(document.descendants(sample))
        headers = [node for node in descendants if "data-mobile-banner-header" in node["attrs"]]
        banners = [node for node in descendants if "data-mobile-banner-message" in node["attrs"]]
        assert len(headers) == len(banners) == 1, "Each sample needs one app header and one banner."
        header, banner = headers[0], banners[0]
        assert header["parent"] is banner["parent"], "The banner must share the app header's parent."
        siblings = header["parent"]["children"]
        assert siblings.index(banner) == siblings.index(header) + 1, "The banner must immediately follow the app header."
        actions = desktop_review.action_names(document, banner)
        authentication = {name for name in actions if name in {"sign in", "sign up"}}
        state = sample["attrs"]["data-mobile-banner-sample"]
        if state == "signed-out":
            assert authentication == {"sign in", "sign up"}, "Visitors need both authentication actions."
            assert "subscribe" not in actions, "Visitors must authenticate before subscribing."
        elif state == "unsubscribed":
            assert "subscribe" in actions and not authentication, "Signed-in members need Subscribe without authentication prompts."
        else:
            assert not authentication and "subscribe" not in actions, "Active subscribers must not receive acquisition actions."
            assert not re.search(r"\bUGX\b", "".join(banner["text"]), re.IGNORECASE), "Active subscribers must not receive sales pricing."
        assert not any(name in {"login", "log in", "register"} for name in actions), "Authentication actions must use the shared vocabulary."
    assert sum(node["tag"] == "main" for node in document.elements) == 1, "The review needs one main landmark."
    assert sum(node["tag"] == "h1" for node in document.elements) == 1, "The review needs one page heading."
    robots = [node["attrs"].get("content", "") for node in document.elements
              if node["tag"] == "meta" and node["attrs"].get("name") == "robots"]
    assert any("noindex" in value and "nofollow" in value for value in robots), "The review must not be indexed."
    assert "data-styled=" in response.text, "Component styles must be server-rendered."
    ids = [node["attrs"]["id"] for node in document.elements if "id" in node["attrs"]]
    assert len(ids) == len(set(ids)), "Repeated previews must not create duplicate element identifiers."
    assets = sorted({node["attrs"].get("src", "") for node in document.elements
                     if node["tag"] == "img" and node["attrs"].get("src", "").startswith("/brand/")})
    assert assets, "The review must use the application's brand artwork."
    for asset in assets:
        assert request(origin, asset).status == 200, f"Brand asset is unavailable: {asset}"
    result = {"options": len(options), "samples": dict(sample_states), "brandAssets": assets,
              "robots": "noindex, nofollow", "uniqueIds": True, "sessionCookieAbsent": True,
              "adjacentHeaderAndBanner": True, "stateAppropriateActions": True, "activeSalesPriceAbsent": True,
              "browserGeometryVerified": False}
    write_json(directory / "verification.json", result)
    print(f"Mobile banner review SSR passed: {result}", flush=True)


def main():
    args = parse_args("mobile banner designs", extra=("--fixture",))
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp"), "Reuse a fixture beneath the application's .tmp directory."
        assert (directory / ".next/BUILD_ID").is_file(), "The selected fixture needs a successful production build."
    else:
        directory = create_fixture("mobile-banner-designs")
        desktop_review.write_preview_layout(directory)
        print(f"Building isolated mobile banner review fixture: {directory}", flush=True)
        build_fixture(directory, timeout=300)
    with Server(directory, ready=PREVIEW_PATH) as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Mobile banner review: {server.origin}{PREVIEW_PATH}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Mobile banner review verification failed; inspect the fixture artifacts and build.log.")
