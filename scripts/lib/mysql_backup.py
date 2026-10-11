"""MySQL backup source with private option files and strict inventory verification."""
import hashlib
import json
import os
from pathlib import Path
import re

from .backup_contract import fail_backup, serialize, sha256
from .isolated_mysql import is_owned_mysql
from .mysql_tools import mysql_child

METADATA_SQL = [
    "SELECT JSON_OBJECT('kind','table','table',TABLE_NAME,'engine',ENGINE,'collation',TABLE_COLLATION,'type',TABLE_TYPE) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME",
    "SELECT JSON_OBJECT('kind','column','table',TABLE_NAME,'name',COLUMN_NAME,'ordinal',ORDINAL_POSITION,'type',COLUMN_TYPE,'nullable',IS_NULLABLE,'default',COLUMN_DEFAULT,'extra',EXTRA,'expression',GENERATION_EXPRESSION,'charset',CHARACTER_SET_NAME,'collation',COLLATION_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION",
    "SELECT JSON_OBJECT('kind','index','table',TABLE_NAME,'name',INDEX_NAME,'sequence',SEQ_IN_INDEX,'column',COLUMN_NAME,'expression',EXPRESSION,'nonUnique',NON_UNIQUE,'prefix',SUB_PART,'type',INDEX_TYPE,'visible',IS_VISIBLE,'collation',COLLATION) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX",
    "SELECT JSON_OBJECT('kind','check','table',t.TABLE_NAME,'name',t.CONSTRAINT_NAME,'clause',c.CHECK_CLAUSE,'enforced',t.ENFORCED) FROM information_schema.TABLE_CONSTRAINTS t JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.CONSTRAINT_SCHEMA=DATABASE() ORDER BY t.TABLE_NAME,t.CONSTRAINT_NAME",
    "SELECT JSON_OBJECT('kind','fk','table',k.TABLE_NAME,'name',k.CONSTRAINT_NAME,'column',k.COLUMN_NAME,'parent',k.REFERENCED_TABLE_NAME,'parentColumn',k.REFERENCED_COLUMN_NAME,'parentSchema',k.REFERENCED_TABLE_SCHEMA,'update',r.UPDATE_RULE,'delete',r.DELETE_RULE) FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION",
    "SELECT JSON_OBJECT('kind','trigger','name',TRIGGER_NAME,'table',EVENT_OBJECT_TABLE,'event',EVENT_MANIPULATION,'timing',ACTION_TIMING,'body',ACTION_STATEMENT,'definer',DEFINER,'mode',SQL_MODE) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME",
    "SELECT JSON_OBJECT('kind','program') FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() UNION ALL SELECT JSON_OBJECT('kind','program') FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()",
    "SELECT JSON_OBJECT('kind','migration','name',migration_name,'checksum',checksum,'complete',finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM _prisma_migrations ORDER BY migration_name",
]


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", value):
        fail_backup("invalid-identifier")
    return "`" + value + "`"


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def repository_migrations(root="prisma/migrations"):
    return [{"name": directory.name, "checksum": sha256((directory / "migration.sql").read_bytes())}
            for directory in sorted(Path(root).iterdir()) if directory.is_dir()]


def repository_compatibility():
    return {"schemaHash": sha256(Path("prisma/schema.prisma").read_bytes()), "lockfileHash": sha256(Path("package-lock.json").read_bytes())}


class MysqlBackupSource:
    def __init__(self, *, bin_directory, database_name, defaults_file=None, expected_uuid=None, verify_quiescence=None, owned_instance=None):
        identifier(database_name)
        if owned_instance is not None and not is_owned_mysql(owned_instance):
            fail_backup("unsafe-target")
        if owned_instance is None and defaults_file is None:
            fail_backup("private-options-required")
        self.bin_directory, self.database_name = Path(bin_directory), database_name
        self.expected_uuid, self.verify_quiescence, self.owned_instance = expected_uuid, verify_quiescence, owned_instance
        self.connection = list(owned_instance.connection) if owned_instance else [f"--defaults-file={Path(defaults_file).resolve()}", "--no-login-paths"]
        self.client_args = [*self.connection, f"--database={database_name}", "--default-character-set=utf8mb4", "--batch", "--raw", "--skip-column-names", "--binary-mode", "--local-infile=0", "--skip-reconnect"]

    def binary(self, name):
        return self.bin_directory / (name + (".exe" if os.name == "nt" else ""))

    def query(self, sql):
        tool = None
        try:
            if self.owned_instance:
                self.owned_instance.assert_ownership()
            tool = mysql_child(self.binary("mysql"), self.client_args)
            tool.child.stdin.write(("SET time_zone='+00:00'; " + sql + ";\n").encode("utf-8"))
            tool.child.stdin.close()
            chunks, size = [], 0
            while chunk := tool.child.stdout.read(65536):
                size += len(chunk)
                if size > 64 * 1024 * 1024:
                    fail_backup("inventory-too-large")
                chunks.append(chunk)
            tool.wait()
            value = b"".join(chunks).decode("utf-8").strip()
            return value.splitlines() if value else []
        except Exception:
            fail_backup("mysql-unavailable")
        finally:
            if tool:
                tool.close()

    def identity(self):
        rows = self.query("SELECT JSON_OBJECT('uuid',@@server_uuid,'version',@@version,'database',DATABASE(),'logBin',@@log_bin,'format',@@binlog_format)")
        value = json.loads(rows[0]) if len(rows) == 1 else None
        if not value or not re.match(r"8\.4\.", value["version"]) or value["database"] != self.database_name or self.expected_uuid and value["uuid"] != self.expected_uuid:
            fail_backup("source-mismatch")
        return value

    def assert_quiescence(self):
        if self.verify_quiescence is None or self.verify_quiescence() is not True:
            fail_backup("writes-not-fenced")
        self.identity()

    def inventory(self):
        metadata = [json.loads(row) for row in self.query(";".join(METADATA_SQL))]
        tables = [value["table"] for value in metadata if value["kind"] == "table"]
        if "_prisma_migrations" not in tables:
            fail_backup("incompatible-schema")
        if any(value["kind"] == "table" and (value["engine"] != "InnoDB" or value["type"] != "BASE TABLE") for value in metadata):
            fail_backup("unsupported-storage")
        if any(value["kind"] == "program" for value in metadata):
            fail_backup("unsupported-stored-program")
        migrations = [value for value in metadata if value["kind"] == "migration"]
        if any(not value["complete"] for value in migrations):
            fail_backup("incompatible-schema")
        digests = {table: {"digest": hashlib.sha256(), "count": 0} for table in tables}
        hash_sql = []
        for table in tables:
            columns = ",".join(identifier(value["name"]) for value in metadata if value["kind"] == "column" and value["table"] == table)
            hash_sql.append(f"SELECT JSON_OBJECT('table',{literal(table)},'hash',SHA2(CAST(JSON_ARRAY({columns}) AS CHAR),256)) AS rowHash FROM {identifier(table)} ORDER BY rowHash")
        for text in self.query(";".join(hash_sql)):
            row = json.loads(text)
            state = digests.get(row["table"])
            if state is None or not re.fullmatch(r"[a-f0-9]{64}", row["hash"]):
                fail_backup("invalid-inventory")
            state["digest"].update(row["hash"].encode("utf-8"))
            state["count"] += 1
        inventory = [{"table": table, "count": digests[table]["count"], "hash": digests[table]["digest"].hexdigest(),
                      "schemaHash": sha256(serialize([value for value in metadata if value.get("table") == table and value["kind"] in ("table", "column", "index", "check")]))} for table in tables]
        keys = [value for value in metadata if value["kind"] == "fk"]
        if any(value["parentSchema"] != self.database_name for value in keys):
            fail_backup("unsupported-cross-schema-key")
        groups = {}
        for key in keys:
            groups.setdefault(key["table"] + ":" + key["name"], []).append(key)
        foreign_key_sql = []
        for group in groups.values():
            first = group[0]
            joins = " AND ".join(f"c.{identifier(key['column'])}=p.{identifier(key['parentColumn'])}" for key in group)
            nonnull = " AND ".join(f"c.{identifier(key['column'])} IS NOT NULL" for key in group)
            foreign_key_sql.append(f"SELECT COUNT(*) FROM {identifier(first['table'])} c LEFT JOIN {identifier(first['parent'])} p ON {joins} WHERE {nonnull} AND p.{identifier(first['parentColumn'])} IS NULL")
        if foreign_key_sql and any(count != "0" for count in self.query(";".join(foreign_key_sql))):
            fail_backup("foreign-key-violation")
        return {"tables": inventory, "migrations": [{"name": row["name"], "checksum": row["checksum"]} for row in migrations],
                "foreignKeys": sha256(serialize(keys)), "triggers": sha256(serialize([value for value in metadata if value["kind"] == "trigger"]))}

    def dump(self):
        return mysql_child(self.binary("mysqldump"), [*self.connection, "--single-transaction", "--source-data=2", "--set-gtid-purged=OFF", "--no-tablespaces", "--hex-blob", "--triggers", "--skip-add-drop-table", "--skip-add-locks", "--skip-disable-keys", "--column-statistics=0", self.database_name])


def create_mysql_backup_source(**options):
    return MysqlBackupSource(**options)


def owned_mysql_source(instance, verify_quiescence=lambda: True):
    if not is_owned_mysql(instance):
        fail_backup("unsafe-target")
    instance.assert_ownership()
    server_uuid = instance.execute_admin("SELECT @@server_uuid").stdout.strip().split()[0]
    return MysqlBackupSource(bin_directory=instance.binary.parent, database_name=instance.database_name, expected_uuid=server_uuid,
                             verify_quiescence=verify_quiescence, owned_instance=instance)
