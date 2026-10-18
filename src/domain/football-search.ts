/** Deterministic name relevance: 0 rejects a candidate; 1–1000 ranks accepted matches.
 * Scores from `footballSearchTiers.exact` up are direct matches: the exact name, an established alias, the same words
 * in another order, or literal word parts. Lower scores are credible alternatives (spelling slips, abbreviations and
 * names mentioned inside a longer query) that the feed and filter lists label "Similar results". */
export const footballSearchTiers = Object.freeze({ exact: 700 });

/** Bit i of `covered` and `direct` stands for `tokens[i]` of the prepared query. */
export type FootballSearchMatch = Readonly<{ score: number; covered: number; direct: number }>;
export type PreparedFootballSearch = Readonly<{
  normalized: string;
  tokens: readonly string[];
  /** Bits of query words that identify something on their own (not "United", "League", numbers or club words). A record
   * whose names cover only part of the query is a similar result when the covered words include a distinctive word and the
   * uncovered words include another (one of several named teams); otherwise it must cover every word. */
  distinctive: number;
  /** Standalone relevance of one name: 0 rejects it. */
  score: (candidate: string) => number;
  /** Relevance plus the query words this name covers. A partial mention ("Barcelona" in "Barcelona vs Real Madrid")
   * is returned even when it would not stand alone, so a fixture can combine its home, away and competition names. */
  match: (candidate: string) => FootballSearchMatch | null;
}>;

const defaultLocale = "en";
const maximumTextLength = 512;
const maximumQueryTokens = 16;
const maximumCandidateTokens = 32;
const candidateCacheSize = 256;
const preparedNameCacheSize = 20_000;
const decimalMark = "\u2024";

const wordSet = (text: string) => new Set(text.trim().split(/\s+/u));
const wordMap = <T>(entries: Record<string, T>) => new Map<string, T>(Object.entries(entries));

/** Club-form words and name articles ("La Liga", "Al Ahly", "Vasco da Gama") never decide a match on their own. */
const clubWords = wordSet(`fc afc cf sc football soccer club the and of la el los las le les il lo de del da do dos das di du
  des van von der den het al`);
/** Words that describe many clubs or competitions. Alone they never pick one record out of many. */
const genericWords = wordSet(`united city town county real athletic atletico athletico sporting sport sports racing rovers
  wanderers albion olympic olympique deportivo deportes union dynamo dinamo central national nacional juniors junior youth
  academy reserve reserves women womens ladies feminine femenino feminino frauen ii iii saint sainte san santa sao new old
  north south east west red white black blue green royal star stars stade league liga ligue lega cup copa coupe coppa
  pokal taca trophy shield super premier premiership first second third division primera segunda tercera serie
  championship championnat campeonato professional profesional amateur regional group playoff playoffs qualification
  qualifiers qualifying round friendly friendlies international world continental conference major pro elite`);
/** Filler in descriptive queries ("show me Arsenal matches today"). None of them is a word in a stored name. */
const stopwords = wordSet(`show me my find search get give list all any every for in on at to from with by about or vs versus
  against match matches game games fixture fixtures result results score scores prediction predictions predict tip tips
  odds bet bets betting pick picks play plays playing played today tonight tomorrow yesterday weekend this next last week
  upcoming who what when where which is are was will does do did i want see watch please between team teams how latest
  win wins won beat beats
  info schedule kickoff`);
/** Articles before a word and fixture separators between two words. "Serie A" keeps its final letter. */
const articles = wordSet("a an");
const separators = wordSet("v x");
const tokenAliases = wordMap<string>({ utd: "united", st: "saint", ste: "sainte", munchen: "munich", muenchen: "munich",
  koln: "cologne", koeln: "cologne", wien: "vienna", nottm: "nottingham", kiev: "kyiv", kiew: "kyiv" });
// Only established names are expanded. Ambiguous initials, "United", "City" and country fragments stay literal.
const nameAliases = wordMap<string>({
  "man united": "manchester united", "man utd": "manchester united", "man u": "manchester united",
  manutd: "manchester united", mufc: "manchester united",
  "man city": "manchester city", mancity: "manchester city", mcfc: "manchester city",
  psg: "paris saint germain", "paris sg": "paris saint germain",
  bvb: "borussia dortmund", spurs: "tottenham hotspur", wolves: "wolverhampton wanderers",
  qpr: "queens park rangers", barca: "barcelona", "inter milan": "internazionale",
  lfc: "liverpool", cfc: "chelsea", efc: "everton", thfc: "tottenham hotspur", avfc: "aston villa",
  nufc: "newcastle united", lufc: "leeds united", whufc: "west ham united", wba: "west bromwich albion",
  hsv: "hamburger sv", bmg: "borussia monchengladbach", juve: "juventus", atleti: "atletico madrid",
  "athletic bilbao": "athletic club",
  epl: "premier league", ucl: "uefa champions league", "uefa cl": "uefa champions league", uel: "uefa europa league",
  uecl: "uefa europa conference league", mls: "major league soccer", afcon: "africa cup of nations", euros: "euro championship",
  usa: "united states", us: "united states", "united states of america": "united states",
  uk: "united kingdom", uae: "united arab emirates", "korea republic": "south korea",
  "republic of korea": "south korea", "korea dpr": "north korea", dprk: "north korea",
  "cote divoire": "ivory coast", "cote d ivoire": "ivory coast", "czech republic": "czechia",
  turkiye: "turkey", brasil: "brazil", deutschland: "germany",
});
/** Aliases that are also ordinary name words apply only to a whole name: "US Lecce" is not the United States and
 * "Juve Stabia" is not Juventus. Stored names only ever use whole-name aliases. */
const wholeOnlyAliases = wordSet("us uk juve wolves");
/** Unambiguous nicknames, read only in queries; stored names are official names. */
const nicknames = wordMap<string>({
  "red devils": "manchester united", gunners: "arsenal", toffees: "everton", magpies: "newcastle united",
  hammers: "west ham united", foxes: "leicester city", villans: "aston villa", baggies: "west bromwich albion",
  cherries: "bournemouth", seagulls: "brighton", cottagers: "fulham", canaries: "norwich city", hornets: "watford",
  owls: "sheffield wednesday", blades: "sheffield united", "tractor boys": "ipswich town", "black cats": "sunderland",
  rams: "derby county", potters: "stoke city", citizens: "manchester city", cityzens: "manchester city",
  bees: "brentford", saints: "southampton", clarets: "burnley", blaugrana: "barcelona", "los blancos": "real madrid",
  merengues: "real madrid", colchoneros: "atletico madrid", bianconeri: "juventus", "old lady": "juventus",
  rossoneri: "milan", nerazzurri: "internazionale", biancocelesti: "lazio", partenopei: "napoli",
  werkself: "bayer leverkusen", azzurri: "italy", "les bleus": "france", "three lions": "england", selecao: "brazil",
  oranje: "netherlands", "die mannschaft": "germany", socceroos: "australia", "super eagles": "nigeria",
  "black stars": "ghana", "bafana bafana": "south africa", pharaohs: "egypt", "atlas lions": "morocco",
  "uganda cranes": "uganda", "harambee stars": "kenya", "taifa stars": "tanzania", "indomitable lions": "cameroon",
  "teranga lions": "senegal", "desert foxes": "algeria", "eagles of carthage": "tunisia", "samurai blue": "japan",
  "taeguk warriors": "south korea", "el tri": "mexico", albiceleste: "argentina", "la celeste": "uruguay",
  ivorian: "ivory coast", "south african": "south africa", "saudi arabian": "saudi arabia",
});
/** "English Premier League" reads as the Premier League of England; the adjective still matches itself. */
const demonyms = wordMap<string>({
  english: "england", scottish: "scotland", welsh: "wales", irish: "ireland", spanish: "spain", german: "germany",
  italian: "italy", french: "france", dutch: "netherlands", portuguese: "portugal", belgian: "belgium", swiss: "switzerland",
  austrian: "austria", greek: "greece", turkish: "turkey", russian: "russia", ukrainian: "ukraine", polish: "poland",
  swedish: "sweden", norwegian: "norway", danish: "denmark", finnish: "finland", czech: "czechia", croatian: "croatia",
  serbian: "serbia", romanian: "romania", hungarian: "hungary", bulgarian: "bulgaria", slovak: "slovakia",
  slovenian: "slovenia", albanian: "albania", cypriot: "cyprus", maltese: "malta", icelandic: "iceland", israeli: "israel",
  brazilian: "brazil", argentine: "argentina", argentinian: "argentina", mexican: "mexico", colombian: "colombia",
  chilean: "chile", uruguayan: "uruguay", peruvian: "peru", paraguayan: "paraguay", ecuadorian: "ecuador",
  bolivian: "bolivia", venezuelan: "venezuela", canadian: "canada", japanese: "japan", chinese: "china", indian: "india",
  iranian: "iran", qatari: "qatar", australian: "australia", egyptian: "egypt", moroccan: "morocco", algerian: "algeria",
  tunisian: "tunisia", nigerian: "nigeria", ghanaian: "ghana", kenyan: "kenya", ugandan: "uganda", tanzanian: "tanzania",
  rwandan: "rwanda", zambian: "zambia", cameroonian: "cameroon", senegalese: "senegal", ethiopian: "ethiopia",
});
/** English competition words also match their usual local forms ("German Cup" finds the DFB Pokal). */
const synonyms = wordMap<readonly string[]>({ league: ["liga", "ligue", "lega"], cup: ["copa", "coupe", "coppa", "pokal", "taca", "beker"],
  women: ["w", "womens", "ladies", "feminine", "femenino", "feminino", "frauen", "femminile", "dames"] });
const longestPhrase = Math.max(...[...nameAliases.keys(), ...nicknames.keys()].map((phrase) => phrase.split(" ").length));

// Zero code points of common decimal digit blocks (Arabic-Indic, Indic scripts, Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, fullwidth).
const digitZeros = [0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66,
  0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0xff10];
const numberSymbolsByLocale = new Map<string, Readonly<{ group: string; decimal: string }>>();
function numberSymbols(locale: string): Readonly<{ group: string; decimal: string }> {
  let symbols = numberSymbolsByLocale.get(locale);
  if (!symbols) {
    let group = ",", decimal = ".";
    try {
      const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
      group = parts.find((part) => part.type === "group")?.value ?? group;
      decimal = parts.find((part) => part.type === "decimal")?.value ?? decimal;
    } catch { /* Unknown locales read numbers the English way. */ }
    symbols = Object.freeze({ group, decimal });
    if (numberSymbolsByLocale.size < 64) numberSymbolsByLocale.set(locale, symbols);
  }
  return symbols;
}
const escapeExpression = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function asciiDigit(digit: string): string {
  const code = digit.codePointAt(0)!;
  if (code < 0x80) return digit;
  const zero = digitZeros.find((start) => code >= start && code <= start + 9);
  return zero === undefined ? digit : String(code - zero);
}

/** Keep Unicode letters/numbers, fold case, accents, invisible formatting and spacing, and join dotted initials and
 * apostrophes. Numbers keep their value in the given locale: "10,000" and "10 000" read 10000, a decimal stays one word
 * ("2.50" reads "2.5"), and "1,5" in English is two numbers rather than fifteen. */
export function normalizeFootballSearch(value: string, locale: string = defaultLocale): string {
  const { group, decimal } = numberSymbols(locale);
  let text = value.replace(/\p{Nd}/gu, asciiDigit).replace(/\p{Cf}+/gu, "")
    // Spaces and apostrophes never mark a decimal, so between digit groups they always group thousands.
    .replace(/(?<=\d)[\u00a0\u2007\u2009\u202f'’](?=\d{3}(?!\d))/gu, "")
    .normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/[ßæœøłđðþı]/gu, (letter) => ({ ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" })[letter]!);
  if (group === "," || group === ".") {
    const separator = escapeExpression(group);
    text = text.replace(new RegExp(`(?<![\\d.,])\\d{1,3}(?:${separator}\\d{3})+(?!\\d|${separator}\\d)`, "gu"),
      (number) => number.replaceAll(group, ""));
  }
  if (decimal === "," || decimal === ".") {
    text = text.replace(new RegExp(`(?<![\\d.,])(\\d+)${escapeExpression(decimal)}(\\d+)(?![\\d]|[.,]\\d)`, "gu"), (_, whole: string, fraction: string) => {
      const significant = fraction.replace(/0+$/u, "");
      return significant ? `${whole}${decimalMark}${significant}` : whole;
    });
  }
  return text.replace(/(?:\p{L}\.){2,}/gu, (initials) => initials.replace(/\./gu, ""))
    .replace(/[’'ʼ]/gu, "").replace(/&/gu, " and ").replace(/[^\p{L}\p{N}\u2024]+/gu, " ").trim().replaceAll(decimalMark, ".");
}

type Token = Readonly<{ value: string; characters: readonly string[]; numeric: boolean; literal: boolean; generic: boolean;
  alternates: readonly Token[] }>;
type Name = Readonly<{ normalized: string; canonical: string; joined: string; initials: string; raw: readonly Token[]; tokens: readonly Token[] }>;
type QueryName = Name & Readonly<{ groups: readonly number[]; genericLike: readonly boolean[]; full: number; distinctive: number }>;

function token(value: string, alternates: readonly string[] = []): Token {
  const characters = Array.from(value);
  return { value, characters, numeric: /\p{N}/u.test(value), literal: clubWords.has(value),
    generic: genericWords.has(value) || characters.length === 1, alternates: alternates.map((alternate) => token(alternate)) };
}
const genericTokens = [...genericWords].map((word) => token(word));
const unique = (tokens: readonly Token[]) => {
  const seen = new Set<string>();
  return tokens.filter((item) => !seen.has(item.value) && Boolean(seen.add(item.value)));
};

/** Words in groups: an alias expansion ("psg" → paris saint germain) is one group, every other word its own. */
type Words = readonly (readonly string[])[];
const flat = (groups: Words) => groups.flat();
const meaningful = (groups: Words, keep: (word: string, index: number, words: readonly string[]) => boolean) => {
  const words = flat(groups);
  let index = 0;
  return groups.map((group) => group.filter((word) => keep(word, index++, words))).filter((group) => group.length > 0);
};

/** Whole-name aliases first; with `phrases`, a query also replaces the longest alias or nickname phrase at each position. */
function expand(groups: Words, query: boolean, phrases: boolean): Words {
  const words = flat(groups), whole = nameAliases.get(words.join(" ")) ?? (query ? nicknames.get(words.join(" ")) : undefined);
  if (whole !== undefined) return [whole.split(" ")];
  if (!query || !phrases) return groups;
  const result: string[][] = [];
  for (let index = 0; index < words.length;) {
    let replaced = false;
    for (let size = Math.min(longestPhrase, words.length - index); size > 0 && !replaced; size--) {
      const phrase = words.slice(index, index + size).join(" ");
      const target = wholeOnlyAliases.has(phrase) ? undefined : nameAliases.get(phrase) ?? nicknames.get(phrase);
      if (target !== undefined) { result.push(target.split(" ")); index += size; replaced = true; }
    }
    if (!replaced) result.push([words[index++]!]);
  }
  return result;
}

const isFiller = (word: string, index: number, words: readonly string[]) => stopwords.has(word) ||
  articles.has(word) && index < words.length - 1 || separators.has(word) && index > 0 && index < words.length - 1;

function prepareName(value: string, locale: string, query: boolean): Name & Readonly<{ groups: readonly number[] }> {
  const normalized = value.length <= maximumTextLength ? normalizeFootballSearch(value, locale) : "";
  const words = normalized ? normalized.split(" ") : [];
  const raw = unique(words.map((word) => token(word)));
  let significant = meaningful(expand(words.map((word) => [word]), query, true), (word) => !clubWords.has(word));
  if (query) {
    const content = meaningful(significant, (word, index, all) => !isFiller(word, index, all));
    if (content.length) significant = content;
  }
  const canonical: Token[] = [], groups: number[] = [], seen = new Set<string>();
  // A second whole-name pass reads "Man Utd FC" or "the US" once club and filler words are gone.
  for (const group of meaningful(expand(significant, query, false), (word) => !clubWords.has(word))) {
    let mask = 0;
    for (const word of group) {
      const value = tokenAliases.get(word) ?? word, country = query ? demonyms.get(value) : undefined;
      const item = !query ? token(value) : country === undefined ? token(value, synonyms.get(value)) : token(country, [value]);
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      mask |= 2 ** canonical.length;
      canonical.push(item);
    }
    if (mask) groups.push(mask);
  }
  // A literal search for "Club" or "FC" still searches those actual words; they never gain fuzzy alternatives.
  const tokens = canonical.length ? canonical : raw;
  // Joined words compare "ManchesterUnited" with "Manchester United"; numbers keep their gaps, so "1 5" never reads 15.
  const joined = tokens.map((item, index) => (index && (item.numeric || tokens[index - 1]!.numeric) ? " " : "") + item.value).join("");
  return { normalized, canonical: tokens.map((item) => item.value).join(" "), joined,
    initials: tokens.map((item) => item.characters[0]).join(""), raw, tokens, groups: canonical.length ? groups : [] };
}

const preparedNames = new Map<string, Name>();
/** Stored names recur across searches, so their normalization is shared, bounded and evicted oldest first. */
function candidateName(value: string, locale: string): Name {
  const key = `${locale}\u0000${value}`;
  let name = preparedNames.get(key);
  if (!name) {
    name = prepareName(value, locale, false);
    if (preparedNames.size >= preparedNameCacheSize) preparedNames.delete(preparedNames.keys().next().value!);
    preparedNames.set(key, name);
  }
  return name;
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

function isSubsequence(short: readonly string[], long: readonly string[]): boolean {
  let index = 0;
  for (const character of long) if (character === short[index] && ++index === short.length) return true;
  return false;
}
const vowels = wordSet("a e i o u y");
/** First letter plus the consonant outline, with doubled letters collapsed: "Totnham" and "Tottenham" both read "tnhm". */
function skeleton(characters: readonly string[]): string {
  let outline = characters[0] ?? "";
  for (const character of characters.slice(1)) if (!vowels.has(character) && !outline.endsWith(character)) outline += character;
  return outline;
}

/** Spelling tolerance for whole words, scored below every direct match (1–690). */
function similarity(query: Token, candidate: Token): number {
  const left = query.characters, right = candidate.characters;
  const shorter = Math.min(left.length, right.length), longer = Math.max(left.length, right.length);
  if (shorter < 4) return 0;
  const sameStart = left[0] === right[0];
  // Beyond one wrong or swapped letter in equally long words the first letter must agree, so "Chichester" is no
  // misspelling of "Manchester". Checking that first also skips most distance computations.
  if (!sameStart && (left.length !== right.length || longer < 5)) return 0;
  // Missing, extra, wrong or swapped letters: one up to 5 letters, two up to 8, three from 9, at most 30% of the word.
  const limit = !sameStart ? 1 : longer >= 9 ? 3 : longer >= 6 ? 2 : 1;
  const distance = editDistance(left, right, limit);
  if (distance <= limit && distance / longer <= 0.3) return 690 - Math.round(240 * distance / longer) - 10 * distance;
  if (!sameStart) return 0;
  // Abbreviations drop letters but keep the rest in order and most of the word: "Mchster" → Manchester, "Untd" → United.
  if (left.length >= 4 && left.length < right.length && left.length / right.length >= 0.6 && isSubsequence(left, right)) {
    return 560 + Math.round(100 * left.length / right.length);
  }
  // Vowel slips keep the consonant outline.
  if (longer / shorter <= 1.67) {
    const outline = skeleton(left);
    if (outline.length >= 4 && outline === skeleton(right)) return 540;
  }
  return 0;
}

/** Word relevance: 1000 equal, 760–900 prefix, 627–690 inner fragment (only when `fragments`), 1–690 spelling.
 * An inner fragment is literal but weak ("man" inside "Fettehman"), so only equal words and prefixes are direct. */
function formScore(query: Token, candidate: Token, fragments: boolean, spelling = true): number {
  if (query.value === candidate.value) return 1000;
  // Ages, divisions, years and identifiers must never drift to a neighboring number.
  if (query.numeric || candidate.numeric) return 0;
  const queryLength = query.characters.length, ratio = queryLength / candidate.characters.length;
  if (queryLength >= 3 && ratio >= 0.3 && candidate.value.startsWith(query.value) && (fragments || queryLength >= 4 && ratio >= 0.4)) {
    return 760 + Math.round(140 * ratio);
  }
  if (fragments && queryLength >= 3 && ratio >= 0.3 && candidate.value.includes(query.value)) return 600 + Math.round(90 * ratio);
  if (!spelling || query.literal || candidate.literal) return 0;
  return similarity(query, candidate);
}
/** Stored names share most words ("united", "u19", "city"), so each query word scores each distinct word once. */
const tokenScores = new WeakMap<Token, readonly [Map<string, number>, Map<string, number>]>();
/** Alternate forms ("liga" for "league", "english" for "england") match exactly or as prefixes, never with corrections. */
function tokenScore(query: Token, candidate: Token, fragments: boolean): number {
  let memo = tokenScores.get(query);
  if (!memo) tokenScores.set(query, memo = [new Map(), new Map()]);
  const scores = memo[fragments ? 1 : 0];
  let best = scores.get(candidate.value);
  if (best === undefined) {
    best = formScore(query, candidate, fragments);
    for (const alternate of query.alternates) if (best < 1000) best = Math.max(best, formScore(alternate, candidate, fragments, false));
    scores.set(candidate.value, best);
  }
  return best;
}

/** Maximum-weight assignment gives each row its own column, without greedy collisions. Rows must not outnumber columns.
 * Returns each row's column, or -1 where no positive weight could be assigned. */
function assign(weights: readonly (readonly number[])[]): number[] {
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
        // Every additional valid pair outranks any combination containing a rejected pair.
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
  const result = new Array<number>(rows).fill(-1);
  for (let column = 1; column <= columns; column++) {
    const row = assignment[column]!;
    if (row && weights[row - 1]![column - 1]! > 0) result[row - 1] = column - 1;
  }
  return result;
}

/** Every query word matches its own word of the name. */
function wordMatch(query: readonly Token[], candidate: readonly Token[], full: number): FootballSearchMatch | null {
  if (!query.length || query.length > candidate.length || query.length > maximumQueryTokens || candidate.length > maximumCandidateTokens) return null;
  const extra = (candidate.length - query.length) / candidate.length;
  const values = new Set(candidate.map((item) => item.value));
  if (query.every((item) => values.has(item.value) || item.alternates.some((alternate) => values.has(alternate.value)))) {
    return { score: query.length === candidate.length ? 940 : 900 - Math.round(100 * extra), covered: full, direct: full };
  }
  const weights = query.map((item) => candidate.map((word) => tokenScore(item, word, true)));
  if (weights.some((row) => !row.some(Boolean))) return null;
  const columns = assign(weights);
  if (columns.some((column) => column < 0)) return null;
  const scores = columns.map((column, row) => weights[row]![column]!);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const direct = scores.reduce((mask, score, index) => score >= footballSearchTiers.exact ? mask | 1 << index : mask, 0);
  // Literal word parts stay direct (700–799); any corrected word makes the whole name a similar result (1–699).
  const score = direct === full ? 700 + Math.round((average - 700) / 4) + Math.round(24 * (1 - extra))
    : Math.max(1, Math.min(699, Math.round(average * 0.72) - Math.round(40 * extra)));
  return { score, covered: full, direct };
}

/** A name mentioned inside a longer query: "Barcelona" in "Barcelona vs Real Madrid". Every word of the name must be
 * matched, except leftover generic words or numbers ("Real", "City", "U21"), and those may not stand against an unmatched
 * generic word or number of the query: "Manchester City" is no mention of "Manchester United", nor "League 2" of
 * "League 1". Word fragments are not mentions. */
function mentionMatch(query: QueryName, candidate: Name): FootballSearchMatch | null {
  const words = query.tokens, names = candidate.tokens;
  if (words.length < 2 || words.length > maximumQueryTokens || names.length > maximumCandidateTokens) return null;
  const weights = words.map((item) => names.map((word) => tokenScore(item, word, false)));
  if (!weights.some((row) => row.some(Boolean))) return null;
  const pairs: [number, number][] = [];
  if (words.length <= names.length) assign(weights).forEach((column, row) => { if (column >= 0) pairs.push([row, column]); });
  else assign(names.map((_, column) => words.map((__, row) => weights[row]![column]!)))
    .forEach((row, column) => { if (row >= 0) pairs.push([row, column]); });
  if (!pairs.length) return null;
  const matchedNames = new Set(pairs.map(([, column]) => column)), matchedWords = new Set(pairs.map(([row]) => row));
  const leftover = names.filter((_, index) => !matchedNames.has(index));
  if (leftover.some((item) => !item.generic && !item.numeric)) return null;
  if (leftover.length > 0 && words.some((item, index) => !matchedWords.has(index) && (query.genericLike[index] || item.numeric))) return null;
  let covered = 0, direct = 0, total = 0;
  for (const [row, column] of pairs) {
    const score = weights[row]![column]!;
    covered |= 1 << row;
    if (score >= footballSearchTiers.exact) direct |= 1 << row;
    total += score;
  }
  // Words of one expanded alias name one team: "Germany" mentions none of "psg" (paris saint germain).
  if (query.groups.some((mask) => (covered & mask) !== 0 && (covered & mask) !== mask)) return null;
  const coverage = matchedWords.size / words.length, average = total / pairs.length;
  const score = Math.max(1, Math.min(649, Math.round(200 + 300 * coverage * average / 1000) - Math.round(30 * leftover.length / names.length)));
  return { score, covered, direct };
}

function matchName(query: QueryName, candidate: Name): FootballSearchMatch | null {
  if (!query.normalized || !candidate.normalized || !query.tokens.length || !candidate.tokens.length ||
    query.tokens.length > maximumQueryTokens) return null;
  const whole = (score: number) => ({ score, covered: query.full, direct: query.full });
  if (query.normalized === candidate.normalized) return whole(1000);
  if (query.canonical === candidate.canonical) return whole(970);
  if (query.joined === candidate.joined) return whole(930);
  let best: FootballSearchMatch | null = query.tokens.length === 1 && query.joined.length >= 3 && query.joined.length <= 6 &&
    query.joined === candidate.initials ? whole(870) : null;
  const words = wordMatch(query.tokens, candidate.tokens, query.full);
  if (words && words.score > (best?.score ?? 0)) best = words;
  const raw = wordMatch(query.raw, candidate.raw, 2 ** query.raw.length - 1);
  if (raw && raw.score > (best?.score ?? 0)) best = { ...whole(raw.score), direct: raw.score >= footballSearchTiers.exact ? query.full : 0 };
  return best ?? mentionMatch(query, candidate);
}

function prepareQuery(value: string, locale: string): QueryName {
  const name = prepareName(value, locale, true);
  // A very long query keeps its first words, one mask bit each, so a long list of teams still finds them.
  const tokens = name.tokens.slice(0, maximumQueryTokens), full = 2 ** tokens.length - 1;
  const genericLike = tokens.map((item) => item.generic || genericTokens.some((word) =>
    item.characters.length >= 3 && word.value.startsWith(item.value) || similarity(item, word) > 0));
  const distinctive = tokens.reduce((mask, item, index) =>
    !item.numeric && !item.literal && !genericLike[index] ? mask | 1 << index : mask, 0);
  return { ...name, tokens, groups: name.groups.map((mask) => mask & full).filter(Boolean), genericLike, full, distinctive };
}

/** Matched words stand on their own when they are all the query's words, or include a distinctive word while another
 * distinctive word stays unmatched: one of several named teams ("Barcelona" for "Barcelona Madrid"). Leaving out only
 * qualifiers is not enough ("Manchester SC" for "Manchester United"). Feed records apply the same rule to the words their
 * teams and competition cover together. */
function mentionStands(covered: number, query: Readonly<{ full: number; distinctive: number }>): boolean {
  return covered === query.full || (covered & query.distinctive) !== 0 && (query.distinctive & ~covered) !== 0;
}

/** Prepare once per search. Candidate memoization is local and bounded; equal scores retain the caller's stable secondary order. */
export function prepareFootballSearch(query: string, locale: string = defaultLocale): PreparedFootballSearch {
  const prepared = prepareQuery(query, locale), cache = new Map<string, FootballSearchMatch | null>();
  const match = (candidate: string): FootballSearchMatch | null => {
    if (cache.has(candidate)) return cache.get(candidate)!;
    const found = matchName(prepared, candidateName(candidate, locale));
    const result = found && Object.freeze(found);
    if (cache.size >= candidateCacheSize) cache.delete(cache.keys().next().value!);
    cache.set(candidate, result);
    return result;
  };
  return Object.freeze({
    normalized: prepared.normalized,
    tokens: Object.freeze(prepared.tokens.map((item) => item.value)),
    distinctive: prepared.distinctive,
    match,
    score(candidate: string): number {
      const found = match(candidate);
      if (!found) return 0;
      return mentionStands(found.covered, prepared) ? found.score : 0;
    },
  });
}

/** Prefer prepareFootballSearch when scoring a collection of team, competition, country or stored alias names. */
export function footballSearchScore(query: string, candidate: string, locale: string = defaultLocale): number {
  return prepareFootballSearch(query, locale).score(candidate);
}
