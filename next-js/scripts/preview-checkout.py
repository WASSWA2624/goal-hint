"""Serve the real checkout components against synthetic, local-only responses."""
from lib.rendering import Server, build_fixture, create_fixture, environment
from lib.runtime import main_guard

def main():
    directory = create_fixture("checkout")
    build_fixture(directory, environment(), timeout=300)
    with Server(directory) as server:
        print(f"Checkout fixture: {server.origin}", flush=True)
        server.serve()

if __name__ == "__main__":
    main_guard(main)
