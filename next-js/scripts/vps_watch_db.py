"""Sample designated MariaDB schemas without returning connection or job details."""

import os
from pathlib import Path
import stat
import subprocess
from time import perf_counter
from typing import Literal, TypedDict


SCHEMAS = {"staging": "ghprod_test", "production": "ghprod_prod"}
CLIENT = "/usr/bin/mariadb"
CONNECT_TIMEOUT_SECONDS = 2
PROBE_TIMEOUT_SECONDS = 8
MAX_OUTPUT_BYTES = 4096

PROBE_SQL = b"""\
SET SESSION max_statement_time = 2;
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
SET @sample_at = UTC_TIMESTAMP(3);
SELECT 'target', DATABASE(), VERSION();
SHOW SESSION STATUS LIKE 'Ssl_cipher';
SELECT 'attempts',
    COUNT(CASE WHEN outcome = 'succeeded' THEN 1 END),
    COUNT(CASE WHEN outcome = 'failed' THEN 1 END),
    COUNT(CASE WHEN outcome = 'expired' THEN 1 END),
    COUNT(CASE WHEN outcome = 'retry' THEN 1 END)
FROM DurableJobAttempt FORCE INDEX (DurableJobAttempt_finishedAt_idx)
WHERE finishedAt >= @sample_at - INTERVAL 5 MINUTE AND finishedAt <= @sample_at;
SELECT 'queue', pending.due, pending.oldest_due_seconds, running.running,
    running.expired_leases, running.expired_attempt_deadlines,
    pending.past_deadline + running.past_deadline
FROM (
    SELECT COUNT(CASE WHEN expiresAt > @sample_at THEN 1 END) AS due,
        TIMESTAMPDIFF(SECOND, MIN(CASE WHEN expiresAt > @sample_at THEN availableAt END), @sample_at)
            AS oldest_due_seconds,
        COUNT(CASE WHEN expiresAt <= @sample_at THEN 1 END) AS past_deadline
    FROM DurableJob FORCE INDEX (DurableJob_state_availableAt_id_idx)
    WHERE state = 'pending' AND availableAt <= @sample_at
) AS pending CROSS JOIN (
    SELECT COUNT(*) AS running,
        COUNT(CASE WHEN leaseExpiresAt <= @sample_at THEN 1 END) AS expired_leases,
        COUNT(CASE WHEN attemptDeadlineAt <= @sample_at THEN 1 END) AS expired_attempt_deadlines,
        COUNT(CASE WHEN expiresAt <= @sample_at THEN 1 END) AS past_deadline
    FROM DurableJob FORCE INDEX (DurableJob_state_leaseExpiresAt_id_idx)
    WHERE state = 'running'
) AS running;
COMMIT;
"""


class AttemptCounts(TypedDict):
    succeeded: int
    failed: int
    expired: int
    retry: int


class QueueCounts(TypedDict):
    due: int
    oldest_due_seconds: int | None
    running: int
    expired_leases: int
    expired_attempt_deadlines: int
    unresolved_past_deadline: int


class ReadySample(TypedDict):
    status: Literal["ok"]
    ready: Literal[True]
    probe_round_trip_ms: float
    scheduler_expected_active: bool
    attempts_5m: AttemptCounts
    queue: QueueCounts


class UnavailableSample(TypedDict):
    status: Literal["unavailable"]
    ready: Literal[False]
    probe_round_trip_ms: float | None
    scheduler_expected_active: bool
    error: str


def _private_option_file(path: Path) -> bool:
    # The service operator can grant its group read access to a root-owned profile.
    # Checking metadata keeps the option contents in the client process.
    if not path.is_absolute():
        return False
    try:
        info = path.lstat()
    except OSError:
        return False
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o037:
        return False
    if not info.st_mode & 0o040:
        return info.st_uid == os.geteuid()
    return info.st_uid == 0 and (os.geteuid() == 0 or info.st_gid in {os.getegid(), *os.getgroups()})


def _count(value: bytes) -> int:
    if not value.isdigit():
        raise ValueError("Unexpected aggregate value")
    return int(value)


def _parse_probe(stdout: bytes, schema: str) -> tuple[AttemptCounts, QueueCounts]:
    if len(stdout) > MAX_OUTPUT_BYTES:
        raise ValueError("Unexpected response length")
    target, tls, attempts, queue = (line.split(b"\t") for line in stdout.splitlines())
    if (len(target) != 3 or target[:2] != [b"target", schema.encode("ascii")] or b"MariaDB" not in target[2]
            or len(tls) != 2 or tls[0] != b"Ssl_cipher" or not tls[1]):
        raise ValueError("Unverified database target")
    if len(attempts) != 5 or attempts[0] != b"attempts" or len(queue) != 7 or queue[0] != b"queue":
        raise ValueError("Unexpected report rows")
    succeeded, failed, expired, retry = map(_count, attempts[1:])
    due = _count(queue[1])
    oldest = None if queue[2] == b"NULL" else _count(queue[2])
    running, expired_leases, expired_attempts, past_deadline = map(_count, queue[3:])
    if (due == 0) != (oldest is None) or expired_leases > running or expired_attempts > running:
        raise ValueError("Incoherent queue aggregates")
    return {"succeeded": succeeded, "failed": failed, "expired": expired, "retry": retry}, {
        "due": due, "oldest_due_seconds": oldest, "running": running, "expired_leases": expired_leases,
        "expired_attempt_deadlines": expired_attempts, "unresolved_past_deadline": past_deadline,
    }


def sample_database(environment: str, defaults_file: Path) -> ReadySample | UnavailableSample:
    """Read TLS readiness and queue counters in one bounded CLI round trip."""
    scheduler_active = environment == "production"

    def unavailable(error: str, elapsed_ms: float | None = None) -> UnavailableSample:
        return {"status": "unavailable", "ready": False, "probe_round_trip_ms": elapsed_ms,
                "scheduler_expected_active": scheduler_active, "error": error}

    schema = SCHEMAS.get(environment)
    if schema is None or not _private_option_file(defaults_file):
        return unavailable("configuration-invalid")

    command = [CLIENT, f"--defaults-file={defaults_file}", f"--database={schema}",
               "--host=127.0.0.1", "--port=3306", "--protocol=tcp", "--ssl", "--ssl-verify-server-cert",
               "--batch", "--raw", "--skip-column-names", "--binary-mode", "--local-infile=0",
               "--skip-reconnect", f"--connect-timeout={CONNECT_TIMEOUT_SECONDS}"]
    started = perf_counter()
    try:
        result = subprocess.run(command, input=PROBE_SQL, capture_output=True, check=False,
                                env={"LC_ALL": "C"}, timeout=PROBE_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return unavailable("timeout", round((perf_counter() - started) * 1000, 1))
    except OSError:
        return unavailable("client-unavailable")
    elapsed_ms = round((perf_counter() - started) * 1000, 1)
    if result.returncode:
        return unavailable("query-failed", elapsed_ms)
    try:
        attempts, queue = _parse_probe(result.stdout, schema)
    except ValueError:
        return unavailable("response-invalid", elapsed_ms)
    return {"status": "ok", "ready": True, "probe_round_trip_ms": elapsed_ms,
            "scheduler_expected_active": scheduler_active, "attempts_5m": attempts, "queue": queue}
