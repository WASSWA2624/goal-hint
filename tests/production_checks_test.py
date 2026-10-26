"""Gate verification must fail on leaked fields, full access, cookies and cached responses."""
from email.message import Message
from pathlib import Path
import runpy
import json
import io
from contextlib import redirect_stdout
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.production_checks import get, private_response
from lib.rendering import Response
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

paywall = runpy.run_path(str(ROOT / "scripts/verify-production-paywall.py"))


class ProductionChecks(unittest.TestCase):
    def test_gate_rejects_added_premium_fields_and_full_access(self):
        safe = {"status": "scheduled", "prices": [], "forecast": {"gated": True, "families": ["match-result"]}}
        paywall["gated_record"](safe)
        for extra in ({"probabilities": {}}, {"markets": []}, {"analysis": "private"}):
            with self.assertRaises(AssertionError):
                paywall["gated_record"]({**safe, "forecast": {**safe["forecast"], **extra}})
        with self.assertRaises(AssertionError):
            paywall["gated_record"]({**safe, "prices": [{"price": "2.00"}]})
        for access in ({"tier": "full", "signedIn": False}, {"tier": "free", "signedIn": True}):
            with self.assertRaises(AssertionError):
                paywall["free_access"]({"access": access})
        # Scores remain public; historical predictions and odds still require entitlement.
        with self.assertRaises(AssertionError):
            paywall["gated_record"]({**safe, "status": "finished-regulation", "prices": [{"price": "2.00"}]})

    def test_raw_html_and_escaped_flight_leaks_fail(self):
        paywall["gated_html"]('<p>Subscriber access</p>')
        for source in ('<article data-market="match-result">', '{"probabilities":{}}', r'{\"reasons\":["private"]}'):
            with self.assertRaises(AssertionError):
                paywall["gated_html"](source)
        # A feed page leaves card markup to FeedCards but still rejects flight data and detail markup.
        paywall["gated_html"]('<article data-market="match-result"><p data-prediction="none" data-outcome="unavailable"></p></article>', cards=True)
        for source in ('{"probabilities":{}}', '<section data-verdict="home-win">'):
            with self.assertRaises(AssertionError):
                paywall["gated_html"](source, cards=True)

    def test_feed_cards_lock_published_forecasts_and_allow_forecastless_cards(self):
        none = '<article data-fixture-id="none" data-market="match-result"><p data-prediction="none" data-outcome="unavailable"></p></article>'
        locked = '<article data-fixture-id="published" data-status="scheduled"><p data-pick-state="subscriber"></p></article>'
        paywall["FeedCards"](f"<main>{locked}{none}</main>", {"published"})
        # Only a published family locks a card; a forecast without one shows no prediction, like a missing forecast.
        records = [{"fixtureId": "published", "forecast": {"gated": True, "families": ["match-result"]}},
            {"fixtureId": "none", "forecast": None}, {"fixtureId": "empty", "forecast": {"gated": True, "families": []}}]
        self.assertEqual(paywall["forecast_ids"]({"records": records}), {"published"})
        for source in ('<article data-fixture-id="published" data-market="match-result"></article>',
                '<article data-fixture-id="published"><p data-prediction="none"></p></article>',
                '<article data-fixture-id="none" data-market="match-result"><p data-prediction="home-win"></p></article>',
                '<article data-fixture-id="none"><p data-outcome="pending"></p></article>',
                '<article data-fixture-id="none"><span data-pick-selection="">Home</span></article>',
                '<article data-fixture-id="none"><span data-probability-meter=""></span></article>',
                f'{none}<p data-prediction="home-win"></p>'):
            with self.assertRaises(AssertionError):
                paywall["FeedCards"](source, {"published"})

    def test_private_headers_reject_shared_cache_or_intermediary(self):
        for values, accepted in [({"Cache-Control": "private, no-store"}, True),
                ({"Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store"}, True),
                ({"Cache-Control": "private, no-store", "CDN-Cache-Control": "max-age=30"}, False),
                ({"Cache-Control": "public, max-age=30"}, False),
                ({"Cache-Control": "private, no-store", "x-litespeed-cache": "hit"}, False),
                ({"Cache-Control": "private, no-store", "Age": "1"}, False)]:
            headers = Message()
            for name, value in values.items():
                headers[name] = value
            response = Response(200, headers, "")
            if accepted:
                private_response(response, "/en")
            else:
                with self.assertRaises(AssertionError):
                    private_response(response, "/en")

    def test_complete_check_rejects_news_analysis_and_missing_forecast(self):
        record = {"fixtureId": "10000000-0000-4000-8000-000000000001", "slug": "synthetic-match",
                  "status": "scheduled", "prices": [], "forecast": {"gated": True, "families": ["match-result"]}}
        none = {**record, "fixtureId": "10000000-0000-4000-8000-000000000002", "forecast": None}
        access = {"tier": "free", "signedIn": False}
        state = {"kind": "report", "forecast": True, "card": ""}
        seen = []

        def cards():
            # The locked card carries no pick markup; the forecastless one shows the subscriber's no-prediction state.
            return (f'<main><article data-fixture-id="{record["fixtureId"]}"{state["card"]}></article>'
                    f'<article data-fixture-id="{none["fixtureId"]}" data-market="match-result">'
                    '<p data-prediction="none" data-outcome="unavailable"></p></article></main>')

        def read(origin, path):
            seen.append(path)
            headers = Message()
            headers["Cache-Control"] = "private, no-store"
            if "/insights" in path:
                value = {"access": access, "fixtureId": record["fixtureId"], "section": "news", "data": {"items": [{"kind": state["kind"]}]}}
            elif path == "/api/best-slips":
                value = {"day": "2026-10-09", "state": "odds-unavailable", "slips": []}
            elif path.startswith("/api/matches/"):
                value = {"access": access, "fixture": record, "history": {"gated": True}, "snapshot": {"gated": True},
                         "route": {"path": f'/en/matches/{record["fixtureId"]}/{record["slug"]}'}}
            elif path.startswith("/api/matches"):
                value = {"access": access, "records": [{**record, "forecast": record["forecast"] if state["forecast"] else None}, none]}
            elif path.startswith("/en/matches?") or path == "/en/matches":
                return Response(200, headers, cards())
            else:
                return Response(200, headers, "<main>Subscriber access</main>")
            return Response(200, headers, json.dumps(value))

        with patch.dict(paywall["verify"].__globals__, {"get": read}), redirect_stdout(io.StringIO()):
            paywall["verify"]("http://127.0.0.1")
            self.assertEqual(len(seen), 9)
            state["kind"] = "analysis"
            with self.assertRaises(AssertionError):
                paywall["verify"]("http://127.0.0.1")
            state.update(kind="report", card=' data-market="match-result"')
            with self.assertRaises(AssertionError):
                paywall["verify"]("http://127.0.0.1")
            state.update(card="", forecast=False)
            with self.assertRaises(AssertionError):
                paywall["verify"]("http://127.0.0.1")

    def test_requests_are_cookie_less_gets_and_set_cookie_is_rejected(self):
        observed = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                observed.append((self.command, self.headers.get("Cookie")))
                self.send_response(200)
                if self.path == "/cookie":
                    self.send_header("Set-Cookie", "synthetic=1")
                self.end_headers()
                self.wfile.write(b"ok")

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            self.assertEqual(get(origin, "/").status, 200)
            with self.assertRaises(AssertionError):
                get(origin, "/cookie")
            self.assertEqual(get(origin, "/").status, 200)
            self.assertEqual(observed, [("GET", None)] * 3)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
