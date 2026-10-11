"""Opt-in native Python backup round trip on a new owned genuine MySQL datadir."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.backup_engine import archive_owned_mysql_logs, capture_mysql_snapshot, with_restored_mysql
from lib.isolated_mysql import MysqlServerUnavailableError, start_isolated_mysql
from lib.mysql_backup import owned_mysql_source


class NativeMysqlIntegration(unittest.TestCase):
    def test_snapshot_and_multilog_replay_restore_verified_inventory_on_a_fresh_owned_server(self):
        try:
            instance = start_isolated_mysql(binary_log=True)
        except MysqlServerUnavailableError as error:
            self.skipTest(str(error))
        temporary = (ROOT / ".tmp").resolve()
        directory = Path(tempfile.mkdtemp(prefix="python-backup-", dir=temporary)).resolve()
        marker, ownership = directory / ".owner", str(uuid.uuid4())
        marker.write_text(ownership, encoding="utf-8")
        policy = {"version": 1, "mode": "local-verification", "evidenceRef": "synthetic-python-proof", "owner": None,
                  "keyRef": "synthetic-key", "grantsRef": "synthetic-grants", "permissionsRef": "synthetic-permissions", "releaseRef": "synthetic-release",
                  "rpoMs": None, "rtoMs": None, "retention": None}
        events = []
        authority = SimpleNamespace(verify_policy=lambda value: value == policy, authorize=lambda operation: True,
                                    verify_storage=lambda target, value: Path(target).resolve().parent == directory and marker.read_text(encoding="utf-8") == ownership)
        try:
            secrets = {"DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"}
            environment = {key: value for key, value in os.environ.items() if not key.startswith(("GOAL_HINT_", "NEXT_PUBLIC_")) and key not in secrets}
            environment.update(NODE_ENV="test", DEBUG="", NODE_DEBUG="", NODE_DEBUG_NATIVE="", GOAL_HINT_OPERATION_SCOPE="disabled", GOAL_HINT_DATABASE_ENABLED="true",
                               TEST_DATABASE_URL=instance.url, MIGRATION_DATABASE_URL=instance.url, GOAL_HINT_DATABASE_CONNECTION_MODE="direct", GOAL_HINT_DATABASE_POOL_LIMIT="2",
                               GOAL_HINT_DATABASE_TLS_MODE="disabled", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS="1000", GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS="2000")
            deployment = subprocess.run([sys.executable, str(ROOT / "scripts/database.py"), "deploy"], cwd=ROOT, env=environment, capture_output=True, text=True, timeout=120)
            self.assertEqual(deployment.returncode, 0, "Synthetic owned database deployment failed; private diagnostics are withheld.")
            instance.execute_admin("CREATE TABLE python_backup_probe (id INT PRIMARY KEY, value VARCHAR(64) NOT NULL) ENGINE=InnoDB; INSERT INTO python_backup_probe VALUES (1,'synthetic-python-roundtrip')")
            source = owned_mysql_source(instance)
            options = {"source": source, "policy": policy, "authority": authority, "key": os.urandom(32), "directory": directory / "artifacts", "emit": events.append}
            snapshot = capture_mysql_snapshot(options)
            self.assertEqual(snapshot["metadata"]["kind"], "mysql-snapshot")
            instance.execute_admin("UPDATE python_backup_probe SET value='synthetic-python-corrected' WHERE id=1; FLUSH BINARY LOGS; INSERT INTO python_backup_probe VALUES (2,'synthetic-python-next-log')")
            recovery = archive_owned_mysql_logs({**options, "snapshot": snapshot})
            self.assertGreaterEqual(len(recovery["metadata"]["files"]), 2)
            restored = with_restored_mysql({**options, "pitr": True}, lambda target: target["target"].query("SELECT value FROM python_backup_probe ORDER BY id"))
            self.assertEqual(restored["result"], ["synthetic-python-corrected", "synthetic-python-next-log"])
            self.assertEqual(restored["recoverablePosition"], {key: recovery["metadata"]["end"][key] for key in ("file", "position")})
            self.assertEqual([event["status"] for event in events], ["succeeded", "succeeded", "succeeded"])
        finally:
            instance.stop()
            # Remove only this fixture's verified immediate child of .tmp.
            self.assertEqual(directory.resolve().parent, temporary)
            self.assertTrue(directory.name.startswith("python-backup-"))
            self.assertEqual(marker.read_text(encoding="utf-8"), ownership)
            shutil.rmtree(directory)


if __name__ == "__main__":
    unittest.main()
