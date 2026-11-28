"""Read bounded Linux host counters and opt-in Apache access-log aggregates."""

import argparse
from collections import Counter
from datetime import datetime, timezone
from functools import lru_cache
import json
import os
from pathlib import Path
import re
import stat
import time
from urllib.parse import parse_qs


PROC = Path("/proc")
ACCESS_RECORD = re.compile(rb'^.{1,512}?\[([^\]\r\n]{26})\] "((?:[^"\\\r\n]|\\.)*)" ([1-5][0-9]{2})(?: |$)')
ROUTES = {
    b"/en/matches": "matches-page",
    b"/en/best-slips": "best-slips-page",
    b"/en/account": "account-page",
    b"/en/slips": "builder-page",
    b"/api/matches": "matches-api",
    b"/api/matches/summary": "matches-summary-api",
    b"/api/best-slips": "best-slips-api",
    b"/api/account/session": "account-session-api",
    b"/api/admin/password-requests": "password-requests-api",
}
DETAIL_API = re.compile(rb"/api/matches/[0-9]+(/insights)?")
ROUTE_LABELS = (*ROUTES.values(), "matches-initial-api", "matches-continuation-api", "match-detail-api", "match-insights-api")
MEMORY_FIELDS = {
    "MemTotal": "totalBytes", "MemAvailable": "availableBytes", "SwapTotal": "swapTotalBytes",
    "SwapFree": "swapFreeBytes", "Dirty": "dirtyBytes", "Writeback": "writebackBytes",
}


@lru_cache(maxsize=4096)
def access_time(value):
    try:
        return int(datetime.strptime(value.decode("ascii"), "%d/%b/%Y:%H:%M:%S %z").timestamp())
    except (UnicodeError, ValueError, OverflowError):
        return None


def matching_routes(request):
    parts = request.split(b" ")
    if len(parts) != 3 or parts[0] != b"GET" or not parts[2].startswith(b"HTTP/"):
        return ()
    path, _, query = parts[1].partition(b"?")
    route = ROUTES.get(path)
    if route is None:
        detail = DETAIL_API.fullmatch(path)
        return (("match-insights-api" if detail[1] else "match-detail-api"),) if detail else ()
    if route != "matches-api":
        return (route,)
    try:
        parameters = parse_qs(query.decode("ascii"), keep_blank_values=True, max_num_fields=128)
    except (UnicodeError, ValueError):
        return (route,)
    page = feed_page(parameters.get("page", ["1"]))
    through = parameters.get("through")
    if page is None or through is not None and ((end := feed_page(through)) is None or end <= page):
        return (route,)
    return route, "matches-continuation-api" if page > 1 or through else "matches-initial-api"


def feed_page(values):
    if len(values) == 1 and re.fullmatch(r"[1-9][0-9]{0,4}", values[0]) and int(values[0]) <= 10_000:
        return int(values[0])
    return None


def utc_stamp(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def collect_access_log(path, end, seconds, cap):
    starts = (end - 2 * seconds, end - seconds)
    counts = [{label: Counter() for label in ROUTE_LABELS} for _ in starts]
    observed = [0, 0]
    earliest = latest = None
    incomplete = unparsed = 0
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0))
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode):
                return {"state": "not-regular"}
            start = max(0, info.st_size - cap)
            source.seek(max(0, start - 1))
            if start and source.read(1) != b"\n":
                source.readline(info.st_size - source.tell())
            while (remaining := info.st_size - source.tell()) > 0:
                line = source.readline(remaining)
                if not line or not line.endswith(b"\n"):
                    incomplete += 1
                    break
                record = ACCESS_RECORD.match(line) if len(line) <= 32_768 else None
                stamp = access_time(record[1]) if record else None
                if stamp is None:
                    unparsed += 1
                    continue
                earliest = stamp if earliest is None else min(earliest, stamp)
                latest = stamp if latest is None else max(latest, stamp)
                if starts[0] <= stamp < end:
                    window = int(stamp >= starts[1])
                    observed[window] += 1
                    for route in matching_routes(record[2]):
                        counts[window][route][int(record[3])] += 1
    except OSError:
        return {"state": "unavailable"}
    return {
        "state": "observed" if earliest is not None else "no-records",
        "scanLimited": start > 0,
        "unparsedLines": unparsed,
        "incompleteTailLines": incomplete,
        "windows": [{
            "startUtc": utc_stamp(begin), "endUtc": utc_stamp(begin + seconds),
            "seenAtOrBeforeStart": earliest is not None and earliest <= begin,
            "seenAtOrAfterEnd": latest is not None and latest >= begin + seconds,
            "logRecords": observed[index],
            "routes": {name: {"statuses": dict(sorted(statuses.items())), "requests": sum(statuses.values()),
                              "requestsPerSecond": round(sum(statuses.values()) / seconds, 6)}
                       for name, statuses in counts[index].items()},
        } for index, begin in enumerate(starts)],
    }


def proc_lines(name):
    try:
        return (PROC / name).read_text(encoding="ascii").splitlines()
    except (OSError, UnicodeError):
        return []


def nonnegative(values, expected):
    if len(values) != expected or any(not value.isascii() or not value.isdecimal() for value in values):
        return None
    return tuple(map(int, values))


def host_snapshot(interface, device):
    cpu = next((nonnegative(line.split()[1:9], 8) for line in proc_lines("stat") if line.startswith("cpu ")), None)
    memory = {}
    for line in proc_lines("meminfo"):
        key, _, value = line.partition(":")
        fields = value.split()
        if key in MEMORY_FIELDS and fields[1:] == ["kB"] and (number := nonnegative(fields[:1], 1)) is not None:
            memory[MEMORY_FIELDS[key]] = number[0] * 1024
    pressure = {}
    for resource in ("cpu", "memory", "io"):
        for line in proc_lines(f"pressure/{resource}"):
            kind, _, fields = line.partition(" ")
            totals = [field.removeprefix("total=") for field in fields.split() if field.startswith("total=")]
            if kind in ("some", "full") and (total := nonnegative(totals, 1)) is not None:
                pressure[(resource, kind)] = total[0]
    network = None
    for line in proc_lines("net/dev"):
        name, _, counters = line.partition(":")
        if name.strip() == interface:
            fields = counters.split()
            network = nonnegative(fields[:1] + fields[8:9], 2)
            break
    disk = None
    if device:
        for line in proc_lines("diskstats"):
            fields = line.split()
            if len(fields) >= 14 and fields[2] == device:
                disk = nonnegative([fields[index] for index in (3, 5, 7, 9, 12)], 5)
                break
    return cpu, memory, pressure, network, disk


def counter_delta(before, after):
    if before is None or after is None or any(current < previous for previous, current in zip(before, after)):
        return None
    return tuple(current - previous for previous, current in zip(before, after))


def collect_host(seconds, interface, device):
    before_start = time.monotonic()
    cpu, _, pressure, network, disk = host_snapshot(interface, device)
    time.sleep(seconds)
    elapsed = time.monotonic() - before_start
    next_cpu, memory, next_pressure, next_network, next_disk = host_snapshot(interface, device)
    cpu_change = counter_delta(cpu, next_cpu)
    cpu_usage = None
    if cpu_change and (total := sum(cpu_change)) > 0:
        cpu_usage = {"busyPercent": round(100 * (total - cpu_change[3] - cpu_change[4] - cpu_change[7]) / total, 3),
                     "ioWaitPercent": round(100 * cpu_change[4] / total, 3),
                     "stealPercent": round(100 * cpu_change[7] / total, 3)}
    pressure_usage = {"cpu": {}, "memory": {}, "io": {}}
    for (resource, kind), value in next_pressure.items():
        previous = pressure.get((resource, kind))
        if previous is not None and value >= previous:
            pressure_usage[resource][kind] = round((value - previous) / (elapsed * 10_000), 3)
    traffic = counter_delta(network, next_network)
    io = counter_delta(disk, next_disk)
    return {
        "sampleSeconds": round(elapsed, 3), "cpu": cpu_usage, "memory": memory or None,
        "pressureStallPercent": {resource: values or None for resource, values in pressure_usage.items()},
        "network": None if traffic is None else {"receiveBytesPerSecond": round(traffic[0] / elapsed, 3),
                                                 "transmitBytesPerSecond": round(traffic[1] / elapsed, 3)},
        "disk": None if io is None else {"readsPerSecond": round(io[0] / elapsed, 3),
                                        "readBytesPerSecond": round(io[1] * 512 / elapsed, 3),
                                        "writesPerSecond": round(io[2] / elapsed, 3),
                                        "writtenBytesPerSecond": round(io[3] * 512 / elapsed, 3),
                                        "ioBusyPercent": round(io[4] / (elapsed * 10), 3)},
    }


def bounded_integer(minimum, maximum):
    def checked(value):
        number = int(value)
        if not minimum <= number <= maximum:
            raise argparse.ArgumentTypeError(f"expected an integer from {minimum} to {maximum}")
        return number
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--access-log", action="append", default=[], help="explicit HTTPS access log (up to four)")
    parser.add_argument("--window-seconds", type=bounded_integer(1, 3600), default=300, help="length of each of two adjacent windows")
    parser.add_argument("--end-epoch", type=bounded_integer(86400, 4102444800), help="UTC Unix seconds at the end of the second window (default: 60 seconds ago)")
    parser.add_argument("--max-log-mib", type=bounded_integer(1, 32), default=8, help="bytes to scan from the end of each log, in MiB")
    parser.add_argument("--sample-seconds", type=bounded_integer(0, 60), default=5, help="host counter interval; 0 skips host sampling")
    parser.add_argument("--network-interface", default="eth0", help="interface visible in /proc/net/dev")
    parser.add_argument("--disk-device", help="whole device visible in /proc/diskstats, for example vda")
    args = parser.parse_args()
    if len(args.access_log) > 4:
        parser.error("provide at most four access logs")
    end = args.end_epoch if args.end_epoch is not None else int(time.time()) - 60
    report = {
        "host": collect_host(args.sample_seconds, args.network_interface, args.disk_device) if args.sample_seconds else None,
        "httpsAccessLogs": [collect_access_log(path, end, args.window_seconds, args.max_log_mib * 2**20)
                            for path in args.access_log],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
