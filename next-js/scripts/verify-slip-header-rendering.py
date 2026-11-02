"""Render real responsive slip headers with synthetic slips and account state."""
import shutil

from lib.rendering import ROOT, Server, build_fixture, create_fixture, parse_args, request
from lib.runtime import main_guard


def prepare():
    directory = create_fixture("slip-header")
    shutil.copyfile(ROOT / "tests/helpers/rendering/slips/app/stored.ts", directory / "app/synthetic-slips.ts")
    return directory


def main():
    args = parse_args("slip header")
    directory = prepare()
    print(f"Building slip-header fixture: {directory}", flush=True)
    build_fixture(directory, timeout=360)
    with Server(directory) as server:
        response = request(server.origin)
        assert response.status == 200 and "data-slip-header-fixture" in response.text
        print(f"Slip-header SSR passed. Browser fixture: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
