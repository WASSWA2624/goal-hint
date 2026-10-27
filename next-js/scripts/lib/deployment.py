"""Shared repository-level deployment paths for the web release tools."""
from datetime import datetime
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from lib.runtime import CommandError, ROOT, hidden_process

DEPLOY_ROOT = ROOT.parent / "deploy"
PRIVATE_ROOT = DEPLOY_ROOT / ".private" / "nextjs"


def web_archive(*, development: bool = False) -> Path:
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    suffix = "-dev" if development else ""
    return DEPLOY_ROOT / f"goal-hint-nextjs-{version}{suffix}.zip"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, encoding="utf-8", creationflags=hidden_process())



def write_zip(directory: Path, target: Path, prefix: str = "goal-hint") -> int:
    entries = sorted(directory.rglob("*"), key=lambda item: item.relative_to(directory).as_posix())
    for item in entries:
        relative = item.relative_to(directory).as_posix()
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise CommandError(f"Unsupported file type in bundle: {relative}")
        if re.search(r"(^|/)\.env(?!\.example$)[^/]*$", relative):
            raise CommandError(f"Refusing to package environment files: {relative}")
        if any(part in {".private", ".goal-hint"} for part in item.relative_to(directory).parts):
            raise CommandError(f"Refusing to package private deployment state: {relative}")
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


def publish_zip(source: Path, target: Path) -> None:
    """Publish a completed archive and its checksum from root-local staging."""
    staging = target.parent / ".staging"
    staging.mkdir(parents=True, exist_ok=True)
    if not staging.resolve().is_relative_to(target.parent.resolve()):
        raise CommandError("Unsafe deployment staging directory.")
    with tempfile.TemporaryDirectory(prefix="nextjs-", dir=staging) as directory:
        staged = Path(directory) / (target.name + ".tmp")
        shutil.copyfile(source, staged)
        digest = hashlib.sha256()
        with staged.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        checksum = target.with_suffix(".zip.sha256")
        staged_checksum = Path(directory) / checksum.name
        staged_checksum.write_text(f"{digest.hexdigest()}  {target.name}\n", encoding="ascii")
        staged.replace(target)
        staged_checksum.replace(checksum)

