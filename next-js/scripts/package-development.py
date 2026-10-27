"""Export the development application as a clean, versioned source ZIP."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile

from lib.deployment import DEPLOY_ROOT, git, publish_zip, stage_source, web_archive, write_zip
from lib.runtime import CommandError, ROOT, main_guard


def main() -> None:
    if sys.argv[1:]:
        raise CommandError("Usage: npm run package:development")
    staging = DEPLOY_ROOT / ".staging"
    staging.mkdir(parents=True, exist_ok=True)
    if not staging.resolve().is_relative_to(DEPLOY_ROOT.resolve()):
        raise CommandError("Unsafe development staging directory.")
    with tempfile.TemporaryDirectory(prefix="nextjs-development-", dir=staging) as temporary:
        source = Path(temporary) / "goal-hint-nextjs"
        stage_source(source)
        package = json.loads((source / "package.json").read_text(encoding="utf-8"))
        metadata = {"name": package["name"], "version": package["version"], "configuration": "development",
                    "kind": "source", "commit": git("rev-parse", "HEAD").strip(),
                    "uncommittedChanges": bool(git("status", "--porcelain").strip()),
                    "packagedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        (source / "BUILD_INFO.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        (source / "DEVELOPMENT.md").write_text((ROOT / "docs/deployment/development.md").read_text(encoding="utf-8"), encoding="utf-8")
        archive = web_archive(development=True)
        staged_archive = Path(temporary) / archive.name
        count = write_zip(source, staged_archive, prefix="goal-hint-nextjs")
        publish_zip(staged_archive, archive)
        print(f"Wrote {archive} ({archive.stat().st_size / 1024 / 1024:.1f} MB, {count} entries), with SHA256 sidecar.")


if __name__ == "__main__":
    main_guard(main, "Development packaging failed; inspect the source checkout.")
