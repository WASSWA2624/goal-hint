import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { BackupError, failBackup } from './backup-contract.mjs';

const magic = Buffer.from('GHBAK001');
const maxHeader = 2 * 1024 * 1024;
function keyBytes(key) { if (!Buffer.isBuffer(key) || key.length !== 32) failBackup('invalid-key'); return key; }

/** Stream compression/encryption; plaintext SQL is never written to disk. */
export async function sealBackup(destination, input, { key, keyRef, metadata }) {
  keyBytes(key);
  const header = Buffer.from(JSON.stringify({ format: 1, id: randomUUID(), keyRef, iv: randomBytes(12).toString('hex'), metadata }));
  if (header.length > maxHeader) failBackup('invalid-artifact');
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const aad = Buffer.concat([magic, length, header]), partial = `${destination}.${randomUUID()}.partial`;
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(JSON.parse(header).iv, 'hex')); cipher.setAAD(aad);
  let handle, reserved = false;
  try {
    // A destination is immutable; never replace an earlier successful backup.
    handle = await open(destination, 'wx', 0o600); reserved = true; await handle.close(); handle = null;
    const output = createWriteStream(partial, { flags: 'wx', mode: 0o600 }); output.write(aad);
    await pipeline(input, createGzip(), cipher, output);
    handle = await open(partial, 'a'); await handle.write(cipher.getAuthTag()); await handle.sync(); await handle.close(); handle = null;
    await rename(partial, destination);
    return { header: JSON.parse(header), bytes: (await stat(destination)).size };
  } catch {
    await handle?.close().catch(() => {}); await rm(partial, { force: true }).catch(() => {});
    // Only remove the empty placeholder that this invocation created.
    if (reserved && (await stat(destination).catch(() => null))?.size === 0) await rm(destination, { force: true }).catch(() => {});
    failBackup('artifact-write-failed');
  }
}

async function artifactParts(file, key, keyRef) {
  keyBytes(key);
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size < 40) failBackup('invalid-artifact');
    const prefix = Buffer.alloc(12); await handle.read(prefix, 0, 12, 0);
    const length = prefix.readUInt32BE(8);
    if (!prefix.subarray(0, 8).equals(magic) || length < 2 || length > maxHeader || info.size <= 12 + length + 16) failBackup('invalid-artifact');
    const headerBytes = Buffer.alloc(length); await handle.read(headerBytes, 0, length, 12);
    let header; try { header = JSON.parse(headerBytes); } catch { failBackup('invalid-artifact'); }
    if (header.format !== 1 || header.keyRef !== keyRef || !/^[a-f0-9]{24}$/u.test(header.iv)) failBackup('invalid-artifact');
    const tag = Buffer.alloc(16); await handle.read(tag, 0, 16, info.size - 16);
    return { header, aad: Buffer.concat([prefix, headerBytes]), tag, start: 12 + length, end: info.size - 17 };
  } finally { await handle.close(); }
}

/** Authenticate a complete artifact before returning its metadata or executing SQL. */
export async function verifyBackup(file, options) {
  try {
    const parts = await artifactParts(file, options.key, options.keyRef);
    await decryptBackup(file, options, new Writable({ write(_chunk, _encoding, done) { done(); } }), parts);
    return parts.header.metadata;
  } catch (error) { if (error instanceof BackupError) throw error; failBackup('artifact-authentication-failed'); }
}
export async function decryptBackup(file, options, output, parts) {
  try {
    parts ??= await artifactParts(file, options.key, options.keyRef);
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(options.key), Buffer.from(parts.header.iv, 'hex'));
    decipher.setAAD(parts.aad); decipher.setAuthTag(parts.tag);
    await pipeline(createReadStream(file, { start: parts.start, end: parts.end }), decipher, createGunzip(), output);
  } catch { failBackup('artifact-authentication-failed'); }
}
export function backupText(value) { return Readable.from([Buffer.from(value)]); }
