"""Dependency-free checks for native release archive boundaries."""

from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import package_release as release


class PackagingTests(unittest.TestCase):
    def test_apk_identity_and_debug_signing_are_rejected(self):
        good = "package: name='com.goalhint.goal_hint' versionCode='1' versionName='1.0.0'"
        release.validate_apk(good, "Signer #1 certificate DN: CN=Goal Hint", "1.0.0", "1")
        for badging, certificate in [
            (good, "Signer #1 certificate DN: CN=Android Debug,O=Android,C=US"),
            (good + "\napplication-debuggable", "CN=Goal Hint"),
            (good.replace("1.0.0", "0.1.0"), "CN=Goal Hint"),
            (good.replace("goal_hint", "another_app"), "CN=Goal Hint"),
        ]:
            with self.subTest(badging=badging, certificate=certificate), self.assertRaises(ValueError):
                release.validate_apk(badging, certificate, "1.0.0", "1")

    def test_archive_is_complete_and_failed_replacement_preserves_previous(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "deploy"
            output.mkdir()
            staging = root / "staging"
            staging.mkdir()
            artifact = root / "signed.apk"
            artifact.write_bytes(b"synthetic archive fixture; not an executable")
            with patch.object(release, "DEPLOY", output):
                target = release.publish(artifact, "android", "1.0.0", staging, False)
                before = target.read_bytes()
                with zipfile.ZipFile(target) as archive:
                    self.assertEqual(set(archive.namelist()), {"goal-hint-android-1.0.0.apk", "README.txt"})
                    self.assertEqual(archive.read("goal-hint-android-1.0.0.apk"), artifact.read_bytes())
                    self.assertIsNone(archive.testzip())
                self.assertTrue(target.with_suffix(".zip.sha256").is_file())
                with self.assertRaises(FileExistsError):
                    release.publish(artifact, "android", "1.0.0", staging, False)
                with patch.object(zipfile.ZipFile, "write", side_effect=OSError("simulated disk failure")):
                    with self.assertRaises(OSError):
                        release.publish(artifact, "android", "1.0.0", staging, True)
                self.assertEqual(target.read_bytes(), before)

    def test_development_ios_export_is_rejected_before_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = root / "ExportOptions.plist"
            options.write_bytes(plistlib.dumps({"method": "development"}))
            with patch.object(release, "run") as command:
                with self.assertRaises(ValueError):
                    release.build_ios("flutter", options, root, "1.0.0", "1")
                command.assert_not_called()

    def test_apple_host_is_required(self):
        with patch.object(release.sys, "platform", "win32"), self.assertRaises(ValueError):
            release.check_apple_host()

    def test_ios_success_without_new_export_cannot_publish_stale_ipa(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old = root / "build/ios/ipa/previous.ipa"
            old.parent.mkdir(parents=True)
            old.write_bytes(b"previous signed IPA fixture")
            (root / "build/ios/archive/Runner.xcarchive").mkdir(parents=True)
            staging = root / "staging"
            staging.mkdir()
            options = root / "ExportOptions.plist"
            options.write_bytes(plistlib.dumps({"method": "app-store-connect"}))
            with patch.object(release, "PROJECT", root), patch.object(release, "run", return_value="") as command:
                with self.assertRaisesRegex(ValueError, "freshly exported IPA"):
                    release.build_ios("flutter", options, staging, "1.0.0", "1")
                self.assertEqual(command.call_args_list[1].args[:2], ("xcodebuild", "-exportArchive"))
                self.assertTrue(old.is_file())

    def test_missing_android_signing_stops_before_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(release, "PROJECT", Path(temporary)), patch.dict(release.os.environ, {}, clear=True):
                with patch.object(release, "run") as command:
                    with self.assertRaises(ValueError):
                        release.build_android("flutter", "1.0.0", "1")
                    command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
