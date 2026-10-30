"""Inspect complete HTML, flight data and real handler responses from synthetic raw stored readers."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import runpy
from urllib.parse import parse_qs, urlsplit
from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment, parse_args, request, run_node, write_json
from lib.runtime import main_guard

SENTINELS = r"SENTINEL-|(?<![\d.])7\.73(?!\d)"
VIEWERS = ["anonymous", "number-only", "entitled", "expired", "revoked", "blocked", "evicted", "test", "off"]
PUBLIC_SLIP_FIELDS = {"rank", "matchCount", "totalOdds", "estimatedProbability", "averageProbability", "outcome", "status", "completed", "slip"}
# Unfinished public slips must not expose aggregate odds or probability values either.
PRIVATE_SLIP_VALUES = SENTINELS + r"|0\.6173|61\.7%|0\.7027|70\.3%|home-win|under-2\.5|10000000-0000-4000-8000-00000000000[12]"
UNFINISHED_SLIP_VALUES = PRIVATE_SLIP_VALUES + r"|10\.98|0\.3456|0\.66|66\.0%"


def verify_private_routes(origin):
    routes = [("/admin", 307, "/en/account?view=login"), ("/en/account", 200, None), ("/en/subscribe", 200, None)]
    for path, status, location in routes:
        page = request(origin, path)
        assert page.status == status, (path, page.status)
        assert page.headers.get("Location") == location, (path, "login redirect")
        assert "no-store" in page.headers.get("Cache-Control", ""), path
        assert "noindex" in page.headers.get("X-Robots-Tag", ""), path
    return len(routes)


def prepare_fixture(scenarios):
    directory = create_fixture("paywall")
    write_json(directory / "app/scenarios.json", scenarios)
    # Exercise the production private-route headers alongside isolated member/owner pages.
    for route, source in [("admin", "src/app/(owner)/admin/page.tsx")]:
        target = directory / "app" / route / "page.tsx"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f'export {{default, metadata}} from "@/{source.removeprefix("src/").removesuffix(".tsx")}";\n' if route == "admin"
            else 'export {default, generateMetadata} from "@/app/[locale]/account/page";\nexport const dynamic = "force-dynamic";\n', encoding="utf-8")
    (directory / "app/admin/layout.tsx").write_text('export {default, metadata} from "@/app/(owner)/admin/layout";\n', encoding="utf-8")
    (directory / "app/layout.tsx").write_text(
        'import Root from "@/app/layout";\nexport {metadata} from "@/app/layout";\n'
        'import {FixtureControls} from "./fixture-controls";\n'
        'export default function Layout({children}:{children:React.ReactNode}){return <Root><FixtureControls/>{children}</Root>;}\n', encoding="utf-8")
    config = directory / "next.config.mjs"
    config_source = config.read_text(encoding="utf-8")
    if 'import production from' not in config_source:
        config.write_text(config_source.replace("export default {", 'import production from "../../next.config.ts";\nexport default { headers: production.headers,'), encoding="utf-8")
    return directory


def main():
    args = parse_args("paid-access leak scan", extra=("--fixture",))
    generated = run_node(["--conditions=react-server", "--input-type=module", "--eval",
        "import {scenarios} from './tests/helpers/paywall-fixtures.mjs'; process.stdout.write(JSON.stringify(scenarios));"])
    scenarios = json.loads(generated.stdout)
    slip_checks = runpy.run_path(str(ROOT / "scripts/verify-slip-rendering.py"))
    document = slip_checks["Document"]
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = prepare_fixture(scenarios)
        print(f"Building leak-scan fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=240)
    checks = 0
    with Server(directory, env, ready="/en") as server:
        def verify_viewer(viewer):
            checks = 0
            headers = {"x-test-viewer": viewer}
            full = viewer == "entitled"
            for name, scenario in scenarios.items():
                detail = scenario["detail"]
                fixture_id, path = detail["fixture"]["fixtureId"], detail["route"]["path"]
                free_fixture = detail["fixture"]["status"] in {"finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded"}
                query = f"?cycle={scenario['cycle']}"
                paths = [f"/en/matches?q={name}", path, path + query,
                    f"/api/matches?q={name}", f"/api/matches/{fixture_id}",
                    f"/api/matches/{fixture_id}{query}", f"/api/matches/{fixture_id}?revision={scenario['revision']}",
                    f"/api/matches/{fixture_id}/insights?section=news"]
                for url in paths:
                    # Without a current forecast every viewer gets the same no-prediction card and verdict; only real forecasts lock.
                    # Pages always show the current verdict (a cycle or revision query only selects history); the API returns the selection.
                    shown = scenario["prior"] if url.startswith("/api/") and ("cycle=" in url or "revision=" in url) else detail
                    forecastless = shown["snapshot"] is None and shown["fixture"]["forecast"] is None
                    leak = r'data-(?:prediction|outcome|featured-pick|verdict|market)="' + (r'(?!none"|unavailable"|match-result")' if forecastless else "")
                    variants = [headers, {**headers, "RSC": "1"}] if not url.startswith("/api/") else [headers]
                    for request_headers in variants:
                        # Next's flight protocol canonicalizes an RSC request with no router tree to this empty cache key.
                        target = url + ("&" if "?" in url else "?") + "_rsc" if "RSC" in request_headers else url
                        response = request(server.origin, target, headers=request_headers)
                        expected_status = 403 if not full and not free_fixture and "/insights" in url else 200
                        assert response.status == expected_status, (viewer, url, response.status)
                        assert response.headers.get("Set-Cookie") is None, url
                        text = response.text  # Keep every flight script; never strip raw RSC data.
                        if url.startswith("/en/matches?q="):
                            assert "data-subscriber-banner" not in text and "Predictions are for subscribers" not in text, (viewer, url, "removed subscriber banner returned")
                        if not full and not free_fixture:
                            assert not re.search(SENTINELS + r'|0\.6173|"home-win"', text), (viewer, url, "unfinished forecast leaked")
                            if "/insights" in url:
                                assert json.loads(text)["error"]["code"] == "subscription-required"
                            # Shared row styles contain static outcome/market selectors in every theme.
                            # Check actual element attributes here; the sentinel scan above still covers
                            # the complete HTML/flight/API response, including scripts and styles.
                            tags = re.findall(r'<[a-z][^>]*>', text, flags=re.I)
                            assert not any(re.search(leak, tag) for tag in tags), (viewer, url, "prediction attribute leaked")
                        if not url.startswith("/api/") and "RSC" not in request_headers:
                            if url.startswith("/en/matches?q="):
                                # Free lists omit unfinished fixtures before pagination; completed cards retain canonical links.
                                linked = re.search(rf'href="/en/matches/{fixture_id}/[a-z0-9-]+"', text)
                                assert bool(linked) == (full or free_fixture), (viewer, url, "completed-only card link")
                                assert f'return=%2Fen%2Fmatches%2F{fixture_id}' not in text, (viewer, url, "card links the account page")
                            if url.startswith("/en/matches?q=") and not full:
                                assert 'Subscribers only' in text
                                assert not re.search(r'<option[^>]*value="probability-desc"[^>]*disabled', text) and not re.search(r'<option[^>]*disabled[^>]*value="probability-desc"', text)
                                # The card element's state, not the stylesheet's selectors.
                                states = set(re.findall(r'<div\b[^>]*\bdata-pick-state="([a-z]+)"', text))
                                assert "subscriber" not in states, (viewer, url, "unfinished public card returned")
                                if not free_fixture:
                                    assert not states and 'data-fixture-id=' not in text, (viewer, url, "unfinished row returned")
                            if not full and not free_fixture and not url.startswith("/en/matches?q="):
                                assert 'data-match-access-required' in text and 'Completed matches are public' in text
                                assert 'data-public-probability' not in text and 'data-featured-pick=' not in text
                                assert 'return=%2Fen%2Fmatches%2F' in text
                            if url.startswith("/en/matches?q="):
                                assert 'data-account-actions' in text and 'view=register' in text
                        if url.startswith("/api/"):
                            assert response.headers.get("Cache-Control") == "private, no-store"
                            assert "cookie" in {item.strip().lower() for header in response.headers.get_all("Vary", []) for item in header.split(",")}
                            if url.startswith("/api/matches?q=") and not full and not free_fixture:
                                feed = json.loads(text)
                                assert feed["records"] == [] and feed["total"] == 0 and feed["totalPages"] == 0
                        if (full or free_fixture) and "/insights" in url:
                            assert "SENTINEL-REASON-7Q" in text
                        if (full or free_fixture) and url.startswith("/api/") and "/insights" not in url and (name != "prior-cycle" or "cycle=" in url or "revision=" in url):
                            assert "0.6173" in text, (viewer, url, "full prediction missing")
                        head = re.search(r"<head>([\s\S]*?)</head>", text)
                        if head: assert not re.search(SENTINELS, head.group(1)), (viewer, url, "metadata sentinel leaked")
                        checks += 1
            if not full:
                for oracle in ["picks=only", "odds=1.50-3.00"]:
                    assert request(server.origin, "/api/matches?" + oracle, headers=headers).status == 403
                    page = request(server.origin, "/en/matches?" + oracle, headers=headers)
                    assert page.status == 307, (oracle, page.status)
                    safe_query = parse_qs(urlsplit(page.headers.get("Location")).query)
                    assert safe_query.get("picks") in (None, ["all"]) and "odds" not in safe_query, (viewer, oracle, "protected oracle criteria survived redirect")
                    assert safe_query.get("when") == ["today"] and safe_query.get("sort") == ["probability"], (viewer, oracle, "safe redirect retains public page defaults")
                    checks += 2
                slips = request(server.origin, "/en/slips?build=1", headers=headers)
                assert slips.status == 200 and not re.search(SENTINELS, slips.text)
                builder = document(slips.text).root
                actions = builder.nodes(attr="data-criteria-actions")
                signed_in = viewer not in {"anonymous", "off", "evicted"}
                label = "Subscribe" if signed_in else "Sign in"
                assert len(actions) == 1, (viewer, "one Slip Builder action group")
                links = builder.nodes("a", "data-slip-access-action")
                assert len(links) == 1, (viewer, "one Slip Builder toolbar access action")
                status = {node.attrs["data-slip-access-message"]: node.text.strip() for node in builder.nodes(attr="data-slip-access-message")}
                assert set(status) == {"mobile", "desktop"}, (viewer, "responsive Slip Builder status guidance")
                assert "active subscription" in status["desktop"].lower(), (viewer, "Slip Builder subscription requirement")
                assert ("Subscribe to build slips above" if signed_in else "sign in") in status["desktop"], (viewer, "Slip Builder account-aware instruction")
                assert ("Subscribe above" if signed_in else "Sign in above") in status["mobile"], (viewer, "Slip Builder mobile account-aware instruction")
                for link in links:
                    labels = {node.attrs["data-action-label"]: node.text.strip() for node in link.nodes(attr="data-action-label")}
                    assert labels == {"mobile": label + " to build slips", "desktop": label + " to build slips"}, (viewer, "responsive Slip Builder access labels")
                    destination = urlsplit(link.attrs["href"])
                    assert destination.path == ("/en/subscribe" if signed_in else "/en/account"), (viewer, "Slip Builder access destination")
                    assert parse_qs(destination.query).get("return") == ["/en/slips"], (viewer, "Slip Builder return destination")
                    if not signed_in:
                        assert parse_qs(destination.query).get("view") == ["login"], (viewer, "Slip Builder guests open sign in")
                checks += 1
            for path, extra in [("/en", {}), ("/en?_rsc", {"RSC": "1"}), ("/api/best-slips", {})]:
                response = request(server.origin, path, headers={**headers, **extra})
                assert response.status == 200, (viewer, path, response.status)
                assert "no-store" in response.headers.get("Cache-Control", ""), path
                if not full:
                    assert not re.search(UNFINISHED_SLIP_VALUES, response.text), (viewer, path, "unfinished Best Slips facts leaked")
                if extra and full:
                    assert all(value in response.text for value in ["totalOdds", "10.98", "estimatedProbability", "0.3456", "averageProbability", "0.66"]), (viewer, "public aggregate facts survive flight transport")
                if path == "/api/best-slips":
                    rows = json.loads(response.text)["slips"]
                    assert len(rows) == (1 if full else 0)
                    if full:
                        view = rows[0]
                        assert set(view) == PUBLIC_SLIP_FIELDS
                        assert view["estimatedProbability"] == 0.3456 and view["averageProbability"] == 0.66
                        assert view["matchCount"] == 2 and view["totalOdds"] == "10.98" and view["completed"] is False
                elif not extra:
                    assert "Best Slips" in response.text and 'href="/en/matches"' in response.text
                    assert ('data-slip-selection=' in response.text) == full
                    markup = document(response.text).root
                    toggles = markup.nodes("summary", "data-slip-toggle")
                    if full:
                        assert len(toggles) == 1 and "10.98" in toggles[0].text and "66.0%" in toggles[0].text, (viewer, "subscriber original header")
                        assert "Win probability" not in toggles[0].text and "34.6%" not in toggles[0].text
                        assert not any(toggles[0].nodes(tag) for tag in ["a", "button"]), (viewer, "whole header remains a toggle")
                        assert '61.7%' in response.text and '70.3%' in response.text, (viewer, "entitled original match probabilities")
                    else:
                        assert not toggles and not markup.nodes(attr="data-slip-content"), (viewer, "no unfinished public slip shell")
                        assert markup.nodes(attr="data-best-slips-access"), (viewer, "subscription guidance remains")
                checks += 1
            for path in ["/completed-slips", "/completed-slips?_rsc", "/api/completed-best-slips"]:
                response = request(server.origin, path, headers={**headers, **({"RSC": "1"} if "_rsc" in path else {})})
                assert response.status == 200, (viewer, path, response.status)
                assert "0.6173" in response.text or "61.7%" in response.text, (viewer, "completed slips remain public")
                if path.startswith("/api/"):
                    value = json.loads(response.text)
                    assert len(value["slips"]) == 1 and value["slips"][0]["completed"] is True
                    assert value["statistics"]["total"] == 1 and value["statistics"]["won"] == 1
                checks += 1
            print(f"PASS {viewer}: raw HTML, flight, APIs and access rules ({checks} checks).", flush=True)
            return checks
        with ThreadPoolExecutor(max_workers=4) as pool:
            checks = sum(pool.map(verify_viewer, VIEWERS))
        for viewer in ["anonymous", "expired"]:
            for extra in [{}, {"RSC": "1"}]:
                path = f"/refresh-access/{viewer}" + ("?_rsc" if extra else "")
                response = request(server.origin, path, headers=extra)
                assert response.status == 200 and not re.search(UNFINISHED_SLIP_VALUES, response.text), (viewer, "fresh access removes original entitled details and aggregates")
                assert "no-store" in response.headers.get("Cache-Control", ""), path
                if not extra:
                    markup = document(response.text).root
                    assert not markup.nodes(attr="data-slip-content") and not markup.nodes("summary", "data-slip-toggle")
                    assert markup.nodes(attr="data-best-slips-access"), "Fresh access shows one list-level prompt"
                checks += 1
            print(f"PASS fresh access during read: {viewer} sees no unfinished slip or aggregate facts.", flush=True)
        checks += verify_private_routes(server.origin)
        print(f"PASS {checks} raw HTML/RSC/API, history, insights, oracle, slips and private-route checks across nine viewer states.", flush=True)
        if args.serve: server.serve()


if __name__ == "__main__":
    main_guard(main)
