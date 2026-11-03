"""Serve real navigation/dialog/settings components against entirely synthetic local responses."""
import shutil
import os
from lib.rendering import ROOT, Server, build_fixture, create_fixture, parse_args, request
from lib.runtime import main_guard


def main():
    args = parse_args("community-alerts")
    directory = create_fixture("community-alerts")
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
        assert 'data-settings-editor' in request(server.origin).text
        assert request(server.origin, '/sounds/payment-review-v1.wav').status == 200
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Community/alerts rendering failed; inspect fixture build.log.")
