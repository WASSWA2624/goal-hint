"""Deploy the cPanel bundle to the Namecheap host over key-only SSH.

Usage:
  python scripts/deploy-cpanel.py [--build] [--zip PATH]   upload, activate, restart, verify
  python scripts/deploy-cpanel.py --status                  deployed build, app state, log tail
  python scripts/deploy-cpanel.py --logs [N]                last N lines of the app log
  python scripts/deploy-cpanel.py --rollback                reactivate the previously active release
  python scripts/deploy-cpanel.py --restart                 reapply private files, then restart

Each release is extracted to ~/goal-hint-releases/<stamp>/ and activated by
repointing the ~/goal-hint/standalone symlink, so rollback is a single swap.
Private files live once in ~/goal-hint-private/ (.env.production.local and
.goal-hint/) and are copied into every release; this script never reads them.
Authentication uses only the SSH key: password prompts are disabled.
Override the target with CPANEL_SSH_HOST, CPANEL_SSH_PORT, CPANEL_SSH_USER,
CPANEL_SSH_KEY, CPANEL_APP_ROOT and CPANEL_DOMAIN.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import sys
import zipfile

from lib.runtime import CommandError, ROOT, main_guard

HOST = os.environ.get("CPANEL_SSH_HOST", "66.29.132.57")
PORT = os.environ.get("CPANEL_SSH_PORT", "21098")
USER = os.environ.get("CPANEL_SSH_USER", "hossuney")
KEY = Path(os.environ.get("CPANEL_SSH_KEY", Path.home() / ".ssh" / "goalhint_deploy"))
APP_ROOT = os.environ.get("CPANEL_APP_ROOT", "goal-hint")
DOMAIN = os.environ.get("CPANEL_DOMAIN", "goalhint.com")
ZIP = ROOT / "deploy/goal-hint-cpanel.zip"
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
    if [ -f "$app/stderr.log" ]; then tail -n 20 "$app/stderr.log"; else echo "(no stderr.log yet)"; fi
    ;;
  logs) if [ -f "$app/stderr.log" ]; then tail -n "$3" "$app/stderr.log"; else echo "(no stderr.log yet)"; fi ;;
  restart) restart; echo "Restarted with the current private files." ;;
  verify)  # Through the web server on this host, so it works before public DNS does.
    for i in $(seq 1 10); do
      code="$(curl -sk -L -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$3:443:$4" "https://$3/" || true)"
      [ "$code" = 200 ] && { echo "Verified https://$3/ on the server -> HTTP 200"; exit 0; }
      echo "  waiting for the app (HTTP $code), attempt $i/10" >&2; sleep 5
    done
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
    result = subprocess.run([tool("scp"), *SSH_OPTIONS, "-P", PORT, "-q", str(archive), f"{USER}@{HOST}:{upload}"], capture_output=True, text=True)
    if result.returncode:
        raise CommandError(f"Upload failed:\n{result.stderr.strip()}")
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
    parser.add_argument("--build", action="store_true", help="rebuild the zip with the pinned Node.js first")
    parser.add_argument("--zip", type=Path, default=ZIP, help="bundle to deploy (default: deploy/goal-hint-cpanel.zip)")
    options = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):  # Next's log symbols are not cp1252.
        stream.reconfigure(encoding="utf-8", errors="replace")
    if options.status:
        print(remote("status"))
    elif options.logs is not None:
        print(remote("logs", str(max(options.logs, 1))))
    elif options.rollback or options.restart:
        print(remote("rollback" if options.rollback else "restart"))
        verify()
    else:
        if options.build:
            build()
        deploy(options.zip.resolve())


if __name__ == "__main__":
    main_guard(main, "Deployment failed unexpectedly; rerun with --status or --logs.")
