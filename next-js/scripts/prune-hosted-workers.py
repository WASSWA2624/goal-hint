"""Remove explicitly reviewed, inactive hosted worker packages under their existing locks."""
import argparse
from contextlib import ExitStack, contextmanager
import fcntl
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess

COMMIT = re.compile(r"[0-9a-f]{40}")
ROLE_DIRECTORIES = {"football": "goal-hint-worker", "publisher": "goal-hint-slip-publisher"}
ROLE_LAUNCHERS = {"football": "football-only-cron.sh", "publisher": "run-stored-publisher.sh"}
SOURCE_ENTRIES = set("""
.env.example .gitignore .goal-hint .node-version .npmrc .nvmrc .release-toolchain
.worker-revision README.md RELEASE_COMMIT RELEASE_SOURCE_SHA256 assets design dev-plan
dev-tracker.md docs eslint.config.mjs next.config.ts node_modules nodemon.json package-lock.json
package.json payment-flow-site prisma prisma.config.ts public scripts src tests tsconfig.json
""".split())


class PruneError(Exception):
    pass


@contextmanager
def exclusive_lock(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise PruneError(f"Unexpected lock ownership or permissions: {path.name}")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise PruneError(f"Busy worker or deployment lock: {path.name}") from error
        yield


def cron_launchers(roots):
    expected = {root / "private" / ROLE_LAUNCHERS[role] for role, root in roots.items()}
    cron = subprocess.run(["crontab", "-l"], capture_output=True, check=True, text=True)
    actual = []
    for line in cron.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or re.match(r"[A-Za-z_][A-Za-z0-9_]*\s*=", line):
            continue
        words = shlex.split(line, comments=True)
        command_position = 1 if words[0].startswith("@") else 5
        if len(words) <= command_position:
            raise PruneError("Could not verify the hosted worker cron entries.")
        actual.append(Path(words[command_position]))
    if len(actual) != len(expected) or set(actual) != expected:
        raise PruneError("The hosted cron launches have changed. Review worker references first.")
    return expected


def protected_commits(home, roots):
    launchers = cron_launchers(roots)
    for root in roots.values():
        launchers.update(item for item in (root / "private").rglob("*.sh") if item.is_file())
    for purpose in ("featured-policy", "targeted-odds"):
        records = home / "goal-hint-private" / purpose
        launchers.update(
            item for item in records.rglob("*")
            if item.is_file() and item.name.startswith(("football.", "publisher.", "publisher-"))
            and (item.suffix in {".before", ".after", ".deferred", ".check", ".sh", ".py"})
        )
    protected = set()
    for path in launchers:
        if path.is_symlink() or path.stat().st_size > 256 * 1024:
            raise PruneError("Review unexpected worker launcher files before pruning.")
        protected.update(COMMIT.findall(path.read_text(encoding="utf-8")))
    for root in roots.values():
        for link in root.iterdir():
            if link.is_symlink():
                protected.update(COMMIT.findall(link.resolve(strict=True).name))
    return protected


def package_directory(root, role, commit):
    name = f"{commit}-production" if role == "football" else commit
    releases = root / "releases"
    path = releases / name
    source = path if role == "football" else path / "next-js"
    if releases.is_symlink() or path.is_symlink() or source.is_symlink() or not source.is_dir():
        raise PruneError(f"Unexpected release directory: {role}/{name}")
    if path.resolve().parent != releases.absolute() or path.stat().st_uid != os.geteuid():
        raise PruneError(f"Unexpected release location or ownership: {role}/{name}")
    if role == "publisher" and {p.name for p in path.iterdir()} - {"COMMIT", "next-js"}:
        raise PruneError(f"Unexpected publisher payload: {name}")
    source_entries = {p.name for p in source.iterdir()}
    if source_entries - SOURCE_ENTRIES or not {"package.json", "package-lock.json", "src", "node_modules"} <= source_entries:
        raise PruneError(f"Unexpected packaged source layout: {role}/{name}")
    for marker in (path / "COMMIT", source / "RELEASE_COMMIT"):
        if marker.exists() and (marker.is_symlink() or marker.read_text(encoding="utf-8").strip() != commit):
            raise PruneError(f"Release marker does not match: {role}/{name}")
    approvals = source / ".goal-hint"
    if approvals.exists() and (approvals.is_symlink() or {p.name for p in approvals.iterdir()} - {"owner-approvals.json"}):
        raise PruneError(f"Unexpected worker settings inside release: {role}/{name}")
    device = path.stat().st_dev
    for parent, dirs, _ in os.walk(path, followlinks=False):
        if any((Path(parent) / directory).lstat().st_dev != device for directory in dirs):
            raise PruneError(f"Release contains another filesystem: {role}/{name}")
    return path


def plan(home, roots, requested):
    protected = protected_commits(home, roots)
    packages = []
    for role, commit in requested:
        if commit in protected:
            raise PruneError(f"An active worker or fallback references {commit}.")
        packages.append(package_directory(roots[role], role, commit))
    return packages


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for role in ROLE_DIRECTORIES:
        parser.add_argument(f"--{role}", action="append", default=[], metavar="FULL_COMMIT")
    parser.add_argument("--apply", action="store_true", help="Delete the selected packages after checking both worker locks.")
    args = parser.parse_args()
    requested = sorted({(role, commit) for role in ROLE_DIRECTORIES for commit in getattr(args, role)})
    if not requested or any(COMMIT.fullmatch(commit) is None for _, commit in requested):
        parser.error("Supply one or more full commit IDs with --football or --publisher.")

    home = Path.home()
    if home != Path("/home/ghprod") or home.is_symlink() or home.stat().st_uid != os.geteuid():
        parser.error("Run as the hosted production account.")
    roots = {role: home / directory for role, directory in ROLE_DIRECTORIES.items()}
    if any(root.is_symlink() or root.stat().st_uid != os.geteuid() for root in roots.values()):
        parser.error("A worker root has unexpected ownership or is a symlink.")
    try:
        if args.apply:
            with ExitStack() as locks:
                for lock in (home / "goal-hint-private/.release.lock",
                             roots["football"] / "worker.lock",
                             roots["publisher"] / "private/publisher.lock"):
                    locks.enter_context(exclusive_lock(lock))
                for path in plan(home, roots, requested):
                    shutil.rmtree(path)
                    print(f"Removed {path.relative_to(home)}", flush=True)
        else:
            for path in plan(home, roots, requested):
                print(f"Would remove {path.relative_to(home)}")
    except PruneError as error:
        parser.exit(1, f"{error}\n")
    except (OSError, subprocess.SubprocessError, ValueError):
        parser.exit(1, "Could not verify or remove all selected worker packages. Inspect the worker paths before retrying.\n")


if __name__ == "__main__":
    main()
