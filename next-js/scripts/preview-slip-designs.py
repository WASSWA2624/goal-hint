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
HEADER_REVIEW_PATH = "/en/slips/designs/headers"


def prepare(directory: Path, review_path: str = REVIEW_PATH) -> None:
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
    paths = ["en/slips/designs", "en/slips/designs/desktop"]
    if review_path == HEADER_REVIEW_PATH:
        paths.append(HEADER_REVIEW_PATH.lstrip("/"))
    for path in paths:
        page = directory / "app" / path / "page.tsx"
        page.parent.mkdir(parents=True, exist_ok=True)
        source = "@/app/[locale]/" + path.removeprefix("en/") + "/page"
        page.write_text(
            f'import Page from "{source}";\nexport {{metadata}} from "{source}";\n'
            'export default function ReviewPage(){return <Page params={Promise.resolve({locale:"en"})}/>;}\n',
            encoding="utf-8",
        )
    (directory / "app/page.tsx").write_text(f'export {{default,metadata}} from "./{review_path.lstrip("/")}/page";\n', encoding="utf-8")
    shutil.copytree(ROOT / "public/design", directory / "public/design", dirs_exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the isolated review server running.")
    parser.add_argument("--reuse", action="store_true", help="Serve the previously built review without rebuilding.")
    parser.add_argument("--port", type=int, help="Choose a local port; otherwise use an available port.")
    parser.add_argument("--view", choices=("desktop", "mobile-headers"), default="desktop", help="Choose the isolated comparison page.")
    args = parser.parse_args()
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    headers = args.view == "mobile-headers"
    review_path = HEADER_REVIEW_PATH if headers else REVIEW_PATH
    directory = ROOT / (".tmp/mobile-slip-header-review" if headers else ".tmp/slip-design-review")
    if args.reuse:
        if not (directory / ".next/BUILD_ID").is_file():
            parser.error("No built slip review exists; omit --reuse on the first run.")
    else:
        prepare(directory, review_path)
        print(f"Building isolated slip reviews: {directory}", flush=True)
        build_fixture(directory, timeout=360)
    server = Server(directory)
    if args.port is not None:
        server.port, server.origin = args.port, f"http://127.0.0.1:{args.port}"
    with server:
        response = request(server.origin, review_path)
        marker = "data-header-summary" if headers else "data-desktop-row"
        assert response.status == 200 and marker in response.text, "Slip review did not render."
        name = "single-row mobile header review" if headers else "single-line desktop review"
        print(f"PASS: {name}. URL: {server.origin}{review_path}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Slip-design preview failed; inspect .tmp/slip-design-review/build.log.")
