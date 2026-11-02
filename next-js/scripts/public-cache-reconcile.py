"""Reconcile disposable responses and their durable invalidation journal."""
import argparse
import json
import sys
from lib.runtime import CommandError, main_guard, service


def batch_size(value):
    if not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= 1000:
        raise argparse.ArgumentTypeError("Choose a batch size from 1 to 1000.")
    return int(value)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("limit", nargs="?", type=batch_size, default=100)
    parser.add_argument("--all", action="store_true", help="Repeat bounded transactions until a pass reports no work.")
    args = parser.parse_args(argv)
    totals = {"acknowledged": 0, "removed": 0}
    for _ in range(1000 if args.all else 1):
        result = service("cache-reconcile", {"limit": args.limit})
        for key in totals:
            totals[key] += result[key]
        if not args.all or not any(result.values()):
            print(json.dumps(totals, separators=(",", ":")))
            return
    raise CommandError("Cache maintenance reached 1000 passes; completed batches were committed. Run again to continue the backlog.")


if __name__ == "__main__":
    main_guard(main)
