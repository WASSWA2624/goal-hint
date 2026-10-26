"""One-shot private backup CLI with trusted Python or existing MJS bindings."""
import importlib.util
import json
from pathlib import Path
import sys

from lib.backup_contract import BackupError, fail_backup
from lib.backup_engine import archive_owned_mysql_logs, capture_mysql_snapshot, with_restored_mysql
from lib.runtime import CommandError, service


def execute_backup_command(args, binding):
    if len(args) != 1 or args[0] not in ("snapshot", "archive", "restore", "restore-pitr"):
        fail_backup("invalid-command")
    if binding is None:
        fail_backup("binding-required")
    if args[0] == "snapshot":
        return capture_mysql_snapshot(binding)
    if args[0] == "archive":
        return archive_owned_mysql_logs(binding)
    if not callable(binding.get("verify_restored")):
        fail_backup("verification-required")
    return with_restored_mysql({**binding, "pitr": args[0] == "restore-pitr"}, binding["verify_restored"])


def main():
    args = sys.argv[1:]
    if len(args) != 3 or args[1] != "--binding" or not Path(args[2]).is_absolute():
        fail_backup("binding-required")
    operation, _, file = args
    if operation not in ("snapshot", "archive", "restore", "restore-pitr"):
        fail_backup("invalid-command")
    if Path(file).suffix != ".py":
        # Existing trusted operator bindings use application objects/callbacks;
        # those execute in the shared server runtime without serializing secrets.
        result = service("backup", {"operation": operation, "binding": file})
        for event in result["events"]:
            print(json.dumps(event, separators=(",", ":")))
    else:
        service("runtime-check")
        spec = importlib.util.spec_from_file_location("goal_hint_backup_binding", file)
        adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(adapter)
        if not callable(getattr(adapter, "create_backup_binding", None)):
            fail_backup("binding-required")
        binding = adapter.create_backup_binding()
        try:
            if binding.get("policy", {}).get("mode") == "live" and operation in ("snapshot", "archive"):
                service("backup-database-access")
            binding.setdefault("emit", lambda event: print(json.dumps(event, separators=(",", ":"))))
            execute_backup_command([operation], binding)
        finally:
            if binding.get("close"):
                binding["close"]()
    print("Private backup operation completed; see approved backup-health evidence.")


if __name__ == "__main__":
    try:
        main()
    except (BackupError, CommandError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
    except Exception:
        print("Backup operation failed; private diagnostics are withheld.", file=sys.stderr)
        raise SystemExit(1) from None
