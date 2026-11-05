"""Repeatable production UI benchmark using real components and isolated synthetic data.

Build/serve independently at the before and after revisions. No database, private
configuration, provider requests or deployment is used. Browser measurements are
collected by benchmark-ui-browser.mjs against the printed loopback URL.
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import shutil
import statistics
import time
from pathlib import Path

from lib.rendering import Server, create_fixture, request, run_node, write_json
from lib.runtime import ROOT, CommandError, main_guard
from importlib.util import module_from_spec, spec_from_file_location


def environment():
    spec = spec_from_file_location("local_benchmark", ROOT / "scripts/benchmark-local-pages.py")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return {**module.isolated_environment(), "NODE_ENV": "production"}


def runtime_info():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    actual = run_node(["--version"], timeout=15).stdout.strip().removeprefix("v")
    expected = package["engines"]["node"]
    if actual != expected:
        raise CommandError(f"Benchmark requires pinned Node {expected}; found {actual}. Set NODE_BINARY to the pinned executable.")
    return {"node": actual, "next": package["dependencies"]["next"]}


def prepare():
    directory = create_fixture("app-loading")
    # Reuse actual populated slip views and APIs alongside the actual feed routes.
    shutil.copytree(ROOT / "tests/helpers/rendering/slips/app", directory / "app", dirs_exist_ok=True)
    for relative in ("en/page.tsx", "en/matches/page.tsx"):
        path = directory / "app" / relative
        path.write_text(path.read_text(encoding="utf-8").replace("setTimeout(resolve, 1_800)", "setTimeout(resolve, 0)"), encoding="utf-8")
    result = run_node(["--conditions=react-server", "--input-type=module", "--eval",
        "import {performancePageScenarios as performance} from './tests/helpers/performance-page-fixtures.mjs';"
        "import {liveFeed} from './tests/helpers/live-refresh-fixtures.mjs';"
        "process.stdout.write(JSON.stringify({performance,feed:liveFeed(),summary:{performance:"
        "{total:16,won:10,lost:3,pending:2,void:1,cancelled:0,unavailable:0}}}));"], env=environment())
    write_json(directory / "app/scenarios.json", json.loads(result.stdout))
    target = directory / "app/audit/options"
    target.mkdir(parents=True)
    (target / "page.tsx").write_text('''"use client";
import { useState } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Stack } from "@/components/ui/layout";
const options = Array.from({ length: 2000 }, (_, index) => ({ value: String(index), label: `League ${String(index).padStart(4, "0")}` }));
export default function Page() {
  const [values, setValues] = useState<string[]>([]);
  return <main><Stack><h1>Synthetic large option picker</h1>
    <Link href="/en/matches">Matches</Link><Link href="/en/performance">Performance</Link>
    <SearchableSelect label="Leagues" values={values} options={options} onValuesChange={setValues}
      allLabel="All leagues" searchLabel="Search leagues" emptyLabel="No leagues" maximum={3} />
    <output data-selected>{values.join(",")}</output>
  </Stack></main>;
}
''', encoding="utf-8")
    return directory


def measure(origin):
    results, scripts = [], set()
    for path in ["/en/matches", "/en/performance", "/best-slips/browse", "/cases/generated", "/audit/options"]:
        timings = []
        for _ in range(6):
            start = time.perf_counter()
            response = request(origin, path, timeout=90)
            elapsed = (time.perf_counter() - start) * 1000
            assert response.status == 200, (path, response.status)
            timings.append(round(elapsed, 2))
        scripts.update(re.findall(r'<script[^>]+src="([^"?]+)', response.text))
        results.append({"path": path, "firstCompleteMs": timings[0], "warmCompleteMs": timings[1:],
                        "warmMedianCompleteMs": statistics.median(timings[1:]), "htmlBytes": len(response.text.encode())})
    assets = []
    from urllib.request import urlopen
    for path in sorted(scripts):
        if path.startswith("/_next/"):
            with urlopen(origin + path) as response:
                data = response.read()
            assets.append({"path": path, "bytes": len(data), "gzipBytes": len(gzip.compress(data))})
    return {"routes": results, "scripts": assets, "uniqueScriptBytes": sum(asset["bytes"] for asset in assets),
            "uniqueScriptGzipBytes": sum(asset["gzipBytes"] for asset in assets)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--rebuild", action="store_true", help="Rebuild a reused fixture after an interrupted build or source change.")
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()
    runtime = runtime_info()
    env = environment()
    directory = args.fixture.resolve() if args.fixture else prepare()
    assert directory.is_relative_to((ROOT / ".tmp").resolve())
    print(f"Benchmark fixture: {directory}", flush=True)
    if not args.fixture or args.rebuild:
        run_node([str(ROOT / "node_modules/next/dist/bin/next"), "build", str(directory), "--webpack"],
                 directory, directory / "build.log", env, timeout=900)
    with Server(directory, env, ready="/audit/options") as server:
        report = {"version": 1, "synthetic": True, "production": True, "runtime": runtime,
                  "limitations": ["Local synthetic data; excludes real database/provider latency and mobile hardware/network",
                                  "HTTP samples measure complete HTML, not browser paint", "gzip bytes are calculated"],
                  **measure(server.origin)}
        write_json(directory / "http-benchmark.json", report)
        print(json.dumps({"report": str(directory / "http-benchmark.json"), "routes": report["routes"]}), flush=True)
        if args.serve:
            server.serve()
    return 0


if __name__ == "__main__":
    main_guard(main)
