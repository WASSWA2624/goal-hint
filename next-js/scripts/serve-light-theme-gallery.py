"""Serve the exported theme samples locally for an external browser."""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


OUTPUT = Path(__file__).resolve().parents[1] / "output/playwright/light-themes"
FILENAME = "goal-hint-light-themes.html"


class GalleryHandler(SimpleHTTPRequestHandler):
    """Expose only the generated gallery, never repository or operator files."""

    def _select_gallery(self) -> bool:
        if urlsplit(self.path).path not in ("/", f"/{FILENAME}"):
            self.send_error(404)
            return False
        self.path = f"/{FILENAME}"
        return True

    def do_GET(self) -> None:
        if self._select_gallery():
            super().do_GET()

    def do_HEAD(self) -> None:
        if self._select_gallery():
            super().do_HEAD()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3108)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    gallery = OUTPUT / FILENAME
    if not gallery.is_file() or gallery.resolve().parent != OUTPUT.resolve():
        parser.error(f"Export the gallery to {gallery} before starting the server.")
    handler = partial(GalleryHandler, directory=str(OUTPUT))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Theme samples: http://127.0.0.1:{args.port}/{FILENAME}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
