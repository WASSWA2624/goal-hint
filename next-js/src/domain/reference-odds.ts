import { parseDecimalOdds } from "./odds.ts";
import type { GoalMarketPeriod } from "./score-distribution-markets.ts";

export const preMatchReferenceOddsFreshMs = 12 * 60 * 60_000;

export type ReferenceOddsSelection = Readonly<{
  fixtureId: string;
  phase: "pre-match" | "closing" | "historical-pre-match" | "in-play";
  period: GoalMarketPeriod;
  marketId: number;
  marketName: string;
  label: string;
  line: string | null;
  playerId: number | null;
  teamId: number | null;
}>;
type ReferenceOddsSource = Readonly<{ sourceId: string; bookmakerId: number | null; observedAt: number; checkedAt: number;
  providerUpdatedAt: number | null }>;
export type ReferenceOddsOffer = ReferenceOddsSelection & ReferenceOddsSource & Readonly<{
  state: "open" | "suspended" | "withdrawn"; price: string | null;
}>;
export type ReferenceBookmakerPolicy = Readonly<{ preferredBookmakerId?: number;
  fallbackBookmakerIds?: readonly number[]; requestedBookmakerId?: number }>;
export type ReferenceOddsResult<Offer extends ReferenceOddsOffer> =
  | Readonly<{ state: "available"; offer: Offer; requestedBookmakerId: number | null;
    sourceId: string; actualBookmakerId: number | null; fallback: "none" | "configured" | "freshest" }>
  | Readonly<{ state: "unavailable"; reason: "missing" | "stale" | "suspended" | "requested-bookmaker-unavailable";
    requestedBookmakerId: number | null; lastObservation: ReferenceOddsSource | null }>;

function normalizedLine(line: string | null) {
  if (line === null) return null;
  if (!/^-?\d{1,3}(?:\.\d{1,3})?$/u.test(line)) return undefined;
  return String(Number(line));
}

function sameSelection(left: ReferenceOddsSelection, right: ReferenceOddsSelection) {
  const line = normalizedLine(left.line);
  return line !== undefined && line === normalizedLine(right.line) && left.fixtureId === right.fixtureId && left.phase === right.phase &&
    left.period === right.period && left.marketId === right.marketId && left.marketName === right.marketName &&
    left.label === right.label && left.playerId === right.playerId && left.teamId === right.teamId;
}

function validBookmakerId(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 4_294_967_295;
}
const time = (value: number) => Number.isSafeInteger(value) && value >= 0;
function validSource(offer: ReferenceOddsOffer, asOf: number) {
  return /^[a-z0-9][a-z0-9._:-]{0,79}$/u.test(offer.sourceId) &&
    (offer.bookmakerId === null || validBookmakerId(offer.bookmakerId)) &&
    time(offer.observedAt) && time(offer.checkedAt) && offer.observedAt <= offer.checkedAt && offer.checkedAt <= asOf &&
    (offer.providerUpdatedAt === null || time(offer.providerUpdatedAt) && offer.providerUpdatedAt <= offer.checkedAt);
}

const observationsNewestFirst = (left: ReferenceOddsSource, right: ReferenceOddsSource) =>
  right.checkedAt - left.checkedAt || (right.providerUpdatedAt ?? right.checkedAt) - (left.providerUpdatedAt ?? left.checkedAt) ||
  right.observedAt - left.observedAt;
const sourcesInOrder = (left: ReferenceOddsSource, right: ReferenceOddsSource) => (left.bookmakerId ?? Infinity) - (right.bookmakerId ?? Infinity) ||
  (left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0);
const freshestFirst = (left: ReferenceOddsSource, right: ReferenceOddsSource) => observationsNewestFirst(left, right) || sourcesInOrder(left, right);

/** Existing bookmaker-bound selections never substitute. Unbound requests use policy order, then freshest exact offer. */
export function resolveReferenceOdds<Offer extends ReferenceOddsOffer>(selection: ReferenceOddsSelection, offers: readonly Offer[],
  policy: ReferenceBookmakerPolicy & Readonly<{ asOf: number; freshnessMs: number }>): ReferenceOddsResult<Offer> {
  const requested = policy.requestedBookmakerId ?? null;
  if (!time(policy.asOf) || !time(policy.freshnessMs) || policy.freshnessMs <= 0 ||
    (requested !== null && !validBookmakerId(requested))) return {
    state: "unavailable", reason: requested === null ? "missing" : "requested-bookmaker-unavailable",
    requestedBookmakerId: requested, lastObservation: null,
  };
  const latest = new Map<string, { offer: Offer; ambiguous: boolean }>();
  for (const offer of offers) {
    if (!sameSelection(selection, offer) || !validSource(offer, policy.asOf) || (requested !== null && offer.bookmakerId !== requested)) continue;
    const current = latest.get(offer.sourceId);
    const order = current ? observationsNewestFirst(offer, current.offer) : -1;
    if (order < 0) latest.set(offer.sourceId, { offer, ambiguous: false });
    else if (order === 0 && current && (current.offer.state !== offer.state || current.offer.price !== offer.price ||
      current.offer.bookmakerId !== offer.bookmakerId)) current.ambiguous = true;
  }
  const exact = [...latest.values()].filter(({ ambiguous }) => !ambiguous).map(({ offer }) => offer).sort(freshestFirst);
  const fresh = exact.filter((offer) => policy.asOf - offer.checkedAt <= policy.freshnessMs &&
    (offer.providerUpdatedAt === null || policy.asOf - offer.providerUpdatedAt <= policy.freshnessMs));
  const valid = fresh.filter(({ state, price }) => state === "open" && price !== null && parseDecimalOdds(price) !== null);
  const preferred = valid.find(({ bookmakerId }) => bookmakerId === policy.preferredBookmakerId);
  const fallback = policy.fallbackBookmakerIds?.map((id) => valid.find(({ bookmakerId }) => bookmakerId === id)).find(Boolean);
  const offer = preferred ?? fallback ?? valid[0];
  if (offer) return { state: "available", offer, requestedBookmakerId: requested, sourceId: offer.sourceId,
    actualBookmakerId: offer.bookmakerId, fallback: requested !== null || preferred ? "none" : fallback ? "configured" : "freshest" };
  const observed = exact[0];
  return { state: "unavailable", requestedBookmakerId: requested, reason: requested !== null ? "requested-bookmaker-unavailable"
    : fresh.some(({ state }) => state === "suspended") ? "suspended" : exact.length && !fresh.length ? "stale" : "missing",
  lastObservation: observed ? { sourceId: observed.sourceId, bookmakerId: observed.bookmakerId,
    observedAt: observed.observedAt, checkedAt: observed.checkedAt, providerUpdatedAt: observed.providerUpdatedAt } : null };
}
