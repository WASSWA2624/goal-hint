import "server-only";

import { bookmakerMarketSchema, oddsDisplayText, preMatchBookmakerOddsSchema, type PreMatchBookmakerOdds } from "../../domain/bookmaker-odds.ts";
import { reconcileOddsCatalog, type CatalogMarketMapping } from "../../domain/market-registry.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { storedOddsBatchSchema, type StoredCurrentBookmakerQuotes } from "./odds-mysql-store.ts";
const safeSelection = oddsDisplayText(64), safeBookmaker = oddsDisplayText(128);

function configuredFallbackBookmakers(): readonly number[] {
  try { return getRuntimePolicy().choices.odds.fallbackBookmakerIds ?? []; } catch { return []; }
}

/** Private coverage report from the newest complete catalog. Unnamed recorded IDs remain explicit. */
export async function storedPreMatchCatalogCoverage(tx: Prisma.TransactionClient, asOf: number,
  reviewed: readonly CatalogMarketMapping[] = []) {
  const [row] = await tx.$queryRaw<{ id: string; body: unknown; validIntegrity: unknown }[]>`
    SELECT id,body,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM OddsImportBatch
    WHERE scopeKey='bets' AND kind='bets' AND status='complete' AND receivedAt<=${new Date(asOf)}
    ORDER BY receivedAt DESC,id DESC LIMIT 1`;
  if (!row) return null;
  assertHistorySeal(row.validIntegrity);
  const batch = storedOddsBatchSchema.safeParse(historyJson(row.body));
  if (!batch.success || batch.data.id !== row.id || batch.data.kind !== "bets" || batch.data.status !== "complete") return null;
  const observations = batch.data.catalog.map(({ id, name }): { id: number; name: string | null } => ({ id, name }));
  const named = new Set(observations.map(({ id }) => id));
  for (const marker of batch.data.missingCoverage) {
    const id = /^odds-catalog-name:(\d+)$/u.exec(marker)?.[1];
    if (id === undefined || named.has(Number(id))) continue;
    observations.push({ id: Number(id), name: null });
    named.add(Number(id));
  }
  return { receiptId: row.id, observedAt: batch.data.receivedAt, entries: reconcileOddsCatalog("pre-match", observations, reviewed) };
}

/** The public bookmaker panel carries only plain-text bet and selection names and canonical decimal offers. */
export function projectBookmakerOdds(quotes: StoredCurrentBookmakerQuotes | null | undefined,
  kind: PreMatchBookmakerOdds["kind"], maximumBytes = Infinity, fallbackBookmakerIds = configuredFallbackBookmakers()): PreMatchBookmakerOdds | null {
  if (!quotes) return null;
  const policy = { primaryBookmakerId: quotes.primaryBookmakerId, ...(fallbackBookmakerIds.length ? { fallbackBookmakerIds } : {}) };
  // Leave room for the occurrence, version and containing detail field.
  let remaining = maximumBytes - 256 - Buffer.byteLength(JSON.stringify(policy), "utf8"), limited = false;
  const ordered = [...quotes.bookmakers].sort((left, right) => Number(right.bookmakerId === quotes.primaryBookmakerId)
    - Number(left.bookmakerId === quotes.primaryBookmakerId) || left.bookmakerId - right.bookmakerId);
  const books = ordered.flatMap(({ bookmakerId, bookmakerName, offers }) => {
    const parsedName = safeBookmaker.safeParse(bookmakerName), name = parsedName.success ? parsedName.data : null;
    const headerBytes = Buffer.byteLength(JSON.stringify({ bookmakerId, name, markets: [] }), "utf8") + 1;
    remaining -= headerBytes;
    const markets = offers.flatMap(({ betId, betName, values, observedAt, checkedAt, providerUpdatedAt }) => {
      const selections = values.flatMap(({ label, odd, observation }) => {
        const price = parseDecimalOdds(odd);
        if (!price || !safeSelection.safeParse(label).success || kind === "historical-pre-match" && !observation) return [];
        return [{ label, line: null, price: price.text, ...(observation ? { observation: {
          observedAt: observation.observedAt, checkedAt: observation.checkedAt, providerUpdatedAt: observation.providerUpdatedAt,
        } } : {}) }];
      });
      const market = bookmakerMarketSchema.safeParse({ betId, name: betName, selections });
      if (!market.success) return [];
      let entry = market.data, bytes = Buffer.byteLength(JSON.stringify(entry), "utf8") + 1;
      if (bytes > remaining) { limited = true; return []; }
      if (observedAt !== undefined && checkedAt !== undefined) {
        const extended = bookmakerMarketSchema.safeParse({ ...entry, observation: { observedAt, checkedAt, providerUpdatedAt } });
        if (extended.success) {
          const extendedBytes = Buffer.byteLength(JSON.stringify(extended.data), "utf8") + 1;
          if (extendedBytes <= remaining) { entry = extended.data; bytes = extendedBytes; }
        }
      }
      remaining -= bytes;
      return [entry];
    });
    if (!markets.length) remaining += headerBytes;
    return markets.length ? [{ bookmakerId, name, markets }] : [];
  });
  const visible = books.map((book) => ({ ...book, markets: book.markets.map(({ observation: _observation, selections, ...market }) => {
    void _observation;
    return { ...market, selections: selections.map(({ label, line, price }) => ({ label, line, price })) };
  }) }));
  const parsed = preMatchBookmakerOddsSchema.safeParse({ kind, fixtureId: quotes.fixtureId, kickoffAt: quotes.kickoffAt,
    checkedAt: quotes.checkedAt, books, version: evidenceFingerprint({ books: visible, limited, ...policy }), ...policy,
    ...(limited ? { limited: true } : {}) });
  return parsed.success ? parsed.data : null;
}
