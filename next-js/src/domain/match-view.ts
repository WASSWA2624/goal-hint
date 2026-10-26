import { isMarketFamily, type MarketFamily } from "./markets.ts";

/**
 * Addressable match-details view state. Every key is optional and parsed leniently: an unknown
 * or invalid value falls back to its default rather than failing the page. Other query keys
 * (for example revision history) are preserved untouched when the view changes.
 */
export const matchSections = ["stats", "h2h", "form", "lineups", "players", "news", "injuries", "context", "referee", "history"] as const;
export type MatchSection = (typeof matchSections)[number];
export const marketCategories = ["popular", "results", "goals", "btts", "double-chance", "draw-no-bet", "handicaps", "corners",
  "cards", "halves", "correct-score", "clean-sheets", "specials"] as const;
export type MarketCategory = (typeof marketCategories)[number];
export const formWindows = [5, 10, 0] as const;
export type FormWindow = (typeof formWindows)[number];
export type TeamFocus = "both" | "home" | "away";
export type VenueFocus = "all" | "home" | "away";

export type MatchView = Readonly<{
  /** All Markets & Odds starts expanded; `mk=closed` collapses it. */
  marketsOpen: boolean;
  marketCategory: MarketCategory;
  marketSearch: string;
  /** Nested market panel inside All Markets & Odds. */
  market: MarketFamily | null;
  section: MatchSection | null;
  tab: string | null;
  item: string | null;
  page: number;
  team: TeamFocus;
  venue: VenueFocus;
  window: FormWindow;
  competition: string | null;
}>;

export const defaultMatchView: MatchView = Object.freeze({ marketsOpen: true, marketCategory: "popular", marketSearch: "", market: null,
  section: null, tab: null, item: null, page: 1, team: "both", venue: "all", window: 5, competition: null });

/** Keys owned by the view; everything else in the URL belongs to other features. */
export const matchViewKeys = Object.freeze(["mk", "mcat", "mq", "market", "section", "tab", "item", "page", "team", "venue", "window", "comp"] as const);
const sectionKeys = ["tab", "item", "page", "team", "venue", "window", "comp"] as const;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u;

type Parameters = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;
function reader(input: Parameters) {
  return (key: string): string | undefined => {
    const value = input instanceof URLSearchParams ? input.get(key) ?? undefined : input[key];
    return typeof value === "string" ? value : undefined;
  };
}
const oneOf = <T extends string>(values: readonly T[], value: string | undefined, fallback: T): T =>
  value !== undefined && (values as readonly string[]).includes(value) ? value as T : fallback;

export function parseMatchView(input: Parameters): MatchView {
  const get = reader(input);
  const section = oneOf<MatchSection | "">([...matchSections, ""], get("section"), "") || null;
  const page = Number(get("page"));
  const window = Number(get("window") ?? 5);
  const search = (get("mq") ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 80);
  const item = get("item"), tab = get("tab"), market = get("market"), competition = get("comp");
  return {
    marketsOpen: get("mk") !== "closed",
    marketCategory: oneOf(marketCategories, get("mcat"), "popular"),
    marketSearch: search,
    market: market !== undefined && isMarketFamily(market) ? market : null,
    section,
    // Section-scoped keys mean nothing without an open section.
    tab: section && tab !== undefined && identifier.test(tab) ? tab : null,
    item: section && item !== undefined && identifier.test(item) ? item : null,
    page: section && Number.isSafeInteger(page) && page >= 1 && page <= 1000 ? page : 1,
    team: section ? oneOf<TeamFocus>(["both", "home", "away"], get("team"), "both") : "both",
    venue: section ? oneOf<VenueFocus>(["all", "home", "away"], get("venue"), "all") : "all",
    window: section && (formWindows as readonly number[]).includes(window) ? window as FormWindow : 5,
    competition: section && competition !== undefined && identifier.test(competition) ? competition : null,
  };
}

/** Serializes only non-default view state, preserving every unrelated key and its order. */
export function serializeMatchView(view: MatchView, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of base) if (!(matchViewKeys as readonly string[]).includes(key)) result.append(key, value);
  if (!view.marketsOpen) result.set("mk", "closed");
  if (view.marketCategory !== defaultMatchView.marketCategory) result.set("mcat", view.marketCategory);
  if (view.marketSearch) result.set("mq", view.marketSearch);
  if (view.market) result.set("market", view.market);
  if (view.section) {
    result.set("section", view.section);
    if (view.tab) result.set("tab", view.tab);
    if (view.item) result.set("item", view.item);
    if (view.page !== 1) result.set("page", String(view.page));
    if (view.team !== "both") result.set("team", view.team);
    if (view.venue !== "all") result.set("venue", view.venue);
    if (view.window !== 5) result.set("window", String(view.window));
    if (view.competition) result.set("comp", view.competition);
  }
  return result;
}

/** Opening another section resets the previous section's own tabs, items and filters. */
export function openSection(view: MatchView, section: MatchSection | null): MatchView {
  const reset = Object.fromEntries(sectionKeys.map((key) => [key === "comp" ? "competition" : key, defaultMatchView[key === "comp" ? "competition" : key]]));
  return { ...view, ...reset, section };
}

/** Opens one item, opening its section first (with fresh section filters) when needed. */
export function openItem(view: MatchView, section: MatchSection, item: string): MatchView {
  return { ...(view.section === section ? view : openSection(view, section)), item };
}

/** Splits page parameters into view state and the remaining (history) parameters. */
export function splitMatchViewParameters(input: Readonly<Record<string, string | string[] | undefined>>) {
  const view: Record<string, string> = {}, rest: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if ((matchViewKeys as readonly string[]).includes(key)) { if (typeof value === "string") view[key] = value; }
    else rest[key] = value;
  }
  return { view: parseMatchView(view), rest };
}
