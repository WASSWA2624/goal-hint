"""Pure helper checks; no production server, account, database or browser is used."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts/serve-offline-proxy.py"
SPEC = importlib.util.spec_from_file_location("offline_proxy", SOURCE)
proxy = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = proxy
SPEC.loader.exec_module(proxy)


def resources():
    body, script = b"<html><body data-offline-view>Connection page</body></html>", b"void 0;"
    entry = {"url": "/offline", "sha256": proxy.digest(body), "bytes": len(body)}
    asset = {"url": "/_next/static/chunks/fixture-a.js", "sha256": proxy.digest(script), "bytes": len(script)}
    branding = {
        f"/brand/goal-hint-{kind}-{variant}.svg": f'<svg data-brand="{kind}-{variant}"/>'.encode()
        for kind in ["logo", "mark", "header"] for variant in ["primary", "inverse"]
    }
    brand_assets = [{"url": path, "sha256": proxy.digest(content), "bytes": len(content)} for path, content in branding.items()]
    manifest = {"schemaVersion": 2, "entry": entry, "assets": [asset, *brand_assets], "createdAt": 1000}
    manifest["version"] = proxy.digest(proxy.json_bytes(proxy.canonical_manifest(manifest)))
    return {
        "/en": proxy.Resource(b"<main data-offline-fixture>Isolated fixture</main>", {}),
        "/offline": proxy.Resource(body, {"content-type": "text/html", "cache-control": "public, max-age=0"}),
        asset["url"]: proxy.Resource(script, {"content-type": "application/javascript", "cache-control": "public, max-age=0"}),
        **{path: proxy.Resource(content, {"content-type": "image/svg+xml"}) for path, content in branding.items()},
        "/offline-manifest.json": proxy.Resource(proxy.json_bytes(manifest), {"x-goalhint-offline-manifest": "1"}),
    }


class OfflineProxyTest(unittest.TestCase):
    def test_loopback_fetch_ignores_environment_proxy_configuration(self):
        response = MagicMock()
        response.read.return_value = b"owned fixture"
        response.status = 200
        response.headers = {"content-type": "text/html"}
        response.__enter__.return_value = response
        with patch.dict(os.environ, {"HTTP_PROXY": "http://must-not-be-used.invalid:8080", "NO_PROXY": ""}), \
                patch.object(proxy, "build_opener") as opener:
            opener.return_value.open.return_value = response
            self.assertEqual(proxy.fetch_backend("http://127.0.0.1:3189", "/en").body, b"owned fixture")
            handler = opener.call_args.args[0]
            self.assertIsInstance(handler, proxy.UrlProxyHandler)
            self.assertEqual(handler.proxies, {})

    def test_derived_bundle_adds_required_asset_without_fixture_data(self):
        source = resources()
        with patch.object(proxy, "fetch_backend", side_effect=lambda origin, path: source[path]):
            bundles = proxy.derive_bundles("http://127.0.0.1:3189")
        a = json.loads(bundles["A"]["/offline-manifest.json"].body)
        b = json.loads(bundles["B"]["/offline-manifest.json"].body)
        self.assertNotEqual(a["version"], b["version"])
        self.assertEqual(b["version"], proxy.digest(proxy.json_bytes(proxy.canonical_manifest(b))))
        self.assertEqual(b["createdAt"], a["createdAt"] + 1)
        self.assertNotIn(proxy.NEW_ASSET, bundles["A"])
        self.assertIn(proxy.NEW_ASSET, bundles["B"])
        self.assertEqual(bundles["A"]["/offline"].body, bundles["B"]["/offline"].body)
        for path, resource in source.items():
            if path.startswith("/brand/"):
                for generation in ["A", "B"]:
                    self.assertEqual(bundles[generation][path].body, resource.body)
        for generation in ["A", "B"]:
            self.assertFalse(any(path.startswith("/api/") for path in bundles[generation]))

    def test_wrong_backend_mismatched_assets_and_unapproved_fields_fail_closed(self):
        for change in ["backend", "asset", "manifest"]:
            source = resources()
            if change == "backend":
                source["/en"] = proxy.Resource(b"A real app is not an owned fixture.", {})
            elif change == "asset":
                source["/_next/static/chunks/fixture-a.js"] = proxy.Resource(b"corrupted", {})
            else:
                data = json.loads(source["/offline-manifest.json"].body)
                data["records"] = ["unexpected fixture projection"]
                source["/offline-manifest.json"] = proxy.Resource(proxy.json_bytes(data), {"x-goalhint-offline-manifest": "1"})
            with self.subTest(change=change), patch.object(proxy, "fetch_backend", side_effect=lambda origin, path: source[path]):
                with self.assertRaises(ValueError):
                    proxy.derive_bundles("http://127.0.0.1:3189")

    def test_control_bounds_and_owned_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            control = Path(folder) / "control.json"
            proxy.atomic_json(control, {"generation": "B", "fault": {"target": "asset", "mode": "stall-body"}, "authState": "expired"})
            self.assertEqual(proxy.load_control(control)["fault"]["delayMs"], 12000)
            for value in [{"generation": "C"}, {"authState": "administrator"}, {"private": True},
                          {"fault": {"target": "unknown", "mode": "503"}},
                          {"fault": {"target": "asset", "mode": "stall-body", "delayMs": 30001}}]:
                proxy.atomic_json(control, value)
                with self.assertRaises(ValueError):
                    proxy.load_control(control)
        self.assertEqual(proxy.owned_path(proxy.ROOT / ".tmp/control.json"), (proxy.ROOT / ".tmp/control.json").resolve())
        with self.assertRaises(ValueError):
            proxy.owned_path(proxy.ROOT / ".tmp/../.env.local")

    def test_counters_survive_restart_without_recording_credentials_or_bodies(self):
        source = resources()
        with tempfile.TemporaryDirectory() as folder, patch.object(proxy, "fetch_backend", side_effect=lambda origin, path: source[path]):
            root = Path(folder)
            arguments = ("http://127.0.0.1:3189", root, 3192, root / "control.json", root / "stats.json")
            state = proxy.FixtureState(*arguments)
            versions = state.stats["versions"]
            self.assertNotEqual(versions["A"], versions["B"])
            first = state.begin("GET", "/en", "document", proxy.load_control(state.control))
            state.finish(first, 200, False, time.monotonic())
            state.begin("POST", "/api/account/fixture", "private", proxy.load_control(state.control))
            restored = proxy.FixtureState(*arguments)
            self.assertEqual(restored.stats["versions"], versions)
            self.assertEqual(restored.stats["boots"], 2)
            self.assertEqual(restored.stats["sequence"], 2)
            self.assertEqual(restored.stats["writes"], 1)
            self.assertEqual(restored.stats["active"], 0)
            self.assertTrue(restored.stats["events"][-1]["restartAborted"])
            third = restored.begin("GET", "/offline-manifest.json", "manifest", proxy.load_control(restored.control))
            restored.finish(third, 200, False, time.monotonic())
            self.assertEqual(restored.stats["sequence"], 3)
            self.assertEqual(restored.stats["writes"], 1)
            for event in restored.stats["events"]:
                self.assertNotIn("headers", event)
                self.assertNotIn("body", event)
                self.assertNotIn("cookies", event)

    def test_categories_distinguish_new_asset_documents_and_rsc(self):
        self.assertEqual(proxy.category_for(proxy.NEW_ASSET, {}), "asset")
        self.assertEqual(proxy.category_for("/_next/static/chunks/old.js", {}), "static")
        self.assertEqual(proxy.category_for("/en", {}), "document")
        self.assertEqual(proxy.category_for("/en", {"RSC": "1"}), "rsc")
        self.assertEqual(proxy.category_for("/api/account/fixture", {}), "private")


if __name__ == "__main__":
    unittest.main()
