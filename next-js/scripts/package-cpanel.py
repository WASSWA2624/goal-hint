"""Build a self-contained cPanel Passenger bundle in an isolated clean tree."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import inspect
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from lib.runtime import CommandError, ROOT, hidden_process, main_guard, node_binary
from lib.deployment import export_commit, git, publish_zip, web_archive, write_zip
from lib.release_bundle import COMMIT, ReleaseBundle, ReleaseBundleError


RELEASE_ONLY_PATHS = {
    "README.md", "dev-tracker.md", "scripts/activate-hosted.sh", "scripts/deploy-cpanel.py",
    "scripts/deploy-hosted.py", "scripts/deploy-mariadb.py", "scripts/deploy-worker-cpanel.py",
    "scripts/lib/deployment.py", "scripts/lib/release_bundle.py", "scripts/package-cpanel.py",
    "scripts/prune-hosted-workers.py", "scripts/receive-hosted.py", "scripts/sync-hosted-env.mjs",
    "scripts/verify-hosted-feed-browser.mjs",
}
# The prior approved packager blob and its identical standalone recipe, for
# releases built before BUILD_INFO recorded the recipe fingerprint.
LEGACY_BUILD_RECIPES = {
    "d0017e6d0f320455bda35619dbf95286f35a63f3": "9e664db2b26aeb95346973dd4fd4d5a9337d2ecbc13d82a485147633f07bd36e",
}


def write_json(file: Path, value: dict) -> None:
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def prepare_hosted_activation(source: Path, bundle: Path) -> str:
    """Install the immutable migration inventory and Passenger startup check."""
    migrations = source / "prisma"
    shutil.copytree(migrations / "migrations", bundle / "prisma/migrations")
    shutil.copytree(migrations / "mariadb", bundle / "prisma/mariadb")
    shutil.copy2(migrations / "adopted-migrations.json", bundle / "prisma/adopted-migrations.json")
    scripts = bundle / "scripts"
    scripts.mkdir()
    activation = source / "scripts/activate-hosted.sh"
    (scripts / activation.name).write_text(activation.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
    shutil.copy2(source / "scripts/deploy-mariadb.py", scripts / "deploy-mariadb.py")
    ledger = sha256()
    inventory = bundle / "prisma"
    for file in sorted(item for item in inventory.rglob("*") if item.is_file()):
        ledger.update(file.relative_to(inventory).as_posix().encode("utf-8") + b"\0" + sha256(file.read_bytes()).digest())
    (bundle / "app.js").write_text('''// Passenger startup file: app.js. Next.js and its dependencies live in ./standalone.
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const standalone = path.join(__dirname, "standalone");

async function start() {
  const files = [[".env.test", "staging"], [".env.production", "production"]]
    .filter(([name]) => fs.existsSync(path.join(standalone, name)));
  if (files.length > 1) throw new Error("Install exactly one hosted environment file.");
  if (files.length === 1) {
    const [name, deployment] = files[0];
    process.loadEnvFile(path.join(standalone, name));
    if (process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT !== deployment) {
      throw new Error("Hosted environment does not match its environment file.");
    }
    const database = new URL(process.env.DATABASE_URL);
    const marker = JSON.parse(fs.readFileSync(path.join(__dirname, ".goal-hint-migrations.json"), "utf8"));
    const build = require("./BUILD_INFO.json");
    if (database.protocol !== "mysql:" || database.hostname !== "127.0.0.1" || (database.port && database.port !== "3306") ||
        marker.environment !== deployment || marker.database !== decodeURIComponent(database.pathname.slice(1)) ||
        marker.migrations !== build.migrations) {
      throw new Error("Verify the hosted database migrations before starting this release.");
    }
  }
  await import(pathToFileURL(path.join(standalone, "server.js")).href);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
''', encoding="utf-8", newline="\n")
    return ledger.hexdigest()


def verify_traced_database_runtime(standalone: Path) -> None:
    next_root = standalone / ".next"
    pattern = re.compile(rb"@prisma/client-[0-9a-f]{16}(?=/runtime/client)")
    aliases = {alias.decode("ascii") for chunk in (next_root / "server/chunks").rglob("*.js")
               for alias in pattern.findall(chunk.read_bytes())}
    if any(not (next_root / "node_modules" / alias / "runtime/client.js").is_file() for alias in aliases):
        raise CommandError("The standalone build is missing a traced Prisma runtime dependency. Rebuild from a clean tree.")


def build_standalone(source: Path, standalone: Path, node: str) -> dict:
    keys = re.findall(r"^[A-Z][A-Z0-9_]*(?==)", (source / ".env.example").read_text(encoding="utf-8"), re.M)
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith("GOAL_HINT_") and key not in keys and key != "NODE_ENV"}

    def run(command: list[str], *, env: dict = environment):
        print("\n> " + " ".join(command), flush=True)
        result = subprocess.run(command, cwd=source, env=env, creationflags=hidden_process())
        if result.returncode:
            raise CommandError(f"{' '.join(command)} failed with exit code {result.returncode}.")

    npm_path = os.environ.get("npm_execpath", "")
    npm = [node, npm_path] if npm_path.endswith(".js") else [shutil.which("npm.cmd" if os.name == "nt" else "npm") or "npm"]
    run([*npm, "ci", "--no-audit", "--no-fund"])
    run([node, str(source / "node_modules/next/dist/bin/next"), "build"], env={**environment, "BUILD_OUTPUT": "standalone", "NEXT_TELEMETRY_DISABLED": "1"})
    run([node, "scripts/build-offline-manifest.mjs"])
    built = source / ".next/standalone"
    if not (built / "server.js").exists():
        raise CommandError("The standalone build has no top-level server.js; check outputFileTracingRoot/turbopack.root.")
    shutil.copytree(built, standalone, symlinks=False)
    shutil.copytree(source / ".next/static", standalone / ".next/static", dirs_exist_ok=True)
    shutil.copytree(source / "public", standalone / "public", dirs_exist_ok=True)
    # Windows codecs cannot run on Linux. Hosted badges use the verified
    # system GraphicsMagick or ImageMagick codec.
    for prune in ("node_modules/sharp", "node_modules/@img"):
        target = standalone / prune
        if target.exists():
            if not target.resolve().is_relative_to(standalone.resolve()):
                raise CommandError("Unsafe standalone prune target.")
            shutil.rmtree(target)
            print(f"Pruned standalone/{prune}")
    next_version = json.loads((source / "node_modules/next/package.json").read_text(encoding="utf-8"))["version"]
    return {"next": next_version, "builtAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}


def reuse_standalone(archive: Path, standalone: Path, previous: str, commit: str, version: str, recipe: str) -> dict:
    if not COMMIT.fullmatch(previous):
        raise CommandError("Supply the full Git commit of the existing standalone build.")
    try:
        changed = git("diff", "--name-only", "--no-renames", "-z", previous, commit, "--")
        for path in filter(None, changed.split("\0")):
            relative = path.removeprefix("next-js/")
            if path == ".gitattributes" or (
                relative != path and relative not in RELEASE_ONLY_PATHS
                and not relative.startswith(("docs/", "dev-plan/", "tests/"))
            ):
                raise CommandError(f"Build input changed ({path}); package again without --reuse.")
        with ReleaseBundle(archive, commit=previous) as release:
            info = release.build_info
            prior_recipe = info.get("buildRecipe")
            if prior_recipe is None:
                prior_recipe = LEGACY_BUILD_RECIPES.get(git("rev-parse", f"{previous}:next-js/scripts/package-cpanel.py").strip())
            if prior_recipe != recipe or info.get("node") != version or info.get("badgeCodec") != "system-webp":
                raise CommandError("The build recipe or runtime changed; package again without --reuse.")
            if not all(isinstance(info.get(key), str) and info[key] for key in ("next", "builtAt")):
                raise CommandError("The existing build has incomplete metadata; package again without --reuse.")
            release.copy_standalone(standalone)
            print(f"Reused verified standalone build {release.manifest['buildId']} from {previous[:7]}.", flush=True)
            return {key: info[key] for key in ("next", "builtAt")}
    except subprocess.CalledProcessError:
        raise CommandError("Git could not compare the prior build with the approved commit.") from None
    except ReleaseBundleError as error:
        raise CommandError(f"{error} Package again without --reuse.") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", help="Require the specified full Git commit to be checked out")
    parser.add_argument("--reuse", metavar="PRIOR_COMMIT", help="Reuse the verified local build when its inputs are unchanged")
    parser.add_argument("--previous-archive", type=Path, help="Read the prior build from this ZIP and its adjacent checksum")
    parser.add_argument("--keep", action="store_true", help="Keep the temporary build directory for diagnostics")
    options = parser.parse_args()
    if options.previous_archive and not options.reuse:
        parser.error("--previous-archive requires --reuse")
    commit = git("rev-parse", "HEAD").strip()
    if (options.commit and options.commit != commit) or git("status", "--porcelain").strip():
        raise CommandError("Package the approved Git commit from a clean checkout.")
    stage = Path(tempfile.mkdtemp(prefix="goal-hint-cpanel-")).resolve()
    source, bundle = stage / "source", stage / "goal-hint"
    standalone = bundle / "standalone"

    try:
        print(f"Staging in {stage}", flush=True)
        export_commit(source, commit)
        package = json.loads((source / "package.json").read_text(encoding="utf-8"))
        node = node_binary()
        version = subprocess.check_output([node, "--version"], encoding="utf-8", creationflags=hidden_process()).strip().removeprefix("v")
        if version != package["engines"]["node"]:
            raise CommandError(f"Build with the pinned Node.js {package['engines']['node']} (found {version}); run `fnm use` or `nvm use` first.")
        archive = web_archive(version=package["version"])
        recipe = sha256(inspect.getsource(build_standalone).encode("utf-8")).hexdigest()
        if options.reuse:
            bundle.mkdir()
            build_metadata = reuse_standalone(options.previous_archive or archive, standalone, options.reuse, commit, version, recipe)
        else:
            build_metadata = build_standalone(source, standalone, node)
        verify_traced_database_runtime(standalone)
        if not any("/usr/bin/convert" in content and "/usr/bin/gm" in content
                   for chunk in (standalone / ".next/server/chunks").glob("*.js")
                   for content in [chunk.read_text(encoding="utf-8")]):
            raise CommandError("The Linux badge codecs are missing from the compiled server; refusing an incompatible release.")
        migration_fingerprint = prepare_hosted_activation(source, bundle)
        write_json(bundle / "package.json", {"name": package["name"] + "-cpanel", "version": package["version"], "private": True,
                   "type": "commonjs", "main": "app.js", "scripts": {"start": "node app.js"}, "engines": {"node": version.split(".")[0] + ".x"}})
        write_json(bundle / "BUILD_INFO.json", {"name": package["name"], "version": package["version"], "commit": commit,
                   "uncommittedChanges": False, **build_metadata, "buildRecipe": recipe,
                   "node": version, "badgeCodec": "system-webp", "migrations": migration_fingerprint,
                   "dependencyLock": sha256((source / "package-lock.json").read_bytes()).hexdigest()})
        shutil.copy2(source / "docs/deployment/README.md", bundle / "DEPLOY.md")
        shutil.copy2(source / ".env.example", bundle / ".env.example")
        archive.parent.mkdir(parents=True, exist_ok=True)
        staged_archive = stage / archive.name
        count = write_zip(bundle, staged_archive)
        # Keep the previous release intact until the complete replacement exists.
        publish_zip(staged_archive, archive)
        print(f"\nWrote {archive.relative_to(ROOT.parent)} ({archive.stat().st_size / 1024 / 1024:.1f} MB, {count} entries) from {commit[:7]}.")
    finally:
        if options.keep:
            print(f"Kept staging directory {stage}")
        else:
            # A computed recursive delete must stay under our new temp root.
            if stage.parent != Path(tempfile.gettempdir()).resolve() or not stage.name.startswith("goal-hint-cpanel-"):
                raise CommandError("Unsafe staging cleanup target; staging was preserved.")
            shutil.rmtree(stage)


if __name__ == "__main__":
    main_guard(main, "cPanel packaging failed; inspect the build output.")
