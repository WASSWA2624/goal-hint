"""Development recovery only stops identified processes on the requested port."""
from pathlib import Path
import os
import socket
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib import development_process as process
from lib.runtime import CommandError


def record(pid, ppid=1, started="original"):
    return {"pid": pid, "ppid": ppid, "started": started, "command": "private arguments", "name": "test"}


class DevelopmentProcessTests(unittest.TestCase):
    def test_identity_requires_original_pid_and_creation_time(self):
        original = record(100)
        self.assertTrue(process.process_matches(original, {**original, "command": "changed title"}))
        for current in [None, record(101), record(100, started="reused"), record(100, started="")]:
            self.assertFalse(process.process_matches(original, current))
        self.assertFalse(process.process_matches({"pid": 100}, {"pid": 100}))

    def test_process_lookup_reuses_snapshot_and_rejects_invalid_identifiers(self):
        rows = [record(100), record(200)]
        with patch.object(process, "process_snapshot", side_effect=AssertionError("Unexpected inspection")):
            self.assertEqual(process.process_record(200, rows), rows[1])
            self.assertIsNone(process.process_record(300, rows))
            for pid in [0, -1, True, "100", None]:
                self.assertIsNone(process.process_record(pid, rows))

    def test_descendants_stop_deepest_first_and_handle_cycles(self):
        rows = [record(10), record(20, 10), record(30, 20), record(40, 10), record(50, 99)]
        self.assertEqual([row["pid"] for row in process.descendant_processes(rows, 10)], [30, 20, 40])
        self.assertEqual([row["pid"] for row in process.descendant_processes([record(10, 20), record(20, 10)], 10)], [20])

    def test_reused_or_exited_process_is_never_stopped(self):
        with patch.object(process, "process_snapshot", return_value=[record(100, started="new")]), \
                patch.object(process, "_stop_identified") as stop:
            process.stop_process(record(100), tree=True)
            stop.assert_not_called()

    def test_launcher_and_ancestors_are_protected(self):
        rows = [record(100, 90), record(90, 80), record(80, 1), record(1, 0)]
        with patch.object(process.os, "getpid", return_value=100), patch.object(process.os, "getppid", return_value=90), \
                patch.object(process, "process_snapshot", return_value=rows), patch.object(process, "_stop_identified") as stop:
            for pid in [100, 90, 80, 1]:
                with self.subTest(pid=pid), self.assertRaises(CommandError):
                    process.stop_process(process.process_record(pid, rows))
            stop.assert_not_called()

    def test_tree_stop_checks_and_stops_descendants_before_the_parent(self):
        rows = [record(10), record(20, 10), record(30, 20)]
        with patch.object(process, "process_snapshot", return_value=rows), \
                patch.object(process.os, "getpid", return_value=999), patch.object(process.os, "getppid", return_value=998), \
                patch.object(process, "_stop_identified") as stop:
            process.stop_process(rows[0], tree=True)
            self.assertEqual([call.args[0]["pid"] for call in stop.call_args_list], [30, 20, 10])

    def test_listener_results_are_deduplicated_and_require_inspectable_identity(self):
        with patch.object(process, "_listening_pids", return_value={10}), \
                patch.object(process, "process_snapshot", return_value=[record(10), record(20)]):
            self.assertEqual(process.listening_processes(3000), [record(10)])
        with patch.object(process, "_listening_pids", side_effect=[{10}, set()]), \
                patch.object(process, "process_snapshot", return_value=[]):
            self.assertEqual(process.listening_processes(3000), [])
        with patch.object(process, "_listening_pids", return_value={10}), \
                patch.object(process, "process_snapshot", return_value=[]), self.assertRaises(CommandError):
            process.listening_processes(3000)

    def test_release_targets_only_requested_listeners_and_is_bounded(self):
        with patch.object(process, "listening_processes", side_effect=[[record(10)], []]) as listeners, \
                patch.object(process, "stop_process") as stop, patch.object(process.time, "sleep"):
            process.release_port(3000)
            stop.assert_called_once_with(record(10), tree=True)
            self.assertEqual([call.args for call in listeners.call_args_list], [(3000,), (3000,)])
        with patch.object(process, "listening_processes", return_value=[record(10)]), \
                patch.object(process, "stop_process") as stop, patch.object(process.time, "sleep"), self.assertRaises(CommandError):
            process.release_port(3000)
        self.assertEqual(stop.call_count, 3)

    def test_invalid_ports_fail_before_any_process_inspection(self):
        with patch.object(process, "_listening_pids", side_effect=AssertionError("Unexpected inspection")):
            for port in [0, -1, 65536, True, "3000", None]:
                with self.subTest(port=port), self.assertRaises(CommandError):
                    process.release_port(port)

    def test_windows_process_and_port_queries_use_structured_data(self):
        with patch.object(process.os, "name", "nt"), patch.object(process, "_powershell", return_value=[record(10)]) as query:
            self.assertEqual(process.process_snapshot(), [record(10)])
            self.assertIn("Get-CimInstance Win32_Process", query.call_args.args[0])
        with patch.object(process.os, "name", "nt"), patch.object(process, "_powershell", return_value=[10, 10, 20]) as query:
            self.assertEqual(process._listening_pids(3000), {10, 20})
            self.assertIn("-LocalPort 3000 -State Listen", query.call_args.args[0])

    def test_inspection_failures_do_not_expose_process_output(self):
        failed = subprocess.CompletedProcess([], 1, "", "private credential")
        with patch.object(process.shutil, "which", return_value="powershell"), patch.object(process, "_run", return_value=failed):
            with self.assertRaises(CommandError) as raised:
                process._powershell("process inspection")
        self.assertNotIn("private credential", str(raised.exception))

    def test_posix_process_table_retains_start_identity_and_command_boundaries(self):
        output = " 100 1 Wed Oct 28 12:00:00 2026 /usr/bin/python private arguments\n"
        with patch.object(process.os, "name", "posix"), patch.object(process, "Path") as path, \
                patch.object(process.shutil, "which", return_value="ps"), \
                patch.object(process, "_run", return_value=subprocess.CompletedProcess([], 0, output, "")):
            path.return_value.is_file.return_value = False
            rows = process.process_snapshot()
        self.assertEqual(rows[0]["started"], "Wed Oct 28 12:00:00 2026")
        self.assertEqual(rows[0]["command"], "/usr/bin/python private arguments")
        self.assertEqual(rows[0]["name"], "python")

    def test_linux_process_arguments_preserve_quoted_paths_and_empty_arguments(self):
        arguments = ["/usr/bin/python", "/a checkout/scripts/development.py", "--datadir=/a checkout/demo mysql", ""]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            boot = root / "sys/kernel/random/boot_id"
            boot.parent.mkdir(parents=True)
            boot.write_text("current-boot", encoding="utf-8")
            entry = root / "100"
            entry.mkdir()
            fields = ["S", "1", *(["0"] * 17), "987"]
            (entry / "stat").write_text("100 (worker with spaces) " + " ".join(fields), encoding="utf-8")
            (entry / "cmdline").write_bytes(b"\0".join(argument.encode("utf-8") for argument in arguments) + b"\0")
            (entry / "comm").write_text("python\n", encoding="utf-8")
            with patch.object(process, "Path", return_value=root):
                rows = process._linux_snapshot()
        self.assertEqual(rows[0]["started"], "current-boot:987")
        self.assertEqual(shlex.split(rows[0]["command"]), arguments)

    def test_missing_posix_port_capabilities_have_an_actionable_error(self):
        with patch.object(process.os, "name", "posix"), patch.object(process, "Path") as path, \
                patch.object(process.shutil, "which", return_value=None):
            path.return_value.is_file.return_value = False
            with self.assertRaisesRegex(CommandError, "Install lsof or ss"):
                process._listening_pids(3000)

    def test_posix_escalation_does_not_signal_a_reused_pid(self):
        original = record(100)
        with patch.object(process.os, "name", "posix"), patch.object(process, "process_snapshot", return_value=[original]), \
                patch.object(process, "process_record", side_effect=[original, record(100, started="reused")]), \
                patch.object(process, "_assert_can_stop"), patch.object(process, "_exited", side_effect=[False, True]), \
                patch.object(process.os, "kill") as kill:
            process._stop_identified(original)
        kill.assert_called_once_with(100, process.signal.SIGTERM)

    def test_real_listener_can_be_released_without_changing_its_parent(self):
        child = subprocess.Popen([sys.executable, "-u", "-c",
            "import socket,time; s=socket.socket(); s.bind(('127.0.0.1',0)); s.listen(); print(s.getsockname()[1],flush=True); time.sleep(60)"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            port = int(child.stdout.readline())
            listeners = process.listening_processes(port)
            self.assertEqual([row["pid"] for row in listeners], [child.pid])
            process.release_port(port)
            child.wait(timeout=10)
            self.assertEqual(process.listening_processes(port), [])
            self.assertIsNotNone(process.process_record(os.getpid()))
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", port))
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=10)
            child.stdout.close()
            child.stderr.close()


if __name__ == "__main__":
    unittest.main()
