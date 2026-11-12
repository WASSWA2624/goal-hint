import "server-only";

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { DatabaseRuntime } from "../database/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "./api-football-contract.ts";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const maximumBytes = 48 * 1024 * 1024;
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const selectors = {
  fixtures: new Set(["id", "ids", "date", "league", "season", "team", "from", "to", "round", "timezone"]),
  competitions: new Set(["id", "season"]),
  teams: new Set(["league", "season"]),
  venues: new Set(["id"]),
  standings: new Set(["league", "season"]),
  injuries: new Set(["league", "season"]),
  transfers: new Set(["team"]),
} as const;
type Endpoint = keyof typeof selectors;
type Selection = Readonly<{ endpoint: Endpoint; parameters: unknown }>;

function archiveSelector({ endpoint, parameters: input }: Selection) {
  if (!Object.hasOwn(selectors, endpoint) || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid historical archive selector.");
  const allowedParameters = selectors[endpoint];
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  if ((!entries.length && endpoint !== "competitions") || entries.some(([key, value]) => !allowedParameters.has(key) || typeof value !== "string" || !value || value.length > 512)) {
    throw new Error("Invalid historical archive selector.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Private replay storage. Only validated response rows and their request identity are retained. */
export function createFootballHistorySource(database: DatabaseRuntime) {
  return {
    async hasPage(input: Selection, observedSince?: number) {
      const selectorHash = hash(JSON.stringify(archiveSelector(input)));
      const retrievedAt = observedSince === undefined ? undefined : { gte: new Date(observedSince) };
      return await database.query((client) => client.footballHistorySourcePage.count({ where: { endpoint: input.endpoint, selectorHash,
        ...(retrievedAt && { retrievedAt }) } })) > 0;
    },
    async savePage(input: Selection & Readonly<{ rows: readonly unknown[]; retrievedAt: number }>) {
      const { endpoint } = input, parameters = archiveSelector(input);
      const retrievedAt = new Date(input.retrievedAt);
      if (!Array.isArray(input.rows) || input.rows.length > 10_000 || !Number.isFinite(retrievedAt.getTime()) || input.retrievedAt > Date.now()) {
        throw new Error("Invalid historical archive page.");
      }
      const body = Buffer.from(JSON.stringify(input.rows));
      if (body.length > maximumBytes) throw new Error("Historical archive page exceeds the archive limit.");
      const selectorHash = hash(JSON.stringify(parameters)), contentHash = hash(body);
      const id = hash(JSON.stringify([endpoint, selectorHash, input.retrievedAt, contentHash]));
      const compressedRows = new Uint8Array(await compress(body));
      return database.query((client) => client.footballHistorySourcePage.createMany({ skipDuplicates: true, data: {
        id, endpoint, selectorHash, parameters, contract: API_FOOTBALL_CONTRACT_VERSION, retrievedAt, rowCount: input.rows.length,
        contentHash, compressedRows,
      } }));
    },
    async latestPage(input: Selection) {
      const selectorHash = hash(JSON.stringify(archiveSelector(input)));
      const page = await database.query((client) => client.footballHistorySourcePage.findFirst({ where: { endpoint: input.endpoint, selectorHash },
        orderBy: [{ retrievedAt: "desc" }, { id: "desc" }] }));
      if (!page) return null;
      const body = await decompress(page.compressedRows, { maxOutputLength: maximumBytes });
      const rows: unknown = JSON.parse(body.toString("utf8"));
      if (!Array.isArray(rows) || rows.length !== page.rowCount || hash(body) !== page.contentHash) throw new Error("Historical archive page failed verification.");
      return { rows: rows as readonly unknown[], retrievedAt: page.retrievedAt, parameters: page.parameters, contract: page.contract };
    },
  };
}
