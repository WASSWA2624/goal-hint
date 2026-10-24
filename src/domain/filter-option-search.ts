import type { FilterOption } from "./feed-presentation.ts";
import { footballSearchTiers, prepareFootballSearch } from "./football-search.ts";

/** The desktop checklist and phone picker share identical football-name ranking. */
export function searchFilterOptions(options: readonly FilterOption[], needle: string): { exact: readonly FilterOption[]; similar: readonly FilterOption[] } {
  if (!needle.trim()) return { exact: options, similar: [] };
  const search = prepareFootballSearch(needle.trim());
  const labels = (option: FilterOption) => option.detail ? [option.label, option.detail, `${option.label} ${option.detail}`] : [option.label];
  const named = options.reduce((bits, option) => labels(option).reduce((all, label) => all | (search.match(label)?.named ?? 0), bits), 0);
  const ranked = options.map((option, index) => ({ option, index, score: Math.max(...labels(option).map((label) => search.score(label, named))) }))
    .filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || left.index - right.index);
  return { exact: ranked.filter(({ score }) => score >= footballSearchTiers.exact).map(({ option }) => option),
    similar: ranked.filter(({ score }) => score < footballSearchTiers.exact).map(({ option }) => option) };
}
