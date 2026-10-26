"""Owned loopback MySQL instances; never uses or stops installed services."""
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
import weakref

from .mysql_tools import private_tool_environment
from .runtime import ROOT, hidden_process

OWNED = weakref.WeakSet()


class MysqlServerUnavailableError(Exception):
    def __init__(self):
        super().__init__("No genuine MySQL server binary was found. Set MYSQL_TEST_SERVER_BINARY to mysqld; MariaDB and installed services are not integration targets.")


def is_owned_mysql(instance):
    return instance in OWNED


def run(binary, args, timeout=15):
    return subprocess.run([str(binary), *map(str, args)], capture_output=True, text=True, encoding="utf-8", timeout=timeout,
                          env=private_tool_environment(), creationflags=hidden_process(), check=True)


def discover_mysql_server():
    configured = os.environ.get("MYSQL_TEST_SERVER_BINARY")
    candidates = [Path(configured).resolve()] if configured else sorted((Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "MySQL").glob("MySQL Server */bin/mysqld.exe"), reverse=True)
    for candidate in candidates:
        try:
            result = run(candidate, ["--no-defaults", "--version"])
            version = (result.stdout + result.stderr).strip()
            if "MySQL" in version and "mariadb" not in version.lower():
                return candidate, version
        except (OSError, subprocess.SubprocessError):
            pass
    raise MysqlServerUnavailableError()


class IsolatedMysql:
    def __init__(self, database_name="goal_hint_test", binary_log=False):
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", database_name) or type(binary_log) is not bool:
            raise ValueError("Invalid isolated MySQL options.")
        self.binary, self.version = discover_mysql_server()
        self.root = ROOT.resolve()
        self.instances_root = ROOT / ".tmp"
        self.instances_root.mkdir(exist_ok=True)
        if self.instances_root.resolve().parent != self.root or self.instances_root.resolve().name != ".tmp":
            raise RuntimeError("The MySQL integration directory must resolve inside this workspace; no instance was initialized.")
        self.directory = Path(tempfile.mkdtemp(prefix="mysql-instance-", dir=self.instances_root)).resolve()
        self.owner = str(uuid.uuid4())
        self.marker = self.directory / ".goal-hint-test-owner"
        with self.marker.open("x", encoding="utf-8") as marker:
            marker.write(self.owner)
        self.datadir = self.directory / "data"
        suffix = ".exe" if os.name == "nt" else ""
        self.admin = self.binary.with_name("mysqladmin" + suffix)
        self.client = self.binary.with_name("mysql" + suffix)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.database_name = database_name
        self.connection = ["--no-defaults", "--no-login-paths", "--protocol=TCP", "--host=127.0.0.1", f"--port={self.port}", "--user=root"]
        self.url = f"mysql://root@127.0.0.1:{self.port}/{database_name}"
        self.child = None
        self.stopped = False
        self.server_uuid = None
        self.target_verified = False
        try:
            run(self.binary, ["--no-defaults", "--initialize-insecure", f"--datadir={self.datadir}"], 60)
            args = ["--no-defaults", f"--datadir={self.datadir}", f"--port={self.port}", "--bind-address=127.0.0.1", "--mysqlx=OFF",
                    "--log-bin-trust-function-creators=ON", f"--pid-file={self.directory / 'mysqld.pid'}", "--console", "--event-scheduler=OFF"]
            args += [f"--log-bin={self.directory / 'binlog'}", "--binlog-format=ROW", "--binlog-expire-logs-auto-purge=OFF", "--sync-binlog=1", "--innodb-flush-log-at-trx-commit=1"] if binary_log else ["--skip-log-bin"]
            self.child = subprocess.Popen([str(self.binary), *args], env=private_tool_environment(), stdin=subprocess.DEVNULL,
                                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=hidden_process())
            deadline = time.monotonic() + 60
            while True:
                if self.child.poll() is not None:
                    raise RuntimeError("The owned MySQL instance exited during startup; private diagnostics are withheld.")
                try:
                    run(self.admin, [*self.connection, "--connect-timeout=1", "ping"], 3)
                    break
                except (OSError, subprocess.SubprocessError):
                    if time.monotonic() >= deadline:
                        raise RuntimeError("The owned MySQL instance did not become ready within 60000 ms.") from None
                    time.sleep(0.25)
            self.assert_ownership()
            self.target_verified = True
            run(self.client, [*self.connection, f"--execute=CREATE DATABASE `{database_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"])
            OWNED.add(self)
        except Exception:
            self.stop()
            raise

    def owned_directory(self):
        actual, parent = self.directory.resolve(strict=True), self.instances_root.resolve(strict=True)
        if parent.parent != self.root or parent.name != ".tmp" or actual.parent != parent or not actual.name.startswith("mysql-instance-") or self.marker.read_text(encoding="utf-8") != self.owner:
            raise RuntimeError("The MySQL test datadir failed its ownership check; it was preserved.")
        return actual

    def assert_ownership(self):
        self.owned_directory()
        if self.child is None or self.child.poll() is not None:
            raise RuntimeError("The owned MySQL child is no longer running; no target operation was attempted.")
        stdout = ""
        for _ in range(3):
            stdout = run(self.client, [*self.connection, "--batch", "--skip-column-names", "--execute=SELECT @@datadir, @@server_uuid, @@port"]).stdout.strip()
            if stdout:
                break
        if not stdout:
            raise RuntimeError("The owned MySQL identity probe returned no evidence; no target operation was attempted.")
        datadir, server_uuid, port = stdout.split("\t")
        if Path(datadir).resolve() != self.datadir.resolve() or int(port) != self.port or self.server_uuid is not None and self.server_uuid != server_uuid:
            raise RuntimeError("The loopback MySQL target failed its owned server identity check; no target operation was attempted.")
        self.server_uuid = server_uuid

    def execute_admin(self, sql):
        self.assert_ownership()
        return run(self.client, [*self.connection, f"--database={self.database_name}", "--batch", "--skip-column-names", f"--execute={sql}"])

    def stop(self):
        if self.stopped:
            return
        self.stopped = True
        if self.child is not None and self.child.poll() is None:
            if self.target_verified:
                try:
                    self.assert_ownership()
                    run(self.admin, [*self.connection, "shutdown"], 10)
                except Exception:
                    self.child.terminate()
            else:
                self.child.terminate()
            try:
                self.child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.child.kill()
                try:
                    self.child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    raise RuntimeError("The owned MySQL child did not exit; its datadir was preserved.") from None
        shutil.rmtree(self.owned_directory())
        OWNED.discard(self)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.stop()


def start_isolated_mysql(*, database_name="goal_hint_test", binary_log=False):
    return IsolatedMysql(database_name, binary_log)
