import "server-only";

import { bookmakerMarketSchema, oddsDisplayText, preMatchBookmakerOddsSchema, type PreMatchBookmakerOdds } from "../../domain/bookmaker-odds.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { StoredCurrentBookmakerQuotes } from "./odds-mysql-store.ts";
const safeSelection = oddsDisplayText(64), safeBookmaker = oddsDisplayText(128);

/** The public bookmaker panel carries only plain-text bet and selection names and canonical decimal offers. */
export function projectBookmakerOdds(quotes: StoredCurrentBookmakerQuotes | null | undefined,
  kind: PreMatchBookmakerOdds["kind"], maximumBytes = Infinity): PreMatchBookmakerOdds | null {
  if (!quotes) return null;
  // Leave room for the occurrence, version and containing detail field.
  let remaining = maximumBytes - 256, limited = false;
  const ordered = [...quotes.bookmakers].sort((left, right) => Number(right.bookmakerId === quotes.primaryBookmakerId)
    - Number(left.bookmakerId === quotes.primaryBookmakerId) || left.bookmakerId - right.bookmakerId);
  const books = ordered.flatMap(({ bookmakerId, bookmakerName, offers }) => {
    const parsedName = safeBookmaker.safeParse(bookmakerName), name = parsedName.success ? parsedName.data : null;
    const headerBytes = Buffer.byteLength(JSON.stringify({ bookmakerId, name, markets: [] }), "utf8") + 1;
    remaining -= headerBytes;
    const markets = offers.flatMap(({ betId, betName, values }) => {
      const selections = values.flatMap(({ label, odd }) => {
        const price = parseDecimalOdds(odd);
        return price && safeSelection.safeParse(label).success ? [{ label, line: null, price: price.text }] : [];
      });
      const market = bookmakerMarketSchema.safeParse({ betId, name: betName, selections });
      if (!market.success) return [];
      const bytes = Buffer.byteLength(JSON.stringify(market.data), "utf8") + 1;
      if (bytes > remaining) { limited = true; return []; }
      remaining -= bytes;
      return [market.data];
    });
    if (!markets.length) remaining += headerBytes;
    return markets.length ? [{ bookmakerId, name, markets }] : [];
  });
  const parsed = preMatchBookmakerOddsSchema.safeParse({ kind, fixtureId: quotes.fixtureId, kickoffAt: quotes.kickoffAt,
    checkedAt: quotes.checkedAt, books, version: evidenceFingerprint({ books, limited }), ...(limited ? { limited: true } : {}) });
  return parsed.success ? parsed.data : null;
}
