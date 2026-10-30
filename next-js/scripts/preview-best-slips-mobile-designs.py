"""Build and optionally serve the mobile concepts with a persistent top navigator."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from shutil import copy2

from lib.runtime import ROOT, main_guard


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="Keep the local review link running")
    parser.add_argument("--port", type=int, default=4390)
    args = parser.parse_args()
    source = ROOT / "design/best-slips-mobile-designs"
    destination = ROOT / "output/best-slips-mobile-review"
    fragment = (source / "best-slips-mobile.html").read_text(encoding="utf-8")
    # The browser review owns its top navigator; the chat keeps its native carousel.
    fragment = fragment.replace('class="viz-carousel viz-dotted-background"', 'class="gh-browser-gallery"', 1)
    template = (source / "review.html").read_text(encoding="utf-8")
    document = template.replace("<!-- BEST_SLIPS_CONCEPTS -->", fragment, 1)
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / "index.html"
    output.write_text(document, encoding="utf-8")
    copy2(ROOT / "public/brand/goal-hint-favicon.ico", destination / "favicon.ico")
    if not args.serve:
        print(output, flush=True)
        return
    handler = partial(SimpleHTTPRequestHandler, directory=str(destination))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Best slips mobile designs: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main_guard(main)
