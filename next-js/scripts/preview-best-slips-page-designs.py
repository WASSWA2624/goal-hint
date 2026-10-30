"""Serve ten desktop page skins using the real, unchanged Best Slips components."""
import shutil

from lib.rendering import Server, build_fixture, create_fixture, parse_args
from lib.runtime import ROOT, main_guard


def main():
    args = parse_args("Best Slips desktop design samples")
    directory = create_fixture("best-slips-page-designs")
    shutil.copytree(ROOT / "design/best-slips-page-designs/app", directory / "app", dirs_exist_ok=True)
    shutil.copy2(ROOT / "public/brand/goal-hint-favicon.ico", directory / "public/favicon.ico")
    print(f"Building review app: {directory}", flush=True)
    build_fixture(directory, timeout=240)
    with Server(directory) as server:
        print(f"Best Slips design review: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
