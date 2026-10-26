"""Run public information/navigation checks against isolated off-mode route factories."""
import subprocess
import sys

from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment
from lib.runtime import main_guard


def main():
    directory = create_fixture("information")
    app = directory / "app"
    pages = {"page.tsx": "app/page", "not-found.tsx": "app/not-found",
             "[locale]/layout.tsx": "app/[locale]/layout",
             "[locale]/how-it-works/page.tsx": "app/[locale]/how-it-works/page",
             "[locale]/matches/[fixtureId]/[slug]/page.tsx": "app/[locale]/matches/[fixtureId]/[slug]/page"}
    for page in ("privacy", "terms", "contact", "help"):
        pages[f"[locale]/{page}/page.tsx"] = f"app/[locale]/{page}/page"
    for target, source in pages.items():
        path = app / target
        path.parent.mkdir(parents=True, exist_ok=True)
        # Only routes which expose metadata re-export it.
        metadata = ", generateMetadata" if target.endswith("page.tsx") and target != "page.tsx" and "how-it-works" not in target else ""
        if target.endswith("layout.tsx"):
            metadata = ", generateMetadata"
        path.write_text(f'export {{ default{metadata} }} from "@/{source}";\n', encoding="utf-8")
    for path, factory, options in [("[locale]/page.tsx", "Feed", ""),
                                    ("[locale]/predictions/[date]/page.tsx", "Feed", "dated: true,"),
                                    ("[locale]/slips/page.tsx", "Slips", "")]:
        target = app / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f'import {{ create{factory}Route }} from "@/app/_components/{factory.lower()}-route";\n'
            f'const route = create{factory}Route({{{options} resolveAccess: async () => ({{tier:"full",signedIn:false,mode:"off"}})}});\n'
            'export const dynamic="force-dynamic";\nexport const generateMetadata=route.generateMetadata;\nexport default route.Page;\n', encoding="utf-8")
    (directory / "proxy.ts").write_text((ROOT / "src/proxy.ts").read_text(encoding="utf-8"), encoding="utf-8")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_DEPLOYMENT_ENVIRONMENT="staging")
    print(f"Building isolated information routes: {directory}", flush=True)
    build_fixture(directory, env, timeout=240)
    with Server(directory, env, ready="/en/privacy") as server:
        for page in ("privacy", "terms", "contact", "navigation"):
            result = subprocess.run([sys.executable, str(ROOT / f"scripts/verify-{page}-rendering.py"), server.origin],
                cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8")
            print(result.stdout, end="", flush=True)
            assert result.returncode == 0, result.stderr
    print("PASS all four information/navigation acceptance commands with isolated off-mode access.")


if __name__ == "__main__":
    main_guard(main)
