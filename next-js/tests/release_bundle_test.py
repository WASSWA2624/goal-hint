from hashlib import sha256
import json
from pathlib import Path
import sys
import tempfile
import unittest
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.release_bundle import Changes, ReleaseBundle, ReleaseBundleError


COMMIT = "a" * 40
MIGRATIONS = "b" * 64


class ReleaseBundleTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.archive = Path(directory.name) / "build.zip"
        self.checksum = self.archive.with_suffix(".zip.sha256")

    def write_archive(self, *, dirty=False, extra=None):
        files = {
            "BUILD_INFO.json": json.dumps({"commit": COMMIT, "uncommittedChanges": dirty,
                                            "migrations": MIGRATIONS}).encode(),
            "app.js": b"startup",
            "standalone/server.js": b"new server",
            "standalone/.next/BUILD_ID": b"new-build",
            "scripts/deploy-mariadb.py": b"migration runner",
            "standalone/node_modules/shared/index.js": b"shared dependency",
        }
        if extra is not None:
            files[extra] = b"unexpected file"
        with ZipFile(self.archive, "w") as package:
            package.writestr("goal-hint/", b"")
            for name, body in files.items():
                package.writestr("goal-hint/" + name, body)
        digest = sha256(self.archive.read_bytes()).hexdigest()
        self.checksum.write_text(f"{digest}  {self.archive.name}\n", encoding="ascii")
        return files, digest

    def test_delta_contains_only_added_and_modified_files(self):
        files, digest = self.write_archive()
        with ReleaseBundle(self.archive, commit=COMMIT) as release:
            target = {path: sha256(body).hexdigest() for path, body in files.items()}
            self.assertEqual(release.manifest, {"commit": COMMIT, "buildId": "new-build", "archiveSha256": digest,
                                               "migrations": MIGRATIONS, "files": target})
            self.assertEqual(release.changes(target), Changes((), (), ()))
            current = {**target, "standalone/server.js": "0" * 64, "standalone/obsolete.js": "1" * 64}
            del current["scripts/deploy-mariadb.py"]
            changes = release.changes(current)
            self.assertEqual(changes, Changes(("scripts/deploy-mariadb.py",), ("standalone/server.js",),
                                              ("standalone/obsolete.js",)))
            payload = self.archive.with_name("delta.zip")
            release.write_delta(payload, changes.writes)
        with ZipFile(payload) as delta:
            self.assertEqual({path: delta.read(path) for path in delta.namelist()},
                             {path: files[path] for path in changes.writes})

    def test_rejects_unapproved_or_tampered_builds(self):
        self.write_archive(dirty=True)
        with self.assertRaisesRegex(ReleaseBundleError, "clean checkout"), ReleaseBundle(self.archive, commit=COMMIT):
            self.fail("Accepted a dirty archive.")
        self.write_archive()
        with self.assertRaisesRegex(ReleaseBundleError, "clean checkout"), ReleaseBundle(self.archive, commit="c" * 40):
            self.fail("Accepted a different commit.")
        self.checksum.write_text(f"{'0' * 64}  {self.archive.name}\n", encoding="ascii")
        with self.assertRaisesRegex(ReleaseBundleError, "SHA-256"), ReleaseBundle(self.archive, commit=COMMIT):
            self.fail("Accepted a mismatched archive checksum.")

    def test_rejects_private_conflicting_and_traversing_paths(self):
        for path in ("standalone/.env.production", "standalone/a/../../outside", "standalone/server.js/child"):
            with self.subTest(path=path):
                self.write_archive(extra=path)
                with self.assertRaises(ReleaseBundleError), ReleaseBundle(self.archive, commit=COMMIT):
                    self.fail("Accepted an unsafe archive.")


if __name__ == "__main__":
    unittest.main()
