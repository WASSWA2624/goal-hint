"""Authorized encrypted snapshots, closed binlogs and quarantined restores."""
import json
import os
from pathlib import Path
import re
import shutil
import time
import uuid

from .backup_contract import BackupError, authorize_backup, backup_health, fail_backup, parse_backup_policy, serialize, sha256
from .backup_crypto import backup_text, decrypt_backup, seal_backup, verify_backup
from .isolated_mysql import is_owned_mysql, start_isolated_mysql
from .mysql_backup import owned_mysql_source, repository_compatibility, repository_migrations
from .mysql_tools import mysql_child


def now():
    return time.time_ns() // 1_000_000


def log_number(name):
    if not isinstance(name, str) or not re.fullmatch(r"binlog\.\d{6}", name):
        fail_backup("invalid-log-chain")
    return int(name[-6:])


def point(source):
    rows = source.query("SHOW BINARY LOG STATUS")
    if len(rows) != 1:
        fail_backup("binlogs-unavailable")
    file, position, *_ = rows[0].split("\t")
    log_number(file)
    if not position.isdigit() or not 4 <= int(position) <= 2**53 - 1:
        fail_backup("invalid-log-chain")
    at = source.query("SELECT CAST(ROUND(UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000) AS UNSIGNED)")
    if len(at) != 1 or not at[0].isdigit():
        fail_backup("invalid-log-chain")
    return {"file": file, "position": int(position), "at": int(at[0])}


def compatible(inventory):
    if inventory["migrations"] != repository_migrations():
        fail_backup("incompatible-schema")


def operation(options, kind, run):
    policy, started = parse_backup_policy(options["policy"]), now()

    def emit(event):
        try:
            if options.get("emit"):
                options["emit"](event)
        except Exception:
            pass

    try:
        authorize_backup(options["authority"], policy, kind)
        result = run(policy)
        emit(backup_health(operation=kind, status="succeeded", started_at=started, finished_at=now(), policy=policy, recoverable_at=result.get("recoverableAt")))
        return result
    except Exception as error:
        emit(backup_health(operation=kind, status="failed", started_at=started, finished_at=now(), policy=policy,
                          reason=error.reason if isinstance(error, BackupError) else "unavailable"))
        if isinstance(error, BackupError):
            raise
        fail_backup("unavailable")


class PrefixReader:
    def __init__(self, stream):
        self.stream, self.prefix = stream, b""

    def read(self, size):
        chunk = self.stream.read(size)
        self.prefix += chunk[:max(0, 65536 - len(self.prefix))]
        return chunk


def capture_mysql_snapshot(options):
    def capture(policy):
        source = options["source"]
        if policy["mode"] == "local-verification" and not is_owned_mysql(source.owned_instance):
            fail_backup("unsafe-target")
        directory = Path(options["directory"])
        if options["authority"].verify_storage(directory, policy) is not True:
            fail_backup("unsafe-storage")
        source.assert_quiescence()
        identity = source.identity()
        if not identity["logBin"] or identity["format"] != "ROW":
            fail_backup("binlogs-unavailable")
        inventory = source.inventory()
        compatible(inventory)
        start = point(source)
        metadata = {"kind": "mysql-snapshot", "version": 1, "id": str(uuid.uuid4()), "identity": identity, "inventory": inventory,
                    "point": start, "compatibility": repository_compatibility(), "policy": policy, "policyHash": sha256(serialize(policy)),
                    "grantsRef": policy["grantsRef"], "quarantined": True}
        directory.mkdir(mode=0o700)
        artifact = directory / "snapshot.ghb"
        dump = source.dump()
        dump.child.stdin.close()
        scan = PrefixReader(dump.child.stdout)
        try:
            seal_backup(artifact, scan, key=options["key"], key_ref=policy["keyRef"], metadata=metadata)
            dump.wait()
            match = re.search(rb"CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='([^']+)', SOURCE_LOG_POS=(\d+)", scan.prefix)
            if not match or match[1].decode("utf-8") != start["file"] or int(match[2]) != start["position"]:
                fail_backup("inconsistent-snapshot")
            source.assert_quiescence()
            after = point(source)
            if start["file"] != after["file"] or start["position"] != after["position"] or inventory != source.inventory():
                fail_backup("writes-not-fenced")
            authorize_backup(options["authority"], policy, "snapshot")
            verify_backup(artifact, key=options["key"], key_ref=policy["keyRef"])
            return {"artifact": artifact, "metadata": metadata, "recoverableAt": start["at"]}
        except Exception:
            artifact.unlink(missing_ok=True)
            raise
        finally:
            dump.close()
    return operation(options, "snapshot", capture)


def archive_owned_mysql_logs(options):
    def archive(policy):
        source, snapshot = options["source"], options["snapshot"]
        instance = source.owned_instance
        if not is_owned_mysql(instance):
            fail_backup("unsupported-hosted-log-export")
        directory = Path(options["directory"])
        if options["authority"].verify_storage(directory, policy) is not True:
            fail_backup("unsafe-storage")
        source.assert_quiescence()
        identity, end, inventory = source.identity(), point(source), source.inventory()
        if identity != snapshot["metadata"]["identity"] or inventory["migrations"] != snapshot["metadata"]["inventory"]["migrations"]:
            fail_backup("source-mismatch")
        first, last = log_number(snapshot["metadata"]["point"]["file"]), log_number(end["file"])
        if first > last:
            fail_backup("invalid-log-chain")
        source.query("FLUSH BINARY LOGS")
        files = []
        for number in range(first, last + 1):
            instance.assert_ownership()
            authorize_backup(options["authority"], policy, "binlog")
            name, artifact = f"binlog.{number:06d}", f"binlog-{number}.ghb"
            file = instance.directory / name
            if file.resolve().parent != instance.directory.resolve():
                fail_backup("unsafe-storage")
            if file.stat().st_size > 64 * 1024 * 1024:
                fail_backup("log-too-large")
            digest = sha256(file.read_bytes())
            metadata = {"kind": "mysql-binlog", "version": 1, "name": name, "hash": digest, "snapshotId": snapshot["metadata"]["id"], "identity": identity}
            with file.open("rb") as data:
                seal_backup(directory / artifact, data, key=options["key"], key_ref=policy["keyRef"], metadata=metadata)
            files.append({"artifact": artifact, "name": name, "hash": digest})
        source.assert_quiescence()
        if inventory != source.inventory():
            fail_backup("writes-not-fenced")
        recovery = {"kind": "mysql-recovery-point", "version": 1, "snapshotId": snapshot["metadata"]["id"], "identity": identity, "inventory": inventory,
                    "start": snapshot["metadata"]["point"], "end": end, "files": files, "policyHash": snapshot["metadata"]["policyHash"]}
        artifact = directory / "recovery-point.ghb"
        authorize_backup(options["authority"], policy, "binlog")
        seal_backup(artifact, backup_text(serialize(recovery)), key=options["key"], key_ref=policy["keyRef"], metadata=recovery)
        return {"artifact": artifact, "metadata": recovery, "recoverableAt": end["at"]}
    return operation(options, "binlog", archive)


def validate_log_chain(snapshot, recovery):
    try:
        if recovery["kind"] != "mysql-recovery-point" or recovery["snapshotId"] != snapshot["id"] or recovery["identity"] != snapshot["identity"] or recovery["start"] != snapshot["point"] or recovery["policyHash"] != snapshot["policyHash"]:
            fail_backup("invalid-log-chain")
        first, last = log_number(recovery["start"]["file"]), log_number(recovery["end"]["file"])
        position = recovery["end"]["position"]
        if not isinstance(recovery["files"], list) or len(recovery["files"]) != last - first + 1 or last < first or type(position) is not int or not 4 <= position <= 2**53 - 1 or first == last and position < recovery["start"]["position"] or recovery["end"]["at"] < recovery["start"]["at"]:
            fail_backup("invalid-log-chain")
        for number, file in enumerate(recovery["files"], first):
            if file["name"] != f"binlog.{number:06d}" or file["artifact"] != f"binlog-{number}.ghb" or not re.fullmatch(r"[a-f0-9]{64}", file["hash"]):
                fail_backup("invalid-log-chain")
    except (KeyError, TypeError, ValueError):
        fail_backup("invalid-log-chain")


def with_restored_mysql(options, inspect):
    def restore(policy):
        directory = Path(options["directory"])
        if options["authority"].verify_storage(directory, policy) is not True:
            fail_backup("unsafe-storage")
        crypto = {"key": options["key"], "key_ref": policy["keyRef"]}
        snapshot = verify_backup(directory / "snapshot.ghb", **crypto)
        if snapshot["kind"] != "mysql-snapshot" or snapshot["policyHash"] != sha256(serialize(snapshot["policy"])) or snapshot["policyHash"] != sha256(serialize(policy)) or snapshot["quarantined"] is not True:
            fail_backup("invalid-artifact")
        compatible(snapshot["inventory"])
        if snapshot["compatibility"] != repository_compatibility():
            fail_backup("incompatible-release")
        recovery = None
        if options.get("pitr") is True:
            recovery = verify_backup(directory / "recovery-point.ghb", **crypto)
            validate_log_chain(snapshot, recovery)
            compatible(recovery["inventory"])
            for file in recovery["files"]:
                metadata = verify_backup(directory / file["artifact"], **crypto)
                if metadata["kind"] != "mysql-binlog" or metadata["snapshotId"] != snapshot["id"] or metadata["name"] != file["name"] or metadata["hash"] != file["hash"] or metadata["identity"] != snapshot["identity"]:
                    fail_backup("invalid-log-chain")
        authorize_backup(options["authority"], policy, "restore")
        with start_isolated_mysql(database_name=snapshot["identity"]["database"]) as instance:
            target = owned_mysql_source(instance)
            if target.query("SHOW TABLES"):
                fail_backup("unsafe-target")
            if options.get("prepare_target"):
                options["prepare_target"](instance, snapshot["grantsRef"])
            instance.assert_ownership()
            authorize_backup(options["authority"], policy, "restore")
            load = mysql_child(target.binary("mysql"), target.client_args, discard_output=True)
            try:
                decrypt_backup(directory / "snapshot.ghb", load.child.stdin, **crypto)
                load.child.stdin.close()
                load.wait()
            finally:
                load.close()
            if target.inventory() != snapshot["inventory"]:
                fail_backup("snapshot-integrity-failed")
            if recovery:
                plaintext_logs = []
                for file in recovery["files"]:
                    plaintext = instance.directory / file["name"]
                    with plaintext.open("xb") as output:
                        os.chmod(plaintext, 0o600)
                        decrypt_backup(directory / file["artifact"], output, **crypto)
                    if sha256(plaintext.read_bytes()) != file["hash"]:
                        fail_backup("invalid-log-chain")
                    plaintext_logs.append(plaintext)
                instance.assert_ownership()
                authorize_backup(options["authority"], policy, "restore")
                logs = mysql_child(target.binary("mysqlbinlog"), ["--no-defaults", "--verify-binlog-checksum", "--disable-log-bin",
                    f"--start-position={recovery['start']['position']}", f"--stop-position={recovery['end']['position']}", *plaintext_logs])
                apply = mysql_child(target.binary("mysql"), target.client_args, discard_output=True)
                try:
                    logs.child.stdin.close()
                    shutil.copyfileobj(logs.child.stdout, apply.child.stdin)
                    apply.child.stdin.close()
                    logs.wait()
                    apply.wait()
                finally:
                    logs.close()
                    apply.close()
                for file in plaintext_logs:
                    file.unlink()
                if target.inventory() != recovery["inventory"]:
                    fail_backup("replay-integrity-failed")
            authorize_backup(options["authority"], policy, "restore")
            recovered = recovery["end"] if recovery else snapshot["point"]
            result = inspect({"instance": instance, "target": target, "snapshot": snapshot, "recoveryPoint": recovery, "quarantined": True})
            lag = max(0, now() - recovered["at"])
            return {"result": result, "recoverableAt": recovered["at"], "recoverablePosition": {"file": recovered["file"], "position": recovered["position"]},
                    "demonstratedLagMs": lag, "objective": "unapproved" if policy["rpoMs"] is None else "met" if lag <= policy["rpoMs"] else "missed"}
    return operation(options, "restore", restore)
