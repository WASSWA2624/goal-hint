"""Deliver an archive completion message to the importer's Windows session."""
from contextlib import contextmanager, suppress
import ctypes
from ctypes import wintypes
from hashlib import sha256
import json
import os
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from typing import Literal


NotificationStatus = Literal["pending", "delivered", "already-delivered", "retryable"]
_TITLE = "Goal Hint"
_WTS_CONNECT_STATE = 8
_WTS_ACTIVE = 0
_MB_ICONINFORMATION = 0x40
_IDASYNC = 32001
_LOAD_LIBRARY_SEARCH_SYSTEM32 = 0x800


def _post_windows_message(message: str) -> bool:
    if sys.platform != "win32":
        return False

    kernel = ctypes.WinDLL("kernel32.dll", winmode=_LOAD_LIBRARY_SEARCH_SYSTEM32)
    sessions = ctypes.WinDLL("wtsapi32.dll", winmode=_LOAD_LIBRARY_SEARCH_SYSTEM32)
    session_for_process = kernel.ProcessIdToSessionId
    session_for_process.argtypes = (wintypes.DWORD, ctypes.POINTER(wintypes.DWORD))
    session_for_process.restype = wintypes.BOOL
    session_id = wintypes.DWORD()
    if not session_for_process(os.getpid(), ctypes.byref(session_id)) or session_id.value == 0:
        return False

    query_session = sessions.WTSQuerySessionInformationW
    query_session.argtypes = (wintypes.HANDLE, wintypes.DWORD, ctypes.c_int,
                              ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.DWORD))
    query_session.restype = wintypes.BOOL
    free_session_buffer = sessions.WTSFreeMemory
    free_session_buffer.argtypes = (ctypes.c_void_p,)
    free_session_buffer.restype = None
    buffer = ctypes.c_void_p()
    size = wintypes.DWORD()
    try:
        if not query_session(None, session_id, _WTS_CONNECT_STATE, ctypes.byref(buffer), ctypes.byref(size)):
            return False
        if not buffer or size.value != ctypes.sizeof(ctypes.c_int):
            return False
        if ctypes.cast(buffer, ctypes.POINTER(ctypes.c_int)).contents.value != _WTS_ACTIVE:
            return False
    finally:
        if buffer:
            free_session_buffer(buffer)

    send_message = sessions.WTSSendMessageW
    send_message.argtypes = (wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, wintypes.DWORD,
                             wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
                             ctypes.POINTER(wintypes.DWORD), wintypes.BOOL)
    send_message.restype = wintypes.BOOL
    response = wintypes.DWORD()
    return bool(send_message(None, session_id, _TITLE, len(_TITLE.encode("utf-16-le")),
                             message, len(message.encode("utf-16-le")), _MB_ICONINFORMATION,
                             0, ctypes.byref(response), False) and response.value == _IDASYNC)


@contextmanager
def _receipt_write(receipt: Path, record: dict):
    temporary_path = None
    try:
        with NamedTemporaryFile(dir=receipt.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(json.dumps(record, ensure_ascii=False).encode("utf-8"))
            temporary.flush()
            os.fsync(temporary.fileno())
        yield temporary_path
    finally:
        if temporary_path is not None:
            with suppress(OSError):
                temporary_path.unlink(missing_ok=True)


def _valid_message(message: object) -> bool:
    return isinstance(message, str) and 0 < len(message) <= 1024 and "\0" not in message


def _notify(directory: Path, completion_key: str, message: str | None) -> NotificationStatus:
    try:
        key = sha256(completion_key.encode("utf-8")).hexdigest()
        receipt = directory / "history-completion-notifications" / key
        try:
            with receipt.open("rb") as current:
                record = json.loads(current.read(8192))
        except FileNotFoundError:
            if message is None:
                return "pending"
            if not _valid_message(message):
                return "retryable"
            receipt.parent.mkdir(exist_ok=True)
            record = {"status": "pending", "message": message}
            with _receipt_write(receipt, record) as staged:
                staged.replace(receipt)
        if record == {"status": "delivered"}:
            return "already-delivered"
        if not isinstance(record, dict) or record.get("status") != "pending" or not _valid_message(record.get("message")):
            return "retryable"
        with _receipt_write(receipt, {"status": "delivered"}) as staged:
            if not _post_windows_message(record["message"]):
                return "retryable"
            staged.replace(receipt)
        return "delivered"
    except (OSError, ValueError):
        return "retryable"


def notify_archive_complete(directory: Path, completion_key: str, message: str) -> NotificationStatus:
    """Save the verified message before posting it while the caller holds the import lock."""
    return _notify(directory, completion_key, message)


def retry_archive_notification(directory: Path, completion_key: str) -> NotificationStatus:
    """Retry a saved message or return pending if completion has yet to be verified."""
    return _notify(directory, completion_key, None)
