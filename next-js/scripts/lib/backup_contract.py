"""Validated backup policy and redacted operation events."""
import hashlib
import json
import re


class BackupError(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"Backup operation {reason}; private diagnostics are withheld.")


def fail_backup(reason: str):
    raise BackupError(reason)


def serialize(value) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def sha256(value) -> str:
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def parse_backup_policy(value: dict) -> dict:
    ordered_fields = ("version", "mode", "evidenceRef", "owner", "keyRef", "grantsRef", "permissionsRef", "releaseRef", "rpoMs", "rtoMs", "retention")
    fields = set(ordered_fields)
    reference = lambda item: isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", item) is not None
    milliseconds = lambda item: type(item) is int and 0 < item <= 2**53 - 1
    if not isinstance(value, dict) or set(value) != fields or type(value["version"]) is not int or value["version"] != 1 or value["mode"] not in ("local-verification", "live"):
        fail_backup("invalid-policy")
    if any(not reference(value[key]) for key in ("evidenceRef", "keyRef", "grantsRef", "permissionsRef", "releaseRef")) or value["owner"] is not None and not reference(value["owner"]):
        fail_backup("invalid-policy")
    if any(value[key] is not None and not milliseconds(value[key]) for key in ("rpoMs", "rtoMs")):
        fail_backup("invalid-policy")
    retention = value["retention"]
    retention_fields = {"predictions", "results", "evidence", "audits", "structured", "backups", "binlogs", "policyRef"}
    if retention is not None and (not isinstance(retention, dict) or set(retention) != retention_fields or not reference(retention["policyRef"]) or any(not milliseconds(retention[key]) for key in retention_fields - {"policyRef"})):
        fail_backup("invalid-policy")
    if value["mode"] == "live" and any(value[key] is None for key in ("owner", "rpoMs", "rtoMs", "retention")):
        fail_backup("invalid-policy")
    result = {field: value[field] for field in ordered_fields}
    if retention is not None:
        result["retention"] = {field: retention[field] for field in ("predictions", "results", "evidence", "audits", "structured", "backups", "binlogs", "policyRef")}
    return json.loads(serialize(result))


def authorize_backup(authority, policy, operation):
    try:
        allowed = authority.verify_policy(policy) is True and authority.authorize(operation) is True
    except Exception:
        allowed = False
    if not allowed:
        fail_backup("unauthorized")


def backup_health(*, operation, status, started_at, finished_at, policy, recoverable_at=None, reason=None):
    elapsed = max(0, finished_at - started_at)
    objective = "unapproved" if policy["rtoMs"] is None or operation != "restore" else "met" if elapsed <= policy["rtoMs"] else "missed"
    return {"event": "backup-health", "operation": operation, "status": status, "startedAt": started_at, "finishedAt": finished_at,
            "durationMs": elapsed, "recoverableAt": recoverable_at, "objective": objective, "reason": reason}
