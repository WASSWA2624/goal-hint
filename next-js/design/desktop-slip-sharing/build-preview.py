"""Build the browser gallery with visible navigation, keeping inline controls native."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--renderer", type=Path, help="Path to the installed visualize scripts/render.py")
    args = parser.parse_args()
    design_dir = Path(__file__).resolve().parent
    output_dir = design_dir.parents[1] / "output"
    source = (design_dir / "desktop-slip-sharing.html").read_text(encoding="utf-8")
    controls = (design_dir / "browser-controls.html").read_text(encoding="utf-8")
    if source.count("<!--browser-controls-->") != 1 or source.count('class="viz-carousel"') != 1:
        parser.error("The source must contain one browser-controls marker and one carousel.")
    source = source.replace("<!--browser-controls-->", controls).replace('class="viz-carousel"', 'class="gh-browser-designs"')
    renderer = args.renderer
    if renderer is None:
        codex_dir = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
        candidates = list(codex_dir.glob("plugins/cache/openai-bundled/visualize/*/skills/visualize/scripts/render.py"))
        if not candidates:
            parser.error("Cannot locate the installed visualize renderer; pass --renderer.")
        renderer = max(candidates, key=lambda path: path.stat().st_mtime)
    if not renderer.is_file():
        parser.error(f"Renderer not found: {renderer}")
    output_dir.mkdir(parents=True, exist_ok=True)
    browser_source = output_dir / "desktop-slip-sharing-browser-source.html"
    browser_source.write_text(source, encoding="utf-8")
    subprocess.run(
        [sys.executable, str(renderer), str(browser_source), str(output_dir / "desktop-slip-sharing-preview.html"), "--title", "Slip sharing — ten desktop designs", "--force"],
        check=True,
    )


if __name__ == "__main__":
    main()
