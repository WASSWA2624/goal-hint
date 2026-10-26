"""Read-only dry-run census of transient result/lifecycle history; it never deletes."""
import argparse
import json
import re

from lib.runtime import main_guard, service

FIXTURE_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
BATCH_ID = re.compile(r"[0-9a-f]{64}")


def bounded(low, high):
    def parse(value):
        try:
            number = int(value)
        except ValueError:
            raise argparse.ArgumentTypeError(f"Use an integer from {low} to {high}.") from None
        if not low <= number <= high:
            raise argparse.ArgumentTypeError(f"Use an integer from {low} to {high}.")
        return number
    return parse


def matching(pattern, label):
    def parse(value):
        if not pattern.fullmatch(value):
            raise argparse.ArgumentTypeError(f"Use the {label} printed by a previous partial report.")
        return value
    return parse


def payload(args):
    return {"maxFixtures": args.max_fixtures, "pageSize": args.page_size, "maxBatches": args.max_batches,
            "afterFixture": args.after_fixture, "afterBatch": args.after_batch}


def run(args):
    response = service("database-compaction-report", payload(args), timeout=600)
    if not isinstance(response, dict) or response.get("status") != "measured":
        print(json.dumps(response))
        return 1
    print(json.dumps(response, ensure_ascii=True, indent=2))
    return 0 if response["report"]["scope"]["coverage"] == "complete" else 3


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--max-fixtures", type=bounded(1, 20_000), default=2000, metavar="1..20000",
                        help="Fixtures with result state to inspect in this run.")
    result.add_argument("--page-size", type=bounded(1, 500), default=200, metavar="1..500",
                        help="Fixtures or batches per read transaction; lower it if a statement reaches its time limit.")
    result.add_argument("--max-batches", type=bounded(0, 100_000), default=5000, metavar="0..100000",
                        help="Result sync batches to inspect in this run.")
    result.add_argument("--after-fixture", type=matching(FIXTURE_ID, "lowercase fixture UUID"), default=None,
                        help="Resume after this fixture (resumeAfterFixture of a partial report).")
    result.add_argument("--after-batch", type=matching(BATCH_ID, "64-character batch hash"), default=None,
                        help="Resume after this batch (resumeAfterBatch of a partial report).")
    return result


def main():
    return run(parser().parse_args())


if __name__ == "__main__":
    main_guard(main, "History compaction report failed; private diagnostics are withheld.")
