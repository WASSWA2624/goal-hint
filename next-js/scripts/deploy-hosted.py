"""Promote one locally verified web artifact through the hosted environments."""

import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile

from lib.deployment import web_archive
from lib.release_bundle import ReleaseBundle, ReleaseBundleError
from lib.runtime import CommandError, ROOT, main_guard, node_binary


VPS = "ghprod@104.207.86.22"
PORT = 21098
RECEIVER = ROOT / "scripts/receive-hosted.py"
BROWSER_VERIFIER = ROOT / "scripts/verify-hosted-feed-browser.mjs"
LOADER = 'import sys; s = sys.stdin.buffer; exec(compile(s.read(int(s.readline())), "receive-hosted.py", "exec"))'


def approved_commit(target, commit, restore):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise CommandError("Supply the complete approved Git commit SHA.")
    ref = f"refs/heads/{target}"
    development = "refs/heads/development"
    refs = [development, ref] if target == "staging" else [development, "refs/heads/staging", ref]
    result = subprocess.run(["git", "ls-remote", "--heads", "origin", *refs], cwd=ROOT,
                            capture_output=True, text=True, timeout=30)
    tips = {branch: revision for revision, branch in (line.split("\t", 1) for line in result.stdout.splitlines())}
    if result.returncode or tips.keys() != set(refs):
        raise CommandError("The required environment branches were not found on origin.")
    for branch, revision in tips.items():
        if branch == development or restore:
            ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", commit, revision], cwd=ROOT,
                                      capture_output=True, timeout=15)
            if ancestor.returncode:
                raise CommandError(f"The commit must be reachable from {branch}. Fetch the branch if needed.")
        elif commit != revision:
            raise CommandError(f"The approved commit must be at the tip of {branch} on origin.")


def record(stream, value):
    stream.write(json.dumps(value, separators=(",", ":")).encode() + b"\n")
    stream.flush()


def read_record(process):
    line = process.stdout.readline()
    try:
        response = json.loads(line)
    except ValueError:
        raise CommandError("The deployment receiver did not respond. Check operator SSH access and diagnostics.") from None
    if not response.get("ok"):
        raise CommandError(response.get("error", "The target declined deployment."))
    return response


def verify_browser(options, build):
    origin = "https://test.goalhint.com" if options.target == "staging" else "https://goalhint.com"
    print(f"{options.target}: checking list and performance counts in Chrome.", flush=True)
    try:
        result = subprocess.run([node_binary(), str(BROWSER_VERIFIER), origin, build, str(options.playwright_module)],
                                timeout=125, cwd=ROOT)
        return result.returncode == 0
    except (CommandError, OSError, subprocess.TimeoutExpired):
        print("Chrome verification did not complete.", flush=True)
        return False


def deploy(options, bundle):
    receiver = RECEIVER.read_bytes()
    arguments = ["ssh", "-F", "none", "-T", "-p", str(options.port), "-o", "BatchMode=yes",
                 "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15",
                 "-o", "ServerAliveCountMax=3"]
    if options.identity_file:
        arguments += ["-i", str(options.identity_file), "-o", "IdentitiesOnly=yes"]
    arguments += ["-o", f'UserKnownHostsFile="{options.known_hosts.as_posix()}"']
    remote = shlex.join(["python3", "-u", "-c", LOADER])
    request = {"target": options.target, "manifest": bundle.manifest, "preview": not options.apply,
               "migrationOptions": options.migration_options, "node": options.node,
               "applyMigrations": options.apply_migrations, "prune": options.prune_release,
               "verifyBrowser": options.playwright_module is not None}
    with subprocess.Popen([*arguments, "--", options.ssh_host, remote], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE) as process:
        try:
            process.stdin.write(str(len(receiver)).encode() + b"\n" + receiver)
            record(process.stdin, request)
            plan = read_record(process)
            print(f"{options.target}: {plan['currentCommit'][:12]} to {options.commit[:12]}. "
                  f"{plan['added']} added, {plan['modified']} changed, {plan['deleted']} obsolete. "
                  f"Migration inventory {'changed' if plan['migrationsChanged'] else 'unchanged'}.", flush=True)
            print(f"Existing release directories: {', '.join(plan['otherReleases']) or 'none'}.", flush=True)
            if options.apply:
                with tempfile.TemporaryDirectory(prefix="goalhint-delta-") as directory:
                    delta = Path(directory) / "delta.zip"
                    bundle.write_delta(delta, plan["writes"])
                    size = delta.stat().st_size
                    record(process.stdin, {"bytes": size})
                    with delta.open("rb") as source:
                        shutil.copyfileobj(source, process.stdin, 1024 * 1024)
                    process.stdin.flush()
                    print(f"Transferred {size:,} bytes for {len(plan['writes']):,} files.", flush=True)
                result = read_record(process)
                if result.get("verifyBrowser"):
                    verified = options.playwright_module is not None and verify_browser(options, bundle.manifest["buildId"])
                    record(process.stdin, {"browserVerified": verified})
                    result = read_record(process)
                print(f"Verified {result['commit']} (Next build {result['buildId']}). "
                      f"Remaining release directories: {', '.join(result['remaining']) or 'none'}.", flush=True)
            process.stdin.close()
            if process.wait(timeout=30):
                raise CommandError("SSH did not complete cleanly. Check the target before retrying.")
        finally:
            if process.poll() is None:
                process.stdin.close()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=("staging", "production"))
    parser.add_argument("--commit", required=True, help="complete approved Git commit SHA")
    parser.add_argument("--archive", default=web_archive(), type=Path, help="local ZIP with adjacent SHA-256")
    parser.add_argument("--apply", action="store_true", help="deploy after preflight; default only previews changes")
    parser.add_argument("--ssh-host", default=VPS)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--identity-file", type=Path)
    parser.add_argument("--known-hosts", type=Path, default=Path.home() / ".ssh/goalhint_hypernova_known_hosts")
    parser.add_argument("--node", default="/opt/node-v24.18.1-linux-x64/bin/node", help="absolute hosted Node path")
    parser.add_argument("--migration-options", help="absolute private MariaDB options path on the VPS")
    parser.add_argument("--playwright-module", type=Path, help="verify the live candidate in Chrome before committing the cutover")
    parser.add_argument("--apply-migrations", action="store_true", help="confirm migration review and any required writer pause")
    parser.add_argument("--restore", action="store_true", help="restore an earlier commit reachable from the environment branches")
    parser.add_argument("--prune-release", action="append", default=[], help="specific audited obsolete release directory name")
    options = parser.parse_args()
    if not options.apply and (options.apply_migrations or options.prune_release):
        parser.error("--apply-migrations and --prune-release require --apply")
    if options.restore and options.apply_migrations:
        parser.error("--restore cannot apply migrations")
    if options.playwright_module is not None:
        options.playwright_module = options.playwright_module.resolve()
        if not options.apply or not options.playwright_module.is_file() or not BROWSER_VERIFIER.is_file():
            parser.error("--playwright-module requires --apply, a local Playwright module and the browser verifier")
    approved_commit(options.target, options.commit, options.restore)
    try:
        with ReleaseBundle(options.archive, commit=options.commit) as bundle:
            deploy(options, bundle)
    except (ReleaseBundleError, BrokenPipeError) as error:
        raise CommandError(str(error)) from None


if __name__ == "__main__":
    main_guard(main, "Deploy failed. Inspect the SSH and release diagnostics before retrying.")
