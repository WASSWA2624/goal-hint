"""Persistent, exclusively owned loopback MySQL for the development demo."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import socket
import subprocess
import time

from .isolated_mysql import discover_mysql_server, run
from .mysql_tools import private_tool_environment
from .runtime import CommandError, ROOT, hidden_process


class DevelopmentMysql:
    """Never connects to an installed service or removes a database directory."""

    def __init__(self):
        self.child = None
        self.lock = None
        self.directory = (ROOT / ".goal-hint" / "development-demo").resolve()
        if self.directory.parent.parent != ROOT.resolve():
            raise CommandError("The development demo directory must stay inside this application.")
        self.directory.mkdir(parents=True, exist_ok=True)
        self.datadir = self.directory / "mysql"
        self.binary = self.discover_binary()
        suffix = ".exe" if os.name == "nt" else ""
        self.client = self.binary.with_name("mysql" + suffix)
        self.admin = self.binary.with_name("mysqladmin" + suffix)
        self.lock = (self.directory / "server.lock").open("a+b")
        self.lock.seek(0)
        self.lock.write(b"1")
        self.lock.flush()
        self.lock.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock.close()
            self.lock = None
            raise CommandError("The development demo database is already in use by another launcher.") from None
        try:
            self.start()
        except Exception:
            self.stop()
            raise

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
        if self.child is not None and self.child.poll() is None:
            try:
                self.assert_ownership()
                run(self.admin, [*self.connection, "shutdown"], 15)
            except Exception:
                self.child.terminate()
            try:
                self.child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait(timeout=10)
        if self.lock is not None:
            self.lock.close()
            self.lock = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.stop()
