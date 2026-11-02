"""Render actual pickers and mixed control rows over synthetic state."""
from lib.rendering import Server, build_fixture, create_fixture, parse_args, request
from lib.runtime import main_guard


def main():
    args = parse_args("layout bounds")
    directory = create_fixture("layout-bounds")
    print(f"Building layout-bounds fixture: {directory}", flush=True)
    build_fixture(directory, timeout=360)
    with Server(directory) as server:
        response = request(server.origin)
        assert response.status == 200 and "data-layout-bounds-fixture" in response.text
        print(f"Layout-bounds SSR passed. Browser fixture: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
