#!/usr/bin/env python3
"""Build and verify native delivery archives in the repository's deploy folder."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
DEPLOY = PROJECT.parent / "deploy"
APPLE_APP_ID = "com.goalhint.goalHint"
ANDROID_APP_ID = "com.goalhint.goal_hint"


def run(*command: str | Path, capture: bool = False) -> str:
    result = subprocess.run(
        [str(part) for part in command], cwd=PROJECT, check=True,
        text=True, stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )
    return result.stdout or ""


def version() -> tuple[str, str]:
    match = re.search(r"(?m)^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$",
                      (PROJECT / "pubspec.yaml").read_text(encoding="utf-8"))
    if not match:
        raise ValueError("pubspec.yaml must contain a release version and build number.")
    return match[1], match[2]


def check_toolchain(flutter: str) -> None:
    expected = json.loads((PROJECT / "release-toolchain.json").read_text(encoding="utf-8"))
    actual = json.loads(run(flutter, "--version", "--machine", capture=True))
    if (actual["frameworkVersion"] != expected["flutter"]["version"]
            or actual["frameworkRevision"] != expected["flutter"]["revision"]
            or actual["dartSdkVersion"].split()[0] != expected["dart"]["version"]):
        raise ValueError("Flutter/Dart SDK differs from release-toolchain.json.")


def android_tools() -> Path:
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk:
        properties = PROJECT / "android/local.properties"
        if properties.is_file():
            match = re.search(r"(?m)^sdk\.dir=(.+)$", properties.read_text(encoding="utf-8"))
            if match:
                sdk = match[1].strip().replace("\\\\", "\\").replace("\\:", ":")
    if not sdk:
        raise ValueError("Set ANDROID_HOME to the build SDK or configure android/local.properties.")
    candidates = [directory for directory in (Path(sdk) / "build-tools").iterdir()
                  if re.fullmatch(r"\d+(?:\.\d+)+", directory.name)]
    candidates.sort(key=lambda directory: tuple(map(int, directory.name.split("."))), reverse=True)
    for directory in candidates:
        if (directory / ("apksigner.bat" if os.name == "nt" else "apksigner")).is_file():
            return directory
    raise ValueError("Android SDK build-tools with apksigner and aapt are required.")


def validate_apk(badging: str, certificates: str, release: str, build: str) -> None:
    match = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not match or match.groups() != (ANDROID_APP_ID, build, release):
        raise ValueError("APK identity/version differs from pubspec.yaml.")
    if "application-debuggable" in badging or "android debug" in certificates.lower():
        raise ValueError("Debug or debug-signed APKs cannot be packaged for production.")


def check_android_signing() -> None:
    signing_values = ("STORE_FILE", "STORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD")
    if (not (PROJECT / "android/key.properties").is_file()
            and not all(os.environ.get(f"GOAL_HINT_ANDROID_{name}") for name in signing_values)):
        raise ValueError("Android release signing is missing. Supply android/key.properties or all four "
                         "GOAL_HINT_ANDROID_* signing values; see flutter/docs/android-release.md.")


def build_android(flutter: str, release: str, build: str) -> Path:
    check_android_signing()
    # Always complete a fresh release command. Never promote a stale APK after a failed build.
    run(flutter, "build", "apk", "--release", "--target=lib/main.dart", "--dart-define=APP_ENV=production")
    apk = PROJECT / "build/app/outputs/flutter-apk/app-release.apk"
    tools = android_tools()
    signer = tools / ("apksigner.bat" if os.name == "nt" else "apksigner")
    aapt = tools / ("aapt.exe" if os.name == "nt" else "aapt")
    certificates = run(signer, "verify", "--verbose", "--print-certs", apk, capture=True)
    badging = run(aapt, "dump", "badging", apk, capture=True)
    validate_apk(badging, certificates, release, build)
    return apk


def check_apple_host() -> None:
    if sys.platform != "darwin":
        raise ValueError("Apple delivery packages require a macOS build host with Xcode and signing configured.")


def validate_apple_app(app: Path, release: str, build: str) -> None:
    for path in app.rglob("*"):
        if path.name in {"kernel_blob.bin", "vm_snapshot_data", "isolate_snapshot_data"} or path.suffix == ".dill":
            raise ValueError("Debug artifacts cannot be packaged for production.")
    info = app / "Info.plist"
    if not info.is_file():
        info = app / "Contents/Info.plist"
    with info.open("rb") as stream:
        metadata = plistlib.load(stream)
    if (metadata.get("CFBundleIdentifier"), metadata.get("CFBundleShortVersionString"),
            str(metadata.get("CFBundleVersion"))) != (APPLE_APP_ID, release, build):
        raise ValueError("Apple app identity/version differs from pubspec.yaml.")
    run("codesign", "--verify", "--deep", "--strict", app)
    signature = run("codesign", "--display", "--verbose=4", app, capture=True)
    if ("Signature=adhoc" in signature or "TeamIdentifier=not set" in signature
            or not re.search(r"Authority=(?:Apple Distribution|iPhone Distribution|Developer ID Application)", signature)):
        raise ValueError("An Apple distribution signing identity is required.")


def build_ios(flutter: str, export_options: Path, staging: Path, release: str, build: str) -> Path:
    if not export_options.is_file():
        raise ValueError("Supply the owner's existing Xcode ExportOptions.plist outside Git.")
    with export_options.open("rb") as stream:
        options = plistlib.load(stream)
    if options.get("method") not in {"app-store-connect", "release-testing", "enterprise", "app-store", "ad-hoc"}:
        raise ValueError("Select an authorized distribution export method, not development signing.")
    run(flutter, "build", "ipa", "--release", "--target=lib/main.dart", "--dart-define=APP_ENV=production",
        f"--export-options-plist={export_options.resolve()}")
    # The pinned Flutter tool can report success after an IPA export failure.
    # Explicitly export its successful Xcode archive into a new empty directory
    # with a checked exit code; never accept a previous build/ios/ipa file.
    archives = list((PROJECT / "build/ios/archive").glob("*.xcarchive"))
    if len(archives) != 1:
        raise ValueError("Expected exactly one successful Xcode archive; resolve stale archives before retrying.")
    export = staging / "ios-export"
    run("xcodebuild", "-exportArchive", "-archivePath", archives[0], "-exportPath", export,
        "-exportOptionsPlist", export_options.resolve())
    candidates = list(export.glob("*.ipa"))
    if len(candidates) != 1:
        raise ValueError("Expected exactly one freshly exported IPA; no previous output will be packaged.")
    extracted = staging / "ios-inspection"
    run("ditto", "-x", "-k", candidates[0], extracted)
    apps = list((extracted / "Payload").glob("*.app"))
    if len(apps) != 1:
        raise ValueError("The IPA must contain exactly one application.")
    validate_apple_app(apps[0], release, build)
    return candidates[0]


def validate_dmg(dmg: Path, staging: Path, release: str, build: str) -> Path:
    if not dmg.is_file() or dmg.suffix.lower() != ".dmg":
        raise ValueError("Supply the owner's signed and notarized macOS .dmg.")
    run("hdiutil", "verify", dmg)
    run("xcrun", "stapler", "validate", dmg)
    run("spctl", "--assess", "--type", "open", "--context", "context:primary-signature", dmg)
    mount = staging / "macos-inspection"
    mount.mkdir()
    run("hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg)
    try:
        apps = list(mount.glob("*.app"))
        if len(apps) != 1:
            raise ValueError("The DMG must contain exactly one Goal Hint application.")
        validate_apple_app(apps[0], release, build)
        run("spctl", "--assess", "--type", "execute", apps[0])
    finally:
        run("hdiutil", "detach", mount)
    return dmg


def publish(artifact: Path, platform: str, release: str, staging: Path, force: bool) -> Path:
    target = DEPLOY / f"goal-hint-{platform}-{release}.zip"
    if target.exists() and not force:
        raise FileExistsError("Archive exists. Use --force to replace the unpublished package explicitly.")
    name = f"goal-hint-{platform}-{release}{artifact.suffix.lower()}"
    instructions = {
        "android": "Extract the ZIP and install the signed APK on an accepted Android device.\n",
        "ios": "Extract the ZIP and distribute the IPA through its provisioned Apple channel (TestFlight/App Store or authorized managed devices).\n",
        "macos": "Extract the ZIP, open the signed/notarized DMG and drag Goal Hint to Applications.\n",
    }
    temporary = staging / target.name
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(artifact, name)
        archive.writestr("README.txt", f"Goal Hint {release}\n" + instructions[platform]
                         + "Production web origin: https://goalhint.com\n")
    with temporary.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    checksum = staging / (target.name + ".sha256")
    checksum.write_text(f"{digest}  {target.name}\n", encoding="ascii")
    temporary.replace(target)
    checksum.replace(target.with_suffix(".zip.sha256"))
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios", "macos"))
    parser.add_argument("--flutter", default="flutter")
    parser.add_argument("--export-options", type=Path, help="Owner's private iOS ExportOptions.plist")
    parser.add_argument("--dmg", type=Path, help="Owner-signed/notarized macOS DMG after the production Flutter build")
    parser.add_argument("--force", action="store_true", help="Replace an unpublished ZIP of the same version")
    args = parser.parse_args()
    args.flutter = shutil.which(args.flutter) or args.flutter
    try:
        release, build = version()
        if args.platform in ("ios", "macos"):
            check_apple_host()
        if args.platform == "ios" and not args.export_options:
            raise ValueError("iOS requires --export-options with the owner's Xcode export configuration.")
        if args.platform == "macos" and not args.dmg:
            raise ValueError("macOS requires --dmg with the owner's signed/notarized production disk image.")
        if args.platform == "android":
            check_android_signing()
        target = DEPLOY / f"goal-hint-{args.platform}-{release}.zip"
        if target.exists() and not args.force:
            raise FileExistsError("Archive exists. Use --force to replace the unpublished package explicitly.")
        if args.platform != "macos":
            check_toolchain(args.flutter)
        staging_root = DEPLOY / ".staging"
        staging_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=f"{args.platform}-", dir=staging_root) as temporary:
            staging = Path(temporary)
            if args.platform == "android":
                artifact = build_android(args.flutter, release, build)
            elif args.platform == "ios":
                artifact = build_ios(args.flutter, args.export_options, staging, release, build)
            else:
                artifact = validate_dmg(args.dmg.resolve(), staging, release, build)
            print(f"Archive: {publish(artifact, args.platform, release, staging, args.force)}")
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Packaging failed: {error}\n")


if __name__ == "__main__":
    main()
