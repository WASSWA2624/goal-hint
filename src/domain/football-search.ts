/** Deterministic name relevance: 0 rejects a candidate; 1–1000 ranks accepted matches. */
export type PreparedFootballSearch = Readonly<{
  normalized: string;
  tokens: readonly string[];
  score: (candidate: string) => number;
}>;

const maximumTextLength = 512;
const maximumQueryTokens = 16;
const maximumCandidateTokens = 32;
const candidateCacheSize = 256;
const clubWords = new Set(["fc", "afc", "cf", "sc", "football", "soccer", "club", "the", "and", "of"]);
const tokenAliases: Readonly<Record<string, string>> = {
  utd: "united", st: "saint", ste: "sainte", munchen: "munich", muenchen: "munich",
  koln: "cologne", koeln: "cologne", wien: "vienna", nottm: "nottingham",
};
// Only established names are expanded. Ambiguous initials, "United", "City" and country fragments stay literal.
const nameAliases: Readonly<Record<string, string>> = {
  "man united": "manchester united", "man utd": "manchester united", "man u": "manchester united",
  manutd: "manchester united", mufc: "manchester united",
  "man city": "manchester city", mancity: "manchester city", mcfc: "manchester city",
  psg: "paris saint germain", "paris sg": "paris saint germain",
  bvb: "borussia dortmund", spurs: "tottenham hotspur", wolves: "wolverhampton wanderers",
  qpr: "queens park rangers", barca: "barcelona", "inter milan": "internazionale",
  epl: "premier league", ucl: "uefa champions league", "uefa cl": "uefa champions league", uel: "uefa europa league",
  usa: "united states", us: "united states", "united states of america": "united states",
  uk: "united kingdom", uae: "united arab emirates", "korea republic": "south korea",
  "republic of korea": "south korea", "korea dpr": "north korea", dprk: "north korea",
  "cote divoire": "ivory coast", "cote d ivoire": "ivory coast", "czech republic": "czechia",
  turkiye: "turkey", brasil: "brazil", deutschland: "germany",
};

/** Keep Unicode letters/numbers, fold accents and spacing, and join dotted initials and apostrophes. */
export function normalizeFootballSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/[ßæœøłđðþı]/gu, (letter) => ({ ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" })[letter]!)
    .replace(/(?:\p{L}\.){2,}/gu, (initials) => initials.replace(/\./gu, ""))
    .replace(/[’'ʼ]/gu, "").replace(/&/gu, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type SearchToken = Readonly<{ value: string; characters: readonly string[]; numeric: boolean; literal: boolean }>;
type Name = Readonly<{ normalized: string; canonical: string; raw: readonly SearchToken[]; tokens: readonly SearchToken[] }>;

function alias(value: string, aliases: Readonly<Record<string, string>>): string {
  return Object.hasOwn(aliases, value) ? aliases[value]! : value;
}

function tokens(value: string, aliases: boolean, omitClubWords = true): SearchToken[] {
  const words = value.split(" ").filter((word) => word && (!omitClubWords || !clubWords.has(word)))
    .map((word) => aliases ? alias(word, tokenAliases) : word);
  return [...new Set(words)].map((word) => ({ value: word, characters: Array.from(word), numeric: /\p{N}/u.test(word), literal: clubWords.has(word) }));
}

function prepareName(value: string): Name {
  const normalized = value.length <= maximumTextLength ? normalizeFootballSearch(value) : "";
  const raw = tokens(normalized, false, false);
  const significant = tokens(alias(normalized, nameAliases), false).map((token) => token.value).join(" ");
  const canonical = tokens(alias(significant, nameAliases), true);
  // A literal search for "Club" or "FC" still searches those actual words; they never gain fuzzy alternatives.
  const canonicalTokens = canonical.length ? canonical : raw;
  return { normalized, canonical: canonicalTokens.map((token) => token.value).join(" "), raw, tokens: canonicalTokens };
}

/** Banded optimal-string-alignment distance; adjacent transpositions cost one edit. */
function editDistance(left: readonly string[], right: readonly string[], limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  const infinity = limit + 1;
  let previousPrevious = new Array<number>(right.length + 1).fill(infinity);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index <= limit ? index : infinity);
  for (let row = 1; row <= left.length; row++) {
    const current = new Array<number>(right.length + 1).fill(infinity);
    current[0] = row <= limit ? row : infinity;
    const start = Math.max(1, row - limit), end = Math.min(right.length, row + limit);
    let minimum = infinity;
    for (let column = start; column <= end; column++) {
      current[column] = Math.min(previous[column]! + 1, current[column - 1]! + 1,
        previous[column - 1]! + Number(left[row - 1] !== right[column - 1]));
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        current[column] = Math.min(current[column]!, previousPrevious[column - 2]! + 1);
      }
      minimum = Math.min(minimum, current[column]!);
    }
    if (minimum > limit) return infinity;
    previousPrevious = previous;
    previous = current;
  }
  return previous[right.length]!;
}

function tokenScore(query: SearchToken, candidate: SearchToken): number {
  if (query.value === candidate.value) return 1000;
  // Ages, divisions, years and identifiers must never drift to a neighboring number.
  if (query.numeric || candidate.numeric) return 0;
  const queryLength = query.characters.length, candidateLength = candidate.characters.length;
  if (queryLength >= 3 && candidate.value.startsWith(query.value) && queryLength / candidateLength >= 0.3) {
    return 760 + Math.round(140 * queryLength / candidateLength);
  }
  if (queryLength >= 3 && candidate.value.includes(query.value) && queryLength / candidateLength >= 0.3) {
    return 700 + Math.round(100 * queryLength / candidateLength);
  }
  if (query.literal || candidate.literal) return 0;
  if (Math.min(queryLength, candidateLength) < 4) return 0;
  const length = Math.max(queryLength, candidateLength);
  const limit = length < 6 ? 1 : length < 11 ? 2 : 3;
  const distance = editDistance(query.characters, candidate.characters, limit);
  if (distance > limit || distance / length > 0.28) return 0;
  return 850 - Math.round(600 * distance / length) - distance * 20;
}

/** Maximum-weight assignment gives each query word its own candidate word, without greedy collisions. */
function matchedScores(weights: readonly (readonly number[])[]): number[] {
  const rows = weights.length, columns = weights[0]!.length;
  const rowPotential = new Array<number>(rows + 1).fill(0), columnPotential = new Array<number>(columns + 1).fill(0);
  const assignment = new Array<number>(columns + 1).fill(0), previous = new Array<number>(columns + 1).fill(0);
  for (let row = 1; row <= rows; row++) {
    assignment[0] = row;
    const minimum = new Array<number>(columns + 1).fill(Infinity), used = new Array<boolean>(columns + 1).fill(false);
    let column = 0;
    do {
      used[column] = true;
      const assignedRow = assignment[column]!;
      let delta = Infinity, nextColumn = 0;
      for (let next = 1; next <= columns; next++) {
        if (used[next]) continue;
        const weight = weights[assignedRow - 1]![next - 1]!;
        // Completing a valid assignment outranks every combination containing a rejected word pair.
        const cost = (weight ? 1000 - weight : (rows + 1) * 1000) - rowPotential[assignedRow]! - columnPotential[next]!;
        if (cost < minimum[next]!) { minimum[next] = cost; previous[next] = column; }
        if (minimum[next]! < delta) { delta = minimum[next]!; nextColumn = next; }
      }
      for (let next = 0; next <= columns; next++) {
        if (used[next]) {
          rowPotential[assignment[next]!]! += delta;
          columnPotential[next]! -= delta;
        } else minimum[next]! -= delta;
      }
      column = nextColumn;
    } while (assignment[column] !== 0);
    do {
      const next = previous[column]!;
      assignment[column] = assignment[next]!;
      column = next;
    } while (column !== 0);
  }
  const result = new Array<number>(rows).fill(0);
  for (let column = 1; column <= columns; column++) {
    if (assignment[column]) result[assignment[column]! - 1] = weights[assignment[column]! - 1]![column - 1]!;
  }
  return result;
}

function wordScore(query: readonly SearchToken[], candidate: readonly SearchToken[]): number {
  if (!query.length || query.length > candidate.length || query.length > maximumQueryTokens || candidate.length > maximumCandidateTokens) return 0;
  const extra = Math.round(100 * (candidate.length - query.length) / candidate.length);
  const candidateWords = new Set(candidate.map((token) => token.value));
  if (query.every((token) => candidateWords.has(token.value))) return query.length === candidate.length ? 940 : 900 - extra;
  const weights = query.map((token) => candidate.map((word) => tokenScore(token, word)));
  if (weights.some((row) => !row.some(Boolean))) return 0;
  const matches = matchedScores(weights);
  if (matches.some((score) => score === 0)) return 0;
  const quality = Math.round(matches.reduce((sum, score) => sum + score, 0) / query.length);
  // A clean word cannot conceal an unrelated second word; every fuzzy word already meets its own bound.
  return Math.min(850, quality - 35) - extra;
}

function scoreName(query: Name, candidate: Name): number {
  if (!query.normalized || !candidate.normalized || !query.tokens.length || !candidate.tokens.length) return 0;
  if (query.normalized === candidate.normalized) return 1000;
  if (query.canonical === candidate.canonical) return 970;
  if (query.canonical.replace(/ /gu, "") === candidate.canonical.replace(/ /gu, "")) return 930;
  const initials = candidate.tokens.map((token) => token.characters[0]).join("");
  const acronym = query.tokens.length === 1 && query.canonical.length >= 3 && query.canonical.length <= 6 && query.canonical === initials ? 870 : 0;
  return Math.max(acronym, wordScore(query.tokens, candidate.tokens), wordScore(query.raw, candidate.raw));
}

/** Prepare once per search. Candidate memoization is local and bounded; equal scores retain the caller's stable secondary order. */
export function prepareFootballSearch(query: string): PreparedFootballSearch {
  const prepared = prepareName(query), cache = new Map<string, number>();
  return Object.freeze({
    normalized: prepared.normalized,
    tokens: Object.freeze(prepared.tokens.map((token) => token.value)),
    score(candidate: string): number {
      const cached = cache.get(candidate);
      if (cached !== undefined) return cached;
      const score = scoreName(prepared, prepareName(candidate));
      if (cache.size >= candidateCacheSize) cache.delete(cache.keys().next().value!);
      cache.set(candidate, score);
      return score;
    },
  });
}

/** Prefer prepareFootballSearch when scoring a collection of team, competition, country or stored alias names. */
export function footballSearchScore(query: string, candidate: string): number {
  return prepareFootballSearch(query).score(candidate);
}
