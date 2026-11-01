"""Build real shared fields with synthetic values for browser interaction checks."""
from lib.rendering import Server, build_fixture, create_fixture, parse_args, request
from lib.runtime import main_guard


def main():
    args = parse_args("floating-labels")
    directory = create_fixture("floating-labels")
    print(f"Building floating-label fixture: {directory}", flush=True)
    build_fixture(directory, timeout=360)
    with Server(directory) as server:
        response = request(server.origin)
        assert response.status == 200 and "data-floating-fixture" in response.text
        assert "data-floating-outline" in response.text
        print(f"Floating-label SSR passed. Browser fixture: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Floating-label rendering failed; inspect the fixture build.log.")
