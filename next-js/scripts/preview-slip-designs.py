"""Build slip-design reviews independently of application builds and private runtime configuration."""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

from lib.rendering import ROOT, Server, build_fixture, create_fixture, request
from lib.runtime import main_guard

REVIEW_PATH = "/en/slips/designs/desktop"


def prepare(directory: Path) -> None:
    create_fixture("slip-design-review", directory=directory)
    font = Path(os.path.relpath(ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2", directory / "app")).as_posix()
    (directory / "app/layout.tsx").write_text(
        'import type {ReactNode} from "react";\n'
        'import localFont from "next/font/local";\n'
        'import {StyleProvider} from "@/styles/provider";\n'
        f'const font=localFont({{src:{json.dumps(font)},variable:"--font-manrope",weight:"200 800",display:"swap",fallback:["Arial","sans-serif"]}});\n'
        'export const metadata={title:"Slip designs | Goal Hint",robots:{index:false,follow:false},icons:{icon:"/brand/goal-hint-favicon.svg"}};\n'
        'export default function Layout({children}:{children:ReactNode}){return <html lang="en" className={font.variable}><body><StyleProvider>{children}</StyleProvider></body></html>;}\n',
        encoding="utf-8",
    )
    for path in ["en/slips/designs", "en/slips/designs/desktop"]:
        page = directory / "app" / path / "page.tsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        source = "@/app/[locale]/" + path.removeprefix("en/") + "/page"
        page.write_text(
            f'import Page from "{source}";\nexport {{metadata}} from "{source}";\n'
            'export default function ReviewPage(){return <Page params={Promise.resolve({locale:"en"})}/>;}\n',
            encoding="utf-8",
        )
    (directory / "app/page.tsx").write_text('export {default,metadata} from "./en/slips/designs/desktop/page";\n', encoding="utf-8")
    shutil.copytree(ROOT / "public/design", directory / "public/design", dirs_exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the isolated review server running.")
    parser.add_argument("--reuse", action="store_true", help="Serve the previously built review without rebuilding.")
    parser.add_argument("--port", type=int, help="Choose a local port; otherwise use an available port.")
    args = parser.parse_args()
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    directory = ROOT / ".tmp/slip-design-review"
    if args.reuse:
        if not (directory / ".next/BUILD_ID").is_file():
            parser.error("No built slip review exists; omit --reuse on the first run.")
    else:
        prepare(directory)
        print(f"Building isolated slip reviews: {directory}", flush=True)
        build_fixture(directory, timeout=360)
    server = Server(directory)
    if args.port is not None:
        server.port, server.origin = args.port, f"http://127.0.0.1:{args.port}"
    with server:
        response = request(server.origin, REVIEW_PATH)
        assert response.status == 200 and "data-desktop-row" in response.text, "Desktop review did not render."
        print(f"PASS: single-line desktop review. URL: {server.origin}{REVIEW_PATH}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Slip-design preview failed; inspect .tmp/slip-design-review/build.log.")
