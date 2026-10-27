"""Regression tests for native Python script behavior and backup interoperability."""
import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.backup_contract import BackupError, parse_backup_policy
from lib.backup_crypto import backup_text, decrypt_backup, seal_backup, verify_backup
from lib.backup_engine import validate_log_chain
from lib.rendering import create_fixture
from lib.runtime import node_binary


def load_script(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ScriptTests(unittest.TestCase):
    def test_rendering_fixture_limits_workers_and_preserves_build_checks(self):
        temporary = ROOT / ".tmp"
        temporary.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary) as directory:
            fixture = create_fixture("match-card", directory=Path(directory))
            source = """
const { default: config } = await import(process.argv[1]);
console.log(JSON.stringify({ workers: config.experimental.cpus,
  styledComponents: config.compiler.styledComponents,
  skipsTypechecking: config.typescript?.ignoreBuildErrors === true,
  root: config.turbopack.root }));
"""
            result = subprocess.run([node_binary(), "--input-type=module", "--eval", source,
                                     (fixture / "next.config.mjs").as_uri()], cwd=fixture,
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, "Generated acceptance configuration must load.")
            self.assertEqual(json.loads(result.stdout), {
                "workers": 1, "styledComponents": True, "skipsTypechecking": False, "root": str(ROOT),
            })
            self.assertEqual((fixture / "app/layout.tsx").read_text(encoding="utf-8"),
                             'export { default, metadata } from "@/app/layout";\n')

    def test_policy_requires_live_decisions_and_rejects_unknown_fields(self):
        policy = {"version": 1, "mode": "local-verification", "evidenceRef": "synthetic-proof", "owner": None,
                  "keyRef": "synthetic-key", "grantsRef": "synthetic-grants", "permissionsRef": "synthetic-permissions", "releaseRef": "synthetic-release",
                  "rpoMs": None, "rtoMs": None, "retention": None}
        self.assertEqual(parse_backup_policy(policy), policy)
        for invalid in ({**policy, "mode": "live"}, {**policy, "unexpected": True}, {**policy, "version": True}):
            with self.assertRaises(BackupError):
                parse_backup_policy(invalid)

    def test_artifacts_authenticate_before_output_and_cannot_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "snapshot.ghb"
            key, text = os.urandom(32), "Synthetic SQL without credentials.\n" * 10000
            options = {"key": key, "key_ref": "synthetic-key"}
            metadata = {"kind": "synthetic", "approval": "synthetic-proof"}
            seal_backup(artifact, backup_text(text), metadata=metadata, **options)
            original = artifact.read_bytes()
            self.assertNotIn(b"Synthetic SQL", original)
            self.assertEqual(verify_backup(artifact, **options), metadata)
            output = io.BytesIO()
            decrypt_backup(artifact, output, **options)
            self.assertEqual(output.getvalue(), text.encode())
            with self.assertRaises(BackupError):
                seal_backup(artifact, backup_text("overwrite"), metadata=metadata, **options)
            self.assertEqual(artifact.read_bytes(), original)
            for position in (0, 15, len(original) - 30, len(original) - 1):
                damaged = bytearray(original)
                damaged[position] ^= 1
                artifact.write_bytes(damaged)
                sink = io.BytesIO()
                with self.assertRaises(BackupError):
                    decrypt_backup(artifact, sink, **options)
                self.assertEqual(sink.getvalue(), b"")

    def test_backup_format_is_compatible_with_existing_operator_bindings(self):
        with tempfile.TemporaryDirectory() as directory:
            native, node = Path(directory) / "python.ghb", Path(directory) / "node.ghb"
            key = os.urandom(32)
            options = {"key": key, "key_ref": "synthetic-key"}
            seal_backup(native, backup_text("Synthetic Python backup."), metadata={"source": "python"}, **options)
            source = """
import assert from 'node:assert/strict';
import { backupText, sealBackup, verifyBackup } from './src/server/backup/backup-crypto.mjs';
const input = JSON.parse(await new Promise(resolve => { let value=''; process.stdin.on('data',chunk=>value+=chunk); process.stdin.on('end',()=>resolve(value)); }));
const options={key:Buffer.from(input.key,'hex'),keyRef:'synthetic-key'};
assert.deepEqual(await verifyBackup(input.native, options), {source:'python'});
await sealBackup(input.node,backupText('Synthetic Node backup.'),{...options,metadata:{source:'node'}});
"""
            result = subprocess.run([node_binary(), "--conditions=react-server", "--input-type=module", "--eval", source], cwd=ROOT,
                                    input=json.dumps({"key": key.hex(), "native": str(native), "node": str(node)}), capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, "Existing operator format interoperability failed.")
            self.assertEqual(verify_backup(node, **options), {"source": "node"})
            output = io.BytesIO()
            decrypt_backup(node, output, **options)
            self.assertEqual(output.getvalue(), b"Synthetic Node backup.")

    def test_binlog_chain_rejects_paths_gaps_and_backward_positions(self):
        snapshot = {"id": "synthetic-snapshot", "identity": {"uuid": "synthetic-server"}, "point": {"file": "binlog.000003", "position": 100, "at": 1000}, "policyHash": "synthetic-policy"}
        chain = {"kind": "mysql-recovery-point", "snapshotId": snapshot["id"], "identity": snapshot["identity"], "policyHash": snapshot["policyHash"],
                 "start": snapshot["point"], "end": {"file": "binlog.000004", "position": 200, "at": 2000},
                 "files": [{"name": f"binlog.{number:06d}", "artifact": f"binlog-{number}.ghb", "hash": "a" * 64} for number in (3, 4)]}
        validate_log_chain(snapshot, chain)
        for invalid in ({**chain, "files": chain["files"][1:]}, {**chain, "files": list(reversed(chain["files"]))},
                        {**chain, "files": [{**chain["files"][0], "artifact": "../private"}, chain["files"][1]]},
                        {**chain, "end": {"file": "binlog.000003", "position": 90, "at": 2000}, "files": chain["files"][:1]}):
            with self.assertRaises(BackupError):
                validate_log_chain(snapshot, invalid)

    def test_cpanel_zip_has_portable_permissions_and_rejects_environment_files(self):
        packager = load_script("package-cpanel")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "bundle"
            root.mkdir()
            (root / "app.js").write_text("Synthetic startup fixture.")
            (root / ".env.example").write_text("SYNTHETIC=example")
            target = Path(directory) / "bundle.zip"
            self.assertEqual(packager.write_zip(root, target), 2)
            with zipfile.ZipFile(target) as archive:
                self.assertEqual(archive.read("goal-hint/app.js"), b"Synthetic startup fixture.")
                self.assertEqual(archive.getinfo("goal-hint/app.js").external_attr >> 16, 0o100644)
                self.assertTrue(all("\\" not in name for name in archive.namelist()))
            (root / ".env.local").write_text("SYNTHETIC=private")
            original = target.read_bytes()
            with self.assertRaises(packager.CommandError):
                packager.write_zip(root, target)
            self.assertEqual(target.read_bytes(), original)
            (root / ".env.local").unlink()
            private = root / ".private"
            private.mkdir()
            (private / "operator.json").write_text("Synthetic private operator state.")
            with self.assertRaises(packager.CommandError):
                packager.write_zip(root, target)
            self.assertEqual(target.read_bytes(), original)

    def test_deployment_defaults_use_repository_release_and_private_directories(self):
        deployer = load_script("deploy-cpanel")
        self.assertEqual(deployer.ZIP, ROOT.parent / "deploy/goal-hint-nextjs-1.0.0.zip")
        for name, path in deployer.LOCAL_CONFIG.items():
            self.assertEqual(path, ROOT.parent / "deploy/.private/nextjs" / name)

    def test_web_publication_checksums_and_cleans_staging_after_failed_copy(self):
        packager = load_script("package-cpanel")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "built.zip"
            source.write_bytes(b"Synthetic completed archive.")
            target = root / "deploy/goal-hint-nextjs-1.0.0.zip"
            packager.publish_zip(source, target)
            self.assertEqual(target.read_bytes(), source.read_bytes())
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            checksum = target.with_suffix(".zip.sha256")
            self.assertEqual(checksum.read_text(encoding="ascii"), f"{digest}  {target.name}\n")
            self.assertEqual(list((target.parent / ".staging").iterdir()), [])
            with mock.patch.object(packager.shutil, "copyfile", side_effect=OSError("Synthetic failed copy")):
                with self.assertRaises(OSError):
                    packager.publish_zip(source, target)
            self.assertEqual(target.read_bytes(), source.read_bytes())
            self.assertEqual(checksum.read_text(encoding="ascii"), f"{digest}  {target.name}\n")
            self.assertEqual(list((target.parent / ".staging").iterdir()), [])

    def test_brand_geometry_matches_committed_symbol_paths(self):
        import xml.etree.ElementTree as ET
        generator = load_script("generate-brand")
        brand = generator.Brand()
        actual = ET.fromstring(generator.svg(160, 160, "Synthetic geometry", brand.mark()))
        expected = ET.parse(ROOT / "public/brand/goal-hint-mark-primary.svg").getroot()
        paths = lambda root: [element.attrib.get("d") for element in root.iter() if element.tag.endswith("path")]
        self.assertEqual(paths(actual), paths(expected))
        from urllib.parse import unquote
        inline = (ROOT / "src/components/ui/brand-inline.ts").read_text(encoding="utf-8")
        uri = json.loads(inline.split(" = ", 1)[1].strip().removesuffix(";"))
        self.assertEqual(unquote(uri.removeprefix("data:image/svg+xml,")),
                         generator.raw_svg((ROOT / "public/brand/goal-hint-logo-inverse.svg").read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
