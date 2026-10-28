"""Start the normal Next application with an isolated, persistent demo database."""
from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import sys
import threading

from lib.development_mysql import DevelopmentMysql
from lib.development_process import process_record, process_snapshot, release_port, stop_process
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


def web_arguments(args, source=None):
    """Choose one explicit port; Next must not silently fall back to another."""
    source = os.environ if source is None else source
    port = source.get("PORT") or "3000"
    forwarded = []
    index = 0
    while index < len(args):
        value = args[index]
        if value in ("--port", "-p"):
            index += 1
            if index >= len(args):
                raise CommandError("The development port requires a value between 1 and 65535.")
            port = args[index]
        elif value.startswith(("--port=", "-p=")):
            port = value.split("=", 1)[1]
        elif value.startswith("-p") and value[2:].isdigit():
            port = value[2:]
        else:
            forwarded.append(value)
        index += 1
    if not re.fullmatch(r"[0-9]+", str(port)) or not 1 <= int(port) <= 65535:
        raise CommandError("The development port must be an integer between 1 and 65535.")
    return [*forwarded, "--port", str(int(port))], int(port)


def release_development_web(port):
    release_port(port)
    # An orphan instance of this checkout on a different port also holds Next's
    # development lock. Stop its process tree, never an app-name-wide selection.
    project = os.path.normcase(str(ROOT.resolve())).replace("\\", "/") + "/node_modules/"
    for process in process_snapshot():
        if process["name"].lower() not in ("node", "node.exe"):
            continue
        command = os.path.normcase(process["command"]).replace("\\", "/")
        next_dev = project + "next/dist/bin/next" in command and re.search(r"\sdev(?:\s|$)", command)
        nodemon = project + "nodemon/bin/nodemon.js" in command
        if next_dev or nodemon:
            print(f"Stopping the previous development web process (PID {process['pid']})…", flush=True)
            stop_process(process, tree=True)


def run_web(args, env, port, *, live=False):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    command = [development_node_binary(), str(ROOT / "node_modules/nodemon/bin/nodemon.js"), *args] if live else [
        development_node_binary(), str(ROOT / "node_modules/next/dist/bin/next"), "dev", "--webpack", *args]
    for attempt in range(3):
        release_port(port)
        child = subprocess.Popen(command, cwd=ROOT, env=env, creationflags=hidden_process(), stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        address_in_use = False
        try:
            for line in child.stdout:
                print(line, end="", flush=True)
                address_in_use |= "EADDRINUSE" in line or "address already in use" in line.lower()
            code = child.wait()
        finally:
            if child.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, creationflags=hidden_process())
                else:
                    known_child = process_record(child.pid)
                    if known_child:
                        stop_process(known_child, tree=True)
                    else:
                        child.terminate()
                child.wait(timeout=15)
            child.stdout.close()
        if not code or not address_in_use or live or attempt == 2:
            return code
        print(f"Port {port} was occupied during startup; releasing it and restarting Next…", flush=True)
    return 1


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
    if live and (prepare_only or verify_only or full):
        raise CommandError("Preparation and verification flags apply only to the development demo.")
    if prepare_only and verify_only:
        raise CommandError("Choose either --prepare-only or --verify-only.")
    if "--help" in args or "-h" in args:
        return subprocess.call([development_node_binary(), str(ROOT / "node_modules/next/dist/bin/next"), "dev", "--help"], cwd=ROOT)
    if not prepare_only and not verify_only:
        args, port = web_arguments(args)
        release_development_web(port)
    if live:
        env = dict(os.environ, GOAL_HINT_DEMO="false", NEXT_PUBLIC_GOAL_HINT_DEMO="false")
        env["PATH"] = os.pathsep.join([str(ROOT / "node_modules/.bin"), str(Path(development_node_binary()).parent), env.get("PATH", "")])
        return run_web(args, env, port, live=True)
    with DevelopmentMysql(replace_running=not (prepare_only or verify_only)) as instance:
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
        return run_web(args, env, port)


if __name__ == "__main__":
    try:
        main_guard(main, "Development demo failed; the owned database files were preserved.")
    except KeyboardInterrupt:
        pass
