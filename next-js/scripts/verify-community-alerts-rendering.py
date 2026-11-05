"""Serve real navigation/dialog/settings components against entirely synthetic local responses."""
import shutil
import os
import json
from lib.rendering import ROOT, Server, build_fixture, create_fixture, parse_args, request
from lib.runtime import main_guard


def main():
    args = parse_args("community-alerts")
    directory = create_fixture("community-alerts")
    # The API and page use synthetic administrator state; keep the shared editor's
    # post-save refresh inside that same fixture instead of asking for real auth.
    typescript_configuration = directory / "tsconfig.json"
    typescript = json.loads(typescript_configuration.read_text(encoding="utf-8"))
    typescript["compilerOptions"]["paths"]["@/app/(owner)/actions"] = ["./app/fixture-actions.ts"]
    typescript_configuration.write_text(json.dumps(typescript, indent=2) + "\n", encoding="utf-8")
    # Isolated worktrees may share dependencies through a directory junction.
    # Turbopack must include both the source and the resolved dependency tree.
    dependencies = (ROOT / "node_modules").resolve()
    if not dependencies.is_relative_to(ROOT):
        configuration = directory / "next.config.mjs"
        source = configuration.read_text(encoding="utf-8")
        source = source.replace(json.dumps(str(ROOT)), json.dumps(os.path.commonpath([ROOT, dependencies])))
        configuration.write_text(source, encoding="utf-8")
    # Keep the real root provider/font; background offline maintenance is tested
    # separately and has no complete public snapshot in this isolated UI fixture.
    layout = (ROOT / "src/app/layout.tsx").read_text(encoding="utf-8")
    layout = layout.replace('import { OfflineBootstrap } from "@/components/offline/offline-bootstrap";\n', '').replace('<OfflineBootstrap />', '')
    font = os.path.relpath(ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2", directory / "app").replace('\\', '/')
    layout = layout.replace('../../assets/brand/source/fonts/Manrope-wght-latin.woff2', font)
    (directory / "app/layout.tsx").write_text(layout, encoding="utf-8")
    shutil.copytree(ROOT / "public/sounds", directory / "public/sounds", dirs_exist_ok=True)
    print(f"Building community/alerts fixture: {directory}", flush=True)
    build_fixture(directory, timeout=360)
    with Server(directory) as server:
        assert 'data-community-fixture' in request(server.origin).text
        assert 'data-settings-editor' not in request(server.origin).text
        assert 'data-fixture-denied' in request(server.origin, '/admin/settings').text
        assert request(server.origin, '/sounds/payment-review-v1.wav').status == 200
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Community/alerts rendering failed; inspect fixture build.log.")
