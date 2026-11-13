#!/usr/bin/env python3
"""Apply release migrations to the explicitly selected hosted MariaDB schema."""

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys


NAME = re.compile(r"\d{14}_[a-z][a-z0-9_]*\Z")
DIGEST = re.compile(r"[a-f0-9]{64}\Z")
TARGETS = {"staging": re.compile(r"ghstage_[a-z0-9_]{1,48}\Z"), "production": re.compile(r"ghprod_prod\Z")}
FOLLOWUP = "20261009123830_durable_jobs"
LEDGER = """SELECT migration_name, checksum, finished_at IS NOT NULL, rolled_back_at IS NOT NULL
FROM _prisma_migrations ORDER BY migration_name"""


class MigrationError(Exception):
    pass


@dataclass(frozen=True)
class Migration:
    name: str
    checksum: str
    compatible_checksums: frozenset[str]
    sql: bytes
    overlay: bytes | None
    followup: bytes | None


def checksum(body):
    return hashlib.sha256(body).hexdigest()


def release_migrations(prisma_dir):
    migrations = []
    for directory in sorted((prisma_dir / "migrations").iterdir()):
        if not directory.is_dir():
            continue
        name = directory.name
        if not NAME.fullmatch(name):
            raise MigrationError("Invalid release migration name.")
        sql = (directory / "migration.sql").read_bytes().replace(b"\r\n", b"\n")
        if not sql.strip():
            raise MigrationError(f"Empty release migration {name}.")
        digest = checksum(sql)
        compatible = frozenset([digest, checksum(sql.replace(b"\n", b"\r\n"))])
        path = prisma_dir / "mariadb" / f"{name}.sql"
        overlay = path.read_bytes() if path.is_file() else None
        if overlay is not None and (name.encode() not in overlay or not any(value.encode() in overlay for value in compatible)):
            raise MigrationError(f"MariaDB overlay does not record the original checksum for {name}.")
        followup = (prisma_dir / "mariadb" / "20261009123830_durable_job_numeric_projection.sql").read_bytes() if name == FOLLOWUP else None
        migrations.append(Migration(name, digest, compatible, sql, overlay, followup))
    if not migrations:
        raise MigrationError("Release has no Prisma migrations.")
    adoption = json.loads((prisma_dir / "adopted-migrations.json").read_text(encoding="utf-8"))
    names = {migration.name for migration in migrations}
    if not isinstance(adoption, list) or any(not isinstance(row, dict) or set(row) != {"name", "checksum", "adoptedBy"} or
            any(not isinstance(value, str) for value in row.values()) or not NAME.fullmatch(row["name"]) or
            not DIGEST.fullmatch(row["checksum"]) or row["name"] in names or row["adoptedBy"] not in names for row in adoption):
        raise MigrationError("Invalid adopted migration inventory.")
    adopted = {row["name"]: (row["checksum"], row["adoptedBy"]) for row in adoption}
    if len(adopted) != len(adoption):
        raise MigrationError("Duplicate adopted migration entries.")
    return migrations, adopted


def pending_migrations(rows, migrations, adopted):
    expected = {migration.name: migration.compatible_checksums for migration in migrations}
    completed = set()
    for row in rows:
        name, digest, finished, rolled_back = row.split("\t")
        allowed = expected.get(name)
        if allowed is None and name in adopted:
            allowed = {adopted[name][0]}
        if allowed is None or digest not in allowed:
            raise MigrationError("Migration ledger contains an unknown or edited entry.")
        if rolled_back == "1":
            continue
        if name in completed or finished != "1" or rolled_back != "0":
            raise MigrationError(f"Migration ledger has an interrupted or duplicate entry for {name}.")
        completed.add(name)
    pending = [migration for migration in migrations if migration.name not in completed]
    if pending and any(migration.name > pending[0].name and migration.name in completed for migration in migrations):
        raise MigrationError("Migration ledger has a gap before an applied release migration.")
    return pending


def canonical_sql(sql):
    # MariaDB uses DROP CONSTRAINT for the check syntax emitted by Prisma for MySQL.
    return re.sub(rb"(?mi)^(\s*(?:ALTER TABLE `?[a-zA-Z0-9_]+`?\s+)?DROP)\s+CHECK\s+(`?[a-zA-Z0-9_]+`?)", rb"\1 CONSTRAINT \2", sql)


class MariaDb:
    def __init__(self, defaults_file, database, port):
        binary = shutil.which("mariadb")
        if binary is None:
            raise MigrationError("MariaDB command-line client is unavailable.")
        self.database = database
        self.command = [binary, f"--defaults-file={defaults_file}", f"--database={database}", "--host=127.0.0.1", f"--port={port}",
                        "--protocol=tcp", "--ssl", "--ssl-verify-server-cert", "--batch", "--raw", "--skip-column-names",
                        "--binary-mode", "--local-infile=0", "--skip-reconnect", "--connect-timeout=10"]
        self.environment = {key: value for key, value in os.environ.items() if not key.startswith(("MYSQL_", "MARIADB_"))}

    def execute(self, body, label):
        try:
            result = subprocess.run(self.command, input=body, capture_output=True, env=self.environment, timeout=900, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise MigrationError(f"MariaDB operation interrupted during {label}.") from error
        if result.returncode:
            code = re.search(rb"\bERROR (\d{3,5})\b", result.stderr)
            suffix = f" (error {code[1].decode('ascii')})" if code else ""
            raise MigrationError(f"MariaDB operation failed during {label}{suffix}.")
        return result.stdout.decode("utf-8").splitlines()

    def verify_target(self):
        rows = self.execute(b"SELECT DATABASE(), VERSION();\nSHOW SESSION STATUS LIKE 'Ssl_cipher';", "target verification")
        identity = rows[0].split("\t") if rows else []
        cipher = rows[1].split("\t") if len(rows) > 1 else []
        if len(identity) != 2 or identity[0] != self.database or "MariaDB" not in identity[1] or len(cipher) != 2 or cipher[0] != "Ssl_cipher" or not cipher[1]:
            raise MigrationError("The selected MariaDB schema or verified TLS connection is unavailable.")

    def ledger(self):
        return self.execute((LEDGER + ";").encode(), "migration ledger read")

    def apply(self, migration):
        name = migration.name
        digest = migration.checksum
        start = f"""INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
SELECT UUID(), '{digest}', '{name}', UTC_TIMESTAMP(3), 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='{name}' AND rolled_back_at IS NULL);"""
        finish = f"""UPDATE _prisma_migrations SET finished_at=UTC_TIMESTAMP(3), applied_steps_count=1
WHERE migration_name='{name}' AND checksum='{digest}' AND finished_at IS NULL AND rolled_back_at IS NULL;"""
        # Overlays assert prerequisites and insert their own original Prisma ledger row.
        if migration.overlay is not None:
            body = migration.overlay
        else:
            body = start.encode() + b"\n" + canonical_sql(migration.sql) + b"\n" + (migration.followup or b"") + b"\n" + finish.encode()
        self.execute(body, name)


@contextmanager
def migration_lock(defaults_file, database):
    import fcntl

    path = defaults_file.parent / f".goal-hint-migrations-{database}.lock"
    fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise MigrationError("Migration lock must be owned by the release account and private.")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise MigrationError("A migration process already owns this database.") from error
        yield


def target_options(environment, database, defaults_file):
    if not TARGETS[environment].fullmatch(database):
        raise MigrationError("Database name does not belong to the selected environment.")
    if not defaults_file.is_absolute() or defaults_file.is_symlink() or not defaults_file.is_file():
        raise MigrationError("Supply an absolute, private MariaDB option file.")
    info = defaults_file.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise MigrationError("MariaDB option file must be owned by the release account and private.")
    # The CLI overrides server and schema, but refuse defaults that can bypass failure/TLS handling or execute SQL at connect time.
    for line in defaults_file.read_text(encoding="utf-8").splitlines():
        option = re.split(r"[=\s]", line.strip(), maxsplit=1)[0].lower().lstrip("-").replace("_", "-")
        if option in {"force", "init-command", "init-command-add", "skip-ssl", "skip-ssl-verify-server-cert"} or option.startswith("!include"):
            raise MigrationError("MariaDB option file contains an unsupported client option.")
    return defaults_file


def migrate(database, migrations, adopted, status_only):
    database.verify_target()
    pending = pending_migrations(database.ledger(), migrations, adopted)
    if status_only:
        for migration in pending:
            print(f"Pending {migration.name}")
        if pending:
            return 2
    for index, migration in enumerate(pending):
        database.apply(migration)
        remaining = pending_migrations(database.ledger(), migrations, adopted)
        if remaining != pending[index + 1:]:
            raise MigrationError(f"Migration {migration.name} was not recorded in the target ledger.")
        print(f"Applied {migration.name}", flush=True)
    print(f"MariaDB migration ledger verified ({len(migrations)} required migrations).")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", required=True, choices=TARGETS)
    parser.add_argument("--database", required=True)
    parser.add_argument("--defaults-file", required=True, type=Path)
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--prisma-dir", type=Path, default=Path(__file__).resolve().parents[1] / "prisma")
    parser.add_argument("--status", action="store_true", help="Report pending migrations without changing the database.")
    args = parser.parse_args(argv)
    try:
        if not 1 <= args.port <= 65535:
            raise MigrationError("Invalid MariaDB port.")
        defaults_file = target_options(args.environment, args.database, args.defaults_file)
        migrations, adopted = release_migrations(args.prisma_dir)
        database = MariaDb(defaults_file, args.database, args.port)
        with migration_lock(defaults_file, args.database):
            return migrate(database, migrations, adopted, args.status)
    except MigrationError as error:
        print(error, file=sys.stderr)
    except (OSError, ValueError):
        print("Could not verify the release migration inventory or private target configuration.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
