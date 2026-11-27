import io
import os
from pathlib import Path
import runpy
import sys
import tempfile
from types import ModuleType
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
            with patch.dict(HOST["recover"].__globals__, {"smoke": Mock()}):
                HOST["recover"](target)
            target.activate.assert_called_once_with(previous)
            target.remove.assert_called_once_with(candidate)
            self.assertFalse(target.journal.exists())


if __name__ == "__main__":
    unittest.main()
