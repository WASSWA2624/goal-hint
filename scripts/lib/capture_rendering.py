"""Validate reusable, SQL-backed rendering artifacts beneath this repository."""
import json
from pathlib import Path
import re
import sys

from .rendering import ROOT, match


def unique_options(*names: str) -> None:
    for name in names:
        assert sum(value == name or value.startswith(name + "=") for value in sys.argv[1:]) <= 1, f"Supply {name} at most once."


def captured_directory(value: str, prefix: str) -> Path:
    directory = (ROOT / value).resolve(strict=True)
    relative = directory.relative_to((ROOT / ".tmp").resolve(strict=True)).as_posix()
    assert re.fullmatch(re.escape(prefix) + r"-[a-zA-Z0-9]+", relative), "Use a repository-local acceptance capture."
    return directory


def assert_database_capture(directory: Path) -> str:
    log = (directory / "database.log").read_text(encoding="utf-8")
    match(r"\bfail 0\b", log)
    match(r"\bskipped 0\b", log, "Genuine SQL preparation must not be skipped.")
    return log


def captured_cases(directory: Path) -> dict:
    return json.loads((directory / "scenarios.json").read_text(encoding="utf-8"))
