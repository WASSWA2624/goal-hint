"""Start the normal Next application with an isolated, persistent demo database."""
from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import sys
import threading

from lib.development_mysql import DevelopmentMysql
from lib.runtime import CommandError, ROOT, hidden_process, main_guard, node_binary


def development_node_binary():
    # npm supplies the exact runtime that launched the project, ahead of unrelated
    # machine-wide Node installations or artifact-tool runtimes.
    return os.environ.get("npm_node_execpath") or node_binary()


def demo_environment(url: str, source=None):
    env = dict(os.environ if source is None else source)
    # Next loads .env files automatically. Explicit empty values stop private local
    # provider/owner settings from filling missing keys in this owned demo process.
    keys = set(env)
    for path in ROOT.glob(".env*"):
        if path.is_file():
            keys.update(re.findall(r"^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=", path.read_text(encoding="utf-8-sig"), re.M))
    credentials = {"DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"}
    for key in keys:
        if key.startswith(("GOAL_HINT_", "NEXT_PUBLIC_")) or key in credentials:
            env[key] = ""
    env.update(NODE_ENV="development", DEBUG="", NODE_DEBUG="", NODE_DEBUG_NATIVE="",
        GOAL_HINT_DEMO="true", NEXT_PUBLIC_GOAL_HINT_DEMO="true",
        GOAL_HINT_DEMO_MEMBER=(source or os.environ).get("GOAL_HINT_DEMO_MEMBER", "true"),
        GOAL_HINT_OPERATION_SCOPE="disabled", GOAL_HINT_DEPLOYMENT_ENVIRONMENT="development",
        GOAL_HINT_DATABASE_ENABLED="true", DATABASE_URL=url, MIGRATION_DATABASE_URL=url,
        GOAL_HINT_DATABASE_CONNECTION_MODE="direct", GOAL_HINT_DATABASE_POOL_LIMIT="5",
        GOAL_HINT_DATABASE_TLS_MODE="disabled", GOAL_HINT_FOOTBALL_ENABLED="false",
        GOAL_HINT_AI_ENABLED="false", GOAL_HINT_RESEARCH_ENABLED="false",
        GOAL_HINT_ODDS_IMPORT_ENABLED="false", GOAL_HINT_LIVE_DETAILS_ENABLED="false",
        GOAL_HINT_TEAM_CODES_IMPORT_ENABLED="false", GOAL_HINT_ANALYTICS_ENABLED="true",
        GOAL_HINT_ADS_ENABLED="false", GOAL_HINT_DARK_MODE_ENABLED="false",
        GOAL_HINT_EXACT_SCORES_ENABLED="false", GOAL_HINT_LOCALES="en")
    # Public fictional credentials belong only to this isolated development process.
    # Ordinary administrator allowlist/password/session checks remain in force.
    env.update(GOAL_HINT_ADMIN_PHONES='["256700000099"]', GOAL_HINT_ADMIN_PASSWORD="DemoGoalHintAdmin2026!")
    return env


def run_checked(args, env, timeout=300):
    # Native Windows pipes may default to cp1252 while Node emits UTF-8 progress.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    child = subprocess.Popen([development_node_binary(), *args], cwd=ROOT, env=env, creationflags=hidden_process(),
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    timer = threading.Timer(timeout, child.kill)
    timer.daemon = True
    timer.start()
    try:
        for line in child.stdout:
            print(line, end="", flush=True)
        if child.wait():
            raise CommandError("Development demo preparation failed; see the command diagnostics above.")
    finally:
        timer.cancel()
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=15)
        child.stdout.close()


def run_web(args, env):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    child = subprocess.Popen([development_node_binary(), str(ROOT / "node_modules/next/dist/bin/next"), "dev", "--webpack", *args],
                             cwd=ROOT, env=env, creationflags=hidden_process(), stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    try:
        for line in child.stdout:
            print(line, end="", flush=True)
        return child.wait()
    finally:
        if child.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, creationflags=hidden_process())
            else:
                child.terminate()
            child.wait(timeout=15)
        child.stdout.close()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = sys.argv[1:]
    live = "--live" in args or os.environ.get("GOAL_HINT_DEMO") == "false"
    args = [value for value in args if value != "--live"]
    prepare_only = "--prepare-only" in args
    args = [value for value in args if value != "--prepare-only"]
    verify_only = "--verify-only" in args
    args = [value for value in args if value != "--verify-only"]
    full = "--full" in args
    args = [value for value in args if value != "--full"]
    if live:
        env = dict(os.environ, GOAL_HINT_DEMO="false", NEXT_PUBLIC_GOAL_HINT_DEMO="false")
        env["PATH"] = os.pathsep.join([str(ROOT / "node_modules/.bin"), str(Path(development_node_binary()).parent), env.get("PATH", "")])
        return subprocess.call([development_node_binary(), str(ROOT / "node_modules/nodemon/bin/nodemon.js"), *args], cwd=ROOT, env=env)
    with DevelopmentMysql() as instance:
        env = demo_environment(instance.url)
        catalog = subprocess.run([development_node_binary(), "--conditions=react-server", "--input-type=module", "-e",
            "import {demoFootballCatalog} from './src/server/demo/api-football.ts'; console.log(demoFootballCatalog.leagues.map(row=>row.id).join(','))"],
            cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", timeout=30, creationflags=hidden_process())
        if catalog.returncode or not re.fullmatch(r"[1-9]\d*(,[1-9]\d*)*", catalog.stdout.strip()):
            raise CommandError("The synthetic football catalog could not be loaded.")
        env["GOAL_HINT_COMPETITION_IDS"] = catalog.stdout.strip()
        print("Applying the normal application migrations to the owned demo database…", flush=True)
        run_checked([str(ROOT / "node_modules/prisma/build/index.js"), "migrate", "deploy"], env)
        run_checked(["--conditions=react-server", "src/server/demo/seed-command.ts", "full" if full else "bootstrap"], env, timeout=21600 if full else 7200)
        if verify_only:
            env["DEMO_DATABASE_INTEGRATION"] = "1"
            run_checked(["--conditions=react-server", "--test", "--test-concurrency=1", "tests/demo-persistence.integration.mjs",
                         "tests/demo-clock.integration.mjs", "tests/demo-workspace.integration.mjs"], env, timeout=1200)
            return 0
        if prepare_only:
            return 0
        print("Development demo ready. The normal app uses synthetic API-Football data; Ctrl+C preserves the demo database.", flush=True)
        return run_web(args, env)


if __name__ == "__main__":
    try:
        main_guard(main, "Development demo failed; the owned database files were preserved.")
    except KeyboardInterrupt:
        pass
