"""Compare cold and warm actual slip rendering in isolated development/production fixtures.

No application database, credentials, providers, deployment or production configuration.
These are synthetic server-rendering measurements, not production/mobile qualification.
"""
from __future__ import annotations

from contextlib import contextmanager
import ctypes
from ctypes import wintypes
import gzip
import http.client
import json
import os
import re
import socket
import statistics
import subprocess
import threading
import time

from lib.development_process import process_record, process_snapshot, stop_process
from lib.rendering import create_fixture, run_node, write_json
from lib.runtime import ROOT, CommandError, hidden_process, main_guard, node_binary


def isolated_environment():
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("GOAL_HINT_", "NEXT_PUBLIC_")) and key not in
           {"DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"}}
    env.update(NEXT_TELEMETRY_DISABLED="1", FORCE_COLOR="0", DEBUG="", NODE_DEBUG="", NODE_DEBUG_NATIVE="",
               GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_FOOTBALL_ENABLED="false", GOAL_HINT_AI_ENABLED="false",
               GOAL_HINT_RESEARCH_ENABLED="false", GOAL_HINT_OPERATION_SCOPE="disabled", NEXT_PUBLIC_GOAL_HINT_DEMO="false")
    return env


def measure_request(port, path):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=180)
    started = time.perf_counter()
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        first = response.read(1)
        first_byte = time.perf_counter()
        body = first + response.read()
        ended = time.perf_counter()
        if response.status != 200:
            raise CommandError(f"Benchmark route {path} returned HTTP {response.status}.")
        return {"ttfbMs": round((first_byte - started) * 1000, 3), "completeMs": round((ended - started) * 1000, 3),
                "responseBytes": len(body)}, body
    finally:
        connection.close()


def process_metrics(pid):
    """Sample the owned Node process tree only; no host-wide resource attribution."""
    if os.name != "nt":
        return {"available": False, "reason": "Windows process sampler unavailable on this host"}
    records = process_snapshot()
    selected = {pid}
    while True:
        descendants = {row["pid"] for row in records if row["ppid"] in selected}
        if descendants <= selected:
            break
        selected.update(descendants)
    class Memory(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    *[(name, ctypes.c_size_t) for name in ("PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                      "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *[ctypes.POINTER(wintypes.FILETIME)] * 4]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
    cpu, memory, counted = 0.0, 0, 0
    for target in selected:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, target)
        if not handle:
            continue
        try:
            created, exited, system, user = (wintypes.FILETIME() for _ in range(4))
            current = Memory(); current.cb = ctypes.sizeof(Memory)
            if kernel.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(system), ctypes.byref(user)):
                cpu += sum((value.dwHighDateTime << 32) + value.dwLowDateTime for value in (system, user)) / 10_000_000
            if psapi.GetProcessMemoryInfo(handle, ctypes.byref(current), current.cb):
                memory += current.WorkingSetSize
            counted += 1
        finally:
            kernel.CloseHandle(handle)
    return {"available": True, "ownedProcesses": counted, "cpuSeconds": round(cpu, 3), "workingSetBytes": memory}


@contextmanager
def server(directory, mode, env):
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    command = [node_binary(), str(ROOT / "node_modules/next/dist/bin/next"), "dev" if mode == "development" else "start", str(directory)]
    if mode == "development":
        command.append("--webpack")
    command += ["--hostname", "127.0.0.1", "--port", str(port)]
    child = subprocess.Popen(command, cwd=directory, env={**env, "NODE_ENV": mode}, stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                             errors="replace", creationflags=hidden_process())
    log = []
    def collect():
        for line in child.stdout:
            log.append(line)
    reader = threading.Thread(target=collect, daemon=True); reader.start()
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise CommandError(f"Owned {mode} server exited; inspect its benchmark log.")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise CommandError(f"Owned {mode} server did not listen within 60 seconds.")
        yield port, child.pid, log
    finally:
        if child.poll() is None:
            record = process_record(child.pid)
            if record:
                stop_process(record, tree=True)
            child.wait(timeout=20)
        reader.join(timeout=5)
        (directory / f"{mode}-server.log").write_text("".join(log), encoding="utf-8")


def measure(directory, mode, env):
    results, scripts = [], set()
    with server(directory, mode, env) as (port, pid, log):
        for path in ["/best-slips/browse", "/cases/generated"]:
            cold, body = measure_request(port, path)
            text = body.decode("utf-8", errors="replace")
            scripts.update(re.findall(r'<script[^>]+src="([^"?]+)(?:\?[^\"]*)?"', text))
            warm = [measure_request(port, path)[0] for _ in range(5)]
            results.append({"path": path, "cold": cold, "warm": warm,
                            "warmMedianTtfbMs": statistics.median(item["ttfbMs"] for item in warm),
                            "warmMedianCompleteMs": statistics.median(item["completeMs"] for item in warm)})
            print(f"{mode} {path}: cold {cold['ttfbMs']} ms; warm median {results[-1]['warmMedianTtfbMs']} ms", flush=True)
        bundles = []
        for path in sorted(scripts):
            if path.startswith("/_next/"):
                _, body = measure_request(port, path)
                bundles.append({"path": path, "bytes": len(body), "gzipBytes": len(gzip.compress(body))})
        resources = process_metrics(pid)
        compilation = [line.strip() for line in log if "ompil" in line or "ender" in line or " GET " in line]
    return {"mode": mode, "routes": results, "scripts": bundles,
            "totalScriptBytes": sum(item["bytes"] for item in bundles),
            "totalScriptGzipBytes": sum(item["gzipBytes"] for item in bundles),
            "resourcesAfterRequests": resources, "serverTimingLog": compilation}


def main():
    env = isolated_environment()
    directory = create_fixture("slips")
    # Keep development and production outputs distinct; use the established fixture config.
    config = directory / "next.config.mjs"
    config.write_text(config.read_text(encoding="utf-8").replace("agentRules: false,", "agentRules: false, distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',"), encoding="utf-8")
    print(f"Isolated rendering benchmark: {directory}", flush=True)
    development = measure(directory, "development", env)
    started = time.perf_counter()
    run_node([str(ROOT / "node_modules/next/dist/bin/next"), "build", str(directory), "--webpack"],
             directory, directory / "build.log", {**env, "NODE_ENV": "production"}, timeout=600)
    build_seconds = round(time.perf_counter() - started, 3)
    production = measure(directory, "production", env)
    report = {"version": 1, "fixture": str(directory), "synthetic": True,
              "scope": "Actual shared slip UI and routing with isolated synthetic stored fixtures; no external services or database.",
              "limitations": ["No live-data/database/entitlement latency", "No browser hydration or mobile network measurement",
                              "Cold route compilation in development is not equivalent to production startup",
                              "gzip bytes are computed sizes, not observed network compression"],
              "productionBuildSeconds": build_seconds, "development": development, "production": production}
    write_json(directory / "benchmark.json", report)
    print(json.dumps({"report": str(directory / "benchmark.json"), "productionBuildSeconds": build_seconds}), flush=True)
    return 0


if __name__ == "__main__":
    main_guard(main, "Local rendering benchmark failed; owned processes were stopped and logs retained.")
