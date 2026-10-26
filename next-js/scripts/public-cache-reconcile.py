"""Perform one bounded private cache-maintenance pass."""
import json
import re
import sys
from lib.runtime import CommandError, main_guard, service


def main():
    args = sys.argv[1:]
    if len(args) > 1 or args and not re.fullmatch(r"[1-9]\d{0,3}", args[0]):
        raise CommandError("Cache maintenance unavailable; check approved database access and the 031 migration. Private diagnostics are withheld.")
    print(json.dumps(service("cache-reconcile", {"limit": int(args[0]) if args else 100}), separators=(",", ":")))


if __name__ == "__main__":
    main_guard(main)
