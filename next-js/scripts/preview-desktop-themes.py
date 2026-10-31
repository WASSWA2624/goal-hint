"""Build and serve ten desktop themes using the real screens and synthetic data."""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment, request, run_node, write_json
from lib.runtime import main_guard


def prepare(directory: Path) -> None:
    create_fixture("desktop-theme-review", directory=directory)
    shutil.copyfile(ROOT / "public/brand/goal-hint-favicon.ico", directory / "public/favicon.ico")
    config = json.loads((directory / "tsconfig.json").read_text(encoding="utf-8"))
    config["compilerOptions"]["paths"].update({
        "@preview/*": ["../../design/desktop-themes/*"], "@preview-data/*": ["./app/*"],
    })
    write_json(directory / "tsconfig.json", config)
    files = {
        "app/layout.tsx": 'export { default, metadata } from "@preview/layout";\n',
        "app/page.tsx": 'import { redirect } from "next/navigation"; export default function Page() { redirect("/themes/porcelain-blue"); }\n',
        "app/themes/[theme]/[[...screen]]/page.tsx": '''import { ThemePage } from "@preview/page";
import performance from "@preview-data/performance.json";
import type { PerformanceDashboardProps } from "@/components/performance/performance-dashboard";
export const dynamic = "force-dynamic";
export default function Page(props: Omit<Parameters<typeof ThemePage>[0], "performance">) {
  return <ThemePage {...props} performance={performance as unknown as PerformanceDashboardProps} />;
}
''',
        "app/api/[...path]/route.ts": 'export { GET, POST } from "@preview/api";\n',
        "app/[...path]/page.tsx": '''import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { appPreviewScreen, findDesktopTheme, previewHref } from "@preview/catalog";
export default async function Page({ params, searchParams }: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = "/" + (await params).path.join("/"), input = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
  const screen = appPreviewScreen(path, query); if (!screen) notFound();
  const selected = (await cookies()).get("goal-hint-desktop-preview-theme")?.value ?? "porcelain-blue";
  redirect(previewHref(findDesktopTheme(selected)?.id ?? "porcelain-blue", screen, query.toString()));
}
''',
    }
    for relative, content in files.items():
        target = directory / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    result = run_node(["--conditions=react-server", "--input-type=module", "--eval",
        "import {performancePageScenarios} from './tests/helpers/performance-page-fixtures.mjs'; process.stdout.write(JSON.stringify(performancePageScenarios.reviewed));"])
    write_json(directory / "app/performance.json", json.loads(result.stdout))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the local preview available.")
    parser.add_argument("--port", type=int, default=3110)
    parser.add_argument("--reuse", action="store_true", help="Serve the last successful build.")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    directory = ROOT / ".tmp/desktop-theme-review"
    directory.parent.mkdir(exist_ok=True)
    env = environment(GOAL_HINT_DATABASE_ENABLED="false")
    if not args.reuse:
        prepare(directory)
        print(f"Building desktop theme previews: {directory}", flush=True)
        build_fixture(directory, env, timeout=360)
    server = Server(directory, env, ready="/themes/porcelain-blue")
    server.port, server.origin = args.port, f"http://127.0.0.1:{args.port}"
    with server:
        assert request(server.origin, "/themes/porcelain-blue").status == 200
        assert request(server.origin, "/themes/not-a-theme").status == 404
        print(f"Desktop theme studio: {server.origin}/themes/porcelain-blue", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Desktop theme preview failed; inspect .tmp/desktop-theme-review/build.log.")
