import "server-only";

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** scrypt with N=2^15, r=8, p=1 (~32 MiB, ~0.1 s): OWASP's memory-hard password storage baseline. */
export const passwordHashing = Object.freeze({ cost: 32_768, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16 });
const limits = Object.freeze({ cost: 1_048_576, blockSize: 32, parallelization: 4 });
const encoded = /^scrypt:(\d+):(\d+):(\d+):([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{32,})$/;

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  const maxmem = 256 * (options.N ?? 0) * (options.r ?? 0) + 16 * 1024 * 1024;
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, length, { ...options, maxmem },
    (error, key) => error ? reject(error) : resolve(key)));
}

/** `scrypt:N:r:p:salt:hash` with base64url fields; colons keep it safe in .env files (no `$` expansion). */
export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0 || password.length > 1024) throw new RangeError("Passwords must contain 1-1024 characters.");
  const { cost, blockSize, parallelization, keyLength, saltLength } = passwordHashing;
  const salt = randomBytes(saltLength);
  const key = await derive(password, salt, keyLength, { N: cost, r: blockSize, p: parallelization });
  return `scrypt:${cost}:${blockSize}:${parallelization}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export function isPasswordHash(value: string): boolean {
  const match = encoded.exec(value);
  if (!match) return false;
  const [cost, blockSize, parallelization] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return cost >= 16_384 && cost <= limits.cost && (cost & (cost - 1)) === 0 && blockSize >= 8 && blockSize <= limits.blockSize
    && parallelization >= 1 && parallelization <= limits.parallelization;
}

/** Constant-time comparison; malformed or out-of-bounds parameters never verify. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > 1024 || !isPasswordHash(stored)) return false;
  const [, cost, blockSize, parallelization, salt, hash] = encoded.exec(stored)!;
  const expected = Buffer.from(hash!, "base64url");
  const actual = await derive(password, Buffer.from(salt!, "base64url"), expected.length,
    { N: Number(cost), r: Number(blockSize), p: Number(parallelization) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
