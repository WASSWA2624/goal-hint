"""Persistent, exclusively owned loopback MySQL for the development demo."""
from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time

from .isolated_mysql import discover_mysql_server, run
from .development_process import process_snapshot, process_record, process_matches, stop_process
from .mysql_tools import private_tool_environment
from .runtime import CommandError, ROOT, hidden_process


def _try_file_lock(stream):
    stream.seek(0)
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return False
    return True


@contextmanager
def _startup_guard(directory, *, timeout=120):
    """Serialize takeover and ownership publication, not application bootstrap."""
    with (directory / "startup.lock").open("a+b") as guard:
        if os.fstat(guard.fileno()).st_size == 0:
            guard.write(b"1")
            guard.flush()
        deadline = time.monotonic() + timeout
        while not _try_file_lock(guard):
            if time.monotonic() >= deadline:
                raise CommandError("Another development demo startup is still running. Its processes and data were preserved.")
            time.sleep(0.2)
        yield


class DevelopmentMysql:
    """Never connects to an installed service or removes a database directory."""

    def __init__(self, *, replace_running=False):
        self.child = None
        self.mysql_process = None
        self.lock = None
        self.locked = False
        self.launcher = None
        self.directory = (ROOT / ".goal-hint" / "development-demo").resolve()
        if self.directory.parent.parent != ROOT.resolve():
            raise CommandError("The development demo directory must stay inside this application.")
        self.directory.mkdir(parents=True, exist_ok=True)
        self.datadir = self.directory / "mysql"
        self.binary = self.discover_binary()
        suffix = ".exe" if os.name == "nt" else ""
        self.client = self.binary.with_name("mysql" + suffix)
        self.admin = self.binary.with_name("mysqladmin" + suffix)
        self.state_file = self.directory / "launcher.json"
        with _startup_guard(self.directory):
            self._acquire_and_start(replace_running)

    def _acquire_and_start(self, replace_running):
        self.lock = (self.directory / "server.lock").open("a+b")
        # The byte may be locked by another Windows process: do not read or write
        # it before trying the OS lock. A leftover file alone is not a live lock.
        if os.fstat(self.lock.fileno()).st_size == 0:
            self.lock.write(b"1")
            self.lock.flush()
        try:
            acquired = self._try_lock()
            if not acquired and not replace_running:
                raise CommandError("The development demo database is already in use by another launcher.")
            if replace_running:
                self._replace_previous(lock_held=not acquired)
            if not self.locked:
                deadline = time.monotonic() + 30
                while not self._try_lock():
                    if time.monotonic() >= deadline:
                        raise CommandError("The previous demo launcher did not release its database lock; its files were preserved.")
                    time.sleep(0.2)
            self.launcher = process_record(os.getpid())
            if not self.launcher:
                raise CommandError("The development launcher process identity could not be recorded.")
            self._write_state()
            self.start()
            self._write_state()
        except BaseException:
            self.stop()
            raise

    def _try_lock(self):
        if self.locked:
            return True
        self.locked = _try_file_lock(self.lock)
        return self.locked

    @staticmethod
    def _identity(record):
        return {"pid": record["pid"], "started": record["started"]} if record else None

    def _write_state(self):
        state = {"version": 1, "root": str(ROOT.resolve()), "launcher": self._identity(self.launcher),
                 "mysql": self._identity(self.mysql_process)}
        temporary = self.directory / f"launcher-{os.getpid()}.tmp"
        try:
            temporary.write_text(json.dumps(state) + "\n", encoding="utf-8")
            temporary.replace(self.state_file)
        finally:
            temporary.unlink(missing_ok=True)

    def _read_state(self):
        try:
            state = json.loads(self.state_file.read_text(encoding="utf-8"))
            return state if isinstance(state, dict) and state.get("version") == 1 and Path(state["root"]).resolve() == ROOT.resolve() else {}
        except (OSError, ValueError, KeyError, TypeError):
            return {}

    @staticmethod
    def _argument(command, name):
        flag = "--" + re.escape(name) + r"(?:=|\s+)"
        match = re.search(r"(?:^|\s)(?:\"" + flag + r"([^\"]+)\"|'" + flag + r"([^']+)'|"
            + flag + r"(?:\"([^\"]+)\"|'([^']+)'|(\S+)))", command)
        return next((value for value in match.groups() if value is not None), None) if match else None

    def _owned_mysql(self, records):
        owned = []
        for record in records:
            if record["name"].lower() not in ("mysqld", "mysqld.exe"):
                continue
            datadir = self._argument(record["command"], "datadir")
            if datadir and Path(datadir).resolve() == self.datadir.resolve():
                owned.append(record)
        return owned

    @staticmethod
    def _is_launcher(record):
        return record and record["name"].lower().startswith(("python", "py.exe")) and re.search(
            r"(?:^|[/\\\s])development\.py(?:[\"'\s]|$)", record["command"])

    def _previous_launcher(self, records, mysql):
        state = self._read_state()
        recorded = state.get("launcher")
        current = process_record(recorded.get("pid"), records) if isinstance(recorded, dict) else None
        if self._is_launcher(current) and process_matches(recorded, current):
            return current
        # Migration from the old launcher, which recorded no PID: only follow
        # ancestry of mysqld with this exact owned datadir, never a process name.
        for server in mysql:
            seen = set()
            current = server
            while current and current["pid"] not in seen:
                seen.add(current["pid"])
                current = process_record(current["ppid"], records)
                if self._is_launcher(current):
                    return current
        return None

    def _replace_previous(self, *, lock_held):
        marker = self.directory / "owner.txt"
        if marker.exists():
            if marker.read_text(encoding="utf-8") != "goal-hint-development-demo-v1\n":
                raise CommandError("The demo database ownership marker is invalid; no process was stopped.")
        elif self.datadir.exists():
            raise CommandError("An unowned demo database directory exists; no process was stopped.")
        else:
            return
        records = process_snapshot()
        mysql = self._owned_mysql(records)
        launcher = self._previous_launcher(records, mysql)
        deadline = time.monotonic() + 90
        waiting = False
        while any(re.search(r"(?:^|\s)--initialize(?:-insecure)?(?:\s|$)", row["command"]) for row in mysql):
            if not waiting:
                print("Waiting for the existing demo database initialization to finish…", flush=True)
                waiting = True
            if time.monotonic() >= deadline:
                raise CommandError("The demo database is still initializing; its initializer and files were preserved.")
            time.sleep(0.25)
            records = process_snapshot()
            mysql = self._owned_mysql(records)
            launcher = self._previous_launcher(records, mysql)
        if launcher and launcher["pid"] == os.getpid():
            raise CommandError("This process already owns a development demo database instance.")
        if lock_held and not launcher:
            # Port cleanup can make the old launcher exit between the initial
            # lock attempt and the process snapshot. Let its finally block finish.
            deadline = time.monotonic() + 30
            while not self._try_lock():
                if time.monotonic() >= deadline:
                    raise CommandError("The demo database lock owner could not be verified; no unrelated process was stopped.")
                time.sleep(0.2)
        if not mysql and not launcher:
            return
        print("Restarting the previous development demo; preserving its database…", flush=True)
        if launcher:
            mysql_ids = {row["pid"] for row in mysql}
            for child in records:
                if child["ppid"] == launcher["pid"] and child["pid"] not in mysql_ids:
                    stop_process(child, tree=True)
        for server in mysql:
            self._shutdown_previous_mysql(server)
        if launcher:
            stop_process(launcher, tree=True)

    def _shutdown_previous_mysql(self, server):
        if not process_matches(server, process_record(server["pid"])):
            return
        port = self._argument(server["command"], "port")
        if not port or not port.isdecimal() or not 1 <= int(port) <= 65535:
            raise CommandError("The previous owned MySQL port could not be verified; its process was preserved.")
        connection = ["--no-defaults", "--no-login-paths", "--protocol=TCP", "--host=127.0.0.1",
                      f"--port={port}", "--user=root", "--connect-timeout=2"]
        deadline = time.monotonic() + 60
        while True:
            if not process_matches(server, process_record(server["pid"])):
                return
            try:
                observed = run(self.client, [*connection, "--batch", "--skip-column-names",
                    "--execute=SELECT @@datadir, @@port"], 5).stdout.strip().split("\t")
                break
            except (OSError, subprocess.SubprocessError):
                # The previous instance may be starting, or its old launcher's
                # finally block may already be closing it. Never infer ownership
                # from a connection failure; retry while its identity is unchanged.
                if time.monotonic() >= deadline:
                    raise CommandError("The previous demo MySQL instance could not be verified; its process was preserved.") from None
                time.sleep(0.25)
        if len(observed) != 2 or Path(observed[0]).resolve() != self.datadir.resolve() or observed[1] != port:
            raise CommandError("The previous demo database ownership check failed; no database process was stopped.")
        if not process_matches(server, process_record(server["pid"])):
            return
        try:
            run(self.admin, [*connection, "shutdown"], 20)
        except (OSError, subprocess.SubprocessError):
            if not self._wait_stopped(server, 20):
                raise CommandError("The previous owned demo MySQL server could not shut down; its files were preserved.") from None
        if not self._wait_stopped(server, 20):
            raise CommandError("The previous owned demo MySQL server did not finish shutting down; its files were preserved.")

    @staticmethod
    def _wait_stopped(record, timeout):
        deadline = time.monotonic() + timeout
        while process_matches(record, process_record(record["pid"])):
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.2)
        return True

    @staticmethod
    def discover_binary():
        configured = os.environ.get("GOAL_HINT_DEMO_MYSQL_BINARY") or shutil.which("mysqld")
        if not configured:
            portable_root = Path(os.environ.get("LOCALAPPDATA", "")) / "GoalHint"
            portable = sorted(portable_root.glob("mysql-*/bin/mysqld.exe"), reverse=True)
            if portable:
                configured = str(portable[0])
        if configured:
            candidate = Path(configured).resolve()
            try:
                version = run(candidate, ["--no-defaults", "--version"]).stdout
                if "MySQL" in version and "mariadb" not in version.lower():
                    return candidate
            except (OSError, subprocess.SubprocessError):
                pass
            raise CommandError("GOAL_HINT_DEMO_MYSQL_BINARY must point to a genuine MySQL mysqld binary.")
        try:
            return discover_mysql_server()[0]
        except Exception:
            raise CommandError("Install MySQL 8.4 or later, or set GOAL_HINT_DEMO_MYSQL_BINARY to mysqld. No installed database service is used.") from None

    def start(self):
        marker = self.directory / "owner.txt"
        expected = "goal-hint-development-demo-v1\n"
        if marker.exists():
            if marker.read_text(encoding="utf-8") != expected:
                raise CommandError("The demo database ownership marker is invalid; its files were preserved.")
        elif self.datadir.exists():
            raise CommandError("An unowned demo database directory exists; its files were preserved.")
        else:
            marker.write_text(expected, encoding="utf-8")
        if not self.datadir.exists():
            print("Initializing the private development demo MySQL directory…", flush=True)
            run(self.binary, ["--no-defaults", "--initialize-insecure", f"--datadir={self.datadir}"], 90)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.connection = ["--no-defaults", "--no-login-paths", "--protocol=TCP", "--host=127.0.0.1",
                           f"--port={self.port}", "--user=root"]
        self.url = f"mysql://root@127.0.0.1:{self.port}/goal_hint_demo"
        self.child = subprocess.Popen([str(self.binary), "--no-defaults", f"--datadir={self.datadir}",
            f"--port={self.port}", "--bind-address=127.0.0.1", "--mysqlx=OFF", "--skip-log-bin",
            "--innodb-flush-log-at-trx-commit=2", "--innodb-buffer-pool-size=512M",
            "--log-bin-trust-function-creators=ON", "--event-scheduler=OFF", "--console"],
            env=private_tool_environment(), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=hidden_process())
        self.mysql_process = process_record(self.child.pid)
        self._write_state()
        deadline = time.monotonic() + 60
        while self.child.poll() is None:
            try:
                run(self.admin, [*self.connection, "--connect-timeout=1", "ping"], 3)
                break
            except (OSError, subprocess.SubprocessError):
                if time.monotonic() >= deadline:
                    raise CommandError("The demo MySQL server did not become ready within 60 seconds.") from None
                time.sleep(0.25)
        self.assert_ownership()
        run(self.client, [*self.connection, "--execute=CREATE DATABASE IF NOT EXISTS goal_hint_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"])

    def assert_ownership(self):
        if self.child is None or self.child.poll() is not None:
            raise CommandError("The owned demo MySQL process stopped; no database operation was attempted.")
        observed = run(self.client, [*self.connection, "--batch", "--skip-column-names",
            "--execute=SELECT @@datadir, @@port"]).stdout.strip().split("\t")
        if len(observed) != 2 or Path(observed[0]).resolve() != self.datadir.resolve() or int(observed[1]) != self.port:
            raise CommandError("The demo database ownership check failed; its files were preserved.")

    def stop(self):
        try:
            if self.child is not None and self.child.poll() is None:
                try:
                    self.assert_ownership()
                    run(self.admin, [*self.connection, "shutdown"], 15)
                except Exception:
                    if self.mysql_process:
                        stop_process(self.mysql_process, tree=True)
                    else:
                        self.child.terminate()
                try:
                    self.child.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    if self.mysql_process:
                        stop_process(self.mysql_process, tree=True)
                    else:
                        self.child.kill()
                    self.child.wait(timeout=10)
        finally:
            if self.lock is not None:
                try:
                    recorded = self._read_state().get("launcher")
                    if self.locked and self.launcher and isinstance(recorded, dict) and process_matches(self.launcher, recorded):
                        self.state_file.unlink(missing_ok=True)
                finally:
                    self.lock.close()
                    self.lock = None
                    self.locked = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.stop()
