"""Exercise the real Windows setup host without installing anything."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


@unittest.skipUnless(os.name == "nt", "The setup executable requires Windows.")
class SetupBootstrapTests(unittest.TestCase):
    def compile_setup(self, root: Path, entries: dict[str, bytes]) -> Path:
        payload = root / "payload.zip"
        with zipfile.ZipFile(payload, "w") as archive:
            for path, contents in entries.items():
                archive.writestr(path, contents)
        compiler = Path(os.environ["SystemRoot"]) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
        executable = root / "setup.exe"
        subprocess.run([str(compiler), "/nologo", "/target:exe", f"/out:{executable}",
                        "/reference:System.IO.Compression.dll", f"/resource:{payload},GoalHint.Payload",
                        str(Path(__file__).parent / "windows/setup-bootstrap.cs")], check=True, capture_output=True)
        return executable

    def test_extract_only_does_not_run_installer_and_preserves_existing_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            script = b'throw "Extraction must never invoke the installer"'
            executable = self.compile_setup(root, {"payload/install.ps1": script})
            destination = root / "extracted"
            result = subprocess.run([str(executable), f"/extract:{destination}"], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((destination / "payload/install.ps1").read_bytes(), script)
            result = subprocess.run([str(executable), f"/extract:{destination}"], capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual((destination / "payload/install.ps1").read_bytes(), script)

    def test_zip_traversal_is_rejected_before_writing_outside_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            executable = self.compile_setup(root, {"../outside.txt": b"must not escape"})
            result = subprocess.run([str(executable), f"/extract:{root / 'extracted'}"], capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse((root / "outside.txt").exists())


if __name__ == "__main__":
    unittest.main()
