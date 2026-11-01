"""Build and optionally serve the ten review-only slip and match card treatments."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from shutil import copy2

from lib.runtime import ROOT, main_guard


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the browser preview running")
    parser.add_argument("--port", type=int, default=4396)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    source = ROOT / "design/card-separation"
    destination = ROOT / "output/card-separation-review"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "review.css", "review.js"):
        copy2(source / name, destination / name)
    copy2(ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2", destination / "Manrope.woff2")
    copy2(ROOT / "public/brand/goal-hint-favicon.ico", destination / "favicon.ico")
    tokens = json.loads((ROOT / "assets/brand/brand-tokens.json").read_text(encoding="utf-8"))
    radii = tokens["shape"]["radius"]
    variables = "".join(f"--radius-{key}:{value};" for key, value in radii.items())
    (destination / "theme-tokens.css").write_text(f":root{{{variables}}}\n", encoding="utf-8")

    if not args.serve:
        print(destination / "index.html", flush=True)
        return
    handler = partial(SimpleHTTPRequestHandler, directory=str(destination))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Card separation designs: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main_guard(main)
