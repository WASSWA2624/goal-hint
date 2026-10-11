"""Stream gzip/AES-256-GCM artifacts compatible with GHBAK001 backups."""
import io
import json
import os
from pathlib import Path
import re
import struct
import stat
import uuid
import zlib

from .backup_contract import BackupError, fail_backup, serialize

MAGIC = b"GHBAK001"
MAX_HEADER = 2 * 1024 * 1024
CHUNK = 64 * 1024


def cipher(key, iv, tag=None):
    if not isinstance(key, bytes) or len(key) != 32:
        fail_backup("invalid-key")
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    except ImportError:
        fail_backup("cryptography-required")
    return Cipher(algorithms.AES(key), modes.GCM(iv, tag))


def backup_text(value):
    return io.BytesIO(value.encode("utf-8"))


def seal_backup(destination, source, *, key, key_ref, metadata):
    iv = os.urandom(12)
    header = {"format": 1, "id": str(uuid.uuid4()), "keyRef": key_ref, "iv": iv.hex(), "metadata": metadata}
    header_bytes = serialize(header).encode("utf-8")
    if len(header_bytes) > MAX_HEADER:
        fail_backup("invalid-artifact")
    aad = MAGIC + struct.pack(">I", len(header_bytes)) + header_bytes
    encryptor = cipher(key, iv).encryptor()
    encryptor.authenticate_additional_data(aad)
    destination = Path(destination)
    partial = destination.with_name(destination.name + "." + str(uuid.uuid4()) + ".partial")
    reserved = False
    try:
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        reserved = True
        compressor = zlib.compressobj(wbits=31)
        with open(partial, "xb") as output:
            os.chmod(partial, 0o600)
            output.write(aad)
            while chunk := source.read(CHUNK):
                output.write(encryptor.update(compressor.compress(chunk)))
            output.write(encryptor.update(compressor.flush()))
            output.write(encryptor.finalize())
            output.write(encryptor.tag)
            output.flush()
            os.fsync(output.fileno())
        os.replace(partial, destination)
        return {"header": header, "bytes": destination.stat().st_size}
    except Exception:
        partial.unlink(missing_ok=True)
        if reserved and destination.exists() and destination.stat().st_size == 0:
            destination.unlink()
        fail_backup("artifact-write-failed")


def artifact_parts(file, key, key_ref):
    with open(file, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode):
            fail_backup("invalid-artifact")
        size = info.st_size
        prefix = source.read(12)
        if len(prefix) != 12 or prefix[:8] != MAGIC:
            fail_backup("invalid-artifact")
        length = struct.unpack(">I", prefix[8:])[0]
        if not 2 <= length <= MAX_HEADER or size <= 12 + length + 16:
            fail_backup("invalid-artifact")
        header_bytes = source.read(length)
        header = json.loads(header_bytes)
        if header.get("format") != 1 or header.get("keyRef") != key_ref or not re.fullmatch(r"[a-f0-9]{24}", header.get("iv", "")):
            fail_backup("invalid-artifact")
        source.seek(-16, 2)
        return header, prefix + header_bytes, source.read(16), 12 + length, size - 16


def decrypt_stream(file, *, key, parts, output=None):
    header, aad, tag, start, end = parts
    decryptor = cipher(key, bytes.fromhex(header["iv"]), tag).decryptor()
    decryptor.authenticate_additional_data(aad)
    decompressor = zlib.decompressobj(wbits=31)
    with open(file, "rb") as source:
        source.seek(start)
        remaining = end - start
        while remaining:
            chunk = source.read(min(CHUNK, remaining))
            if not chunk:
                fail_backup("invalid-artifact")
            remaining -= len(chunk)
            compressed = decryptor.update(chunk)
            # Bound decompressed chunks even for highly compressible streams.
            while compressed:
                plaintext = decompressor.decompress(compressed, CHUNK)
                if output is not None:
                    output.write(plaintext)
                compressed = decompressor.unconsumed_tail
        tail = decompressor.decompress(decryptor.finalize()) + decompressor.flush()
        if not decompressor.eof or decompressor.unused_data:
            fail_backup("invalid-artifact")
        if output is not None:
            output.write(tail)


def verify_backup(file, *, key, key_ref):
    try:
        parts = artifact_parts(file, key, key_ref)
        decrypt_stream(file, key=key, parts=parts)
        return parts[0]["metadata"]
    except BackupError:
        raise
    except Exception:
        fail_backup("artifact-authentication-failed")


def decrypt_backup(file, output, *, key, key_ref):
    try:
        parts = artifact_parts(file, key, key_ref)
        # Complete authentication precedes the first byte written to a SQL sink.
        decrypt_stream(file, key=key, parts=parts)
        decrypt_stream(file, key=key, parts=parts, output=output)
    except Exception:
        fail_backup("artifact-authentication-failed")
