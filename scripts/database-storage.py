"""Inspect database allocation/payload sizes and retain a bounded private growth baseline."""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile

from lib.runtime import CommandError, ROOT, main_guard, service

MAX_HISTORY_BYTES = 16 * 1024 * 1024
HISTORY_LIMIT = 30


def positive(value):
    try:
        number = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("Use a positive integer.") from None
    if not 0 < number <= 9_007_199_254_740_991:
        raise argparse.ArgumentTypeError("Use a positive safe integer.")
    return number


def history_path(target):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", target):
        raise CommandError("Use a short coded target name without paths or connection details.")
    directory = ROOT / ".goal-hint" / "storage"
    directory.mkdir(parents=True, exist_ok=True)
    if directory.is_symlink():
        raise CommandError("Storage history must use an ordinary private directory.")
    return directory / (target + ".json")


def load_history(path):
    if not path.exists():
        return []
    if path.is_symlink() or path.stat().st_size > MAX_HISTORY_BYTES:
        raise CommandError("Storage history is invalid or oversized; preserve it for operator review.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list) or len(value) > HISTORY_LIMIT or any(not isinstance(item, dict) for item in value):
            raise ValueError()
        return value
    except (OSError, ValueError):
        raise CommandError("Storage history is unreadable; preserve it for operator review.") from None


def save_history(path, history, report):
    rows = [*history, report["measurement"]][-HISTORY_LIMIT:]
    content = json.dumps(rows, ensure_ascii=True, indent=2) + "\n"
    if len(content.encode("utf-8")) > MAX_HISTORY_BYTES:
        raise CommandError("Storage history exceeds its size bound; no prior measurement was changed.")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", prefix=path.stem + "-", suffix=".tmp",
                                         dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def run(args):
    path = history_path(args.target)
    lock = path.with_suffix(".lock")
    try:
        handle = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise CommandError("Storage inspection is already running, or its private lock needs operator review.") from None
    try:
        history = load_history(path)
        report = service("database-storage", {"sampleRows": args.sample_rows, "previous": history[-1] if history else None,
            "limits": {"maximumAllocatedBytes": args.max_allocated_bytes, "maximumGrowthBytesPerDay": args.max_growth_bytes_per_day}})
        if report.get("status") != "measured":
            print(json.dumps(report))
            return 1
        if args.record:
            save_history(path, history, report)
        print(json.dumps(report, ensure_ascii=True, indent=2))
        if any(value is True for value in report["alerts"].values()):
            return 2
        if args.max_allocated_bytes is not None and report["measurement"]["allocatedBytes"] is None:
            return 3
        if args.max_growth_bytes_per_day is not None and report["comparison"]["growthBytesPerDay"] is None:
            return 3
        return 0
    finally:
        os.close(handle)
        lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", action="store_true", help="Retain this measurement as the next private growth baseline (last 30 only).")
    parser.add_argument("--target", default="application", help="Coded private history namespace; use a separate name per database target.")
    parser.add_argument("--sample-rows", type=int, default=100, choices=range(0, 1001), metavar="0..1000", help="Bounded primary-key-ordered JSON samples per supported football/audit table; zero disables sampling.")
    parser.add_argument("--max-allocated-bytes", type=positive)
    parser.add_argument("--max-growth-bytes-per-day", type=positive)
    return run(parser.parse_args())


if __name__ == "__main__":
    main_guard(main, "Database storage inspection failed; private diagnostics are withheld.")
