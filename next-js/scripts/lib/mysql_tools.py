"""Private, timeout-bounded MySQL subprocesses without diagnostic disclosure."""
import os
import subprocess
import threading

from .runtime import hidden_process


def private_tool_environment():
    if any(os.environ.get(key, "").strip() for key in ("NODE_DEBUG", "NODE_DEBUG_NATIVE")):
        raise RuntimeError("Disable private process diagnostics.")
    return {key: os.environ[key] for key in ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA") if key in os.environ}


class MysqlTool:
    def __init__(self, binary, args, discard_output=False):
        try:
            self.child = subprocess.Popen([str(binary), *map(str, args)], env=private_tool_environment(),
                                          stdin=subprocess.PIPE, stdout=subprocess.DEVNULL if discard_output else subprocess.PIPE, stderr=subprocess.DEVNULL,
                                          creationflags=hidden_process())
        except OSError:
            raise RuntimeError("Private MySQL tool failed.") from None
        self.timer = threading.Timer(120, self.child.kill)
        self.timer.daemon = True
        self.timer.start()

    def wait(self):
        try:
            if self.child.wait(timeout=120):
                raise RuntimeError("Private MySQL tool failed.")
        finally:
            self.timer.cancel()

    def close(self):
        if self.child.poll() is None:
            self.child.kill()
        self.child.wait()
        self.timer.cancel()
        for stream in (self.child.stdin, self.child.stdout):
            if stream and not stream.closed:
                stream.close()


def mysql_child(binary, args, *, discard_output=False):
    return MysqlTool(binary, args, discard_output)
