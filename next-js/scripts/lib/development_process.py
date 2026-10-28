"""Bounded process and requested-port cleanup for the local development launcher."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import time

from .runtime import CommandError, hidden_process


def _run(args, *, input=None):
    try:
        result = subprocess.run(args, input=input, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=15,
                                creationflags=hidden_process())
    except (OSError, subprocess.SubprocessError):
        raise CommandError("Development process inspection is unavailable on this computer.") from None
    return result


def _powershell(script, *, value=None):
    binary = shutil.which("powershell") or shutil.which("pwsh")
    if not binary:
        raise CommandError("PowerShell is required to inspect and release development processes on Windows.")
    result = _run([binary, "-NoProfile", "-NonInteractive", "-Command",
                   "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; " + script],
                  input=None if value is None else json.dumps(value))
    if result.returncode:
        raise CommandError("Development process access failed; close the existing process or use a terminal with permission to stop it.")
    try:
        return json.loads(result.stdout.lstrip("\ufeff").strip() or "[]")
    except (ValueError, TypeError):
        raise CommandError("Development process inspection returned an invalid response.") from None


def _records(value):
    rows = value if isinstance(value, list) else [value]
    result = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            pid, ppid = int(row["pid"]), int(row["ppid"])
            started = str(row["started"] or "")
        except (ValueError, TypeError, KeyError):
            continue
        if pid > 0 and ppid >= 0 and started:
            result.append({"pid": pid, "ppid": ppid, "started": started,
                           "command": str(row.get("command") or ""), "name": str(row.get("name") or "")})
    return result


def _linux_snapshot():
    root = Path("/proc")
    try:
        boot = (root / "sys/kernel/random/boot_id").read_text().strip()
        entries = list(root.iterdir())
    except OSError:
        raise CommandError("Development process inspection cannot read the operating system process table.") from None
    result = []
    for entry in entries:
        if not entry.name.isdecimal():
            continue
        try:
            stat = (entry / "stat").read_text()
            fields = stat[stat.rindex(")") + 2:].split()
            if fields[0] in {"Z", "X"}:
                continue
            arguments = (entry / "cmdline").read_bytes().split(b"\0")
            if arguments and arguments[-1] == b"":
                arguments.pop()
            result.append({"pid": int(entry.name), "ppid": int(fields[1]), "started": f"{boot}:{fields[19]}",
                           "command": shlex.join(argument.decode("utf-8", errors="replace") for argument in arguments),
                           "name": (entry / "comm").read_text().strip()})
        except (OSError, ValueError, IndexError):
            # Processes can exit between reading the directory and its metadata.
            continue
    return result


def process_snapshot():
    """Return process identities; callers must never log private command lines."""
    if os.name == "nt":
        return _records(_powershell(
            "@(Get-CimInstance Win32_Process | Select-Object "
            "@{n='pid';e={$_.ProcessId}},@{n='ppid';e={$_.ParentProcessId}},"
            "@{n='started';e={if($_.CreationDate){$_.CreationDate.ToUniversalTime().Ticks.ToString()}}},"
            "@{n='command';e={$_.CommandLine}},@{n='name';e={$_.Name}}) | ConvertTo-Json -Compress"))
    if Path("/proc/self/stat").is_file():
        return _linux_snapshot()
    binary = shutil.which("ps")
    if not binary:
        raise CommandError("The ps utility is required to inspect development processes.")
    result = _run([binary, "-axo", "pid=,ppid=,lstart=,args="])
    if result.returncode:
        raise CommandError("The operating system process table could not be inspected.")
    rows = []
    for line in result.stdout.splitlines():
        fields = line.split(None, 7)
        if len(fields) == 8:
            rows.append({"pid": fields[0], "ppid": fields[1], "started": " ".join(fields[2:7]),
                         "command": fields[7], "name": fields[7].split(None, 1)[0].rsplit("/", 1)[-1]})
    return _records(rows)


def process_record(pid, snapshot=None):
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return None
    records = process_snapshot() if snapshot is None else snapshot
    return next((row for row in records if row["pid"] == pid), None)


def process_matches(record, current):
    """A PID without its original creation identity never authorizes termination."""
    return bool(record and current and record.get("started") and current.get("started")
                and record.get("pid") == current.get("pid") and record["started"] == current["started"])


def descendant_processes(records, pid):
    """Return descendants deepest first, so child services stop before parents."""
    children = {}
    for row in records:
        children.setdefault(row["ppid"], []).append(row)
    result, visited = [], {pid}

    def visit(parent):
        for row in children.get(parent, []):
            if row["pid"] not in visited:
                visited.add(row["pid"])
                visit(row["pid"])
                result.append(row)

    visit(pid)
    return result


def _assert_can_stop(pid, records):
    protected = {0, 1, os.getpid(), os.getppid()}
    if os.name == "nt":
        protected.add(4)  # Windows System owns kernel-managed listeners.
    parents = {row["pid"]: row["ppid"] for row in records}
    parent = os.getppid()
    while parent not in {0, 1} and parent in parents:
        parent = parents[parent]
        if parent in protected:
            break
        protected.add(parent)
    if pid in protected:
        raise CommandError("The requested development port belongs to this launcher or a protected system process; choose another port.")


def _exited(record, timeout):
    deadline = time.monotonic() + timeout
    while process_matches(record, process_record(record["pid"])):
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.1)
    return True


def _stop_identified(record):
    snapshot = process_snapshot()
    current = process_record(record["pid"], snapshot)
    if not process_matches(record, current):
        return
    _assert_can_stop(record["pid"], snapshot)
    if os.name == "nt":
        # Compare again in the terminating process, keeping command-line contents
        # out of both shell source and diagnostics.
        _powershell(
            "$targetRecord=($input | Out-String | ConvertFrom-Json); "
            "$item=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$targetRecord.pid); "
            "if($item -and $item.CreationDate.ToUniversalTime().Ticks.ToString() -eq $targetRecord.started){"
            "Stop-Process -Id ([int]$targetRecord.pid) -Force -ErrorAction Stop}; '[]'",
            value={"pid": record["pid"], "started": record["started"]})
        if not _exited(record, 5):
            raise CommandError(f"Development process {record['pid']} did not stop within five seconds.")
        return
    try:
        os.kill(record["pid"], signal.SIGTERM)
        if _exited(record, 2):
            return
        if process_matches(record, process_record(record["pid"])):
            os.kill(record["pid"], signal.SIGKILL)
        if not _exited(record, 2):
            raise CommandError(f"Development process {record['pid']} did not stop within four seconds.")
    except ProcessLookupError:
        return
    except PermissionError:
        raise CommandError(f"Development process {record['pid']} cannot be stopped; close it or use a terminal with permission to stop it.") from None


def stop_process(record, *, tree=False):
    if not isinstance(record, dict):
        return
    snapshot = process_snapshot()
    current = process_record(record.get("pid"), snapshot)
    if not process_matches(record, current):
        return
    _assert_can_stop(current["pid"], snapshot)
    for child in descendant_processes(snapshot, current["pid"]) if tree else []:
        _stop_identified(child)
    _stop_identified(current)


def _validate_port(port):
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise CommandError("The development port must be an integer between 1 and 65535.")


def _linux_listening_pids(port):
    inodes = set()
    try:
        for table in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
            if not table.exists():
                continue
            for line in table.read_text().splitlines()[1:]:
                fields = line.split()
                if fields[3] == "0A" and int(fields[1].rsplit(":", 1)[1], 16) == port:
                    inodes.add(f"socket:[{fields[9]}]")
    except (OSError, ValueError, IndexError):
        raise CommandError("The development port could not be inspected in the operating system socket table.") from None
    if not inodes:
        return set()
    pids, found = set(), set()
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            for descriptor in (entry / "fd").iterdir():
                try:
                    target = os.readlink(descriptor)
                    if target in inodes:
                        pids.add(int(entry.name))
                        found.add(target)
                except OSError:
                    continue
        except OSError:
            continue
    if found != inodes:
        raise CommandError(f"Port {port} has a listener whose owner cannot be inspected; close it or use a terminal with permission to inspect it.")
    return pids


def _listening_pids(port):
    if os.name == "nt":
        rows = _powershell(
            f"@(Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | "
            "Select-Object -ExpandProperty OwningProcess -Unique) | ConvertTo-Json -Compress")
        return {int(pid) for pid in (rows if isinstance(rows, list) else [rows])}
    if Path("/proc/net/tcp").is_file():
        return _linux_listening_pids(port)
    binary = shutil.which("lsof")
    if not binary and Path("/usr/sbin/lsof").is_file():
        binary = "/usr/sbin/lsof"
    if binary:
        result = _run([binary, "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"])
        if result.returncode in {0, 1} and all(row.isdecimal() for row in result.stdout.split()):
            return {int(row) for row in result.stdout.split()}
        raise CommandError("The development port owner could not be inspected with lsof.")
    binary = shutil.which("ss")
    if binary:
        result = _run([binary, "-H", "-ltnp", f"sport = :{port}"])
        if result.returncode == 0:
            pids = {int(pid) for pid in re.findall(r"\bpid=(\d+)", result.stdout)}
            if not result.stdout.strip() or pids:
                return pids
        raise CommandError("The development port owner could not be inspected with ss.")
    raise CommandError("Install lsof or ss to inspect and release the requested development port.")


def listening_processes(port):
    _validate_port(port)
    pids = _listening_pids(port)
    if not pids:
        return []
    snapshot = process_snapshot()
    # A listener may naturally exit during inspection. A second port query
    # distinguishes that race from an inaccessible process identity.
    result = [row for row in snapshot if row["pid"] in pids]
    missing = pids - {row["pid"] for row in result}
    if missing and missing.intersection(_listening_pids(port)):
        raise CommandError(f"Port {port} has a listener whose process identity cannot be verified.")
    return result


def release_port(port):
    """Release only this requested web port, never processes selected by name."""
    _validate_port(port)
    for _ in range(3):
        records = listening_processes(port)
        if not records:
            return
        for record in records:
            print(f"Releasing development port {port} (process {record['pid']})...", flush=True)
            stop_process(record, tree=True)
        time.sleep(0.1)
    if listening_processes(port):
        raise CommandError(f"Port {port} is still in use or its process keeps restarting; stop its supervisor and run the development command again.")
