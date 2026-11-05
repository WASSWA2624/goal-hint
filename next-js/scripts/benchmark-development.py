"""Compare Webpack and Turbopack in isolated populated fixtures or actual-app snapshots.

Run modes sequentially on a quiet host. This does not start the application demo
database, read its environment files, stop other servers, or change its launcher.
Use --application to include the actual instrumentation and proxy with external
services disabled. Fixture results alone do not qualify a default bundler change.
Use --server-externals with --application to compare a generated-only MariaDB
driver externalization candidate; the application's source config is unchanged.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import ctypes
import http.client
from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
import re
import shutil
import socket
import statistics
import subprocess
import threading
import time
from uuid import uuid4

from lib.development_process import process_record, stop_process
from lib.rendering import write_json
from lib.runtime import ROOT, CommandError, hidden_process, main_guard, node_binary


MODES = ("webpack", "turbopack")
ROUTES = ("/en/matches", "/en/performance", "/best-slips/browse", "/cases/generated", "/audit/options")
APPLICATION_ROUTES = ("/en/matches", "/en/performance", "/en/account", "/en/download")
SERVER_EXTERNAL_CANDIDATE = ("@prisma/adapter-mariadb", "mariadb")
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def load_script(name):
    spec = spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / f"{name}.py")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


local = load_script("benchmark-local-pages")


def benchmark_environment():
    return {**local.isolated_environment(), "NODE_ENV": "development", "NODE_OPTIONS": ""}


def common_root(source, dependencies):
    try:
        return Path(os.path.commonpath([str(source.resolve()), str(dependencies.resolve())]))
    except ValueError as error:
        raise CommandError("The fixture source and resolved dependencies must share a filesystem root.") from error


def copy_fixture(template, directory, root=ROOT):
    """Copy only fixture inputs; private files and previous compiler output are excluded."""
    directory.mkdir()
    for name in ("app", "public"):
        if (template / name).is_dir():
            shutil.copytree(template / name, directory / name,
                            ignore=shutil.ignore_patterns(".env*", "node_modules", ".next*", "__pycache__"))
    for name in ("package.json", "next-env.d.ts"):
        if (template / name).is_file():
            shutil.copyfile(template / name, directory / name)
    relative = Path(os.path.relpath(root, directory)).as_posix()
    write_json(directory / "tsconfig.json", {"extends": relative + "/tsconfig.json",
        "compilerOptions": {"paths": {"@/*": [relative + "/src/*"]}},
        "include": ["app/**/*.tsx", "app/**/*.ts", ".next/types/**/*.ts", relative + "/src/styles/styled.d.ts"],
        "exclude": ["node_modules"]})
    # A worktree may resolve its dependency junction outside ROOT. Widen only
    # this generated fixture's Turbopack root, never the actual application config.
    compiler_root = common_root(root, root / "node_modules")
    (directory / "next.config.mjs").write_text(
        "export default { agentRules: false, compiler: { styledComponents: true }, "
        "experimental: { cpus: 1 }, turbopack: { root: " + json.dumps(str(compiler_root)) + " } };\n",
        encoding="utf-8")
    return compiler_root


def copy_application_inputs(source, directory):
    """Preserve application startup hooks while copying only public source inputs."""
    required = ("src/instrumentation.ts", "src/proxy.ts", "next.config.ts", "tsconfig.json", "package.json")
    if any(not (source / name).is_file() for name in required):
        raise CommandError("An application snapshot requires the real instrumentation, proxy and application configs.")
    directory.mkdir()
    for name in ("src", "assets", "public"):
        if (source / name).is_dir():
            shutil.copytree(source / name, directory / name,
                            ignore=shutil.ignore_patterns(".env*", ".private", ".goal-hint", "node_modules", ".next*", "__pycache__"))
    for name in ("package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "prisma.config.ts"):
        if (source / name).is_file():
            shutil.copyfile(source / name, directory / name)


def prepare_application():
    directory = ROOT / ".tmp" / f"development-application-source-{uuid4().hex[:8]}"
    directory.parent.mkdir(exist_ok=True)
    copy_application_inputs(ROOT, directory)
    return directory


def copy_application(template, directory, root=ROOT, server_externals=()):
    copy_application_inputs(template, directory)
    compiler_root = common_root(root, root / "node_modules")
    # Keep the original config intact. Candidate externals apply only to this
    # generated wrapper, alongside the root needed by the dependency junction.
    shutil.copyfile(directory / "next.config.ts", directory / "application.next.config.ts")
    external_config = (
        'serverExternalPackages: [...new Set([...(applicationConfig.serverExternalPackages ?? []), ...'
        + json.dumps(list(server_externals)) + '])], '
        if server_externals else ''
    )
    (directory / "next.config.ts").write_text(
        'import applicationConfig from "./application.next.config.ts";\n'
        'export default { ...applicationConfig, ' + external_config
        + 'turbopack: { ...applicationConfig.turbopack, root: '
        + json.dumps(str(compiler_root)) + " } };\n", encoding="utf-8")
    return compiler_root


def host_resources():
    result = {"logicalCpus": os.cpu_count()}
    if hasattr(os, "getloadavg"):
        result["loadAverage"] = list(os.getloadavg())
    if os.name == "nt":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong),
                        *[(name, ctypes.c_ulonglong) for name in
                          ("totalPhysical", "availablePhysical", "totalPageFile", "availablePageFile",
                           "totalVirtual", "availableVirtual", "availableExtendedVirtual")]]
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            result.update(memoryLoadPercent=status.load, physicalBytes=status.totalPhysical,
                          availablePhysicalBytes=status.availablePhysical,
                          availableCommitBytes=status.availablePageFile)
    return result


@contextmanager
def server(directory, mode, env, startup_timeout=120):
    if mode not in MODES:
        raise CommandError("Choose webpack or turbopack.")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    command = [node_binary(), str(ROOT / "node_modules/next/dist/bin/next"), "dev", str(directory),
               f"--{mode}", "--hostname", "127.0.0.1", "--port", str(port)]
    started = time.perf_counter()
    child = subprocess.Popen(command, cwd=directory, env=env, stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                             errors="replace", creationflags=hidden_process())
    log, ready = [], threading.Event()
    timing = {}

    def collect():
        for line in child.stdout:
            line = ANSI.sub("", line)
            log.append(line)
            if "Ready in" in line and not ready.is_set():
                timing["startupMs"] = round((time.perf_counter() - started) * 1000, 3)
                ready.set()

    reader = threading.Thread(target=collect, daemon=True)
    reader.start()
    try:
        deadline = time.monotonic() + startup_timeout
        while not ready.wait(0.1):
            if child.poll() is not None:
                raise CommandError(f"Owned {mode} server exited before readiness; inspect {directory / 'server.log'}.")
            if time.monotonic() >= deadline:
                raise CommandError(f"Owned {mode} server did not become ready within {startup_timeout} seconds.")
        yield port, child, log, timing
    finally:
        try:
            if child.poll() is None:
                record = process_record(child.pid)
                if record:
                    stop_process(record, tree=True)
                else:
                    child.terminate()
                child.wait(timeout=20)
        finally:
            reader.join(timeout=5)
            (directory / "server.log").write_text("".join(log), encoding="utf-8")
            if not reader.is_alive():
                child.stdout.close()


def measure_routes(port, routes=ROUTES):
    results = []
    for path in routes:
        cold, _ = local.measure_request(port, path)
        warm = [local.measure_request(port, path)[0] for _ in range(5)]
        results.append({"path": path, "firstRequest": cold, "warm": warm,
                        "warmMedianTtfbMs": statistics.median(value["ttfbMs"] for value in warm),
                        "warmMedianCompleteMs": statistics.median(value["completeMs"] for value in warm)})
        print(f"{path}: first complete {cold['completeMs']} ms; warm median {results[-1]['warmMedianCompleteMs']} ms", flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modes", nargs="+", choices=MODES, default=list(MODES), help="Sequential mode order; reverse on a repeat run to check order bias.")
    parser.add_argument("--application", action="store_true", help="Copy the actual application including instrumentation/proxy; keep database and providers disabled.")
    parser.add_argument("--server-externals", action="store_true", help="Generated application config only: externalize the MariaDB adapter and driver for comparison with an unchanged run.")
    parser.add_argument("--fixture", type=Path, help="Reuse benchmark inputs in .tmp (an actual-app source snapshot with --application); each mode gets a fresh directory.")
    parser.add_argument("--serve", action="store_true", help="Keep one selected mode running after measurements for browser checks.")
    args = parser.parse_args()
    runtime = load_script("benchmark-ui").runtime_info()
    if len(set(args.modes)) != len(args.modes):
        parser.error("Each mode may appear only once.")
    if args.serve and len(args.modes) != 1:
        parser.error("--serve requires exactly one mode, for example --modes turbopack --serve.")
    if args.server_externals and not args.application:
        parser.error("--server-externals requires --application so the real database import graph is measured.")
    if args.fixture:
        template = args.fixture.resolve()
        required = ("src/instrumentation.ts", "src/proxy.ts") if args.application else ("app/audit/options/page.tsx",)
        if not template.is_relative_to((ROOT / ".tmp").resolve()) or any(not (template / name).is_file() for name in required):
            parser.error("--fixture must contain the selected benchmark's source inputs inside this checkout's .tmp directory.")
    elif args.application:
        template = prepare_application()
    else:
        template = load_script("benchmark-ui").prepare()
    run_id = uuid4().hex[:8]
    report_path = template / f"development-benchmark-{run_id}.json"
    scope = (["Actual copied application includes instrumentation/proxy, with database and providers disabled.",
              "Empty/unavailable and signed-out routes do not qualify populated demo-database, authenticated, or provider behavior."]
             if args.application else
             ["Local synthetic populated UI; no demo database, providers, or actual-app instrumentation/proxy.",
              "Fixture results do not qualify changing the default bundler; full-app startup/navigation must also pass."])
    report = {"version": 1, "synthetic": not args.application, "application": args.application, "production": False, "runtime": runtime,
              "template": str(template), "modeOrder": args.modes,
              "additionalServerExternalPackages": list(SERVER_EXTERNAL_CANDIDATE) if args.server_externals else [],
              "limitations": [*scope,
                              "First request includes on-demand compilation; later routes may reuse modules compiled by earlier routes.",
                              "HTTP timings include complete streamed HTML, not browser hydration, paint, or input latency.",
                              "Host memory pressure, other processes, filesystem caches and mode order can affect timings.",
                              "Resource snapshots are contextual, not peak usage or exclusive host measurements."],
              "modes": []}
    write_json(report_path, report)
    print(f"Development benchmark report: {report_path}", flush=True)
    for mode in args.modes:
        directory = ROOT / ".tmp" / f"development-{mode}-{run_id}"
        compiler_root = (copy_application(template, directory, server_externals=SERVER_EXTERNAL_CANDIDATE if args.server_externals else ())
                         if args.application else copy_fixture(template, directory))
        result = {"mode": mode, "fixture": str(directory), "turbopackRoot": str(compiler_root),
                  "hostBefore": host_resources(), "status": "pending", "serverLog": str(directory / "server.log")}
        report["modes"].append(result)
        try:
            with server(directory, mode, benchmark_environment()) as (port, child, log, timing):
                print(f"{mode} isolated browser URL: http://127.0.0.1:{port}", flush=True)
                result.update(timing, routes=measure_routes(port, APPLICATION_ROUTES if args.application else ROUTES),
                              resourcesAfterRequests=local.process_metrics(child.pid))
                result["serverTimingLog"] = [line.strip() for line in log if re.search(r"[Cc]ompil|[Rr]ender|\bGET\b|Ready in", line)]
                result["errors"] = [line.strip() for line in log if re.search(r"(?:Error:|TurbopackInternalError|Failed to compile|⨯)", line)]
                result["status"] = "failed" if result["errors"] else "passed"
                write_json(report_path, report)
                if args.serve:
                    print("Owned fixture remains available for browser checks; Ctrl+C stops it.", flush=True)
                    child.wait()
        except KeyboardInterrupt:
            result["interrupted"] = True
            if result["status"] == "pending":
                result["status"] = "interrupted"
            break
        except (CommandError, OSError, http.client.HTTPException, subprocess.SubprocessError) as error:
            result.update(status="failed", error=str(error))
        finally:
            result["hostAfter"] = host_resources()
            write_json(report_path, report)
    print(json.dumps({"report": str(report_path), "modes": [{"mode": value["mode"], "status": value["status"]} for value in report["modes"]]}), flush=True)
    return 0 if len(report["modes"]) == len(args.modes) and all(value["status"] == "passed" for value in report["modes"]) else 1


if __name__ == "__main__":
    main_guard(main, "Development benchmark failed; inspect the isolated report and server logs.")
