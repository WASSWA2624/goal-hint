"""Run bounded Prisma commands with the application's approved target policy."""
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import subprocess
import sys

from lib.runtime import CommandError, ROOT, hidden_process, main_guard, node_binary, service

COMMANDS = {
    "generate": ["generate", "--no-hints"], "validate": ["validate"],
    "migrate": ["migrate", "diff", "--from-schema", "prisma/schema.snapshot.prisma", "--to-schema", "prisma/schema.prisma", "--script"],
    "deploy": ["migrate", "deploy"], "status": ["migrate", "status"],
    "verify": ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
}


def guard_generated_client(directory: Path | None = None) -> None:
    directory = directory or Path.cwd() / "src/server/generated/prisma"
    if not directory.exists():
        return
    for target in directory.rglob("*.ts"):
        if target.name.endswith(".d.ts"):
            continue
        with target.open("r", encoding="utf-8", newline="") as file:
            source = file.read()
        if re.search(r'^import [\"\']server-only[\"\'];?\s*$', source, re.M):
            continue
        marker = 'import "server-only";\n'
        statement = re.search(r"^(import|export)\s", source, re.M)
        guarded = source[:statement.start()] + marker + source[statement.start():] if statement else source + "\n" + marker
        target.write_text(guarded, encoding="utf-8", newline="\n")


def main() -> None:
    working = Path.cwd()
    args = sys.argv[1:]
    command = args[0] if args else ""
    if command not in COMMANDS:
        raise CommandError("Use generate, validate, migrate, deploy, status or verify.")
    additional = args[1:]
    if additional and not (command == "migrate" and len(additional) == 2 and additional[0] == "--name" and re.fullmatch(r"[a-z][a-z0-9_]{0,63}", additional[1])):
        raise CommandError("Only migrate accepts additional arguments: --name <lowercase_identifier>.")
    if command == "migrate" and not additional:
        raise CommandError("Migration generation requires --name <lowercase_identifier>.")
    if any(os.environ.get(key, "").strip() for key in ("NODE_DEBUG", "NODE_DEBUG_NATIVE")):
        raise CommandError("Disable Node process diagnostics before database commands; they may reveal child-process credentials.")
    prepared = service("database-prepare", {"command": command})
    env = dict(os.environ, CHECKPOINT_DISABLE="1", PRISMA_HIDE_UPDATE_MESSAGE="1")
    if prepared["migrationUrl"] is None:
        env.pop("MIGRATION_DATABASE_URL", None)
    else:
        env["MIGRATION_DATABASE_URL"] = prepared["migrationUrl"]
    prefix = [node_binary(), "--conditions=react-server"]
    prefix.append(str(ROOT / "node_modules/prisma/build/index.js"))
    output = None
    try:
        for prisma_args in ([COMMANDS["status"], COMMANDS[command]] if command == "verify" else [COMMANDS[command]]):
            output = subprocess.run(prefix + prisma_args, capture_output=True, text=True, encoding="utf-8", cwd=working,
                                    env=env, timeout=120, creationflags=hidden_process())
            if output.returncode:
                reason = "Schema drift detected." if command == "verify" and output.returncode == 2 else "Prisma command failed."
                diagnostic = re.search(r"\bP\d{4}\b", output.stderr)
                raise CommandError(f"{reason}{' (' + diagnostic[0] + ')' if diagnostic else ''} Check approved target access and migration state; raw diagnostics are withheld.")
    finally:
        if command == "generate":
            guard_generated_client()
    if command == "migrate":
        sql = output.stdout
        if not sql.strip():
            raise CommandError("Prisma returned no migration output; no migration or schema snapshot was changed.")
        if re.fullmatch(r"\s*-- This is an empty migration\.?\s*", sql):
            print("No schema changes; no migration created.")
            return
        name = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "_" + additional[1]
        directory = working / "prisma/migrations" / name
        with (working / "prisma/schema.prisma").open("r", encoding="utf-8", newline="") as file:
            schema = file.read()
        directory.mkdir()
        (directory / "migration.sql").write_text(sql, encoding="utf-8", newline="\n")
        (working / "prisma/schema.snapshot.prisma").write_text(schema, encoding="utf-8", newline="\n")
        print(f"Migration {name} generated; review SQL before deployment.")
    else:
        print(f"Database {command} completed.")


if __name__ == "__main__":
    main_guard(main, "Database command failed; private diagnostics are withheld.")
