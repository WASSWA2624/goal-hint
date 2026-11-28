"""VPS side of the incremental Passenger deployment. Runs from the operator's SSH stream."""

from contextlib import ExitStack
import fcntl
from hashlib import file_digest
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import zipfile


ACCOUNT = "ghprod"
TARGETS = {
    "staging": ("goal-hint-test", "ghprod_test", ".env.test", "test.goalhint.com"),
    "production": ("goal-hint", "ghprod_prod", ".env.production", "goalhint.com"),
}
INFO = "BUILD_INFO.json"
BUILD_ID = "standalone/.next/BUILD_ID"
MIGRATION_MARKER = ".goal-hint-migrations.json"
RECEIPT = ".goal-hint-release.json"
PROBE = re.compile(r"standalone/public/goalhint-release-[0-9a-f]{32}\.txt")
HEX = re.compile(r"[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
RELEASE = re.compile(r"[0-9a-f]{7,64}(?:-[A-Za-z0-9-]+)?|live-[0-9a-f]{20}")
INCOMING = re.compile(r"\.incoming-[0-9a-f]{7,40}\.[A-Za-z0-9]+")
RUNTIME = {MIGRATION_MARKER, RECEIPT, "tmp/restart.txt", "standalone/.env.test", "standalone/.env.production",
           "standalone/.goal-hint/owner-approvals.json"}
PACKAGE_ROOTS = {"app.js", INFO, "package.json", "DEPLOY.md", ".env.example", "standalone", "prisma", "scripts"}
REQUIRED = {"app.js", INFO, BUILD_ID, "standalone/server.js", "scripts/deploy-mariadb.py"}
CACHE_DIRECTORIES = {"standalone/.next/cache", "standalone/.next/server/route-cache"}
MATCHES_SMOKE_PATH = "/en/matches"
TODAY_SMOKE_PATH = "/api/matches?when=today&pageSize=1"
SMOKE_HEADER_SECONDS = 15
MATCHES_BODY_SECONDS = 40
FIRST_BYTE_MARKER = b"\n__goalhint_first_byte__="
BROWSER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36")
MATCHES_MARKERS = (
    rb'<[a-z][^>]*\sdata-app-navigation="matches"',
    rb'<[a-z][^>]*\sdata-feed-match-results(?=[=\s>])',
    rb'<[a-z][^>]*\sdata-feed-performance-state="ready"',
)
MATCHES_RECOVERY = rb'<[a-z][^>]*\sdata-feed-list-recovery(?=[=\s>])'


class DeploymentError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def read_record(stream, limit):
    line = stream.readline(limit + 1)
    require(len(line) <= limit and line.endswith(b"\n"), "The deployment request is incomplete or too large.")
    return json.loads(line)


def send(**record):
    print(json.dumps(record, separators=(",", ":")), flush=True)


def safe_path(name):
    path = PurePosixPath(name)
    parts = path.parts
    return (bool(parts) and path.as_posix() == name and not path.is_absolute() and ".." not in parts and
            not any(part in {".private", ".goal-hint", ".git"} for part in parts) and
            not any(part.startswith(".env") and part != ".env.example" for part in parts) and
            not any(ord(char) < 32 or char in "\\:" for char in name) and name not in RUNTIME and not PROBE.fullmatch(name) and
            parts[0] in PACKAGE_ROOTS and not any(name.startswith(directory + "/") for directory in CACHE_DIRECTORIES))


def digest(path):
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def read_json(path):
    require(path.is_file() and not path.is_symlink(), f"Missing regular deployment metadata: {path.name}.")
    return json.loads(path.read_bytes())


def write_json(path, value, mode=0o600):
    stream = tempfile.NamedTemporaryFile(dir=path.parent, prefix=".deploy-state-", delete=False)
    temporary = Path(stream.name)
    try:
        with stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(json.dumps(value, separators=(",", ":")).encode() + b"\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def validate_manifest(manifest):
    files = manifest["files"]
    require(COMMIT.fullmatch(manifest["commit"]) and HEX.fullmatch(manifest["archiveSha256"]) and
            HEX.fullmatch(manifest["migrations"]) and re.fullmatch(r"[A-Za-z0-9_-]{6,128}", manifest["buildId"]) and
            REQUIRED <= files.keys() and len(files) < 65_535 and
            all(safe_path(name) and HEX.fullmatch(value) for name, value in files.items()),
            "The release manifest is invalid.")
    return files


def safe_directory(path, uid):
    require(path.is_dir() and not path.is_symlink() and path.stat().st_uid == uid,
            f"Unexpected owner or type for the {path.name} deployment directory.")


def present(path):
    return path.exists() or path.is_symlink()


class Target:
    def __init__(self, environment, home, uid, gid):
        self.environment = environment
        name, self.database, self.env_file, self.host = TARGETS[environment]
        self.uid, self.gid = uid, gid
        self.active = home / name
        self.releases = home / f"{name}-releases"
        self.private = home / f"{name}-private"
        self.journal = self.private / ".incremental-deployment.json"
        safe_directory(self.releases, uid)
        safe_directory(self.private, uid)
        require(self.private.stat().st_mode & 0o077 == 0, "The hosted configuration directory must be private.")

    def lock(self, stack):
        lock = self.private / ".release.lock"
        descriptor = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
        stack.callback(os.close, descriptor)
        require(stat.S_ISREG(os.fstat(descriptor).st_mode), "The hosted release lock is invalid.")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeploymentError("Another deployment or hosted settings update holds the release lock.") from None

    def release(self, name):
        require(RELEASE.fullmatch(name), "Unrecognized release directory name.")
        path = self.releases / name
        safe_directory(path, self.uid)
        return path

    def current(self):
        require(self.active.is_symlink(), "The configured Passenger launcher is not a release symlink.")
        current = self.active.resolve(strict=True)
        require(current.parent == self.releases, "The active release is outside the designated installation.")
        return self.release(current.name)

    def activate(self, release):
        with tempfile.TemporaryDirectory(dir=self.releases, prefix=".switch-") as directory:
            link = Path(directory) / "active"
            link.symlink_to(release)
            link.replace(self.active)
        (release / "tmp/restart.txt").touch()

    def remove(self, release):
        require(self.current() != release, "Refusing to remove the selected release.")
        require(release.parent == self.releases and (RELEASE.fullmatch(release.name) or INCOMING.fullmatch(release.name)),
                "Unrecognized cleanup directory.")
        safe_directory(release, self.uid)
        shutil.rmtree(release)


def scan(release, *, verify_old=False):
    recorded = None
    if verify_old and present(release / RECEIPT):
        recorded = validate_manifest(read_json(release / RECEIPT))
    files = {}
    def walk_error(error):
        raise error

    for directory, names, filenames in os.walk(release, onerror=walk_error):
        parent = Path(directory)
        for name in names[:]:
            require(not (parent / name).is_symlink(), "Release contains an unmanaged directory link; review it before deployment.")
            if (parent / name).relative_to(release).as_posix() in CACHE_DIRECTORIES:
                names.remove(name)
        for name in filenames:
            path = parent / name
            key = path.relative_to(release).as_posix()
            require(stat.S_ISREG(path.lstat().st_mode), f"Unmanaged file type in release: {key}.")
            if key in RUNTIME or PROBE.fullmatch(key):
                continue
            require(safe_path(key) and (recorded is None or key in recorded),
                    f"Unmanaged release file requires review: {key}.")
            files[key] = digest(path)
    return files


def stage_delta(stream, stage, current, files, writes, uid, gid):
    upload = read_record(stream, 1024)["bytes"]
    require(type(upload) is int and 22 <= upload <= 2**31, "Invalid deployment transfer size.")
    with tempfile.TemporaryFile(dir=stage.parent) as payload:
        while upload:
            chunk = stream.read(min(upload, 1024 * 1024))
            require(chunk, "Incomplete deployment transfer.")
            payload.write(chunk)
            upload -= len(chunk)
        with zipfile.ZipFile(payload) as archive:
            entries = archive.infolist()
            require(len(entries) == len(writes) and {item.filename for item in entries} == writes,
                    "The transferred files do not match the agreed changes.")
            for name in files:
                target = stage / name
                target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                if name in writes:
                    with archive.open(name) as source, target.open("xb") as destination:
                        shutil.copyfileobj(source, destination, 1024 * 1024)
                    os.chown(target, uid, gid)
                    target.chmod(0o644)
                else:
                    os.link(current / name, target)
    for directory, _, _ in os.walk(stage):
        os.chown(directory, uid, gid)
        Path(directory).chmod(0o755)
    require(scan(stage) == files, "The staged installation did not match the approved checksums.")


def install_settings(target, stage, manifest, node):
    runtime = stage / "standalone"
    for name in (target.env_file, ".goal-hint/owner-approvals.json"):
        source, destination = target.private / name, runtime / name
        require(source.is_file() and not source.is_symlink() and source.stat().st_uid == target.uid and
                source.stat().st_mode & 0o077 == 0, "The target must have private web settings and approvals.")
        if not destination.parent.exists():
            destination.parent.mkdir(mode=0o700)
            os.chown(destination.parent, target.uid, target.gid)
        shutil.copyfile(source, destination)
        destination.chmod(0o600)
        os.chown(destination, target.uid, target.gid)
    check = '''const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
try {
  const [, , path, environment, database] = process.argv;
  const settings = parseEnv(readFileSync(path, 'utf8'));
  const url = new URL(settings.DATABASE_URL);
  if (settings.GOAL_HINT_DEPLOYMENT_ENVIRONMENT !== environment || settings.GOAL_HINT_DATABASE_ENABLED !== 'true' ||
      url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || (url.port && url.port !== '3306') ||
      decodeURIComponent(url.pathname.slice(1)) !== database) process.exitCode = 1;
} catch { process.exitCode = 1; }
'''
    result = subprocess.run([node, "-", str(runtime / target.env_file), target.environment, target.database],
                            input=check, text=True, capture_output=True, timeout=15)
    require(result.returncode == 0, "The private settings do not select the pinned environment and database.")
    write_json(stage / MIGRATION_MARKER, {"environment": target.environment, "database": target.database,
                                         "migrations": manifest["migrations"]}, 0o644)
    (stage / "tmp").mkdir(mode=0o755)
    os.chown(stage / "tmp", target.uid, target.gid)
    (stage / "tmp/restart.txt").touch()
    os.chown(stage / "tmp/restart.txt", target.uid, target.gid)
    probe = stage / "standalone/public" / probe_name(manifest)
    probe.parent.mkdir(mode=0o755, exist_ok=True)
    probe.write_text("ready\n", encoding="ascii")
    probe.chmod(0o644)


def verify_schema(target, stage, options, node, manifest):
    build = read_json(stage / INFO)
    require(build["commit"] == manifest["commit"] and build["migrations"] == manifest["migrations"] and
            build["uncommittedChanges"] is False and (stage / BUILD_ID).read_text().strip() == manifest["buildId"],
            "Staged build metadata does not match the approved web artifact.")
    version = subprocess.check_output([node, "--version"], text=True, timeout=15).strip().removeprefix("v")
    require(version == build["node"], "The VPS Node version differs from the approved build.")
    defaults = (Path(options["migrationOptions"]) if options["migrationOptions"] else
                target.private / f"mariadb-migrate-{target.environment}.cnf")
    require(defaults.is_absolute(), "Use an absolute private migration options path.")
    migrate = [sys.executable, str(stage / "scripts/deploy-mariadb.py"), "--environment", target.environment,
               "--database", target.database, "--defaults-file", str(defaults), "--prisma-dir", str(stage / "prisma")]
    status = subprocess.run([*migrate, "--status"], stdout=sys.stderr, timeout=60).returncode
    if status == 2:
        require(options["applyMigrations"], "Pending migrations require review, writer handling and --apply-migrations.")
        subprocess.run(migrate, stdout=sys.stderr, check=True, timeout=1800)
        subprocess.run([*migrate, "--status"], stdout=sys.stderr, check=True, timeout=60)
    else:
        require(status == 0, "MariaDB target or migration ledger verification failed.")


def probe_name(manifest):
    return f"goalhint-release-{manifest['archiveSha256'][:32]}.txt"


def healthy_today_feed(body, environment):
    try:
        response = json.loads(body)
    except (ValueError, UnicodeError):
        return False
    if not isinstance(response, dict):
        return False
    state = response.get("state")
    records, dates, access = (response.get(key) for key in ("records", "range", "access"))
    total = response.get("total")
    if not (isinstance(records, list) and len(records) <= 1 and type(total) is int and total >= len(records)
            and response.get("page") == response.get("pageSize") == 1
            and isinstance(dates, dict) and isinstance(response.get("today"), str)
            and dates.get("from") == dates.get("to") == response["today"]
            and access == {"tier": "free", "signedIn": False}):
        return False
    if state in ("ready", "insufficient-data"):
        return bool(records)
    if state in ("no-fixtures", "no-filter-matches"):
        return total == 0
    # Staging disables live provider jobs and can have no fixture coverage.
    coverage = response.get("coverage")
    return (environment == "staging" and state == "data-unavailable" and total == 0
            and isinstance(coverage, dict) and coverage.get("knownFixtures") == 0 and coverage.get("partial") is True)


def smoke_request(target, path, build, probe, *, legacy_rollback=False):
    document = path == MATCHES_SMOKE_PATH
    budget = MATCHES_BODY_SECONDS if document else SMOKE_HEADER_SECONDS
    args = ["curl", "--silent", "--fail", "--noproxy", "*", "--max-time", str(budget), "--include",
            "--header", "Cache-Control: no-cache"]
    if document:
        args += ["--user-agent", BROWSER_AGENT, "--header", "Accept: text/html",
                 "--header", "Sec-Fetch-Mode: navigate", "--header", "Sec-Fetch-Dest: document",
                 "--write-out", FIRST_BYTE_MARKER.decode("ascii") + "%{time_starttransfer}"]
    try:
        result = subprocess.run([*args, f"https://{target.host}{path}"], capture_output=True, timeout=budget + 1)
    except subprocess.TimeoutExpired:
        return "request deadline"
    if result.returncode:
        return "request deadline" if result.returncode == 28 else "HTTP request failed"
    headers, _, body = result.stdout.partition(b"\r\n\r\n")
    if not re.match(rb"HTTP/\S+ 200\b", headers) or not body:
        return "unexpected response"
    if path == probe and body != b"ready\n":
        return "release probe mismatch"
    if document:
        body, _, first_byte = body.rpartition(FIRST_BYTE_MARKER)
        if not re.fullmatch(rb"\d+(?:\.\d+)?", first_byte):
            return "missing response timing"
        if not legacy_rollback and float(first_byte) > SMOKE_HEADER_SECONDS:
            return "browser header deadline"
        if build.encode() not in body:
            return "build identity mismatch"
        if target.environment == "staging" and not re.search(rb"(?im)^x-robots-tag:[^\r\n]*\bnoindex\b", headers):
            return "missing staging noindex"
        if not all(re.search(marker, body) for marker in MATCHES_MARKERS) or re.search(MATCHES_RECOVERY, body):
            return "Matches list or summary unavailable"
    if path.startswith("/api/") and not re.search(rb"(?im)^content-type:\s*application/json\b", headers):
        return "expected API JSON"
    if path == TODAY_SMOKE_PATH and not healthy_today_feed(body, target.environment):
        return "Today feed unavailable or invalid"
    return None


def smoke(target, release, manifest=None, *, legacy_rollback=False):
    build = (release / BUILD_ID).read_text().strip()
    require(re.fullmatch(r"[A-Za-z0-9_-]{6,128}", build), "Invalid Next build identity.")
    endpoints = [MATCHES_SMOKE_PATH, TODAY_SMOKE_PATH, "/api/account/session",
                 f"/_next/static/{build}/_buildManifest.js"]
    probe = f"/{probe_name(manifest)}" if manifest else None
    if probe:
        endpoints.append(probe)
    for attempt in range(6):
        for path in endpoints:
            failure = smoke_request(target, path, build, probe, legacy_rollback=legacy_rollback)
            if failure:
                break
        else:
            return
        if attempt < 5:
            time.sleep(2)
    raise DeploymentError(f"HTTPS smoke failed on {target.environment} at {path} for Next build {build}: {failure}.")


def recover(target):
    if not present(target.journal):
        return
    state = read_json(target.journal)
    active = target.current()
    candidate_name = state["candidate"]
    require(re.fullmatch(r"live-[0-9a-f]{20}", candidate_name) and RELEASE.fullmatch(state["previous"]) and
            candidate_name != state["previous"], "Invalid interrupted deployment record.")
    candidate = target.releases / candidate_name
    previous = target.releases / state["previous"]
    require(active in {previous, candidate}, "An interrupted deployment has an unexpected active release.")
    if active == candidate and present(candidate / RECEIPT):
        smoke(target, candidate)
        if present(previous):
            target.remove(previous)
    else:
        if active == candidate:
            target.activate(target.release(previous.name))
            smoke(target, previous, legacy_rollback=True)
        if present(candidate):
            target.remove(candidate)
    target.journal.unlink()


def verify_prune(target, names, current):
    result = []
    for name in dict.fromkeys(names):
        if INCOMING.fullmatch(name):
            incoming = target.releases / name
            safe_directory(incoming, target.uid)
            for path in incoming.iterdir():
                require(re.fullmatch(r"[A-Za-z0-9._-]+\.zip(?:\.sha256)?", path.name) and
                        path.is_file() and not path.is_symlink(), "Incoming directory contains an unclassified file.")
            result.append(incoming)
            continue
        release = target.release(name)
        require(release != current, "The active release is never an explicit cleanup target.")
        require(COMMIT.fullmatch(read_json(release / INFO)["commit"]), "Cleanup requires a recognizable web release.")
        scan(release, verify_old=True)
        result.append(release)
    return result


def install(target, current, manifest, files, writes, options, stream):
    if not writes and (current / RECEIPT).is_file() and read_json(current / RECEIPT) == manifest:
        with tempfile.TemporaryDirectory(prefix=".noop-", dir=target.releases) as directory:
            stage_delta(stream, Path(directory), current, {}, set(), target.uid, target.gid)
        verify_schema(target, current, options, options["node"], manifest)
        smoke(target, current)
        return
    name = "live-" + manifest["archiveSha256"][:20]
    stage = target.releases / name
    require(not present(stage), "The candidate release directory already exists; audit it before retrying.")
    write_json(target.journal, {"previous": current.name, "candidate": name})
    try:
        stage.mkdir(mode=0o700)
        os.chown(stage, target.uid, target.gid)
        stage_delta(stream, stage, current, files, writes, target.uid, target.gid)
        node = options["node"]
        require(Path(node).is_absolute(), "Use an absolute hosted Node executable path.")
        install_settings(target, stage, manifest, node)
        verify_schema(target, stage, options, node, manifest)
        target.activate(stage)
        smoke(target, stage, manifest)
        (stage / "standalone/public" / probe_name(manifest)).unlink()
        write_json(stage / RECEIPT, manifest)
        target.remove(current)
        target.journal.unlink()
    except Exception:
        recover(target)
        raise


def receive(stream):
    options = read_record(stream, 16 * 1024 * 1024)
    environment = options["target"]
    manifest = options["manifest"]
    files = validate_manifest(manifest)
    owner = pwd.getpwnam(ACCOUNT)
    require(os.geteuid() in {0, owner.pw_uid}, "Use the configured VPS deployment account.")
    home = Path(owner.pw_dir).resolve(strict=True)
    staging = Target("staging", home, owner.pw_uid, owner.pw_gid)
    target = staging if environment == "staging" else Target(environment, home, owner.pw_uid, owner.pw_gid)
    with ExitStack() as locks:
        staging.lock(locks)
        if target != staging:
            target.lock(locks)
        if options["preview"]:
            require(not present(target.journal), "An interrupted release requires recovery with --apply before previewing.")
        else:
            if target != staging:
                staged = staging.current()
                require(not present(staging.journal) and read_json(staged / RECEIPT) == manifest,
                        "Production requires the same artifact currently verified on staging.")
                smoke(staging, staged)
            recover(target)
        current = target.current()
        build = read_json(current / INFO)
        actual = scan(current, verify_old=True)
        added = files.keys() - actual.keys()
        obsolete = actual.keys() - files.keys()
        modified = {name for name in files.keys() & actual.keys() if files[name] != actual[name]}
        other = sorted(path.name for path in target.releases.iterdir() if path != current)
        prune = verify_prune(target, options["prune"], current)
        writes = added | modified
        send(ok=True, currentCommit=build["commit"], added=len(added), modified=len(modified), deleted=len(obsolete),
             migrationsChanged=build["migrations"] != manifest["migrations"], otherReleases=other, writes=sorted(writes))
        if options["preview"]:
            return
        install(target, current, manifest, files, writes, options, stream)
        for release in prune:
            target.remove(release)
        remaining = sorted(path.name for path in target.releases.iterdir() if path != target.current())
        send(ok=True, commit=manifest["commit"], buildId=manifest["buildId"], remaining=remaining)


def interrupted(_signal, _frame):
    raise DeploymentError("The deployment connection was interrupted.")


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    try:
        receive(sys.stdin.buffer)
    except DeploymentError as error:
        send(ok=False, error=str(error))
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        send(ok=False, error=f"Deployment did not complete ({type(error).__name__}). Check SSH and the target state.")
        sys.exit(1)
