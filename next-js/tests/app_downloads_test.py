import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.app_downloads import prepare_app_downloads
from lib.runtime import CommandError


class AppDownloadsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="goal-hint-publish-test-")
        self.directory = Path(self.temporary.name)
        self.packages = self.directory / "packages"
        self.packages.mkdir()

    def tearDown(self):
        self.temporary.cleanup()

    def package(self, channel="development", build=7, content=b"installer", suffix=".exe"):
        name = f"goal-hint-windows-1.0.0{'-dev' if channel == 'development' else ''}.zip"
        archive = self.packages / name
        metadata = {"platform": "windows", "environment": channel, "mode": "debug" if channel == "development" else "release",
                    "version": "1.0.0", "build": build, "artifactSha256": hashlib.sha256(content).hexdigest()}
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("download-manifest.json", json.dumps(metadata))
            bundle.writestr("Setup" + suffix, content)
        archive.with_suffix(".zip.sha256").write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + "  " + name)
        return archive

    def test_publishes_actual_files_and_metadata(self):
        self.package()
        root = prepare_app_downloads("development", self.directory / "downloads", self.packages)
        catalog = json.loads((root / "catalog.json").read_text())
        self.assertEqual(catalog["releases"][0]["build"], 7)
        self.assertEqual((root / "files/windows/1.0.0-7/Setup.exe").read_bytes(), b"installer")

    def test_production_never_promotes_development_archives(self):
        self.package()
        root = prepare_app_downloads("production", self.directory / "downloads", self.packages)
        self.assertEqual(json.loads((root / "catalog.json").read_text())["releases"], [])

    def test_bad_checksum_preserves_previous_catalog(self):
        archive = self.package()
        root = prepare_app_downloads("development", self.directory / "downloads", self.packages)
        previous = (root / "catalog.json").read_bytes()
        archive.write_bytes(b"damaged")
        with self.assertRaises(CommandError):
            prepare_app_downloads("development", root, self.packages)
        self.assertEqual((root / "catalog.json").read_bytes(), previous)

    def test_same_version_build_cannot_replace_an_installer(self):
        self.package()
        root = prepare_app_downloads("development", self.directory / "downloads", self.packages)
        self.package(content=b"different")
        with self.assertRaises(CommandError):
            prepare_app_downloads("development", root, self.packages)
        self.assertEqual((root / "files/windows/1.0.0-7/Setup.exe").read_bytes(), b"installer")

    def test_rejects_path_traversal_and_channel_reuse(self):
        self.package(suffix=".exe/../../malicious.exe")
        with self.assertRaises(CommandError):
            prepare_app_downloads("development", self.directory / "downloads", self.packages)
        self.package()
        root = prepare_app_downloads("development", self.directory / "downloads", self.packages)
        with self.assertRaises(CommandError):
            prepare_app_downloads("production", root, self.packages)

    def test_production_requires_valid_release_metadata(self):
        self.package("production")
        root = prepare_app_downloads("production", self.directory / "downloads", self.packages)
        self.assertEqual(json.loads((root / "catalog.json").read_text())["releases"][0]["platform"], "windows")


if __name__ == "__main__":
    unittest.main()
