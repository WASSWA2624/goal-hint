"""Run the shared forecast evaluation service and report its immutable outputs."""
import sys
from lib.runtime import CommandError, main_guard, service


def main():
    try:
        result = service("evaluation", {"args": sys.argv[1:]})
    except CommandError:
        print("Forecast evaluation unavailable; private input, verifier and storage diagnostics are withheld.", file=sys.stderr)
        print("Usage: npm run evaluation:report -- [--protocol private.json --dataset private.json --authority trusted.mjs --split finalTest] [--directory private-directory]", file=sys.stderr)
        return 1
    print(f"Forecast evaluation: {result['kind']}. Promotion performed: false. Public claim authorized: false.")
    print(f"Report: {result['markdownPath']}")
    print(f"JSON: {result['reportPath']}")


if __name__ == "__main__":
    main_guard(main)
