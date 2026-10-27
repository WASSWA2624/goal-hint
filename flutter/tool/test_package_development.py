from pathlib import Path
import tempfile
import unittest
import zipfile

import package_development as development


class DevelopmentPackagingTests(unittest.TestCase):
    def test_origin_rejects_credentials_and_non_origin_values(self):
        self.assertEqual(development.development_origin("http://192.168.1.148:3000/"), "http://192.168.1.148:3000")
        for value in ("http://user:secret@host", "https://host/path", "http://host?secret=x", "http://host:0", "http://bad%40host"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                development.development_origin(value)

    def test_development_apk_requires_debug_identity_and_signing(self):
        badging = "package: name='com.goalhint.goal_hint' versionCode='1' versionName='1.0.0'\napplication-debuggable"
        development.validate_debug_apk(badging, "CN=Android Debug", "1.0.0", "1")
        with self.assertRaises(ValueError):
            development.validate_debug_apk(badging, "CN=Production", "1.0.0", "1")
        with self.assertRaises(ValueError):
            development.validate_debug_apk(badging.replace("application-debuggable", ""), "CN=Android Debug", "1.0.0", "1")

    def test_manifest_origin_must_match_compiled_debug_kernel(self):
        with tempfile.TemporaryDirectory() as temporary:
            apk = Path(temporary) / "debug.apk"
            with zipfile.ZipFile(apk, "w") as archive:
                archive.writestr("assets/flutter_assets/kernel_blob.bin", b"fixture http://192.168.1.148:3000 compiled origin")
            development.validate_apk_origin(apk, "http://192.168.1.148:3000")
            with self.assertRaises(ValueError):
                development.validate_apk_origin(apk, "http://localhost:3000")


if __name__ == "__main__":
    unittest.main()
