"""Deploy the cPanel bundle to the Namecheap host over key-only SSH.

Usage:
  python scripts/deploy-cpanel.py [--build] [--zip PATH]   upload, activate, restart, verify
  python scripts/deploy-cpanel.py --status                  deployed build, app state, log tail
  python scripts/deploy-cpanel.py --logs [N]                last N lines of the app log
  python scripts/deploy-cpanel.py --rollback                reactivate the previously active release
  python scripts/deploy-cpanel.py --restart                 reapply private files, then restart
  python scripts/deploy-cpanel.py --config-pull             server settings -> deploy/.env.production.local
                                                            and deploy/.goal-hint/owner-approvals.json
  python scripts/deploy-cpanel.py --config-push             check those files, upload them, restart
  python scripts/deploy-cpanel.py --repair                  restore the domain's .htaccess routing, restart

Each release is extracted to ~/goal-hint-releases/<stamp>/ and activated by
repointing the ~/goal-hint/standalone symlink, so rollback is a single swap.
Private files live once in ~/goal-hint-private/ (.env.production.local and
.goal-hint/) and are copied into every release. --config-pull/--config-push edit
them through git-ignored local copies; the files never pass through command lines.
Authentication uses only the SSH key: password prompts are disabled.
Override the target with CPANEL_SSH_HOST, CPANEL_SSH_PORT, CPANEL_SSH_USER,
CPANEL_SSH_KEY, CPANEL_APP_ROOT and CPANEL_DOMAIN.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import zipfile

from lib.runtime import CommandError, ROOT, main_guard

HOST = os.environ.get("CPANEL_SSH_HOST", "66.29.132.57")
PORT = os.environ.get("CPANEL_SSH_PORT", "21098")
USER = os.environ.get("CPANEL_SSH_USER", "hossuney")
KEY = Path(os.environ.get("CPANEL_SSH_KEY", Path.home() / ".ssh" / "goalhint_deploy"))
APP_ROOT = os.environ.get("CPANEL_APP_ROOT", "goal-hint")
DOMAIN = os.environ.get("CPANEL_DOMAIN", "goalhint.com")
ZIP = ROOT / "deploy/goal-hint-cpanel.zip"
# Git-ignored local copies of ~/<app>-private (.gitignore: .env*, .goal-hint/).
LOCAL_CONFIG = {".env.production.local": ROOT / "deploy/.env.production.local",
                ".goal-hint/owner-approvals.json": ROOT / "deploy/.goal-hint/owner-approvals.json"}
KEEP_RELEASES = 3
# Created once with the app; later deploys never touch cPanel environment variables.
# Database settings belong in ~/goal-hint-private/.env.production.local: cPanel writes
# these into the domain's .htaccess, and they would override the private file.
INITIAL_ENV = {"GOAL_HINT_DEPLOYMENT_ENVIRONMENT": "production"}

SSH_OPTIONS = ["-i", str(KEY), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "PasswordAuthentication=no",
               "-o", "KbdInteractiveAuthentication=no", "-o", "ConnectTimeout=20", "-o", "StrictHostKeyChecking=accept-new",
               "-o", "LogLevel=ERROR"]

# Runs on the server as `bash -s -- <command> <args>`. Release paths are all under $HOME.
REMOTE = r"""
set -euo pipefail
command="$1"; app_root="$2"; app="$HOME/$app_root"
releases="$HOME/$app_root-releases"; private="$HOME/$app_root-private"
selector() { cloudlinux-selector "$@" --json --interpreter nodejs; }
app_exists() { selector get | python3 -c 'import json,sys; d=json.load(sys.stdin); print(any(sys.argv[1] in (u.get("applications") or {}) for v in d.get("available_versions",{}).values() for u in (v.get("users") or {}).values()))' "$app_root" | grep -q True; }
current() { readlink "$app/standalone" 2>/dev/null | sed -E 's#^.*/([^/]+)/goal-hint/standalone$#\1#'; }
complete() { [ -f "$releases/$1/goal-hint/app.js" ] && [ -f "$releases/$1/goal-hint/package.json" ] && [ -f "$releases/$1/goal-hint/standalone/server.js" ]; }

sync_private() {  # Mirror ~/<app>-private into a release. A file missing there leaves the release
  local dir="$1" name  # (a withdrawn approval must take effect) but is moved aside, never deleted.
  for name in .env.production.local .goal-hint; do
    if [ -e "$private/$name" ]; then
      rm -rf "${dir:?}/$name"; cp -a "$private/$name" "$dir/$name"; chmod -R go-rwx "$dir/$name"
    elif [ -e "$dir/$name" ]; then
      mv "$dir/$name" "$private/$name.removed-$(date +%Y%m%d%H%M%S)"
      echo "Moved $name out of the release into $private, because $private has no $name." >&2
    fi
  done
}

restart() {
  if [ -L "$app/standalone" ]; then sync_private "$(readlink -f "$app/standalone")"
  elif [ -e "$app/standalone" ]; then echo "$app/standalone is not a release link; deploy once with this script first." >&2; exit 3; fi
  if app_exists; then selector restart --app-root "$app_root" >/dev/null; else mkdir -p "$app/tmp"; touch "$app/tmp/restart.txt"; fi
}

activate() {  # $1 = release stamp. Touching the release keeps `ls -t` in activation order for rollback.
  local target="$releases/$1/goal-hint" f
  complete "$1" || { echo "Release $1 is incomplete." >&2; exit 3; }
  sync_private "$target/standalone"
  for f in app.js package.json BUILD_INFO.json DEPLOY.md .env.example; do [ ! -e "$target/$f" ] || cp -p "$target/$f" "$app/$f"; done
  ln -sfn "$target/standalone" "$app/standalone.next" && mv -Tf "$app/standalone.next" "$app/standalone"
  touch "$releases/$1"
}

case "$command" in
  deploy)
    zip="$HOME/$3"; stamp="$4"; env_json="$5"; domain="$6"; keep="$7"
    trap 'rm -f "$zip"' EXIT
    mkdir -p "$releases" "$private" "$app"; chmod 700 "$releases" "$private"
    unzip -q "$zip" -d "$releases/$stamp" && complete "$stamp" || { rm -rf "${releases:?}/$stamp"; echo "Uploaded bundle is incomplete." >&2; exit 3; }
    # A manually extracted standalone/ directory becomes a normal, restorable release.
    if [ -d "$app/standalone" ] && [ ! -L "$app/standalone" ]; then
      legacy="$releases/legacy-$stamp/goal-hint"; mkdir -p "$legacy"
      for f in .env.production.local .goal-hint; do
        [ -e "$app/standalone/$f" ] && [ ! -e "$private/$f" ] && cp -a "$app/standalone/$f" "$private/$f"
      done
      mv "$app/standalone" "$legacy/standalone"
      for f in app.js package.json BUILD_INFO.json DEPLOY.md .env.example; do [ -e "$app/$f" ] && cp -p "$app/$f" "$legacy/$f"; done
    fi
    previous="$(current || true)"
    activate "$stamp"
    if ! app_exists; then
      selector create --app-root "$app_root" --domain "$domain" --app-uri "" --version 24 --app-mode production \
        --startup-file app.js --env-vars "$env_json" >/dev/null
      echo "Created the Node.js application for $domain."
    fi
    restart
    # Keep the newest releases, plus whatever was active before this deploy.
    ls -1t "$releases" | tail -n +$(( keep + 1 )) | while read -r old; do
      [ "$old" = "$previous" ] || [ "$old" = "$stamp" ] || rm -rf -- "${releases:?}/$old"
    done
    echo "Activated $stamp (previous: ${previous:-none})."
    ;;
  rollback)
    now="$(current || true)"; [ -n "$now" ] || { echo "No active release." >&2; exit 3; }
    previous=""
    for r in $(ls -1t "$releases"); do [ "$r" != "$now" ] && complete "$r" && { previous="$r"; break; }; done
    [ -n "$previous" ] || { echo "No earlier release to roll back to." >&2; exit 3; }
    activate "$previous"; restart; echo "Rolled back from $now to $previous."
    ;;
  status)
    echo "Active release: $(current || echo none)"; cat "$app/BUILD_INFO.json" 2>/dev/null || true
    echo "Releases: $(ls -1t "$releases" 2>/dev/null | tr '\n' ' ')"
    app_exists && echo "Node.js application: configured" || echo "Node.js application: missing"
    echo "cPanel environment variables: $(selector get | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" ".join(sorted(k for v in d.get("available_versions",{}).values() for u in (v.get("users") or {}).values() for a,c in (u.get("applications") or {}).items() if a==sys.argv[1] for k in (c.get("env_vars") or {}))) or "none")' "$app_root")"
    echo "Private files: $(cd "$private" 2>/dev/null && ls -1d .env.production.local .goal-hint/owner-approvals.json 2>/dev/null | tr '\n' ' ' || true)"
    if [ -f "$app/stderr.log" ]; then tail -n 20 "$app/stderr.log"; else echo "(no stderr.log yet)"; fi
    ;;
  logs) if [ -f "$app/stderr.log" ]; then tail -n "$3" "$app/stderr.log"; else echo "(no stderr.log yet)"; fi ;;
  restart) restart; echo "Restarted with the current private files." ;;
  repair)  # Recreate the Passenger block that routes the domain to the app (lost if ~/<domain>/.htaccess is deleted).
    root="$(uapi --output=json DomainInfo single_domain_data domain="$3" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["data"]["documentroot"])')"
    node="$HOME/nodevenv/$app_root/24/bin/node"
    [ -x "$node" ] || { echo "No Node.js 24 environment for $app_root; deploy first." >&2; exit 3; }
    if grep -qF "PassengerAppRoot \"$app\"" "$root/.htaccess" 2>/dev/null; then
      echo "$root/.htaccess already routes to $app."
    else
      { printf '# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN\nPassengerAppRoot "%s"\nPassengerBaseURI "/"\nPassengerNodejs "%s"\nPassengerAppType node\nPassengerStartupFile app.js\n# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END\n' "$app" "$node"
        cat "$root/.htaccess" 2>/dev/null || true; } > "$root/.htaccess.new"
      chmod 644 "$root/.htaccess.new"; mv -f "$root/.htaccess.new" "$root/.htaccess"
      echo "Restored the Passenger routing in $root/.htaccess."
    fi
    selector set --app-root "$app_root" --env-vars "$4" >/dev/null  # rewrites the environment section
    restart; echo "Restarted." ;;
  config-get)  # name<TAB>base64 per existing private file.
    for f in .env.production.local .goal-hint/owner-approvals.json; do
      [ ! -f "$private/$f" ] || printf '%s\t%s\n' "$f" "$(base64 -w0 "$private/$f")"
    done ;;
  config-install)  # Uploaded as *.new by scp; installed with owner-only permissions.
    mkdir -p "$private/.goal-hint"; chmod 700 "$private" "$private/.goal-hint"
    for f in .env.production.local .goal-hint/owner-approvals.json; do
      [ ! -f "$private/$f.new" ] || { chmod 600 "$private/$f.new"; mv -f "$private/$f.new" "$private/$f"; echo "Installed $f."; }
    done
    restart ;;
  verify)  # Through the web server on this host, so it works before public DNS does.
    for i in $(seq 1 10); do
      code="$(curl -sk -L -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$3:443:$4" "https://$3/" || true)"
      if [ "$code" = 200 ]; then
        api="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$3:443:$4" "https://$3/api/matches" || true)"
        echo "Verified https://$3/ on the server -> HTTP 200 (/api/matches -> HTTP $api; 503 = database off or refused)"; exit 0
      fi
      echo "  waiting for the app (HTTP $code), attempt $i/10" >&2; sleep 5
    done
    [ "$code" != 404 ] || echo "A 404 from LiteSpeed means the domain no longer routes to the app; run --repair." >&2
    echo "https://$3/ did not return HTTP 200; run --logs, or --rollback." >&2; exit 4 ;;
  *) echo "Unknown command $command" >&2; exit 2 ;;
esac
"""


def tool(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise CommandError(f"OpenSSH `{name}` was not found on PATH.")
    return found


def remote(command: str, *args: str, timeout: int = 300) -> str:
    if not KEY.exists():
        raise CommandError(f"SSH key {KEY} is missing. Authorize its .pub in cPanel > SSH Access first.")
    try:
        result = subprocess.run([tool("ssh"), *SSH_OPTIONS, "-p", PORT, f"{USER}@{HOST}", "bash -s -- " + shlex.join([command, APP_ROOT, *args])],
                                input=REMOTE.encode(), capture_output=True, timeout=timeout)  # bytes: no CRLF on Windows
    except subprocess.TimeoutExpired:
        raise CommandError(f"Remote {command} timed out after {timeout}s; run --logs.") from None
    stdout, stderr = result.stdout.decode("utf-8", "replace").strip(), result.stderr.decode("utf-8", "replace").strip()
    if result.returncode:
        raise CommandError(f"Remote {command} failed:\n{stderr or stdout}")
    return stdout


def scp(local: Path, destination: str) -> None:
    # Budget for a slow uplink (8 KB/s): a 14 MB bundle takes over ten minutes at 20 KB/s.
    timeout = max(600, local.stat().st_size // 8_000)
    try:
        result = subprocess.run([tool("scp"), *SSH_OPTIONS, "-P", PORT, "-q", str(local), f"{USER}@{HOST}:{destination}"],
                                capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise CommandError(f"Upload timed out after {timeout}s; nothing was activated.") from None
    if result.returncode:
        raise CommandError(f"Upload failed:\n{result.stderr.strip()}")


def config_pull() -> None:
    files = dict(line.split("\t", 1) for line in remote("config-get").splitlines() if "\t" in line)
    for name, local in LOCAL_CONFIG.items():
        if name in files:
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(base64.b64decode(files[name]))
            print(f"Pulled {name} -> {local.relative_to(ROOT)}")
        else:
            print(f"The server has no {name} yet.")


def check_config(env_text: str | None, approvals_text: str | None) -> list[str]:
    """Catch the mistakes that otherwise surface only as an unlogged 503 or a 500. Names only, never values."""
    problems, env = [], {}
    known = set(re.findall(r"^[A-Z][A-Z0-9_]*(?==)", (ROOT / ".env.example").read_text(encoding="utf-8"), re.M))
    for number, line in enumerate((env_text or "").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key.strip()):
            problems.append(f".env.production.local line {number} is not NAME=value")
            continue
        env[key.strip()] = value.strip().strip("\"'")
    for key in env:
        if key.startswith("NEXT_PUBLIC_") or key in ("PORT", "HOSTNAME", "DEBUG", "NODE_ENV"):
            problems.append(f"{key} must not be set in production")
        elif key.startswith("GOAL_HINT_") and key not in known:
            problems.append(f"{key} is not a known setting (see .env.example)")
    if env.get("GOAL_HINT_DATABASE_ENABLED") == "true":
        for key in ("DATABASE_URL", "GOAL_HINT_DATABASE_ACCESS_REF", "GOAL_HINT_BUDGET_APPROVAL_REF", "GOAL_HINT_COMPETITION_IDS"):
            if not env.get(key):
                problems.append(f"{key} is required when the database is enabled")
        expected = {"GOAL_HINT_DATABASE_CONNECTION_MODE": "direct", "GOAL_HINT_DATABASE_TLS_MODE": "required"}
        problems += [f"{key} must be {value}" for key, value in expected.items() if env.get(key) != value]
        if not re.fullmatch(r"[1-9][0-9]*", env.get("GOAL_HINT_DATABASE_POOL_LIMIT", "")):
            problems.append("GOAL_HINT_DATABASE_POOL_LIMIT must be a positive integer")
        if not re.fullmatch(r"0|[1-9][0-9]*", env.get("GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS", "")):
            problems.append("GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS must be a whole number of cents")
        url = env.get("DATABASE_URL", "")
        if "<" in url or ">" in url:
            problems.append("DATABASE_URL still contains a <placeholder>")
        elif url and (not url.startswith("mysql://") or "?" in url or "#" in url):
            problems.append("DATABASE_URL must be mysql://user:percent-encoded-password@host:port/database with no ? or #")
    if approvals_text is not None:
        try:
            register = json.loads(approvals_text)
            records = register["approvals"]
            valid = (set(register) == {"version", "owner", "approvals"} and register["version"] == 1 and str(register["owner"]).strip()
                     and isinstance(records, list) and records
                     and all(isinstance(item, dict) and set(item) == {"requirement", "reference", "approvedAt", "decision"}
                             and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(item["approvedAt"])) and str(item["decision"]).strip() for item in records))
            pairs = [(item["requirement"], item["reference"]) for item in records] if valid else []
        except (ValueError, KeyError, TypeError):
            valid, pairs = False, []
        if not valid or len(pairs) != len(set(pairs)):
            problems.append("owner-approvals.json must be {version: 1, owner, approvals: [{requirement, reference, approvedAt: YYYY-MM-DD, decision}]} without duplicates")
        elif env.get("GOAL_HINT_DATABASE_ENABLED") == "true":
            for requirement, key in (("database-access", "GOAL_HINT_DATABASE_ACCESS_REF"), ("budget-approval", "GOAL_HINT_BUDGET_APPROVAL_REF")):
                if env.get(key) and (requirement, env[key]) not in pairs:
                    problems.append(f"{key} has no matching {requirement} record in owner-approvals.json")
    return problems


def config_push() -> None:
    texts = {name: local.read_bytes().decode("utf-8-sig").replace("\r\n", "\n") for name, local in LOCAL_CONFIG.items() if local.exists()}
    if not texts:
        raise CommandError("Nothing to push. Run --config-pull first, or create deploy/.env.production.local.")
    problems = check_config(texts.get(".env.production.local"), texts.get(".goal-hint/owner-approvals.json"))
    if problems:
        raise CommandError("Configuration not pushed:\n- " + "\n- ".join(problems))
    with tempfile.TemporaryDirectory() as directory:
        for name, text in texts.items():
            staged = Path(directory) / Path(name).name
            staged.write_text(text, encoding="utf-8", newline="\n")
            scp(staged, f"{APP_ROOT}-private/{name}.new")
    print(remote("config-install"))
    verify()


def build() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    npm = "npm.cmd" if os.name == "nt" else "npm"
    command = [npm, "run", "package:cpanel"]
    if shutil.which("fnm"):
        command = ["fnm", "exec", f"--using={package['engines']['node']}", *command]
    print("> " + " ".join(command), flush=True)
    if subprocess.run(command, cwd=ROOT).returncode:
        raise CommandError("Build failed; see the output above.")


def inspect_bundle(archive: Path) -> dict:
    if not archive.is_file():
        raise CommandError(f"{archive} does not exist; run with --build.")
    with zipfile.ZipFile(archive) as bundle:
        names = set(bundle.namelist())
        for required in ("goal-hint/app.js", "goal-hint/standalone/server.js", "goal-hint/BUILD_INFO.json"):
            if required not in names:
                raise CommandError(f"{archive.name} is missing {required}.")
        if any(name.startswith("goal-hint/node_modules/") for name in names):
            raise CommandError("The bundle has a root node_modules, which the CloudLinux selector rejects.")
        return json.loads(bundle.read("goal-hint/BUILD_INFO.json"))


def verify() -> None:
    server = socket.gethostbyname(HOST)
    print(remote("verify", DOMAIN, server))
    try:
        public = socket.gethostbyname(DOMAIN)
    except OSError:
        public = "nothing"
    if public != server:
        print(f"Warning: public DNS for {DOMAIN} points to {public}, not {server}; visitors won't reach this deployment yet.")


def deploy(archive: Path) -> None:
    info = inspect_bundle(archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + info["commit"][:7]
    print(f"Deploying {archive.name}: commit {info['commit'][:7]}{' (uncommitted changes)' if info.get('uncommittedChanges') else ''}, built {info['builtAt']}")
    upload = f"{APP_ROOT}-upload-{stamp}.zip"
    scp(archive, upload)
    check = subprocess.run([tool("ssh"), *SSH_OPTIONS, "-p", PORT, f"{USER}@{HOST}", "sha256sum " + shlex.quote(upload)],
                           capture_output=True, text=True, timeout=120)
    if check.returncode:
        raise CommandError(f"Could not checksum the upload:\n{check.stderr.strip()}")
    if check.stdout.split(" ")[0] != digest:
        subprocess.run([tool("ssh"), *SSH_OPTIONS, "-p", PORT, f"{USER}@{HOST}", "rm -f " + shlex.quote(upload)], capture_output=True, timeout=60)
        raise CommandError("Uploaded file checksum does not match; nothing was activated.")
    print(remote("deploy", upload, stamp, json.dumps(INITIAL_ENV), DOMAIN, str(KEEP_RELEASES)))
    verify()


def main():
    parser = argparse.ArgumentParser(description="Deploy Goal Hint to cPanel over key-only SSH.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--status", action="store_true", help="show the deployed build, app state and log tail")
    action.add_argument("--logs", nargs="?", type=int, const=100, metavar="N", help="show the last N log lines")
    action.add_argument("--rollback", action="store_true", help="reactivate the previously active release")
    action.add_argument("--restart", action="store_true", help="reapply ~/goal-hint-private files and restart")
    action.add_argument("--config-pull", action="store_true", help="download the server settings into deploy/ (git-ignored)")
    action.add_argument("--config-push", action="store_true", help="check deploy/ settings, upload them and restart")
    action.add_argument("--repair", action="store_true", help="restore the domain's .htaccess routing and restart")
    parser.add_argument("--build", action="store_true", help="rebuild the zip with the pinned Node.js first")
    parser.add_argument("--zip", type=Path, default=ZIP, help="bundle to deploy (default: deploy/goal-hint-cpanel.zip)")
    options = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):  # Next's log symbols are not cp1252.
        stream.reconfigure(encoding="utf-8", errors="replace")
    if options.status:
        print(remote("status"))
    elif options.logs is not None:
        print(remote("logs", str(max(options.logs, 1))))
    elif options.config_pull:
        config_pull()
    elif options.config_push:
        config_push()
    elif options.repair:
        print(remote("repair", DOMAIN, json.dumps(INITIAL_ENV)))
        verify()
    elif options.rollback or options.restart:
        print(remote("rollback" if options.rollback else "restart"))
        verify()
    else:
        if options.build:
            build()
        deploy(options.zip.resolve())


if __name__ == "__main__":
    main_guard(main, "Deployment failed unexpectedly; rerun with --status or --logs.")
