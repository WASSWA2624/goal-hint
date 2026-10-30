"""Build and optionally serve the ten compact mobile match-card concepts."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from shutil import copy2

from lib.runtime import ROOT, main_guard


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the local comparison running")
    parser.add_argument("--port", type=int, default=4393)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    source = ROOT / "design/mobile-match-card-designs"
    destination = ROOT / "output/mobile-match-card-review"
    fragment = (source / "mobile-match-cards.html").read_text(encoding="utf-8")
    # The conversation owns its native carousel; the browser shell owns its navigator.
    fragment = fragment.replace('class="viz-carousel viz-dotted-background"', 'class="mc-browser-gallery"', 1)
    # The local browser uses the bundled font and works without a CDN request.
    fragment = "\n".join(line for line in fragment.splitlines() if not line.startswith('<link rel="stylesheet"'))
    template = (source / "review.html").read_text(encoding="utf-8")
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / "index.html"
    output.write_text(template.replace("<!-- MOBILE_MATCH_CARDS -->", fragment, 1), encoding="utf-8")
    copy2(ROOT / "assets/brand/source/fonts/Manrope-wght-latin.woff2", destination / "Manrope.woff2")
    copy2(ROOT / "public/brand/goal-hint-favicon.ico", destination / "favicon.ico")
    if not args.serve:
        print(output, flush=True)
        return
    handler = partial(SimpleHTTPRequestHandler, directory=str(destination))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Mobile match card designs: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main_guard(main)
