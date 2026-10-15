"""Render the desktop match-details proposals to PNG with headless Chrome (or Edge) over the DevTools protocol.

Serves the repository root on 127.0.0.1 so the kit's relative font and logo paths resolve, then writes for each
design a first-screen shot (1440x900), a full-page shot (every tab and drawer opened via ?full) and reports which
data blocks the page rendered. Usage: python output/match-detail-desktop-designs/shoot.py [design-prefix ...]
"""
import asyncio
import base64
import functools
import http.server
import json
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import websockets

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SHOTS = HERE / "shots"
BROWSERS = [Path(r"C:/Program Files/Google/Chrome/Application/chrome.exe"), Path(r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")]
PROFILE = Path(tempfile.gettempdir()) / "goal-hint-design-shots"
PORT = 9339
WIDTH, HEIGHT = 1440, 900
REQUIRED = ["analysis", "bench", "compare", "disc", "events", "form", "goalMinutes", "h2h", "history", "info", "injuries", "keyPlayers",
    "news", "odds", "outcomes", "picks", "pitch|lineups", "playerTable", "resultBar", "schedule", "season", "stats", "table"]


class Page:
    def __init__(self, socket):
        self.socket, self.next = socket, 0

    async def call(self, method, **params):
        self.next += 1
        ident = self.next
        await self.socket.send(json.dumps({"id": ident, "method": method, "params": params}))
        while True:
            message = json.loads(await self.socket.recv())
            if message.get("id") == ident:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})

    async def size(self, height):
        await self.call("Emulation.setDeviceMetricsOverride", width=WIDTH, height=height, deviceScaleFactor=1, mobile=False)

    async def open(self, url):
        await self.size(HEIGHT)
        await self.call("Page.navigate", url=url)
        for _ in range(100):
            await asyncio.sleep(0.1)
            state = await self.call("Runtime.evaluate", expression="document.readyState + '|' + (document.documentElement.dataset.blocks || '')", returnByValue=True)
            ready, _, blocks = str(state.get("result", {}).get("value", "")).partition("|")
            if ready == "complete" and blocks:
                break
        await asyncio.sleep(1.2)

    async def shot(self, path, height=None):
        clip = {"x": 0, "y": 0, "width": WIDTH, "height": height or HEIGHT, "scale": 1}
        data = await self.call("Page.captureScreenshot", format="png", clip=clip, captureBeyondViewport=bool(height))
        path.write_bytes(base64.b64decode(data["data"]))

    async def value(self, expression):
        return (await self.call("Runtime.evaluate", expression=expression, returnByValue=True))["result"]["value"]


async def shoot(base, pages):
    targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
    target = next(t for t in targets if t["type"] == "page")
    report = {}
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=2 ** 28) as socket:
        page = Page(socket)
        await page.call("Page.enable")
        for file in pages:
            stem, url = file.stem, f"{base}/{file.name}"
            await page.open(url)
            await page.shot(SHOTS / f"{stem}-first.png")
            await page.open(f"{url}?full")
            height = await page.value("document.documentElement.scrollHeight")
            blocks = (await page.value("document.documentElement.dataset.blocks")).split(",")
            await page.shot(SHOTS / f"{stem}-full.png", min(height, 16000))
            missing = [need for need in REQUIRED if not any(option in blocks for option in need.split("|"))]
            report[stem] = {"fullHeight": height, "missing": missing}
            print(f"{stem}: full {height}px, missing {missing or 'nothing'}", flush=True)
    return report


def main():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    server.handle_error = lambda *args: None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/{HERE.relative_to(ROOT).as_posix()}"
    SHOTS.mkdir(exist_ok=True)
    prefixes = sys.argv[1:]
    pages = [page for page in sorted(HERE.glob("[0-9][0-9]-*.html")) if not prefixes or any(page.name.startswith(p) for p in prefixes)]
    browser = next(str(path) for path in BROWSERS if path.exists())
    process = subprocess.Popen([browser, "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--window-size=1440,900", f"--user-data-dir={PROFILE}",
        f"--remote-debugging-port={PORT}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version")
                break
            except OSError:
                time.sleep(0.1)
        report = asyncio.run(shoot(base, pages))
    finally:
        process.terminate()
        server.shutdown()
    path = SHOTS / "report.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    path.write_text(json.dumps({**previous, **report}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
