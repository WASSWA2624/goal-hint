"""Exercise both read-only production verifiers on real route factories and synthetic stored data."""
import json
import runpy

from lib.capture_rendering import captured_directory
from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment, parse_args, run_node, write_json
from lib.runtime import main_guard


def verify_built(directory, env):
    with Server(directory, env, ready="/en") as server:
        runpy.run_path(str(ROOT / "scripts/verify-production-paywall.py"))["verify"](server.origin)
        runpy.run_path(str(ROOT / "scripts/verify-production-seo.py"))["verify"](server.origin, today="2026-10-09")
        print("PASS both production scripts against a local production build; no production host contacted.", flush=True)


def main():
    args = parse_args("launch checks", ("--reuse",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.reuse:
        verify_built(captured_directory(args.reuse, "paywall"), env)
        return
    directory = create_fixture("paywall")
    generated = run_node(["--conditions=react-server", "--input-type=module", "--eval",
        "import {scenarios} from './tests/helpers/paywall-fixtures.mjs';process.stdout.write(JSON.stringify(scenarios));"])
    write_json(directory / "app/scenarios.json", json.loads(generated.stdout))
    app = directory / "app"

    def write(path, source):
        target = app / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source, encoding="utf-8")

    write("launch.ts", '''import {notFound} from "next/navigation";
import {createDiscoveryRoutes} from "@/server/seo/discovery-routes";
import {policy,scenarios} from "./stored";
export const discovery=createDiscoveryRoutes({policy,missing:notFound,reader:()=>({
 inventory:async()=>({matches:1,dates:0}),matches:async()=>[{path:scenarios.scheduled!.detail.route.path}],dates:async()=>[]
})});
''')
    write("robots.ts", 'import {discovery} from "./launch";export const dynamic="force-dynamic";export default discovery.robots;\n')
    write("sitemap.ts", 'import {discovery} from "./launch";export const dynamic="force-dynamic";export default discovery.sitemap;\n')
    write("matches/sitemap.ts", 'import {discovery} from "../launch";export const generateSitemaps=discovery.matchIds;export default discovery.matches;\n')
    write("sitemap-index.xml/route.ts", 'import {discovery} from "../launch";export async function GET(){return new Response(await discovery.sitemapIndex(),{headers:{"Content-Type":"application/xml"}});}\n')
    write("api/performance/route.ts", '// Clearly synthetic cohort for the production-script contract, not measured performance.\nexport function GET(){return Response.json({cohort:{fixtureCount:1001},policy:{state:"unapproved"},cells:[{metrics:{hitRate:null}}]});}\n')
    write("en/predictions/[date]/page.tsx", '''import {createFeedRoute} from "@/app/_components/feed-route";
import {instant,policy,readFeed,resolveAccess} from "../../../stored";
const route=createFeedRoute({dated:true,instant,policy,read:readFeed,resolveAccess});
export const generateMetadata=route.generateMetadata;export default route.Page;
''')
    for page in ("privacy", "terms"):
        write(f"en/{page}/page.tsx", f'export {{default,generateMetadata}} from "@/app/[locale]/{page}/page";\n')
    write("admin/page.tsx", 'export {default,metadata} from "@/app/(owner)/admin/page";\n')
    write("admin/layout.tsx", 'export {default,metadata} from "@/app/(owner)/admin/layout";\n')
    for page in ("account", "subscribe"):
        write(f"en/{page}/page.tsx", f'export {{default,generateMetadata}} from "@/app/[locale]/{page}/page";\nexport const dynamic="force-dynamic";\n')
    config = directory / "next.config.mjs"
    config.write_text(config.read_text(encoding="utf-8").replace("export default {",
        'import production from "../../next.config.ts";\nexport default {headers:production.headers,rewrites:production.rewrites,'), encoding="utf-8")
    print(f"Building launch-check fixture: {directory}", flush=True)
    build_fixture(directory, env, timeout=300)
    verify_built(directory, env)


if __name__ == "__main__":
    main_guard(main)
