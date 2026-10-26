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
    reference = result.get("promotionReference")
    # AI-first publication needs the owner to approve this exact reference as "ai-promotion"; printing it promotes nothing.
    print(f"Promotion reference (owner approval required): {reference}" if reference else "Promotion reference: none")


if __name__ == "__main__":
    main_guard(main)
