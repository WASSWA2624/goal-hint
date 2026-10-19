"""Inspect complete HTML, flight data and real handler responses from synthetic raw stored readers."""
import json
from concurrent.futures import ThreadPoolExecutor
import re
from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment, parse_args, request, run_node, write_json
from lib.runtime import main_guard

SENTINELS = r"SENTINEL-|(?<![\d.])(?:0\.6173|61\.73|62%|7\.73)(?!\d)"
VIEWERS = ["anonymous", "number-only", "entitled", "expired", "revoked", "blocked", "evicted", "off"]


def main():
    args = parse_args("paid-access leak scan")
    directory = create_fixture("paywall")
    generated = run_node(["--conditions=react-server", "--input-type=module", "--eval",
        "import {scenarios} from './tests/helpers/paywall-fixtures.mjs'; process.stdout.write(JSON.stringify(scenarios));"])
    scenarios = json.loads(generated.stdout)
    write_json(directory / "app/scenarios.json", scenarios)
    # Exercise the production private-route headers alongside isolated member/owner pages.
    for route, source in [("en/account", "src/app/[locale]/account/page.tsx"), ("admin", "src/app/admin/page.tsx")]:
        target = directory / "app" / route / "page.tsx"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f'export {{default, metadata}} from "@/{source.removeprefix("src/").removesuffix(".tsx")}";\n' if route == "admin"
            else 'export {default, generateMetadata} from "@/app/[locale]/account/page";\nexport const dynamic = "force-dynamic";\n', encoding="utf-8")
    (directory / "app/admin/layout.tsx").write_text('export {default, metadata} from "@/app/admin/layout";\n', encoding="utf-8")
    subscribe = directory / "app/en/subscribe/page.tsx"
    subscribe.parent.mkdir(parents=True, exist_ok=True)
    subscribe.write_text('export {default, generateMetadata} from "@/app/[locale]/account/page";\nexport const dynamic = "force-dynamic";\n', encoding="utf-8")
    config = directory / "next.config.mjs"
    config.write_text(config.read_text(encoding="utf-8").replace("export default {", 'import production from "../../next.config.ts";\nexport default { headers: production.headers,'), encoding="utf-8")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    print(f"Building leak-scan fixture: {directory}", flush=True)
    build_fixture(directory, env, timeout=240)
    checks = 0
    with Server(directory, env, ready="/en") as server:
        def verify_viewer(viewer):
            checks = 0
            headers = {"x-test-viewer": viewer}
            full = viewer in ("entitled", "off")
            for name, scenario in scenarios.items():
                detail = scenario["detail"]
                fixture_id, path = detail["fixture"]["fixtureId"], detail["route"]["path"]
                free_fixture = name in ("finished-regulation", "canceled")
                query = f"?cycle={scenario['cycle']}"
                paths = [f"/en?q={name}", path, path + query,
                    f"/api/matches?q={name}", f"/api/matches/{fixture_id}",
                    f"/api/matches/{fixture_id}{query}", f"/api/matches/{fixture_id}?revision={scenario['revision']}",
                    f"/api/matches/{fixture_id}/insights?section=news"]
                for url in paths:
                    variants = [headers, {**headers, "RSC": "1"}] if not url.startswith("/api/") else [headers]
                    for request_headers in variants:
                        # Next's flight protocol canonicalizes an RSC request with no router tree to this empty cache key.
                        target = url + ("&" if "?" in url else "?") + "_rsc" if "RSC" in request_headers else url
                        response = request(server.origin, target, headers=request_headers)
                        assert response.status == 200, (viewer, url, response.status)
                        assert response.headers.get("Set-Cookie") is None, url
                        text = response.text  # Keep every flight script; never strip raw RSC data.
                        if not full and not free_fixture:
                            assert not re.search(SENTINELS, text), (viewer, url, "premium sentinel leaked")
                            assert not re.search(r'data-(?:prediction|outcome|featured-pick|verdict|market)="', text), (viewer, url, "prediction attribute leaked")
                        if url.startswith("/api/"):
                            assert response.headers.get("Cache-Control") == "private, no-store"
                            assert "cookie" in {item.strip().lower() for header in response.headers.get_all("Vary", []) for item in header.split(",")}
                        if (full or free_fixture) and "/insights" in url:
                            assert "SENTINEL-REASON-7Q" in text
                        if (full or free_fixture) and url.startswith("/api/") and "/insights" not in url and (name != "prior-cycle" or "cycle=" in url or "revision=" in url):
                            assert "0.6173" in text, (viewer, url, "full prediction missing")
                        head = re.search(r"<head>([\s\S]*?)</head>", text)
                        if head: assert not re.search(SENTINELS, head.group(1)), (viewer, url, "metadata sentinel leaked")
                        checks += 1
            if not full:
                for oracle in ["prob=1-100", "sort=probability", "picks=only", "odds=1.50-3.00"]:
                    assert request(server.origin, "/api/matches?" + oracle, headers=headers).status == 403
                    page = request(server.origin, "/en?" + oracle, headers=headers)
                    assert page.status == 307, (oracle, page.status)
                    assert not re.search(r"prob=|sort=probability|picks=|odds=", page.headers.get("Location"))
                    checks += 2
                slips = request(server.origin, "/en/slips?build=1", headers=headers)
                assert slips.status == 200 and not re.search(SENTINELS, slips.text)
                checks += 1
            print(f"PASS {viewer}: raw HTML, flight, APIs and access rules ({checks} checks).", flush=True)
            return checks
        with ThreadPoolExecutor(max_workers=4) as pool:
            checks = sum(pool.map(verify_viewer, VIEWERS))
        for path in ["/admin", "/en/account", "/en/subscribe"]:
            page = request(server.origin, path)
            assert page.status == 200, path
            assert "no-store" in page.headers.get("Cache-Control", ""), path
            assert "noindex" in page.headers.get("X-Robots-Tag", ""), path
            checks += 1
        print(f"PASS {checks} raw HTML/RSC/API, history, insights, oracle, slips and private-route checks across eight viewer states.", flush=True)
        if args.serve: server.serve()


if __name__ == "__main__":
    main_guard(main)
