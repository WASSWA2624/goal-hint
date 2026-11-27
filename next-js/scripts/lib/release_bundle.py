"""Read an approved standalone web build and select its deployment payload."""
from collections.abc import Iterable, Mapping
from contextlib import ExitStack
from dataclasses import dataclass
from hashlib import file_digest
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile, ZipInfo


ARCHIVE_PREFIX = "goal-hint/"
SHA256 = re.compile(r"[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
BUILD_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
INVALID_PATH_CHARACTERS = re.compile(r'[\x00-\x1f\x7f<>:"|?*\\]')


class ReleaseBundleError(ValueError):
    """A release could not be verified or prepared for deployment."""


def validate_path(name: str) -> str:
    parts = name.split("/") if isinstance(name, str) else ()
    if not parts or INVALID_PATH_CHARACTERS.search(name) or any(
        part in {"", ".", "..", ".git", ".private", ".goal-hint"} or
        (part.startswith(".env") and part != ".env.example")
        for part in parts
    ):
        raise ReleaseBundleError("The release contains an unsafe or private file path.")
    return name


@dataclass(frozen=True)
class Changes:
    added: tuple[str, ...]
    modified: tuple[str, ...]
    deleted: tuple[str, ...]

    @property
    def writes(self) -> tuple[str, ...]:
        return self.added + self.modified


class ReleaseBundle:
    """Pin the verified archive to one open file throughout deployment."""

    def __init__(self, archive: Path, *, commit: str):
        if not isinstance(commit, str) or not COMMIT.fullmatch(commit):
            raise ReleaseBundleError("Supply the full approved Git commit.")
        self.path = archive
        self.commit = commit

    def __enter__(self):
        try:
            with ExitStack() as stack:
                stream = stack.enter_context(self.path.open("rb"))
                archive_hash = file_digest(stream, "sha256").hexdigest()
                checksum = self.path.with_suffix(".zip.sha256").read_text(encoding="ascii").split()
                if checksum != [archive_hash, self.path.name]:
                    raise ReleaseBundleError("The web build archive failed its published SHA-256 check.")
                stream.seek(0)
                self.archive = stack.enter_context(ZipFile(stream))
                self.entries, self.manifest = self._inspect(archive_hash)
                self.resources = stack.pop_all()
        except (OSError, UnicodeError, BadZipFile, KeyError, RuntimeError, json.JSONDecodeError):
            raise ReleaseBundleError("The web build archive or its checksum is missing or invalid.") from None
        return self

    def __exit__(self, *_):
        self.resources.close()

    def _inspect(self, archive_hash: str) -> tuple[dict, dict]:
        entries: dict[str, ZipInfo] = {}
        names: set[str] = set()
        roots = 0
        for entry in self.archive.infolist():
            if entry.filename == ARCHIVE_PREFIX and entry.orig_filename == ARCHIVE_PREFIX:
                roots += 1
                continue
            if entry.orig_filename != entry.filename or not entry.filename.startswith(ARCHIVE_PREFIX):
                raise ReleaseBundleError("A file is outside the web build archive root.")
            directory = entry.is_dir()
            path = validate_path(entry.filename[len(ARCHIVE_PREFIX):].removesuffix("/") if directory
                                 else entry.filename[len(ARCHIVE_PREFIX):])
            file_type = stat.S_IFMT(entry.external_attr >> 16)
            if path in names or file_type not in {0, stat.S_IFDIR if directory else stat.S_IFREG}:
                raise ReleaseBundleError("The web build archive contains a duplicate or unsupported entry.")
            names.add(path)
            if not directory:
                entries[path] = entry

        required = {"app.js", "BUILD_INFO.json", "standalone/server.js", "standalone/.next/BUILD_ID",
                    "scripts/deploy-mariadb.py"}
        if roots != 1 or not required <= entries.keys() or any(
            parent.as_posix() in entries for path in names for parent in PurePosixPath(path).parents
        ):
            raise ReleaseBundleError("The web build archive is incomplete or has conflicting paths.")
        info = json.loads(self.archive.read(entries["BUILD_INFO.json"]))
        build_id = self.archive.read(entries["standalone/.next/BUILD_ID"]).decode("ascii").strip()
        if not isinstance(info, dict) or info.get("commit") != self.commit or info.get("uncommittedChanges") is not False:
            raise ReleaseBundleError("Build the approved Git commit from a clean checkout.")
        migrations = info.get("migrations")
        if not BUILD_ID.fullmatch(build_id) or not isinstance(migrations, str) or not SHA256.fullmatch(migrations):
            raise ReleaseBundleError("The web build archive has invalid build or migration metadata.")
        self.build_info = info
        files = {}
        for path, entry in sorted(entries.items()):
            with self.archive.open(entry) as source:
                files[path] = file_digest(source, "sha256").hexdigest()
        return entries, {"commit": self.commit, "buildId": build_id, "archiveSha256": archive_hash,
                         "migrations": migrations, "files": files}

    def changes(self, current_files: Mapping[str, str]) -> Changes:
        targets = self.manifest["files"]
        added = targets.keys() - current_files.keys()
        deleted = current_files.keys() - targets.keys()
        modified = {path for path in targets.keys() & current_files.keys() if targets[path] != current_files[path]}
        return Changes(tuple(sorted(added)), tuple(sorted(modified)), tuple(sorted(deleted)))

    def write_delta(self, target: Path, paths: Iterable[str]) -> None:
        paths = sorted(set(paths))
        if any(path not in self.entries for path in paths):
            raise ReleaseBundleError("The deployment payload requested files outside the web build.")
        with ZipFile(target, "w", compression=ZIP_DEFLATED) as delta:
            for path in paths:
                entry = ZipInfo(path)
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                entry.compress_type = ZIP_DEFLATED
                with self.archive.open(self.entries[path]) as source, delta.open(entry, "w") as output:
                    shutil.copyfileobj(source, output)

    def copy_standalone(self, destination: Path) -> None:
        """Materialize the verified standalone files for a local package rebuild."""
        destination.mkdir()
        for path, entry in self.entries.items():
            if path.startswith("standalone/"):
                target = destination / path.removeprefix("standalone/")
                target.parent.mkdir(parents=True, exist_ok=True)
                with self.archive.open(entry) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
