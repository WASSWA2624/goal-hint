"""Build a self-contained cPanel Passenger bundle in an isolated clean tree."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

from lib.runtime import CommandError, ROOT, hidden_process, main_guard, node_binary


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, encoding="utf-8", creationflags=hidden_process())


def write_json(file: Path, value: dict) -> None:
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def write_zip(directory: Path, target: Path, prefix: str = "goal-hint") -> int:
    entries = sorted(directory.rglob("*"), key=lambda item: item.relative_to(directory).as_posix())
    for item in entries:
        relative = item.relative_to(directory).as_posix()
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise CommandError(f"Unsupported file type in bundle: {relative}")
        if re.search(r"(^|/)\.env(?!\.example$)[^/]*$", relative):
            raise CommandError(f"Refusing to package environment files: {relative}")
    if len(entries) >= 0xFFFF:
        raise CommandError("Too many files for a ZIP32 archive.")
    # zipfile supplies portable CRCs, UTF-8 names and forward-slash paths.
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=False) as archive:
        for item in [directory, *entries]:
            relative = item.relative_to(directory).as_posix() if item != directory else ""
            name = prefix + "/" + relative + ("/" if item.is_dir() and relative else "")
            info = zipfile.ZipInfo(name, datetime.now().timetuple()[:6])
            info.create_system = 3
            info.external_attr = ((0o40755 if item.is_dir() else 0o100644) << 16) | (0x10 if item.is_dir() else 0)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, b"" if item.is_dir() else item.read_bytes(), compresslevel=9)
    return len(entries)


def main():
    args = sys.argv[1:]
    if any(arg != "--keep" for arg in args):
        raise CommandError("Usage: npm run package:cpanel -- [--keep]")
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    node = node_binary()
    version = subprocess.check_output([node, "--version"], encoding="utf-8", creationflags=hidden_process()).strip().removeprefix("v")
    if version != package["engines"]["node"]:
        raise CommandError(f"Build with the pinned Node.js {package['engines']['node']} (found {version}); run `fnm use` or `nvm use` first.")
    stage = Path(tempfile.mkdtemp(prefix="goal-hint-cpanel-")).resolve()
    source, bundle = stage / "source", stage / "goal-hint"
    standalone = bundle / "standalone"
    keys = re.findall(r"^[A-Z][A-Z0-9_]*(?==)", (ROOT / ".env.example").read_text(encoding="utf-8"), re.M)
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GOAL_HINT_") and key not in keys and key != "NODE_ENV"}

    def run(command: list[str], *, env: dict = environment):
        print("\n> " + " ".join(command), flush=True)
        result = subprocess.run(command, cwd=source, env=env, creationflags=hidden_process())
        if result.returncode:
            raise CommandError(f"{' '.join(command)} failed with exit code {result.returncode}.")

    try:
        print(f"Staging in {stage}", flush=True)
        for name in filter(None, git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0")):
            if re.search(r"(^|/)\.env(?!\.example$)[^/]*$", name):
                raise CommandError(f"Refusing to stage an environment file: {name}")
            original, destination = ROOT / name, source / name
            if not original.exists():
                continue
            # Never follow working-tree links outside the repository.
            if not original.resolve().is_relative_to(ROOT):
                raise CommandError(f"Refusing to stage an external working-tree link: {name}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, destination)
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
        if not any("/usr/bin/convert" in chunk.read_text(encoding="utf-8")
                   for chunk in (standalone / ".next/server/chunks").glob("*.js")):
            raise CommandError("The Linux badge codec is missing from the compiled server; refusing an incompatible release.")
        # Windows codecs cannot run on Linux. Hosted badges use the verified
        # system ImageMagick codec; Sharp remains available for local tooling.
        for prune in ("node_modules/sharp", "node_modules/@img"):
            target = standalone / prune
            if target.exists():
                if not target.resolve().is_relative_to(standalone.resolve()):
                    raise CommandError("Unsafe standalone prune target.")
                shutil.rmtree(target)
                print(f"Pruned standalone/{prune}")
        commit, dirty = git("rev-parse", "HEAD").strip(), bool(git("status", "--porcelain").strip())
        (bundle / "app.js").write_text('''// Passenger startup file: app.js. Next.js and its dependencies live in ./standalone.
"use strict";
const path = require("node:path");
const { pathToFileURL } = require("node:url");
import(pathToFileURL(path.join(__dirname, "standalone", "server.js")).href).catch((error) => {
  console.error(error);
  process.exit(1);
});
''', encoding="utf-8", newline="\n")
        write_json(bundle / "package.json", {"name": package["name"] + "-cpanel", "version": package["version"], "private": True,
                   "type": "commonjs", "main": "app.js", "scripts": {"start": "node app.js"}, "engines": {"node": version.split(".")[0] + ".x"}})
        next_version = json.loads((source / "node_modules/next/package.json").read_text(encoding="utf-8"))["version"]
        write_json(bundle / "BUILD_INFO.json", {"name": package["name"], "version": package["version"], "commit": commit,
                   "uncommittedChanges": dirty, "builtAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                   "node": version, "next": next_version, "badgeCodec": "imagemagick"})
        shutil.copy2(ROOT / "deploy/README.md", bundle / "DEPLOY.md")
        shutil.copy2(ROOT / ".env.example", bundle / ".env.example")
        archive = ROOT / "deploy/goal-hint-cpanel.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        count = write_zip(bundle, archive)
        print(f"\nWrote {archive.relative_to(ROOT)} ({archive.stat().st_size / 1024 / 1024:.1f} MB, {count} entries) from {commit[:7]}{' with uncommitted changes' if dirty else ''}.")
    finally:
        if "--keep" in args:
            print(f"Kept staging directory {stage}")
        else:
            # A computed recursive delete must stay under our new temp root.
            if stage.parent != Path(tempfile.gettempdir()).resolve() or not stage.name.startswith("goal-hint-cpanel-"):
                raise CommandError("Unsafe staging cleanup target; staging was preserved.")
            shutil.rmtree(stage)


if __name__ == "__main__":
    main_guard(main, "cPanel packaging failed; inspect the build output.")
