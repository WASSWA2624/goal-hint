"""Run one exclusive, resumable history batch against the owned snapshot."""
import os
import subprocess
import sys

from lib.development_mysql import LocalFootballMysql, _try_file_lock
from lib.runtime import CommandError, ROOT, main_guard, node_binary


def main():
    args = sys.argv[1:]
    command = [node_binary(), "--conditions=react-server", "--env-file-if-exists=.env.local",
               "--env-file-if-exists=.env.operations", "scripts/backfill-football-history.mjs", *args]
    env = dict(os.environ, NODE_ENV="development", GOAL_HINT_DEMO="false",
               NEXT_PUBLIC_GOAL_HINT_DEMO="false", NEXT_PUBLIC_GOAL_HINT_LOCAL_FOOTBALL="true",
               NODE_DEBUG="", NODE_DEBUG_NATIVE="")
    if args == ["--help"]:
        return subprocess.call(command, cwd=ROOT, env=env)
    directory = ROOT / ".goal-hint" / LocalFootballMysql.directory_name
    if not (directory / "target.env").is_file():
        raise CommandError("Start the owned local football database before importing history.")
    with (directory / "history-backfill.lock").open("a+b") as lock:
        if os.fstat(lock.fileno()).st_size == 0:
            lock.write(b"1")
            lock.flush()
        if not _try_file_lock(lock):
            raise CommandError("Another football history import is already running.")
        return subprocess.call(command, cwd=ROOT, env=env)


if __name__ == "__main__":
    try:
        main_guard(main, "History import stopped. Completed batches remain saved.")
    except KeyboardInterrupt:
        raise SystemExit(130) from None
