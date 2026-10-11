"""Shared, private process boundary for Python operator commands.

Application services remain in the application's Node runtime. JSON is passed
over anonymous pipes, never shell arguments or temporary credential files.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


class CommandError(Exception):
    """An operator-safe diagnostic, without private child output."""


def node_binary() -> str:
    binary = os.environ.get("NODE_BINARY") or shutil.which("node")
    if not binary:
        raise CommandError("Node.js is required for the existing application services.")
    return binary


def service(action: str, payload: dict | None = None, *, operations: bool = False,
            environment: dict | None = None, timeout: int = 120) -> object:
    """Call a shared application service and return its structured response."""
    env = dict(os.environ if environment is None else environment)
    args = [node_binary(), "--conditions=react-server"]
    if env.get("NODE_ENV") != "test":
        args.append("--env-file-if-exists=.env.local")
    if operations:
        args.append("--env-file-if-exists=.env.operations")
    args.append(str(ROOT / "src/server/operations/cli-bridge.mjs"))
    try:
        result = subprocess.run(args, input=json.dumps({"action": action, "payload": payload or {}}),
                                capture_output=True, text=True, encoding="utf-8", cwd=Path.cwd(),
                                env=env, timeout=timeout, creationflags=hidden_process())
        # Trusted operator adapters may also log; the final record remains
        # unambiguous and raw adapter output never becomes a public diagnostic.
        response = json.loads(result.stdout.rsplit("\x1e", 1)[-1])
    except (OSError, subprocess.SubprocessError, ValueError):
        raise CommandError("Application service unavailable; private diagnostics are withheld.") from None
    if result.returncode or not response.get("ok"):
        raise CommandError(response.get("error", "Application service unavailable; private diagnostics are withheld."))
    return response.get("value")


def hidden_process() -> int:
    return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def main_guard(main, fallback: str = "Command failed; private diagnostics are withheld.") -> None:
    try:
        result = main()
        if isinstance(result, int):
            raise SystemExit(result)
    except CommandError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
    except Exception:
        print(fallback, file=sys.stderr)
        raise SystemExit(1) from None
