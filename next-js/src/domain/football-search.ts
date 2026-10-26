/** Deterministic name relevance: 0 rejects a candidate; 1–1000 ranks accepted matches.
 * Scores from `footballSearchTiers.exact` up are direct matches: the exact name, an established alias, the same words
 * in another order, or literal word prefixes. Lower scores are credible alternatives (spelling slips, abbreviations,
 * inner word fragments and names mentioned inside a longer query) that the feed and filter lists label "Similar results". */
export const footballSearchTiers = Object.freeze({ exact: 700 });

/** Bit i of each mask stands for `tokens[i]` of the prepared query. `named` holds the query words this name contains
 * exactly as distinctive words; it confirms an ambiguous query word as a real name (see `ambiguous`). */
export type FootballSearchMatch = Readonly<{ score: number; covered: number; direct: number; named: number }>;
export type PreparedFootballSearch = Readonly<{
  normalized: string;
  tokens: readonly string[];
  /** Bits of query words that identify something on their own (not "United", "League", numbers or club words). A record
   * whose names cover only part of the query is a similar result when the covered words include a distinctive word;
   * otherwise it must cover every word. */
  distinctive: number;
  /** Words that resemble a generic word ("Reading" ~ racing, "Inter" ~ international, "Untd" ~ united). They count as
   * distinctive only where a searched name contains them exactly: pass the union of `named` across the searched names. */
  ambiguous: number;
  /** Standalone relevance of one name: 0 rejects it. `named` defaults to this name's own confirmed words. */
  score: (candidate: string, named?: number) => number;
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

/** Club forms and name articles ("AC Milan", "FK Partizan", "Örgryte IS", "La Liga", "Vasco da Gama", "L'Aquila") never
 * decide a match on their own; a search made only of them still finds them literally. "US" stays a word: it is also the
 * United States. */
const clubWords = wordSet(`fc afc cf sc football soccer club the and of la el los las le les il lo de del da do dos das di du
  des van von der den het al l d fk ac as sk sv ff if is ud cd ca rb vfl vfb tsv tsg fsv bsc ssc ss bk ik ifk nk hnk ofk ks
  kv ec es se cr rc rcd sd ad cs`);
/** Words that describe many clubs or competitions. Alone they never pick one record out of many. */
const genericWords = wordSet(`united city town county real athletic atletico athletico sporting sport sports racing rovers
  wanderers albion olympic olympique deportivo deportes union dynamo dinamo central national nacional juniors junior youth
  academy reserve reserves women womens ladies feminine femenino feminino frauen ii iii saint sainte san santa sao new old
  north south east west red white black blue green royal star stars stade league liga ligue lega cup copa coupe coppa
  pokal taca trophy shield super premier premiership first second third division primera segunda tercera serie
  championship championnat campeonato professional profesional amateur regional group playoff playoffs qualification
  qualifiers qualifying round friendly friendlies international world continental conference major pro elite
  fa efl dfb rfef knvb figc uefa caf concacaf conmebol ofc fifa`);
/** Filler in descriptive queries ("show me Arsenal matches today"). A stored name may contain one ("All Boys",
 * "MLS Next Pro"); there it is an optional word, like a generic one. */
const stopwords = wordSet(`show me my find search get give list all any every for in on at to from with by about or vs versus
  against match matches game games fixture fixtures result results score scores prediction predictions predict tip tips
  odds bet bets betting pick picks play plays playing played today tonight tomorrow yesterday weekend this next last week
  upcoming who what when where which are was will does do did want see watch please between team teams how latest
  win wins won beat beats info schedule kickoff need like wish would love follow support wanna think`);
/** "I" is filler only as the subject of such a verb; "NB I" and "Liga I" keep their numeral. */
const pronounVerbs = wordSet("want need see watch like wish would love follow support wanna think am m");
/** Articles before a word and fixture separators between two words. "Serie A" keeps its final letter. */
const articles = wordSet("a an");
const separators = wordSet("v x");
/** Words that set two named teams apart in a query. ("And" stays inside names such as "Brighton and Hove Albion".) */
const connectors = wordSet("vs versus against between");
/** Division ordinals a stored name may keep beside a matched group number ("Tercera División RFEF - Group 2"). */
const divisionWords = wordSet("primera segunda tercera cuarta first second third fourth");
/** Roman numerals in names ("NB I", "Liga II") behave like numbers: they never drift to a neighbour. */
const numerals = wordSet("i ii iii iv");
const tokenAliases = wordMap<string>({ utd: "united", st: "saint", ste: "sainte", munchen: "munich", muenchen: "munich",
  koln: "cologne", koeln: "cologne", wien: "vienna", nottm: "nottingham", kiev: "kyiv", kiew: "kyiv",
  // Every women's form, including the stored "W" suffix, reads as one word on both sides.
  w: "women", womens: "women", ladies: "women", feminine: "women", femenino: "women", femenina: "women", femenil: "women",
  femeni: "women", feminino: "women", feminina: "women", frauen: "women", femminile: "women", dames: "women", wfc: "women" });
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
  // The club's stored name is generic on its own, so both spellings meet at the distinctive one.
  "athletic club": "athletic bilbao",
  epl: "premier league", ucl: "uefa champions league", "uefa cl": "uefa champions league", uel: "uefa europa league",
  uecl: "uefa europa conference league", mls: "major league soccer", afcon: "africa cup of nations", euros: "euro championship",
  usa: "united states", us: "united states", "united states of america": "united states",
  uk: "united kingdom", uae: "united arab emirates", "korea republic": "south korea",
  "republic of korea": "south korea", "korea dpr": "north korea", dprk: "north korea",
  "cote divoire": "ivory coast", "cote d ivoire": "ivory coast", "czech republic": "czechia",
  turkiye: "turkey", brasil: "brazil", deutschland: "germany",
});
/** Aliases that are also ordinary name words apply only to a whole query: "US Lecce" is not the United States and
 * "Juve Stabia" is not Juventus. Stored names use whole-name aliases, plus the phrases the query itself expanded. */
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
/** Established abbreviations a query may expand anywhere in a side. Nicknames and whole-only aliases name a team only as a
 * whole side (see wholeSide). */
const aliasPhrases = new Map<string, readonly string[]>([...nameAliases]
  .filter(([phrase]) => !wholeOnlyAliases.has(phrase)).map(([phrase, target]) => [phrase, target.split(" ")]));
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
const synonyms = wordMap<readonly string[]>({ league: ["liga", "ligue", "lega"], cup: ["copa", "coupe", "coppa", "pokal", "taca", "beker"] });
const longestPhrase = Math.max(...[...aliasPhrases.keys()].map((phrase) => phrase.split(" ").length));

// Zero code points of common decimal digit blocks (Arabic-Indic, Indic scripts, Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, fullwidth).
const digitZeros = [0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66,
  0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0xff10];
const numberSymbolsByLocale = new Map<string, Readonly<{ group: string; decimal: string }>>();
/** The locale's own separators, reduced to the forms the folded text can hold: "," or "." for either, or a space for grouping. */
function numberSymbols(locale: string): Readonly<{ group: string | null; decimal: string }> {
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
  const decimal = symbols.decimal === "," ? "," : ".";
  const group = symbols.group === "," || symbols.group === "." ? (symbols.group === decimal ? null : symbols.group)
    : /^\s$/u.test(symbols.group) ? " " : null;
  return { group, decimal };
}
const escapeExpression = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function asciiDigit(digit: string): string {
  const code = digit.codePointAt(0)!;
  if (code < 0x80) return digit;
  const zero = digitZeros.find((start) => code >= start && code <= start + 9);
  return zero === undefined ? digit : String(code - zero);
}

/** Keep Unicode letters/numbers, fold case, accents, invisible formatting and spacing, and join dotted initials and
 * apostrophes. Numbers keep their value in the given locale: "10,000" reads 10000 (as do no-break-space groups, and
 * plain-space groups in locales that group with spaces), a decimal stays one word ("2.50" reads "2.5"), and "1,5" in
 * English is two numbers rather than fifteen. Age groups join ("U-19", "Under 19" read "u19"); ordinal signs drop. */
export function normalizeFootballSearch(value: string, locale: string = defaultLocale): string {
  const { group, decimal } = numberSymbols(locale);
  let text = value.replace(/\p{Nd}/gu, asciiDigit).replace(/[\p{Cf}\u115f\u1160\u3164\uffa0]+/gu, "")
    // Spaces and apostrophes never mark a decimal, so between digit groups they always group thousands.
    .replace(/(?<=\d)[\u00a0\u2007\u2009\u202f'’\u066c](?=\d{3}(?!\d))/gu, "")
    .replace(/(?<=\d)\u066b(?=\d)/gu, decimal).replace(/(?<=\d)[ºª°]/gu, "")
    .normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/ς/gu, "σ")
    .replace(/[ßæœøłđðþı]/gu, (letter) => ({ ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" })[letter]!)
    // Age groups join and lose a plural ("U-19s", "Under 21's" read u19, u21); ordinals lose their suffix ("1a", "2nd").
    .replace(/(?<![\p{L}\p{N}])(?:u|under)[\s._–—-]*(\d{1,2})(?:['’]?s)?(?![\p{L}\p{N}])/gu, "u$1")
    .replace(/(?<![\p{L}\p{N}])(\d{1,2})(?:o|a|st|nd|rd|th)(?![\p{L}\p{N}])/gu, "$1")
    // An elided article stands apart from its name: "L'Aquila", "d'Escaldes".
    .replace(/(?<![\p{L}\p{N}])([dl])['’ʼ](?=[aeiouh])/gu, "$1 ");
  if (group) {
    const separator = escapeExpression(group);
    text = text.replace(new RegExp(`(?<![\\d.,])\\d{1,3}(?:${separator}\\d{3})+(?!\\d|${separator}\\d)`, "gu"),
      (number) => number.replaceAll(group, ""));
  }
  text = text.replace(new RegExp(`(?<![\\d.,])(\\d+)${escapeExpression(decimal)}(\\d+)(?![\\d]|[.,]\\d)`, "gu"), (_, whole: string, fraction: string) => {
    const significant = fraction.replace(/0+$/u, "");
    return significant ? `${whole}${decimalMark}${significant}` : whole;
  });
  return text.replace(/(?:\p{L}\.){2,}/gu, (initials) => initials.replace(/\./gu, ""))
    .replace(/[’'ʼ]/gu, "").replace(/&/gu, " and ").replace(/[^\p{L}\p{N}\u2024]+/gu, " ").trim().replaceAll(decimalMark, ".");
}

type Token = Readonly<{ value: string; characters: readonly string[]; numeric: boolean; literal: boolean; generic: boolean;
  /** The last word of a longer query while it is still being typed ("Real M"): it matches as a prefix of any length. */
  partial: boolean;
  /** For a query word, the sides of the query it belongs to: "Inter" and "Milan" in "Inter vs Milan" are on two sides. */
  sides: number; alternates: readonly Token[] }>;
type Name = Readonly<{ normalized: string; canonical: string; joined: string;
  /** Spellings without spaces that a one-word query may equal: canonical words, all typed words, typed words without club forms. */
  joins: readonly string[]; initials: string; raw: readonly Token[]; tokens: readonly Token[]; groups: readonly number[] }>;
type QueryName = Name & Readonly<{ phrases: ReadonlyMap<string, readonly string[]>; qualifierLike: readonly boolean[];
  full: number; distinctive: number; ambiguous: number; sideCount: number }>;

function token(value: string, alternates: readonly string[] = [], partial = false, sides = 0): Token {
  const characters = Array.from(value);
  return { value, characters, numeric: /\p{N}/u.test(value) || numerals.has(value), literal: clubWords.has(value),
    generic: genericWords.has(value) || stopwords.has(value) || characters.length === 1, partial, sides,
    alternates: alternates.map((alternate) => token(alternate)) };
}
const genericTokens = [...genericWords].map((word) => token(word));
// Only one slip in a longer filler word is corrected ("matchs", "tomorow"): shorter or looser readings sit too close to
// names ("Manch" ~ match, "Sparta" ~ support, "Beijing" ~ betting).
const fillerTokens = [...stopwords].filter((word) => word.length >= 6).map((word) => token(word));
const isSlip = (word: string, filler: Token) => word[0] === filler.value[0] && editDistance(Array.from(word), filler.characters, 1) <= 1;
const unique = (tokens: readonly Token[]) => {
  const seen = new Set<string>();
  return tokens.filter((item) => !seen.has(item.value) && Boolean(seen.add(item.value)));
};
/** A word of a stored name that identifies it. */
const isDistinctive = (item: Token) => !item.generic && !item.numeric && !item.literal;
/** Joined words compare "ManchesterUnited" with "Manchester United"; numbers keep their gaps, so "1 5" never reads 15. */
const joinWords = (tokens: readonly Token[]) => tokens.map((item, index) => (index && (item.numeric || tokens[index - 1]!.numeric) ? " " : "") + item.value).join("");

/** Words in groups: an alias expansion ("psg" → paris saint germain) is one group, every other word its own. */
type Words = readonly (readonly string[])[];
const flat = (groups: Words) => groups.flat();
const meaningful = (groups: Words, keep: (word: string, index: number, words: readonly string[]) => boolean) => {
  const words = flat(groups);
  let index = 0;
  return groups.map((group) => group.filter((word) => keep(word, index++, words))).filter((group) => group.length > 0);
};

/** A whole-name alias, else the longest of `phrases` at each position. A query records what it expanded in `expanded`,
 * so stored names containing those phrases can be read the same way. */
function expand(groups: Words, phrases: ReadonlyMap<string, readonly string[]> | null, expanded?: Map<string, readonly string[]>): Words {
  const words = flat(groups), joined = words.join(" "), whole = nameAliases.get(joined);
  if (whole !== undefined) {
    if (!wholeOnlyAliases.has(joined)) expanded?.set(joined, whole.split(" "));
    return [whole.split(" ")];
  }
  if (!phrases?.size) return groups;
  const result: string[][] = [];
  for (let index = 0; index < words.length;) {
    let replaced = false;
    for (let size = Math.min(longestPhrase, words.length - index); size > 0 && !replaced; size--) {
      const phrase = words.slice(index, index + size).join(" "), target = phrases.get(phrase);
      if (target !== undefined) { expanded?.set(phrase, target); result.push([...target]); index += size; replaced = true; }
    }
    if (!replaced) result.push([words[index++]!]);
  }
  return result;
}

const isQualifierWord = (word: string) => {
  const value = tokenAliases.get(word) ?? word;
  return genericWords.has(value) || /\p{N}/u.test(value) || numerals.has(value);
};
/** A side that is an alias or a nickname, alone or followed by qualifiers ("US W", "Spurs U21"), names that team.
 * Inside a longer name a nickname stays literal: "Singida Black Stars" is no Ghana side. */
function wholeSide(groups: Words, lookup: (head: string) => string | undefined, expanded?: Map<string, readonly string[]>): Words {
  const words = flat(groups);
  for (let size = words.length; size > 0; size--) {
    const head = words.slice(0, size).join(" "), target = lookup(head);
    if (target === undefined || !words.slice(size).every(isQualifierWord)) continue;
    if (!wholeOnlyAliases.has(head)) expanded?.set(head, target.split(" "));
    return [target.split(" "), ...words.slice(size).map((word) => [word])];
  }
  return groups;
}
const sideAlias = (head: string) => nameAliases.get(head) ?? nicknames.get(head);
/** Stored names read the same way ("USA W", "PSG U19", "Wolves U21"), plus short stored forms of clubs whose alias
 * expands further. Queries never read these, so "Inter" still finds Inter Miami. */
const storedAliases = wordMap<string>({ inter: "internazionale", "inter milano": "internazionale", tottenham: "tottenham hotspur" });
const storedAlias = (head: string) => nameAliases.get(head) ?? storedAliases.get(head);

/** Filler: stopwords and their spelling slips ("tomorow", "matchs"), a subject "I"; then articles and separators are judged
 * among the remaining words, so "Serie A matches" keeps its final letter. */
function withoutFiller(groups: Words): Words {
  const content = meaningful(groups, (word, index, words) => !stopwords.has(word) && !(word === "i" && pronounVerbs.has(words[index + 1] ?? "")) &&
    !(word.length >= 5 && !genericWords.has(word) && fillerTokens.some((filler) => isSlip(word, filler))));
  return meaningful(content, (word, index, words) => !(articles.has(word) && index < words.length - 1) &&
    !(separators.has(word) && index > 0 && index < words.length - 1));
}

/** A query's sides: connectors anywhere and "v" or "x" between two words set named teams apart. */
function querySides(words: readonly string[]): string[][] {
  const sides: string[][] = [[]];
  words.forEach((word, index) => {
    if (connectors.has(word) || separators.has(word) && index > 0 && index < words.length - 1) sides.push([]);
    else sides.at(-1)!.push(word);
  });
  return sides.filter((side) => side.length > 0);
}

function nameOf(normalized: string, raw: readonly Token[], canonical: readonly Token[], groups: readonly number[]): Name {
  // A literal search for "Club" or "FC" still searches those actual words; they never gain fuzzy alternatives.
  const tokens = canonical.length ? canonical : raw, joined = joinWords(tokens);
  // Initials skip age groups and numbers, which no acronym spells.
  const initials = tokens.filter((item) => !item.numeric).map((item) => item.characters[0]).join("");
  return { normalized, canonical: tokens.map((item) => item.value).join(" "), joined,
    joins: [...new Set([joined, joinWords(raw), joinWords(raw.filter((item) => !item.literal))])], initials, raw, tokens,
    groups: canonical.length ? groups : [] };
}

/** A stored name: whole-name aliases (plus the phrases a query expanded, when given) and no club forms. */
function prepareCandidate(value: string, locale: string, phrases: ReadonlyMap<string, readonly string[]> | null = null): Name {
  const normalized = value.length <= maximumTextLength ? normalizeFootballSearch(value, locale) : "";
  const words = normalized ? normalized.split(" ") : [];
  const raw = unique(words.map((word) => token(word)));
  const significant = meaningful(expand(words.map((word) => [word]), phrases), (word) => !clubWords.has(word));
  const groups = meaningful(wholeSide(significant, storedAlias), (word) => !clubWords.has(word));
  const canonical = unique(flat(groups).map((word) => token(tokenAliases.get(word) ?? word)));
  return nameOf(normalized, raw, canonical, []);
}

/** A query: split into sides, aliases and nicknames read per side, filler dropped, words shared across teams kept once. */
function prepareQueryName(value: string, locale: string, expanded: Map<string, readonly string[]>): Name & Readonly<{ sideCount: number }> {
  const normalized = value.length <= maximumTextLength ? normalizeFootballSearch(value, locale) : "";
  const words = normalized ? normalized.split(" ") : [];
  const raw = unique(words.map((word) => token(word)));
  // A leading "the" never belongs to an alias: "the US" reads as the United States.
  const named = words[0] === "the" && words.length > 1 ? words.slice(1) : words;
  const parts = querySides(named).map((side) => meaningful(expand(side.map((word) => [word]), aliasPhrases, expanded),
    (word) => !clubWords.has(word)));
  const content = parts.map(withoutFiller);
  const sides = (content.some((part) => part.length) ? content : parts).filter((part) => part.length)
    .map((part) => meaningful(wholeSide(part, sideAlias, expanded), (word) => !clubWords.has(word))).filter((part) => part.length);
  // The last typed word of a longer query is still being typed if it is one or two letters ("Real M", "AC Mi").
  const last = words.at(-1) ?? "";
  const typing = words.length > 1 && /^\p{L}{1,2}$/u.test(last) && !numerals.has(last) ? last : null;
  const canonical: Token[] = [], groups: number[] = [], sideBits: number[] = [], positions = new Map<string, number>();
  for (const [side, part] of sides.entries()) {
    for (const [index, group] of part.entries()) {
      let mask = 0;
      for (const word of group) {
        const value = tokenAliases.get(word) ?? word, country = demonyms.get(value);
        const partial = side === sides.length - 1 && index === part.length - 1 && group.length === 1 && word === typing && value === word;
        // A word a stored short form expands to one word ("Inter" → internazionale) also matches that word.
        const stored = storedAliases.get(value), alternates = [...synonyms.get(value) ?? [], ...stored && !stored.includes(" ") ? [stored] : []];
        const item = country === undefined ? token(value, alternates, partial) : token(country, [value]);
        // A word shared by two named teams ("Man Utd vs Man City") belongs to both of their groups.
        let position = positions.get(item.value);
        if (position === undefined) { position = canonical.length; positions.set(item.value, position); canonical.push(item); sideBits.push(0); }
        sideBits[position]! |= 1 << side;
        mask |= 2 ** position;
      }
      groups.push(mask);
    }
  }
  const tokens = canonical.map((item, index) => ({ ...item, sides: sideBits[index]! }));
  return { ...nameOf(normalized, raw, tokens, groups), sideCount: sides.length };
}

const preparedNames = new Map<string, Name>();
/** Stored names recur across searches, so their normalization is shared, bounded and evicted oldest first. */
function candidateName(value: string, locale: string): Name {
  const key = `${locale}|${value}`;
  let name = preparedNames.get(key);
  if (!name) {
    name = prepareCandidate(value, locale);
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
  const sameStart = left[0] === right[0];
  // A three-letter abbreviation of a four-letter word drops one letter: "Cty" → City, "Twn" → Town.
  if (shorter < 4) return left.length === 3 && right.length === 4 && sameStart && isSubsequence(left, right) ? 560 + 75 : 0;
  // A word that runs on past the other by three letters or more holds another word, not a slip: "ManchesterUtd" is no
  // misspelling of "Manchester".
  if (longer - shorter >= 3 && (query.value.startsWith(candidate.value) || candidate.value.startsWith(query.value))) return 0;
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
  const queryLength = query.characters.length, ratio = queryLength / candidate.characters.length;
  // A word still being typed matches as a prefix of any length and nothing else; never of a number or age group, so
  // "Manchester U" is no "Manchester City U19".
  if (query.partial) return !candidate.numeric && candidate.value.startsWith(query.value) ? 760 + Math.round(140 * ratio) : 0;
  // Ages, divisions, years and identifiers must never drift to a neighboring number.
  if (query.numeric || candidate.numeric) return 0;
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

type Found = Readonly<{ score: number; covered: number; direct: number }>;
/** A reading kept as a similar result rather than a direct one. */
const demote = (found: Found): Found => ({ score: Math.max(1, Math.min(699, Math.round(found.score * 0.72))), covered: found.covered, direct: 0 });
/** Numbers, Roman numerals and single letters mark divisions and groups. */
const isMarker = (item: Token) => item.numeric || item.characters.length === 1;

/** Every query word matches its own word of the name. A name that keeps another division marker beside the matched one
 * is a different competition, so it is a similar result: "Division 2" is no "Tercera División RFEF - Group 2" and
 * "Serie A" no "Serie C - Girone A". */
function wordMatch(query: readonly Token[], candidate: readonly Token[], full: number): Found | null {
  if (!query.length || query.length > candidate.length || query.length > maximumQueryTokens || candidate.length > maximumCandidateTokens) return null;
  const extra = (candidate.length - query.length) / candidate.length;
  const values = new Set(candidate.map((item) => item.value));
  let found: Found, leftover: readonly Token[];
  if (query.every((item) => values.has(item.value) || item.alternates.some((alternate) => values.has(alternate.value)))) {
    found = { score: query.length === candidate.length ? 940 : 900 - Math.round(100 * extra), covered: full, direct: full };
    leftover = candidate.filter((word) => !query.some((item) => item.value === word.value || item.alternates.some((alternate) => alternate.value === word.value)));
  } else {
    const weights = query.map((item) => candidate.map((word) => tokenScore(item, word, true)));
    if (weights.some((row) => !row.some(Boolean))) return null;
    const columns = assign(weights);
    if (columns.some((column) => column < 0)) return null;
    const scores = columns.map((column, row) => weights[row]![column]!);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const direct = scores.reduce((mask, score, index) => score >= footballSearchTiers.exact ? mask | 1 << index : mask, 0);
    // Literal word prefixes stay direct (700–799); any corrected word makes the whole name a similar result (1–699).
    found = { score: direct === full ? 700 + Math.round((average - 700) / 4) + Math.round(24 * (1 - extra))
      : Math.max(1, Math.min(699, Math.round(average * 0.72) - Math.round(40 * extra))), covered: full, direct };
    leftover = candidate.filter((_, index) => !columns.includes(index));
  }
  // A half-typed letter marks a division only once it is a whole word of the name ("Serie A", not "Real M").
  const marked = query.some((item) => isMarker(item) && (!item.partial || values.has(item.value)));
  return marked && leftover.some((item) => isMarker(item) || divisionWords.has(item.value)) ? demote(found) : found;
}

/** A name mentioned inside a longer query: "Barcelona" in "Barcelona vs Real Madrid", "Bayern" for "Bayern München".
 * - A leftover word of the name must be generic, a number or filler, unless the mention matched a distinctive word of
 *   the name directly: "Leeds United" is no mention of "United" and "Costa Rica" none of "rice", but "Bayern München"
 *   is one of "Bayern".
 * - A leftover generic word may not stand against an unmatched qualifier on the same side of the query, nor a leftover
 *   number against an unmatched number: "Manchester City" is no mention of "Manchester United", nor "League 2" of
 *   "League 1", while "Boca Juniors" is one of "Boca vs Racing".
 * - The covered words must be whole alias groups: "Germany" mentions nothing of "psg" (paris saint germain).
 * Word fragments are not mentions. */
function mentionMatch(query: QueryName, candidate: Name): Found | null {
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
  // Only the side of the query this name answers can contradict it.
  const anchors = pairs.filter(([, column]) => isDistinctive(names[column]!));
  const sides = (anchors.length ? anchors : pairs).reduce((bits, [row]) => bits | words[row]!.sides, 0);
  const unmatched = words.flatMap((item, index) => !matchedWords.has(index) && (item.sides & sides) !== 0 ? [index] : []);
  if (leftover.some((item) => !item.generic && !item.numeric) &&
    !pairs.some(([row, column]) => isDistinctive(names[column]!) && weights[row]![column]! >= footballSearchTiers.exact)) return null;
  if (leftover.some((item) => item.generic && !item.numeric) && unmatched.some((index) => query.qualifierLike[index])) return null;
  if (leftover.some((item) => item.numeric) && unmatched.some((index) => words[index]!.numeric)) return null;
  let covered = 0, direct = 0, total = 0;
  for (const [row, column] of pairs) {
    const score = weights[row]![column]!;
    covered |= 1 << row;
    if (score >= footballSearchTiers.exact) direct |= 1 << row;
    total += score;
  }
  const whole = query.groups.reduce((mask, group) => (covered & group) === group ? mask | group : mask, 0);
  if (whole !== covered) return null;
  const coverage = matchedWords.size / words.length, average = total / pairs.length;
  const score = Math.max(1, Math.min(649, Math.round(200 + 300 * coverage * average / 1000) - Math.round(30 * leftover.length / names.length)));
  return { score, covered, direct };
}

function matchName(query: QueryName, candidate: Name): Found | null {
  if (!query.normalized || !candidate.normalized || !query.tokens.length || !candidate.tokens.length) return null;
  const whole = (score: number) => ({ score, covered: query.full, direct: query.full });
  if (query.normalized === candidate.normalized) return whole(1000);
  // One name never answers two teams a query set apart: "Inter Milano W" is no exact result for "Inter vs Milan".
  const apart = query.sideCount > 1;
  if (!apart && query.canonical === candidate.canonical) return whole(970);
  if (!apart && candidate.joins.includes(query.joined)) return whole(930);
  let best: Found | null = !apart && query.tokens.length === 1 && query.joined.length >= 3 && query.joined.length <= 6 &&
    query.joined === candidate.initials ? whole(870) : null;
  const words = wordMatch(query.tokens, candidate.tokens, query.full);
  if (words && words.score > (best?.score ?? 0)) best = words;
  const raw = wordMatch(query.raw, candidate.raw, 2 ** query.raw.length - 1);
  if (raw && raw.score > (best?.score ?? 0)) best = { ...whole(raw.score), direct: raw.score >= footballSearchTiers.exact ? query.full : 0 };
  return best ? apart ? demote(best) : best : mentionMatch(query, candidate);
}

const bitCount = (mask: number) => { let count = 0; for (let value = mask; value; value &= value - 1) count++; return count; };
/** The better reading of a name: more query words covered, then higher relevance. */
const better = (left: Found | null, right: Found | null) => !right ? left : !left ? right
  : bitCount(right.covered) > bitCount(left.covered) || bitCount(right.covered) === bitCount(left.covered) && right.score > left.score ? right : left;

function prepareQuery(value: string, locale: string): QueryName {
  const phrases = new Map<string, readonly string[]>();
  const name = prepareQueryName(value, locale, phrases);
  // A very long query keeps its first words, one mask bit each, so a long list of teams still finds them.
  const tokens = name.tokens.slice(0, maximumQueryTokens), full = 2 ** tokens.length - 1;
  // Generic words, numbers, club words and one- or two-letter words never name a team. Words that resemble a generic
  // word ("Untd", "Cty", "Unitited", but also "Reading" or "Inter") are ambiguous until a searched name confirms them.
  const plain = tokens.map((item) => item.generic || item.numeric || item.literal || item.partial || item.characters.length <= 2);
  const resembling = tokens.map((item, index) => !plain[index] && genericTokens.some((word) =>
    item.characters.length >= 3 && word.value.startsWith(item.value) || similarity(item, word) > 0));
  const mask = (flags: readonly boolean[]) => flags.reduce((bits, flag, index) => flag ? bits | 1 << index : bits, 0);
  const groups = name.groups.map((group) => group & full).filter(Boolean);
  // An expanded alias names one team even when its words are generic ("man city" → manchester city); a mention covers
  // such a group whole or not at all, so its words may count as distinctive.
  const aliased = groups.reduce((bits, group) => group & group - 1 ? bits | group : bits, 0);
  return { ...name, tokens, groups, phrases,
    qualifierLike: tokens.map((item, index) => plain[index] && !item.numeric || resembling[index]!), full,
    distinctive: mask(tokens.map((_, index) => !plain[index] && !resembling[index])) | aliased, ambiguous: mask(resembling) & ~aliased };
}

/** Matched words stand on their own when they are all the query's words or include a distinctive one: "Leeds" answers
 * "Leeds United" and "Barcelona" answers "Barcelona vs Real Madrid" as similar results, while a name matched only by
 * qualifiers ("Racing United" for "Manchester United") never stands. Feed records apply the same rule to the words
 * their teams and competition cover together. */
function mentionStands(covered: number, full: number, distinctive: number): boolean {
  return covered === full || (covered & distinctive) !== 0;
}

/** Prepare once per search. Candidate memoization is local and bounded; equal scores retain the caller's stable secondary order. */
export function prepareFootballSearch(query: string, locale: string = defaultLocale): PreparedFootballSearch {
  const prepared = prepareQuery(query, locale), cache = new Map<string, FootballSearchMatch | null>();
  const match = (candidate: string): FootballSearchMatch | null => {
    if (cache.has(candidate)) return cache.get(candidate)!;
    const name = candidateName(candidate, locale);
    let found = matchName(prepared, name);
    // A stored name containing a phrase the query expanded ("PSG U19" for "psg u19 matches") is read the same way.
    const words = ` ${name.normalized} `;
    if (prepared.phrases.size && [...prepared.phrases.keys()].some((phrase) => words.includes(` ${phrase} `))) {
      found = better(found, matchName(prepared, prepareCandidate(candidate, locale, prepared.phrases)));
    }
    let result: FootballSearchMatch | null = null;
    if (found) {
      const names = new Set(name.tokens.filter(isDistinctive).map((item) => item.value));
      const named = prepared.tokens.reduce((bits, item, index) => names.has(item.value) ? bits | 1 << index : bits, 0) & found.covered;
      result = Object.freeze({ ...found, named });
    }
    if (cache.size >= candidateCacheSize) cache.delete(cache.keys().next().value!);
    cache.set(candidate, result);
    return result;
  };
  return Object.freeze({
    normalized: prepared.normalized,
    tokens: Object.freeze(prepared.tokens.map((item) => item.value)),
    distinctive: prepared.distinctive,
    ambiguous: prepared.ambiguous,
    match,
    score(candidate: string, named?: number): number {
      const found = match(candidate);
      if (!found) return 0;
      const distinctive = prepared.distinctive | prepared.ambiguous & (named ?? found.named);
      return mentionStands(found.covered, prepared.full, distinctive) ? found.score : 0;
    },
  });
}

/** Prefer prepareFootballSearch when scoring a collection of team, competition, country or stored alias names. */
export function footballSearchScore(query: string, candidate: string, locale: string = defaultLocale): number {
  return prepareFootballSearch(query, locale).score(candidate);
}
