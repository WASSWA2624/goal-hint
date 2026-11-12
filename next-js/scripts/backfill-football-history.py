"""Run resumable history imports against the exclusively owned snapshot."""
from collections import deque
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
import json
import os
import subprocess
import sys
import time

from lib.development_mysql import LocalFootballMysql, _try_file_lock
from lib.runtime import CommandError, ROOT, hidden_process, main_guard, node_binary


ARCHIVE_PHASES = (("fixtures", ()), ("details", ("--details",)), ("reference", ("--reference",)), ("replay", ("--replay",)))
ACCESS_BLOCKERS = {"authentication-error", "invalid-credential", "subscription-expired"}
SHARED_QUOTA_PAUSES = {"quota-denied", "rate-limited", "provider-day-ended"}
PROVIDER_TRANSPORT_PAUSE = "provider-transport-unavailable"
TRANSIENT_PAUSES = {"operation-not-authorized", "shared-work-pending", "detail-work-busy", "reference-unavailable", "deadline-exceeded"}


def report_state(status, **details):
    print(json.dumps({"event": "history-background", "status": status, **details}), flush=True)


def run_batch(command, env):
    summary = failure = None
    with subprocess.Popen(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, encoding="utf-8", errors="replace", creationflags=hidden_process()) as process:
        for line in process.stdout:
            print(line, end="", flush=True)
            if not line.startswith('{"event":"history-'):
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record["event"] == "history-batch":
                summary = record
            elif record["event"] == "history-error":
                failure = record
        return process.wait(), summary, failure


def run_continuous(command, args, env, *, prepare_database=None):
    phases = deque(ARCHIVE_PHASES)
    pause = 30
    while True:
        progress = False
        retry = None
        for _ in range(len(phases)):
            phase, options = phases[0]
            report_state("running", phase=phase)
            phase_args = () if phase == "replay" else args
            exit_code, summary, failure = run_batch([*command, *phase_args, *options], env)
            if exit_code == 130:
                return exit_code
            if (failure or {}).get("reason") == "local-target-unavailable":
                if prepare_database is not None:
                    prepare_database()
                retry = "waiting-for-local-database"
                break
            stop = (summary or {}).get("stopped") or (summary or {}).get("reason")
            if stop in ACCESS_BLOCKERS or (failure or {}).get("retryable") is False:
                report_state("blocked", phase=phase, reason=stop or failure["reason"])
                return 1
            if not exit_code and summary is not None:
                indexed = (summary.get("subjectDiscovery") or {}).get("indexed", 0)
                progress |= indexed > 0 or (stop == "request-budget" and summary.get("requests", 0) > 0) or any(
                    summary.get(field, 0) > 0 for field in ("imported", "received", "written", "archived"))
            if stop in SHARED_QUOTA_PAUSES or stop == PROVIDER_TRANSPORT_PAUSE:
                phases.rotate(-1)
                retry = "waiting-for-provider" if stop == PROVIDER_TRANSPORT_PAUSE else "waiting-for-shared-quota"
                break
            phases.rotate(-1)
            if exit_code or summary is None or stop in TRANSIENT_PAUSES:
                retry = "waiting-to-resume"
        if retry:
            pause = 30 if progress else pause
            report_state(retry, retrySeconds=pause)
            time.sleep(pause)
            pause = min(pause * 2, 300)
        elif not progress:
            # A drained pass can still have delayed fixture checks, disputed rows,
            # or new targets once more fixture data is available.
            report_state("waiting-for-pending-coverage", retrySeconds=900)
            time.sleep(900)
        else:
            pause = 30


def main():
    args = sys.argv[1:]
    continuous = "--continuous" in args
    prepare = "--prepare-database" in args
    if prepare and (not continuous or args.count("--prepare-database") != 1):
        raise CommandError("Use --prepare-database once with --continuous.")
    if continuous:
        args = [argument for argument in args if argument not in ("--continuous", "--prepare-database")]
        if args and (len(args) != 2 or args[0] != "--requests" or not args[1].isascii() or not args[1].isdigit()
                     or len(args[1]) > 3 or not 2 <= int(args[1]) <= 100):
            raise CommandError("Use --continuous with an optional --requests value from 2 to 100.")
        if not args:
            args = ["--requests", "100"]
    command = [node_binary(), "--conditions=react-server", "--env-file-if-exists=.env.local",
               "--env-file-if-exists=.env.operations", "scripts/backfill-football-history.mjs"]
    env = dict(os.environ, NODE_ENV="development", GOAL_HINT_DEMO="false",
               NEXT_PUBLIC_GOAL_HINT_DEMO="false", NEXT_PUBLIC_GOAL_HINT_LOCAL_FOOTBALL="true",
               NODE_DEBUG="", NODE_DEBUG_NATIVE="")
    if args == ["--help"]:
        return subprocess.call([*command, *args], cwd=ROOT, env=env)
    directory = ROOT / ".goal-hint" / LocalFootballMysql.directory_name
    if prepare:
        if not (directory / "owner.txt").is_file() or not (directory / "mysql").is_dir():
            raise CommandError("Prepare the owned local football snapshot before starting its archive.")
    elif not (directory / "target.env").is_file():
        raise CommandError("Start the owned local football database before importing history.")
    database_process = None

    def prepare_database():
        nonlocal database_process
        if database_process is not None and database_process.poll() is None:
            return
        report_state("preparing-local-database")
        prepare_env = dict(os.environ, NODE_DEBUG="", NODE_DEBUG_NATIVE="")
        # The development launcher treats GOAL_HINT_DEMO=false as --live,
        # which is mutually exclusive with preparing an owned snapshot.
        prepare_env.pop("GOAL_HINT_DEMO", None)
        database_process = subprocess.Popen(
            [sys.executable, str(ROOT / "scripts" / "development.py"), "--prepare-local-football"],
            cwd=ROOT, env=prepare_env, stdout=sys.stdout, stderr=subprocess.STDOUT, creationflags=hidden_process(),
        )

    with (directory / "history-backfill.lock").open("a+b") as lock:
        if os.fstat(lock.fileno()).st_size == 0:
            lock.write(b"1")
            lock.flush()
        while not _try_file_lock(lock):
            if not continuous:
                raise CommandError("Another football history import is already running.")
            report_state("waiting-for-current-batch", retrySeconds=5)
            time.sleep(5)
        if continuous:
            return run_continuous(command, args, env, prepare_database=prepare_database if prepare else None)
        return subprocess.call([*command, *args], cwd=ROOT, env=env)


def run_main():
    args = sys.argv[1:]
    if "--log-to-disk" not in args:
        main_guard(main, "History import stopped. Completed batches remain saved.")
        return
    if "--continuous" not in args or args.count("--log-to-disk") != 1:
        print("Use --log-to-disk once with --continuous.", file=sys.stderr)
        raise SystemExit(2)
    sys.argv.remove("--log-to-disk")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = ROOT / ".goal-hint" / f"football-history-continuous-{stamp}-{os.getpid()}.log"
    with path.open("x", encoding="utf-8", buffering=1) as log, redirect_stdout(log), redirect_stderr(log):
        main_guard(main, "History import stopped. Completed batches remain saved.")


if __name__ == "__main__":
    try:
        run_main()
    except KeyboardInterrupt:
        raise SystemExit(130) from None
