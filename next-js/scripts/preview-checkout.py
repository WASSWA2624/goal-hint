"""Serve the real checkout components against synthetic, local-only responses."""
from lib.rendering import ROOT, Server, build_fixture, create_fixture, environment, run_node
from lib.runtime import main_guard

def main():
    directory = create_fixture("checkout")
    run_node([str(ROOT / "scripts/create-checkout-samples.mjs"), str(directory / "public/checkout-samples")])
    build_fixture(directory, environment(), timeout=300)
    with Server(directory, ready="/en/subscribe") as server:
        print(f"Checkout fixture: {server.origin}", flush=True)
        server.serve()

if __name__ == "__main__":
    main_guard(main)
