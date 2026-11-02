"""Reconcile disposable responses and their durable invalidation journal."""
import argparse
import json
from lib.runtime import CommandError, main_guard, service


class CacheArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise CommandError("Use cache:reconcile -- [1-1000] [--all].")


def batch_size(value):
    if not 1 <= len(value) <= 4 or not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= 1000:
        raise argparse.ArgumentTypeError("Choose a batch size from 1 to 1000.")
    return int(value)


def main(argv=None):
    parser = CacheArgumentParser(description=__doc__)
    parser.add_argument("limit", nargs="?", type=batch_size, default=100)
    parser.add_argument("--all", action="store_true", help="Repeat bounded transactions until a pass reports no work.")
    args = parser.parse_args(argv)
    totals = {"acknowledged": 0, "removed": 0}
    for _ in range(1000 if args.all else 1):
        result = service("cache-reconcile", {"limit": args.limit})
        for key in totals:
            totals[key] += result[key]
        if not args.all or not any(result[key] for key in totals):
            print(json.dumps(totals, separators=(",", ":")))
            return
    raise CommandError(f"Cache maintenance reached 1000 passes ({totals['acknowledged']} acknowledged, {totals['removed']} removed). Run again to continue the backlog.")


if __name__ == "__main__":
    main_guard(main)
