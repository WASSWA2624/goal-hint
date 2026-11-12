import type { Messages } from "../i18n/messages.ts";
import { bettingShortForm, marketShortCode, marketShortForms, predictionSelectionAliases, predictionShortForms } from "./betting-short-forms.ts";
import { searchFilterOptions } from "./filter-option-search.ts";
import { normalizeFootballSearch, prepareFootballSearch } from "./football-search.ts";
import type { MarketFamily } from "./markets.ts";
import { predictionLabel, predictionText } from "./prediction-label.ts";
import { publicPolicy } from "./public-policy.ts";
import { slipMarketSelections, type SlipMarketSelection } from "./slip-markets.ts";

export type MarketFilterMatches = Readonly<{
  families: ReadonlySet<MarketFamily>;
  outcomes: ReadonlyMap<MarketFamily, ReadonlySet<SlipMarketSelection>>;
}>;

type LabelMessages = Pick<Messages, "text">;
type SearchEntry = Readonly<{ family: MarketFamily; selection?: SlipMarketSelection; label: string; detail?: string; line?: string }>;
const decimal = /^\d+\.\d+$/u;
const selectionLine = (selection: SlipMarketSelection) => selection.split("-").find(word => decimal.test(word));

/** Keep football folding and numeric normalization, with betting-specific totals vocabulary. */
function marketSearchText(value: string): string {
  const text = normalizeFootballSearch(value.replace(/\bo\s*\/\s*u(?=\b|\d)/giu, "ou ").replace(/(?<=\d),(?=\d{1,2}(?!\d))/gu, "."));
  // Football normalizes "under 19" as an age group, so restore directional tokens before a decimal line.
  return text.replace(/\b1 x 2\b/gu, "1x2").replace(/\b([12]) x\b/gu, "$1x").replace(/\bx ([12])\b/gu, "x$1")
    .replace(/\bou(?=\d+\.\d+\b)/gu, "ou ").replace(/\b(?:o|over)\s*(?=\d+\.\d+\b)/gu, "over ")
    .replace(/\b(?:u|under)\s*(?=\d+\.\d+\b)/gu, "under ")
    .replace(/\b(?:over (?:or )?under|under (?:or )?over)\b/gu, "ou");
}

function marketEntries(messages: LabelMessages): SearchEntry[] {
  return publicPolicy.markets.flatMap(family => {
    const form = marketShortForms[family], title = messages.text(`market.family.${family}`);
    const familyLabel = family === "total-goals" ? messages.text("slips.totalGoalsMarket") : title;
    const familyEntries = [...new Set([family, title, familyLabel, form.label, form.code].map(marketSearchText))].map(label => {
      const line = label.split(" ").find(word => decimal.test(word));
      return { family, label, ...(line ? { line } : {}) };
    });
    const detail = marketSearchText(`${familyLabel} ${form.code}`);
    const outcomeEntries = slipMarketSelections[family].flatMap(selection => {
      const line = selectionLine(selection);
      const aliases = [selection, predictionText(messages, selection), predictionLabel(messages, selection),
        ...Object.keys(predictionSelectionAliases).filter(alias => predictionSelectionAliases[alias] === selection)];
      if (selection === "yes" || selection === "no") aliases.push(messages.text(`market.selection.${selection}`));
      else {
        const form = bettingShortForm(predictionShortForms, selection);
        if (form) aliases.push(form.label);
      }
      if (line) aliases.push(line, selection.slice(0, selection.indexOf("-")));
      return [...new Set(aliases.map(marketSearchText))].map(label => ({ family, selection, label, detail, ...(line ? { line } : {}) }));
    });
    return [...familyEntries, ...outcomeEntries];
  });
}

function collectMatches(entries: readonly SearchEntry[], line?: string): MarketFilterMatches {
  const families = new Set<MarketFamily>(), outcomes = new Map<MarketFamily, Set<SlipMarketSelection>>();
  for (const { family, selection } of entries) {
    let choices = outcomes.get(family);
    if (!choices) outcomes.set(family, choices = new Set());
    if (selection) choices.add(selection);
    else {
      families.add(family);
      for (const choice of slipMarketSelections[family]) if (!line || selectionLine(choice) === line) choices.add(choice);
    }
  }
  return { families, outcomes };
}

export function searchMarketFilters(needle: string, messages: LabelMessages): MarketFilterMatches | null {
  const query = marketSearchText(marketShortCode(needle, needle));
  if (!query) return null;
  // A stated decimal line is an exact constraint, including when the direction has a spelling mistake.
  const lines = new Set(query.split(" ").filter(word => decimal.test(word)));
  if (lines.size > 1) return collectMatches([]);
  const [line] = lines;
  const entries = marketEntries(messages).filter(entry => !line || entry.line === line);
  const literal = entries.filter(entry => entry.label === query);
  if (literal.length) {
    const families = literal.filter(entry => !entry.selection);
    return collectMatches(families.length ? families : literal, line);
  }
  const ranked = searchFilterOptions(entries, query);
  if (ranked.exact.length || !ranked.similar.length) return collectMatches(ranked.exact, line);
  // A market choice must answer the whole search. Fixture-style mentions inside unrelated words are insufficient.
  const search = prepareFootballSearch(query), full = 2 ** search.tokens.length - 1;
  const coversQuery = (text: string) => search.match(text)?.covered === full;
  const complete = ranked.similar.filter(({ label, detail }) => coversQuery(label) ||
    detail !== undefined && (coversQuery(detail) || coversQuery(`${label} ${detail}`)));
  return collectMatches(complete, line);
}
