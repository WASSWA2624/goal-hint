import "server-only";

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
export const maximumFootballSourcePageBytes = 48 * 1024 * 1024;
export const footballSourceHash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Both historical projections and complete provider envelopes share the private replay archive. */
export async function encodeFootballSourcePage(input: Readonly<{
  endpoint: string; parameters: Record<string, string>; contract: string;
  observedAt: number; rowCount: number; body: Uint8Array;
}>) {
  const { endpoint, parameters, contract, observedAt, rowCount, body } = input;
  const retrievedAt = new Date(observedAt);
  if (!Number.isFinite(retrievedAt.getTime()) || observedAt > Date.now()) throw new Error("Invalid historical archive page.");
  if (body.length > maximumFootballSourcePageBytes) throw new Error("Historical archive page exceeds the archive limit.");
  const selectorHash = footballSourceHash(JSON.stringify(parameters)), contentHash = footballSourceHash(body);
  const id = footballSourceHash(JSON.stringify([endpoint, selectorHash, observedAt, contentHash]));
  const compressedRows = new Uint8Array(await compress(body));
  return { id, endpoint, selectorHash, parameters, contract, retrievedAt, rowCount, contentHash, compressedRows };
}

export async function readFootballSourcePagePayload(page: Readonly<{ compressedRows: Uint8Array; contentHash: string }>) {
  const body = await decompress(page.compressedRows, { maxOutputLength: maximumFootballSourcePageBytes });
  if (footballSourceHash(body) !== page.contentHash) throw new Error("Historical archive page failed verification.");
  return body;
}
