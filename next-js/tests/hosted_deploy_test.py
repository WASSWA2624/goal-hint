import io
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile


def receiver():
    path = Path(__file__).resolve().parents[1] / "scripts/receive-hosted.py"
    if os.name == "nt":
        with patch.dict(sys.modules, {name: ModuleType(name) for name in ("fcntl", "pwd")}):
            return runpy.run_path(str(path))
    return runpy.run_path(str(path))


HOST = receiver()


def delta(entries):
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        for name, value in entries.items():
            archive.writestr(name, value)
    body = payload.getvalue()
    return io.BytesIO(f'{{"bytes":{len(body)}}}\n'.encode() + body)


class HostedDeployTest(unittest.TestCase):
    def test_matches_smoke_verifies_browser_headers_and_the_accepted_list(self):
        target = SimpleNamespace(host="test.goalhint.com", environment="staging")
        matches = b'<header data-app-navigation="matches"></header><main data-feed-match-results="">'
        ready = b'<section data-feed-performance-state="ready">build-fixture</section></main>'
        deferred = b'<section data-feed-performance-state="loading" data-feed-performance-deferred="true">build-fixture</section>'
        headers = b"HTTP/2 200\r\nX-Robots-Tag: noindex\r\n\r\n"
        marker = HOST["FIRST_BYTE_MARKER"]
        run = Mock(return_value=SimpleNamespace(returncode=0, stdout=headers + matches + ready + marker + b"1.25"))
        request = HOST["smoke_request"]
        with patch.object(request.__globals__["subprocess"], "run", run):
            self.assertIsNone(request(target, "/en/matches", "build-fixture", None))
            args = run.call_args.args[0]
            self.assertIn("Sec-Fetch-Mode: navigate", args)
            self.assertIn("Sec-Fetch-Dest: document", args)
            self.assertEqual(args[args.index("--max-time") + 1], "40")
            self.assertEqual(run.call_args.kwargs["timeout"], 41)
            run.return_value.stdout = headers + matches + deferred + marker + b"1.25"
            self.assertIsNone(request(target, "/en/matches", "build-fixture", None))
            self.assertEqual(request(target, "/en/matches", "build-fixture", None, legacy_rollback=True),
                             "Matches summary shell unavailable")
            run.return_value.stdout = headers + matches + deferred.replace(b' data-feed-performance-deferred="true"', b'') + marker + b"1.25"
            self.assertEqual(request(target, "/en/matches", "build-fixture", None), "Matches summary shell unavailable")

            run.return_value.stdout = headers + matches + ready + marker + b"16.1"
            self.assertEqual(request(target, "/en/matches", "build-fixture", None), "browser header deadline")
            self.assertIsNone(request(target, "/en/matches", "build-fixture", None, legacy_rollback=True))
            run.return_value.stdout = headers + matches + ready + b'<div data-feed-list-recovery="">' + marker + b"1.25"
            self.assertEqual(request(target, "/en/matches", "build-fixture", None), "Matches list unavailable")
            run.return_value.stdout = headers + matches.replace(b"data-feed-match-results", b'data-feed-list-state="data-unavailable" data-feed-match-results') + ready + marker + b"1.25"
            self.assertIsNone(request(target, "/en/matches", "build-fixture", None))
            production = SimpleNamespace(host=target.host, environment="production")
            self.assertEqual(request(production, "/en/matches", "build-fixture", None), "Matches fixture coverage unavailable")
            run.return_value.stdout = headers + matches + b"build-fixture" + marker + b"1.25"
            self.assertEqual(request(target, "/en/matches", "build-fixture", None), "Matches summary shell unavailable")
            run.return_value.stdout = b"HTTP/2 200\r\n\r\n" + matches + ready + marker + b"1.25"
            self.assertEqual(request(target, "/en/matches", "build-fixture", None), "missing staging noindex")
            run.return_value.returncode = 28
            self.assertEqual(request(target, "/en/matches", "build-fixture", None), "request deadline")

    def test_today_summary_requires_coherent_public_counts_and_generation(self):
        summary = {"performance": {"total": 4, "won": 1, "pending": 2, "lost": 0, "void": 0, "unavailable": 1},
                   "asOf": 1795848819630, "paginationVersion": "a" * 64, "access": {"tier": "free", "signedIn": False}}
        healthy = HOST["healthy_today_summary"]
        self.assertTrue(healthy(json.dumps(summary).encode()))
        self.assertFalse(healthy(json.dumps({**summary, "paginationVersion": None}).encode()))
        self.assertFalse(healthy(json.dumps({**summary, "performance": {**summary["performance"], "won": 2}}).encode()))
        self.assertFalse(healthy(json.dumps({**summary, "access": {"tier": "full", "signedIn": True}}).encode()))
        self.assertFalse(healthy(b"bad json"))

    def test_cutover_browser_confirmation_requires_an_explicit_success_before_receipt(self):
        verify = HOST["require_browser_verification"]
        state = verify.__globals__
        send = Mock()
        stream = io.BytesIO()
        with patch.dict(state, {"send": send}), patch.object(state["select"], "select") as select:
            verify({}, stream)
            send.assert_not_called()
            select.return_value = ([stream], [], [])
            verify({"verifyBrowser": True}, io.BytesIO(b'{"browserVerified":true}\n'))
            send.assert_called_once_with(ok=True, verifyBrowser=True)
            with self.assertRaisesRegex(HOST["DeploymentError"], "browser readiness verification failed"):
                verify({"verifyBrowser": True}, io.BytesIO(b'{"browserVerified":false}\n'))
            select.return_value = ([], [], [])
            with self.assertRaisesRegex(HOST["DeploymentError"], "browser readiness verification timed out"):
                verify({"verifyBrowser": True}, stream)

    def test_rejected_browser_check_leaves_previous_release_available_for_rollback(self):
        install = HOST["install"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = root / "live-0123456789abcdefabcd"
            previous.mkdir()
            target = Mock(releases=root, journal=root / "journal.json", uid=0, gid=0)
            manifest = {"archiveSha256": "a" * 64}
            rollback = Mock()
            browser = Mock(side_effect=HOST["DeploymentError"]("browser rejected"))
            dependencies = {"stage_delta": Mock(), "install_settings": Mock(), "verify_schema": Mock(), "smoke": Mock(),
                            "require_browser_verification": browser, "recover": rollback}
            with patch.dict(install.__globals__, dependencies), patch.object(os, "chown", create=True):
                with self.assertRaisesRegex(HOST["DeploymentError"], "browser rejected"):
                    install(target, previous, manifest, {}, {"app.js"}, {"node": str(root / "node")}, io.BytesIO())
            rollback.assert_called_once_with(target)
            target.remove.assert_not_called()
            self.assertTrue(previous.is_dir())
            self.assertFalse((root / ("live-" + "a" * 20) / HOST["RECEIPT"]).exists())

    def test_today_smoke_rejects_false_success_and_allows_sparse_staging_coverage(self):
        feed = {"state": "ready", "records": [{}], "page": 1, "pageSize": 1, "total": 14,
                "today": "2026-11-28", "range": {"from": "2026-11-28", "to": "2026-11-28"},
                "access": {"tier": "free", "signedIn": False}}
        healthy = HOST["healthy_today_feed"]

        def body(**changes):
            return json.dumps({**feed, **changes}).encode()

        self.assertTrue(healthy(body(), "production"))
        self.assertFalse(healthy(body(records=[]), "production"))
        self.assertFalse(healthy(body(records=[{}, {}]), "production"))
        self.assertFalse(healthy(body(access={"tier": "full", "signedIn": True}), "production"))
        self.assertFalse(healthy(body(today="2026-11-27"), "production"))
        sparse = body(state="data-unavailable", records=[], total=0, coverage={"partial": True, "knownFixtures": 0})
        self.assertTrue(healthy(sparse, "staging"))
        self.assertFalse(healthy(sparse, "production"))
        self.assertTrue(healthy(body(state="no-fixtures", records=[], total=0), "production"))

    def test_delta_links_unchanged_files_and_omits_obsolete_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current, expected, stage = (root / name for name in ("current", "expected", "stage"))
            for folder in (current, expected, stage):
                folder.mkdir()
            (current / "app.js").write_bytes(b"same")
            (current / "DEPLOY.md").write_bytes(b"obsolete")
            (expected / "app.js").write_bytes(b"same")
            (expected / "package.json").write_bytes(b"new")
            files = HOST["scan"](expected)
            with patch.object(os, "chown", create=True):
                HOST["stage_delta"](delta({"package.json": b"new"}), stage, current, files, {"package.json"}, 0, 0)
            self.assertEqual(HOST["scan"](stage), files)
            self.assertTrue((current / "app.js").samefile(stage / "app.js"))
            self.assertEqual((current / "DEPLOY.md").read_bytes(), b"obsolete")

    def test_delta_refuses_unexpected_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory)
            with self.assertRaisesRegex(HOST["DeploymentError"], "agreed changes"):
                HOST["stage_delta"](delta({"../app.js": b"wrong"}), stage, stage, {"app.js": ""}, {"app.js"}, 0, 0)
            self.assertEqual(list(stage.iterdir()), [])

    def test_interrupted_cutover_reselects_previous_before_cleaning_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Mock()
            target.releases = Path(directory)
            target.journal = target.releases / "journal.json"
            previous = target.releases / "01234567-staging"
            candidate = target.releases / "live-0123456789abcdefabcd"
            candidate.mkdir()
            target.current.return_value = candidate
            target.release.return_value = previous
            HOST["write_json"](target.journal, {"previous": previous.name, "candidate": candidate.name})
            smoke = Mock()
            with patch.dict(HOST["recover"].__globals__, {"smoke": smoke}):
                HOST["recover"](target)
            target.activate.assert_called_once_with(previous)
            smoke.assert_called_once_with(target, previous, legacy_rollback=True)
            target.remove.assert_called_once_with(candidate)
            self.assertFalse(target.journal.exists())


if __name__ == "__main__":
    unittest.main()
