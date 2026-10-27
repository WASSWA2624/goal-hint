#!/usr/bin/env python3
"""Build clearly labelled native development ZIPs without production credentials."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit
import zipfile

import package_release as release


def development_origin(value: str) -> str:
    try:
        uri = urlsplit(value)
        if (uri.scheme not in {"http", "https"} or not uri.hostname
                or uri.username is not None or uri.password is not None
                or uri.path not in {"", "/"} or uri.query or uri.fragment
                or re.search(r"[\s\\\x00-\x1f]", value)
                or re.search(r"[\s\\/?#@\x00-\x1f]", unquote(uri.hostname))
                or (uri.port is not None and not 1 <= uri.port <= 65535)):
            raise ValueError
    except ValueError:
        raise ValueError("Supply an HTTP(S) origin without credentials, path, query or fragment.") from None
    return f"{uri.scheme}://{uri.netloc}"


def validate_debug_apk(badging: str, certificates: str, version: str, build: str) -> None:
    match = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not match or match.groups() != (release.ANDROID_APP_ID, build, version):
        raise ValueError("Development APK identity/version differs from pubspec.yaml.")
    if "application-debuggable" not in badging or "android debug" not in certificates.lower():
        raise ValueError("The development archive requires a Debug APK and Android Debug certificate.")


def validate_apk_origin(artifact: Path, origin: str) -> None:
    needle = origin.encode("utf-8")
    with zipfile.ZipFile(artifact) as archive:
        with archive.open("assets/flutter_assets/kernel_blob.bin") as kernel:
            previous = b""
            while chunk := kernel.read(1024 * 1024):
                if needle in previous + chunk:
                    return
                previous = chunk[-len(needle):]
    raise ValueError("The requested development origin was not found in the Debug APK's compiled kernel.")


def package_android(args: argparse.Namespace) -> Path:
    version, build = release.version()
    target = release.DEPLOY / f"goal-hint-android-{version}-dev.zip"
    if target.exists() and not args.force:
        raise FileExistsError("Development ZIP exists; use --force to replace it explicitly.")
    flutter = shutil.which(args.flutter) or args.flutter
    release.check_toolchain(flutter)
    if not args.skip_build:
        release.run(flutter, "build", "apk", "--debug", "--target=lib/main.dart",
                    "--dart-define=APP_ENV=development", f"--dart-define=DEV_APP_ORIGIN={args.origin}")
    artifact = release.PROJECT / "build/app/outputs/flutter-apk/app-debug.apk"
    tools = release.android_tools()
    signer = tools / ("apksigner.bat" if os.name == "nt" else "apksigner")
    aapt = tools / ("aapt.exe" if os.name == "nt" else "aapt")
    certificates = release.run(signer, "verify", "--verbose", "--print-certs", artifact, capture=True)
    badging = release.run(aapt, "dump", "badging", artifact, capture=True)
    validate_debug_apk(badging, certificates, version, build)
    validate_apk_origin(artifact, args.origin)
    staging_root = release.DEPLOY / ".staging"
    staging_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="android-dev-", dir=staging_root) as temporary:
        staging = Path(temporary)
        candidate = staging / target.name
        with artifact.open("rb") as stream:
            artifact_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        manifest = {
            "schema": 1, "platform": "android", "mode": "debug", "environment": "development",
            "version": version, "build": build, "appId": release.ANDROID_APP_ID,
            "origin": args.origin, "entryPoint": "lib/main.dart", "debugSigned": True,
            "sourceRevision": release.run("git", "rev-parse", "HEAD", capture=True).strip(),
            "skippedBuild": args.skip_build, "apkSha256": artifact_hash,
        }
        with zipfile.ZipFile(candidate, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(artifact, f"goal-hint-android-{version}-dev.apk")
            archive.writestr("development-manifest.json", json.dumps(manifest, indent=2) + "\n")
            archive.writestr("README.txt", f"Goal Hint {version} ANDROID DEVELOPMENT BUILD\n"
                             f"Requires the development website at {args.origin}.\n"
                             "Extract and install the Debug APK on your development device.\n"
                             "Start Next.js with npm --prefix next-js run dev on the development computer.\n"
                             "Debug signing is for development; this is not a production release.\n"
                             "The same app ID may conflict with an app signed using another key.\n"
                             "Preserve existing app data; do not uninstall an existing app to bypass signing checks.\n")
        with candidate.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        checksum = staging / (target.name + ".sha256")
        checksum.write_text(f"{digest}  {target.name}\n", encoding="ascii")
        candidate.replace(target)
        checksum.replace(target.with_suffix(".zip.sha256"))
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "windows"))
    parser.add_argument("--origin", required=True, type=development_origin)
    parser.add_argument("--flutter", default="flutter")
    parser.add_argument("--skip-build", action="store_true", help="Package the immediately completed same-checkout Debug build")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    try:
        if args.platform == "android":
            print(f"Archive: {package_android(args)}")
        else:
            if os.name != "nt":
                raise ValueError("The Windows development bundle requires a Windows build host.")
            command = ["powershell.exe", "-NoProfile", "-File", str(release.PROJECT / "tool/windows/package-development.ps1"),
                       "-Origin", args.origin, "-Flutter", shutil.which(args.flutter) or args.flutter]
            if args.skip_build:
                command.append("-SkipBuild")
            if args.force:
                command.append("-Force")
            release.run(*command)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Development packaging failed: {error}\n")


if __name__ == "__main__":
    main()
