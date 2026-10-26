"""Verify deterministic, request-isolated initial Redux state in production HTML."""
from concurrent.futures import ThreadPoolExecutor
import json

from lib.rendering import build_fixture, create_fixture, match, parse_args, request, Server
from lib.runtime import main_guard, service


def main() -> None:
    args = parse_args("client state")
    directory = create_fixture("client-state")
    page = directory / "app/page.tsx"
    page.write_text(page.read_text(encoding="utf-8").replace('"__CLIENT_FIXTURE__"',
        json.dumps(service("rendering-fixtures")["clientFixture"])), encoding="utf-8")
    print(f"Building client state fixture: {directory}", flush=True)
    build_fixture(directory)
    seeds = ["alpha", "beta", "gamma", "delta"]
    with Server(directory) as server:
        def verify(seed: str) -> None:
            response = request(server.origin, f"/?seed={seed}")
            assert response.status == 200
            assert response.headers.get("set-cookie") is None
            for element, value in [("a-query", seed), ("b-query", seed + "-b"), ("a-draft", seed),
                ("b-draft", seed + "-b"), ("a-version", "9"), ("b-version", "9"),
                ("a-density", "comfortable"), ("b-density", "comfortable")]:
                match(f'id="{element}"[^>]*>{value}</p>', response.text)
            assert response.text.count('data-hydrated="false"') == 2
            for other in seeds:
                if other != seed:
                    assert f">{other}</p>" not in response.text
            (directory / f"{seed}.html").write_text(response.text, encoding="utf-8")
        with ThreadPoolExecutor(max_workers=len(seeds)) as executor:
            list(executor.map(verify, seeds))
        print(f"Client state SSR verification passed: {len(seeds)} concurrent requests, two isolated providers each, deterministic initial preferences.")
        print(f"Fixture artifacts: {directory}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
