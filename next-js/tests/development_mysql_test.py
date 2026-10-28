"""Restart only the verified demo owner, preserving its persistent database."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib import development_mysql as module
from lib.runtime import CommandError


def record(pid, ppid=0, command="", name="python.exe", started="original"):
    return {"pid": pid, "ppid": ppid, "command": command, "name": name, "started": started}


class DevelopmentMysqlOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.owner = record(os.getpid(), command="python scripts/development.py")

    def make_instance(self):
        instance = module.DevelopmentMysql.__new__(module.DevelopmentMysql)
        instance.directory = self.root / ".goal-hint/development-demo"
        instance.directory.mkdir(parents=True, exist_ok=True)
        instance.datadir = instance.directory / "mysql"
        instance.state_file = instance.directory / "launcher.json"
        instance.client = Path("mysql")
        instance.admin = Path("mysqladmin")
        (instance.directory / "owner.txt").write_text("goal-hint-development-demo-v1\n", encoding="utf-8")
        return instance

    def mysql(self, instance, pid=700, ppid=600):
        return record(pid, ppid, f'mysqld --datadir="{instance.datadir}" --port=43210', "mysqld.exe")

    def test_stale_lock_file_is_reused_without_growing_or_deleting_data(self):
        instance = self.make_instance()
        instance.datadir.mkdir()
        data = instance.datadir / "preserve.ibd"
        data.write_bytes(b"existing demo tables")
        lock = instance.directory / "server.lock"
        lock.write_bytes(b"1legacy")
        with patch.object(module, "ROOT", self.root), \
                patch.object(module.DevelopmentMysql, "discover_binary", return_value=Path("mysqld")), \
                patch.object(module.DevelopmentMysql, "start"), \
                patch.object(module, "process_record", return_value=self.owner):
            with module.DevelopmentMysql() as running:
                state = json.loads(running.state_file.read_text(encoding="utf-8"))
                self.assertEqual(state["launcher"], {"pid": os.getpid(), "started": "original"})
                self.assertNotIn("command", state["launcher"])
            self.assertFalse(instance.state_file.exists())
        self.assertEqual(lock.read_bytes(), b"1legacy")
        self.assertEqual(data.read_bytes(), b"existing demo tables")

    def test_prepare_commands_do_not_replace_an_active_database_owner(self):
        with patch.object(module, "ROOT", self.root), \
                patch.object(module.DevelopmentMysql, "discover_binary", return_value=Path("mysqld")), \
                patch.object(module.DevelopmentMysql, "start"), \
                patch.object(module, "process_record", return_value=self.owner), \
                patch.object(module.DevelopmentMysql, "_replace_previous") as replace:
            with module.DevelopmentMysql() as first:
                expected = first.state_file.read_bytes()
                with self.assertRaisesRegex(CommandError, "already in use"):
                    module.DevelopmentMysql()
                self.assertEqual(first.state_file.read_bytes(), expected)
            replace.assert_not_called()

    def test_replacement_acquired_lock_is_not_acquired_again_by_constructor(self):
        def replace(instance, *, lock_held):
            self.assertTrue(lock_held)
            instance.locked = True

        with patch.object(module, "ROOT", self.root), \
                patch.object(module.DevelopmentMysql, "discover_binary", return_value=Path("mysqld")), \
                patch.object(module.DevelopmentMysql, "start"), \
                patch.object(module, "process_record", return_value=self.owner), \
                patch.object(module.DevelopmentMysql, "_try_lock", return_value=False) as acquire, \
                patch.object(module.DevelopmentMysql, "_replace_previous", replace):
            with module.DevelopmentMysql(replace_running=True):
                pass
        acquire.assert_called_once()

    def test_exact_datadir_filters_out_installed_mysql_services(self):
        instance = self.make_instance()
        owned = self.mysql(instance)
        service = record(800, 1, 'mysqld --datadir="C:/installed/mysql/data" --port=3306', "mysqld.exe")
        other = record(801, 1, f'node --datadir="{instance.datadir}" --port=43210', "node.exe")
        self.assertEqual(instance._owned_mysql([owned, service, other]), [owned])

    def test_mysql_arguments_accept_quoted_values_and_whole_quoted_arguments(self):
        for command, expected in [
            ('mysqld --datadir="D:\\folder with spaces\\mysql" --port=43210', 'D:\\folder with spaces\\mysql'),
            ('mysqld "--datadir=D:\\folder with spaces\\mysql" --port=43210', 'D:\\folder with spaces\\mysql'),
            ("mysqld '--datadir=/folder with spaces/mysql' --port=43210", '/folder with spaces/mysql'),
            ("mysqld --datadir '/folder with spaces/mysql' '--port=43210'", '/folder with spaces/mysql'),
            ('mysqld --datadir=/folder/mysql "--port=43210"', '/folder/mysql'),
        ]:
            with self.subTest(command=command):
                self.assertEqual(module.DevelopmentMysql._argument(command, "datadir"), expected)
                self.assertEqual(module.DevelopmentMysql._argument(command, "port"), "43210")

    def test_owned_mysql_recognizes_whole_quoted_datadir_with_spaces(self):
        instance = self.make_instance()
        instance.datadir = instance.directory / "mysql data"
        for quote in ('"', "'"):
            mysql = record(700, 600, f"mysqld {quote}--datadir={instance.datadir}{quote} --port=43210", "mysqld.exe")
            self.assertEqual(instance._owned_mysql([mysql]), [mysql])

    def test_legacy_launcher_is_identified_only_through_owned_mysql_ancestry(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        launcher = record(600, 500, "python scripts/development.py")
        unrelated = record(900, 500, "python scripts/development.py")
        with patch.object(module, "ROOT", self.root):
            self.assertEqual(instance._previous_launcher([mysql, launcher, unrelated], [mysql]), launcher)
            self.assertIsNone(instance._previous_launcher([unrelated], []))

    def test_stale_record_with_reused_pid_does_not_authorize_takeover(self):
        instance = self.make_instance()
        instance.state_file.write_text(json.dumps({"version": 1, "root": str(self.root),
            "launcher": {"pid": 600, "started": "old"}}), encoding="utf-8")
        current = record(600, command="python scripts/development.py", started="new")
        with patch.object(module, "ROOT", self.root):
            self.assertIsNone(instance._previous_launcher([current], []))

    def test_non_object_state_is_ignored(self):
        instance = self.make_instance()
        for value in ([], "stale", 1, None):
            instance.state_file.write_text(json.dumps(value), encoding="utf-8")
            self.assertEqual(instance._read_state(), {})

    def test_finished_old_launcher_can_release_lock_after_initial_attempt(self):
        instance = self.make_instance()
        with patch.object(module, "process_snapshot", return_value=[]), \
                patch.object(instance, "_try_lock", side_effect=[False, True]) as lock, \
                patch.object(module.time, "sleep"), patch.object(module, "stop_process") as stop:
            instance._replace_previous(lock_held=True)
        self.assertEqual(lock.call_count, 2)
        stop.assert_not_called()

    def test_orphan_owned_mysql_is_recovered_even_without_held_lock(self):
        instance = self.make_instance()
        mysql = self.mysql(instance, ppid=1)
        with patch.object(module, "process_snapshot", return_value=[mysql]), \
                patch.object(instance, "_shutdown_previous_mysql") as shutdown, \
                patch.object(module, "stop_process") as stop:
            instance._replace_previous(lock_held=False)
        shutdown.assert_called_once_with(mysql)
        stop.assert_not_called()

    def test_replacement_stops_owned_web_child_before_database_and_launcher(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        launcher = record(600, 500, "python scripts/development.py")
        web = record(701, 600, "node next dev", "node.exe")
        unrelated = record(800, 1, "mysqld --datadir=unrelated --port=3306", "mysqld.exe")
        order = []
        with patch.object(module, "process_snapshot", return_value=[launcher, mysql, web, unrelated]), \
                patch.object(instance, "_shutdown_previous_mysql", side_effect=lambda row: order.append(("database", row["pid"]))), \
                patch.object(module, "stop_process", side_effect=lambda row, **_: order.append(("process", row["pid"]))):
            instance._replace_previous(lock_held=True)
        self.assertEqual(order, [("process", 701), ("database", 700), ("process", 600)])

    def test_invalid_owner_marker_prevents_any_process_action(self):
        instance = self.make_instance()
        (instance.directory / "owner.txt").write_text("someone else's database", encoding="utf-8")
        with patch.object(module, "process_snapshot") as snapshot, patch.object(module, "stop_process") as stop:
            with self.assertRaisesRegex(CommandError, "ownership marker"):
                instance._replace_previous(lock_held=True)
        snapshot.assert_not_called()
        stop.assert_not_called()

    def test_sql_ownership_mismatch_never_shuts_down_an_installed_database(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        with patch.object(module, "process_record", return_value=mysql), \
                patch.object(module, "run", return_value=Mock(stdout="C:/installed/mysql/data\t43210\n")) as run:
            with self.assertRaisesRegex(CommandError, "ownership check failed"):
                instance._shutdown_previous_mysql(mysql)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0], instance.client)

    def test_graceful_shutdown_requires_both_process_and_sql_ownership(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        with patch.object(module, "process_record", return_value=mysql), \
                patch.object(module, "run", return_value=Mock(stdout=f"{instance.datadir}\t43210\n")) as run, \
                patch.object(instance, "_wait_stopped", return_value=True):
            instance._shutdown_previous_mysql(mysql)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args.args[0], instance.admin)
        self.assertEqual(run.call_args.args[1][-1], "shutdown")

    def test_reused_mysql_pid_is_not_queried_or_stopped(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        replacement = {**mysql, "started": "new-process"}
        with patch.object(module, "process_record", return_value=replacement), patch.object(module, "run") as run:
            instance._shutdown_previous_mysql(mysql)
        run.assert_not_called()

    def test_concurrent_graceful_shutdown_is_accepted_only_after_process_exits(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        with patch.object(module, "process_record", side_effect=[mysql, mysql, None]), \
                patch.object(module, "run", side_effect=subprocess.CalledProcessError(1, "mysql")), \
                patch.object(module.time, "sleep"):
            instance._shutdown_previous_mysql(mysql)

    def test_starting_previous_mysql_is_retried_until_sql_ownership_is_confirmed(self):
        instance = self.make_instance()
        mysql = self.mysql(instance)
        with patch.object(module, "process_record", return_value=mysql), \
                patch.object(module, "run", side_effect=[subprocess.CalledProcessError(1, "mysql"),
                    Mock(stdout=f"{instance.datadir}\t43210\n"), Mock()]) as run, \
                patch.object(module.time, "sleep"), patch.object(instance, "_wait_stopped", return_value=True):
            instance._shutdown_previous_mysql(mysql)
        self.assertEqual(run.call_count, 3)
        self.assertEqual(run.call_args.args[0], instance.admin)

    def test_initialization_finishes_before_old_launcher_is_replaced(self):
        instance = self.make_instance()
        initializing = record(700, 600, f'mysqld --initialize-insecure --datadir="{instance.datadir}"', "mysqld.exe")
        mysql = self.mysql(instance)
        launcher = record(600, 500, "python scripts/development.py")
        with patch.object(module, "process_snapshot", side_effect=[[launcher, initializing], [launcher, mysql]]), \
                patch.object(instance, "_shutdown_previous_mysql") as shutdown, \
                patch.object(module.time, "sleep") as sleep, patch.object(module, "stop_process") as stop:
            instance._replace_previous(lock_held=True)
        sleep.assert_called_once()
        shutdown.assert_called_once_with(mysql)
        stop.assert_called_once_with(launcher, tree=True)

    def test_failed_shutdown_uses_known_owned_process_tree_and_releases_lock(self):
        instance = self.make_instance()
        instance.child = Mock()
        instance.child.poll.return_value = None
        instance.mysql_process = self.mysql(instance)
        instance.lock = Mock()
        lock = instance.lock
        instance.locked = True
        instance.launcher = self.owner
        with patch.object(instance, "assert_ownership", side_effect=CommandError("unavailable")), \
                patch.object(module, "stop_process") as stop:
            instance.stop()
        stop.assert_called_once_with(instance.mysql_process, tree=True)
        lock.close.assert_called_once()
        self.assertIsNone(instance.lock)
        instance.child.terminate.assert_not_called()


class DevelopmentMysqlStartupGuardTests(unittest.TestCase):
    def test_guard_releases_after_exception_and_times_out_without_stopping_owner(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with self.assertRaisesRegex(ValueError, "test interruption"):
                with module._startup_guard(directory):
                    with self.assertRaisesRegex(CommandError, "startup is still running"):
                        with module._startup_guard(directory, timeout=0):
                            self.fail("A concurrent startup acquired the same guard.")
                    raise ValueError("test interruption")
            with module._startup_guard(directory, timeout=0):
                pass

    def test_other_process_waits_until_startup_and_metadata_publication_finish(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            ready, acquired = directory / "ready.txt", directory / "acquired.txt"
            code = "\n".join([
                "from pathlib import Path",
                "from lib.development_mysql import _startup_guard",
                f"directory = Path({str(directory)!r})",
                "(directory / 'ready.txt').write_text('waiting')",
                "with _startup_guard(directory, timeout=8):",
                "    assert (directory / 'published.txt').read_text() == 'owner metadata'",
                "    (directory / 'acquired.txt').write_text('acquired')",
            ])
            child = None
            try:
                with module._startup_guard(directory):
                    child = subprocess.Popen([sys.executable, "-c", code],
                        env=dict(os.environ, PYTHONPATH=str(ROOT / "scripts")),
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        text=True, encoding="utf-8", creationflags=module.hidden_process())
                    deadline = time.monotonic() + 5
                    while not ready.exists() and child.poll() is None and time.monotonic() < deadline:
                        time.sleep(0.02)
                    self.assertTrue(ready.exists(), "The competing startup did not begin.")
                    self.assertFalse(acquired.exists())
                    (directory / "published.txt").write_text("owner metadata")
                _, stderr = child.communicate(timeout=10)
                self.assertEqual(child.returncode, 0, stderr)
                self.assertEqual(acquired.read_text(), "acquired")
            finally:
                if child is not None:
                    if child.poll() is None:
                        child.kill()
                    child.communicate(timeout=10)


if __name__ == "__main__":
    unittest.main()
