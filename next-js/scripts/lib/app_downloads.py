"""Publish verified native delivery packages to a separate download root."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

from lib.runtime import CommandError, ROOT
from lib.deployment import DEPLOY_ROOT

FILE_EXTENSIONS = {"android": ".apk", "windows": ".exe", "macos": ".dmg", "linux": ".deb"}


def package_release(archive: Path, platform: str, channel: str, root: Path) -> dict:
    checksum = archive.with_suffix(".zip.sha256")
    if not checksum.is_file():
        raise CommandError(f"Missing checksum for {archive.name}.")
    expected = checksum.read_text(encoding="utf-8-sig").split()[0]
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
            raise CommandError(f"Checksum mismatch for {archive.name}.")
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        metadata_name = "download-manifest.json" if "download-manifest.json" in names else "development-manifest.json"
        if names.count(metadata_name) != 1:
            raise CommandError(f"{archive.name} has no unique download metadata. Repackage the native build.")
        metadata = json.loads(bundle.read(metadata_name).decode("utf-8-sig"))
        mode = "debug" if channel == "development" else "release"
        if metadata.get("platform") != platform or metadata.get("environment") != channel or metadata.get("mode") != mode:
            raise CommandError(f"{archive.name} does not match {channel}/{platform}.")
        if channel == "production" and metadata.get("signed") is not True:
            raise CommandError(f"{archive.name} requires a verified release signature.")
        version = re.fullmatch(r"(\d+\.\d+\.\d+)(?:\+(\d+))?", str(metadata.get("version", "")))
        build = str(metadata.get("build") or (version[2] if version else ""))
        if not version or not re.fullmatch(r"[1-9]\d*", build):
            raise CommandError(f"{archive.name} has invalid version/build metadata.")
        suffix = FILE_EXTENSIONS[platform]
        candidates = [name for name in names if name.endswith(suffix)]
        if len(candidates) != 1 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]+" + re.escape(suffix), candidates[0]):
            raise CommandError(f"{archive.name} must contain one top-level installer.")
        name = candidates[0]
        file_hash = metadata.get("artifactSha256") or metadata.get("apkSha256")
        destination = root / "files" / platform / f"{version[1]}-{build}"
        destination.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=destination, suffix=".pending", delete=False) as temporary:
            temporary_path = Path(temporary.name)
        try:
            with bundle.open(name) as source, temporary_path.open("wb") as target_stream:
                shutil.copyfileobj(source, target_stream)
            with temporary_path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if file_hash and digest != file_hash:
                raise CommandError(f"Installer hash mismatch for {archive.name}.")
            if channel == "production" and not file_hash:
                raise CommandError("Production packages require installer SHA-256 metadata.")
            target = destination / name
            if target.exists():
                with target.open("rb") as stream:
                    if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                        raise CommandError("This version/build already contains a different installer. Increment the native build number.")
            temporary_path.replace(target)
            return {"platform": platform, "version": version[1], "build": int(build), "fileName": name,
                    "size": target.stat().st_size, "sha256": digest}
        finally:
            temporary_path.unlink(missing_ok=True)


def prepare_app_downloads(channel: str, root: Path | None = None, deploy_root: Path = DEPLOY_ROOT) -> Path:
    if channel not in ("development", "production"):
        raise CommandError("Choose development or production downloads.")
    root = (root or ROOT / ".app-downloads").resolve()
    root.mkdir(parents=True, exist_ok=True)
    existing = root / "catalog.json"
    prior = json.loads(existing.read_text(encoding="utf-8")) if existing.exists() else {"channel": channel, "releases": []}
    if prior["channel"] != channel:
        raise CommandError("Use separate roots for development and production downloads.")
    platforms = ("android", "windows") if channel == "development" else FILE_EXTENSIONS
    releases = {release["platform"]: release for release in prior["releases"]} if channel == "production" else {}
    for platform in platforms:
        suffix = "-dev" if channel == "development" else ""
        pattern = re.compile(rf"goal-hint-{platform}-\d+\.\d+\.\d+{suffix}\.zip$")
        archives = [item for item in deploy_root.glob(f"goal-hint-{platform}-*.zip") if pattern.fullmatch(item.name)]
        if not archives:
            continue
        # Delivery archives contain their own build number; publishing never infers one from source.
        def version_key(item):
            return tuple(map(int, re.search(r"(\d+\.\d+\.\d+)", item.name)[1].split(".")))
        releases[platform] = package_release(max(archives, key=version_key), platform, channel, root)
    with tempfile.NamedTemporaryFile(dir=root, suffix=".pending", delete=False) as temporary:
        pending = Path(temporary.name)
    try:
        pending.write_text(json.dumps({"schema": 1, "channel": channel, "releases": list(releases.values())}, indent=2) + "\n", encoding="utf-8")
        pending.replace(existing)
    finally:
        pending.unlink(missing_ok=True)
    return root
