import { footballSearchTiers, prepareFootballSearch } from "./football-search.ts";

const normalized = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");

/** Direct partial matches work from the first character; football aliases and spelling matches follow them. */
export function searchFilterOptions<Option extends Readonly<{ label: string; detail?: string | null }>>(options: readonly Option[], needle: string): { exact: readonly Option[]; similar: readonly Option[] } {
  const query = normalized(needle);
  if (!query) return { exact: options, similar: [] };
  const search = query.length >= 2 ? prepareFootballSearch(needle.trim()) : null;
  const labels = (option: Option) => option.detail ? [option.label, option.detail, `${option.label} ${option.detail}`] : [option.label];
  const named = options.reduce((bits, option) => labels(option).reduce((all, label) => all | (search?.match(label)?.named ?? 0), bits), 0);
  const ranked = options.map((option, index) => {
    const fields = labels(option).map(normalized), words = query.split(" ");
    const direct = fields.some(value => value === query) ? 5 : fields.some(value => value.startsWith(query)) ? 4
      : fields.some(value => words.every(word => value.split(" ").some(part => part.startsWith(word)))) ? 3
        : fields.some(value => words.every(word => value.includes(word))) ? 2 : 0;
    const score = search ? Math.max(...labels(option).map(label => search.score(label, named))) : 0;
    return { option, index, direct, score };
  }).filter(value => value.direct > 0 || value.score > 0)
    .sort((left, right) => right.direct - left.direct || right.score - left.score || left.index - right.index);
  return { exact: ranked.filter(value => value.direct > 0 || value.score >= footballSearchTiers.exact).map(value => value.option),
    similar: ranked.filter(value => value.direct === 0 && value.score < footballSearchTiers.exact).map(value => value.option) };
}
