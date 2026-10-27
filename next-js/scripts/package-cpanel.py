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

from lib.runtime import CommandError, ROOT, hidden_process, main_guard, node_binary
from lib.deployment import git, publish_zip, stage_source, web_archive, write_zip


def write_json(file: Path, value: dict) -> None:
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


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
        stage_source(source)
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
        shutil.copy2(ROOT / "docs/deployment/README.md", bundle / "DEPLOY.md")
        shutil.copy2(ROOT / ".env.example", bundle / ".env.example")
        archive = web_archive()
        archive.parent.mkdir(parents=True, exist_ok=True)
        staged_archive = stage / archive.name
        count = write_zip(bundle, staged_archive)
        # Keep the previous release intact until the complete replacement exists.
        publish_zip(staged_archive, archive)
        print(f"\nWrote {archive.relative_to(ROOT.parent)} ({archive.stat().st_size / 1024 / 1024:.1f} MB, {count} entries) from {commit[:7]}{' with uncommitted changes' if dirty else ''}.")
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
