/**
 * Short team labels for the phone match card, which always shows abbreviations: the provider team code when the
 * fixture carries a valid one, otherwise a derived three-letter abbreviation. Provider codes arrive through the
 * spare-quota team-code import, so many teams have none for a while (small clubs, youth and women's sides often never
 * get one). Full names stay in the card's heading, hidden text and tooltips.
 *
 * `teamAbbreviation(name)` is deterministic and locale-independent:
 *
 * 0. A national side, a name that is exactly a country once women's, reserve and youth qualifiers go, takes the
 *    country's FIFA code from domain `country-code` ("New Zealand W" → NZL, "Brazil U20" → BRA, "Saudi Arabia" → KSA,
 *    "Korea Republic" → KOR). Clubs never match: their names carry more than a country ("FC Andorra" → AND by step 4).
 * 1. Normalize: NFKD with combining marks dropped (accents stripped), letters that do not decompose transliterated
 *    (Ø→O, Æ→AE, Œ→OE, ß→SS, Ł→L, Đ/Ð→D, Þ→TH, ı→I), uppercase. A leading elided article goes ("d'Ivoire" → IVOIRE);
 *    other apostrophes and dots join their word ("Newell's" → NEWELLS, "F.C." → FC, "St." → ST); any other character
 *    separates words ("Bodø/Glimt" → BODO GLIMT, "Al-Nassr" → AL NASSR, "Saint-Étienne" → SAINT ETIENNE).
 * 2. Drop words that do not name the club: club-type tokens (FC, CF, SC, AFC, CD, AC, CA, SL, FK, and the other
 *    entries of `clubTokens`), women's, reserve and youth qualifiers (W, Women, Femenino, II, B, Reserves, U21, U-19,
 *    Sub-20…), articles and linking words (de, del, da, do, la, el, los, the, of, al…) and words without a letter
 *    ("1.", "04", "1899"), and Portuguese "os".
 * 3. When the first remaining word is a common prefix (Real, Atlético, Deportivo, Sporting, Club, Racing, Union, Inter,
 *    Dynamo, Dinamo, Olympique, Borussia, Saint, San, Santa, São, Hapoel, Maccabi… see `prefixes`) and another word
 *    follows, the abbreviation is the prefix's initial plus the first two letters of the next word: Real Madrid → RMA,
 *    Atletico Tucuman → ATU, Sporting CP → SCP, Deportivo La Coruña → DCO.
 *    A lone initial goes too while a longer word remains ("A. Italiano" → ITALIANO).
 * 4. Otherwise it is the first three letters of the first remaining word, continuing into the next word when that word
 *    is shorter: Platense FC → PLA, Juticalpa → JUT, Boca Juniors → BOC, Al Hilal → HIL, AZ Alkmaar → AZA. Fewer than
 *    three letters in all are followed by the name's numbers ("B 93" → B93, "TP-47" → TP4).
 * 5. When step 2 leaves nothing, the dropped words are used instead ("FC 105" → FC1). A name without Latin letters
 *    keeps its first three letters as written. An empty or missing name has no abbreviation ("").
 *
 * `cardTeamAbbreviations(home, away)` applies codes first and guarantees the two labels of one card differ.
 *
 * The module also holds the Manrope Bold widths the card budgets its bold labels with: team labels and the market
 * and pick chips (`boldWidthEm`, `abbreviationSlotEm`, `chipSlotEm`).
 */

import { fifaCountryCode } from "./country-code.ts";

/** A stored provider team code as published: 2–5 ASCII capital letters or digits. */
export const teamCodePattern = /^[A-Z0-9]{2,5}$/u;
/** Before uppercasing, so a letter that uppercases to ASCII ("ß" → "SS") never becomes a code. */
const rawCodePattern = /^[A-Za-z0-9]{2,5}$/u;

/** Club-type tokens, compared without dots ("F.C." is FC). They describe the organization, not the club. */
const clubTokens: ReadonlySet<string> = new Set([
  "FC", "CF", "SC", "AFC", "CD", "AC", "CA", "SL", "FK",
  "ACF", "AD", "AS", "AJ", "BK", "BSC", "CR", "CS", "EC", "FBC", "FF", "FSV", "GNK", "HNK", "IF", "IFK", "IK", "IL",
  "KRC", "KV", "NK", "OFK", "OGC", "PFC", "RB", "RC", "RCD", "SD", "SE", "SK", "SPVGG", "SS", "SSC", "SV", "TSV", "UD",
  "US", "VFB", "VFL",
]);
/** Women's, reserve and youth qualifiers; age groups ("U21", "U-19", "Sub-20") are matched by `agePattern`. */
const qualifiers: ReadonlySet<string> = new Set([
  "W", "WOMEN", "WOMENS", "LADIES", "FEMENINO", "FEMININO", "FEMININE", "FEMININ", "FEM", "FRAUEN", "DAMES", "DAMEN",
  "DAM", "KVINNER", "II", "III", "B", "RESERVE", "RESERVES", "RES", "YOUTH",
]);
const agePattern = /(?:^|[\s-])(?:U|SUB)-?\d{2}(?=$|[\s-])/gu;
/** Articles and linking words. */
const stopwords: ReadonlySet<string> = new Set([
  "DE", "DEL", "DA", "DO", "DAS", "DOS", "DI", "DU", "DES", "LA", "LE", "LES", "EL", "LOS", "LAS", "THE", "OF", "Y",
  "E", "ET", "AND", "UND", "AL", "OS",
]);
/** Words that lead many club names; the next word tells the clubs apart. */
const prefixes: ReadonlySet<string> = new Set([
  "REAL", "ATLETICO", "ATL", "ATHLETICO", "DEPORTIVO", "DEP", "DEPORTES", "SPORTING", "CLUB", "RACING", "UNION", "INTER",
  "DYNAMO", "DINAMO", "OLYMPIQUE", "BORUSSIA", "SAINT", "ST", "SAN", "SANTA", "SAO", "HAPOEL", "MACCABI", "BEITAR",
  "BNEI", "IRONI", "LOKOMOTIV", "LOKOMOTIVA", "SPARTAK", "UNIVERSIDAD", "UNIVERSITATEA",
]);
const transliterations: Readonly<Record<string, string>> = {
  Ø: "O", Æ: "AE", Œ: "OE", Ł: "L", Đ: "D", Ð: "D", Þ: "TH", Ħ: "H", Ŧ: "T", ẞ: "SS",
};

type Words = { significant: readonly string[]; numbers: string };

function words(name: string): Words | null {
  const upper = name.normalize("NFKD").replace(/\p{M}+/gu, "").toUpperCase()
    .replace(/[ØÆŒŁĐÐÞĦŦẞ]/gu, (letter) => transliterations[letter]!)
    .replace(agePattern, " ");
  const all: string[] = [];
  let numbers = "";
  for (const raw of upper.split(/[^\p{L}\p{N}'’.]+/u)) {
    const word = raw.replace(/^[DL]['’](?=\p{L})/u, "").replace(/[^A-Z0-9]/gu, "");
    if (/[A-Z]/u.test(word)) all.push(word);
    else numbers += word;
  }
  if (all.length === 0) return null;
  const named = all.filter((word) => !clubTokens.has(word) && !qualifiers.has(word) && !stopwords.has(word));
  // A lone initial ("A. Italiano") goes while a longer word remains.
  const longer = named.filter((word) => word.length > 1);
  return { significant: longer.length > 0 ? longer : named.length > 0 ? named : all, numbers };
}

function primary({ significant, numbers }: Words): string {
  const [first, ...rest] = significant;
  const form = prefixes.has(first!) && rest.length > 0 ? first![0]! + rest.join("").slice(0, 2) : significant.join("").slice(0, 3);
  // Too few letters: the name's numbers fill in ("B 93" → B93, "TP-47" → TP4).
  return (form + numbers).slice(0, 3);
}

/** Step 0: the FIFA code of a name that is exactly a country after its trailing qualifiers go, else null. "World"
 * (API-Football's international pseudo-country, INT) names no side. */
function nationalCode(name: string): string | null {
  const parts = name.toUpperCase().replace(agePattern, " ").split(/\s+/u).filter(Boolean);
  while (parts.length > 1 && qualifiers.has(parts.at(-1)!.replace(/[^A-Z]/gu, ""))) parts.pop();
  const code = parts.length > 0 ? fifaCountryCode(parts.join(" ")) : null;
  return code === "INT" ? null : code;
}

/** The derived abbreviation (see the module rules); "" for a name without letters or digits. */
export function teamAbbreviation(name: string | null | undefined): string {
  if (typeof name !== "string") return "";
  const national = nationalCode(name);
  if (national) return national;
  const parsed = words(name);
  if (parsed) return primary(parsed);
  return (name.normalize("NFC").match(/[\p{L}\p{N}]/gu) ?? []).slice(0, 3).join("").toUpperCase();
}

/**
 * Three-letter forms of a name for separating two sides that read the same, one per rule so that step k means the same
 * rule on both sides: 0, the label `teamAbbreviation` gives; 1, the first word's initial plus two letters of the second word
 * (Manchester United → MUN, Manchester City → MCI); 2, the second word's first three letters (Stade Rennais → REN);
 * 3, the initials of the first three words; 4, the first word's first two letters plus its last ("first and last
 * letters": Bocholt → BOT); then every form that keeps the name's first letter followed by two later letters in order.
 * A rule that does not apply (a one-word name has no second word) repeats the primary form, so that side stays put.
 */
function forms(name: string | null | undefined): readonly string[] {
  const parsed = typeof name === "string" ? words(name) : null;
  const base = teamAbbreviation(name);
  if (!parsed) return [base];
  const { significant } = parsed;
  const [first, second, third] = significant as [string, string?, string?];
  const list = [base,
    second ? first[0]! + second.slice(0, 2) : base,
    second && second.length >= 3 ? second.slice(0, 3) : base,
    second && third ? first[0]! + second[0]! + third[0]! : base,
    first.length >= 3 ? first.slice(0, 2) + first.at(-1)! : base];
  const joined = significant.join("");
  for (let middle = 1; middle < joined.length && list.length < 64; middle += 1) {
    for (let last = middle + 1; last < joined.length && list.length < 64; last += 1) list.push(joined[0]! + joined[middle]! + joined[last]!);
  }
  return list;
}

/** Manrope Bold (700) advance widths in em for the characters card labels use, kerning ignored (from the brand font
 * file, assets/brand/source/fonts/Manrope-wght.ttf at wght 700). */
const boldAdvances: Readonly<Record<string, number>> = {
  A: 0.671, B: 0.631, C: 0.738, D: 0.7, E: 0.585, F: 0.524, G: 0.732, H: 0.721, I: 0.281, J: 0.5, K: 0.647, L: 0.533,
  M: 0.855, N: 0.718, O: 0.75, P: 0.638, Q: 0.75, R: 0.66, S: 0.658, T: 0.607, U: 0.72, V: 0.641, W: 0.976, X: 0.655,
  Y: 0.612, Z: 0.663, 0: 0.658, 1: 0.438, 2: 0.596, 3: 0.582, 4: 0.608, 5: 0.586, 6: 0.621, 7: 0.533, 8: 0.612, 9: 0.621,
  a: 0.576, b: 0.616, c: 0.576, d: 0.617, e: 0.602, f: 0.378, g: 0.616, h: 0.625, i: 0.281, j: 0.288, k: 0.538, l: 0.281,
  m: 0.899, n: 0.625, o: 0.618, p: 0.616, q: 0.617, r: 0.399, s: 0.541, t: 0.433, u: 0.625, v: 0.553, w: 0.802, x: 0.554,
  y: 0.559, z: 0.533, " ": 0.2, "/": 0.433, ".": 0.303,
};
/** The phone card's label slot, in em of the label's type: it holds 99.5% of derived abbreviations at full size. */
export const abbreviationSlotEm = 2.375;
/** The card sets wider labels (WOH, MUM, RWW, most 4–5 character codes) at 90%; every derived abbreviation then fits. */
export const tightAbbreviationScale = 0.9;
/**
 * Phone card chip slots, in em of the chip type (Manrope Bold), so every card's chips line up in columns as in the
 * owner's reference: the widest market code ("O/U 2.5", 3.59em); the widest code once phones under 390px hide the goal
 * line ("BTTS", 2.50em); the widest pick ("Under", 2.96em); and, for 320–359px phones, where chips keep their own
 * widths, the widest code-and-pick pair of one family ("O/U" + "Under", 4.87em). tests/match-card.test.mjs checks
 * every market code and pick against them.
 */
export const chipSlotEm = { market: 3.6, shortMarket: 2.51, pick: 2.97, shortPair: 4.87 } as const;

/** A text's width in em at Manrope Bold; a character outside the table counts as 1em, so unknown text reads wide. */
export function boldWidthEm(text: string): number {
  let width = 0;
  for (const character of text) width += boldAdvances[character] ?? 1;
  return width;
}

/** A team label's width in em at Manrope Bold (`boldWidthEm`); non-Latin labels read wide. */
export const abbreviationWidthEm = boldWidthEm;

/** A provider team code, when it is 2–5 ASCII letters or digits after trimming (returned uppercase); anything else,
 * including a non-string, is null. Read paths store this form, and the phone card re-checks it before display. */
export function validTeamCode(code: unknown): string | null {
  const value = typeof code === "string" ? code.trim() : "";
  return rawCodePattern.test(value) ? value.toUpperCase() : null;
}

export type CardTeam = { name: string | null | undefined; code?: string | null | undefined };

/**
 * The two labels for one card: each side's valid provider code, else its derived abbreviation. When both read the
 * same, a side with a code keeps it and each derived side takes the same rule of its `forms` at each step, so
 * Manchester United v Manchester City reads MUN v MCI (not MAN v MCI) and Real Madrid v Real Madrid Castilla reads
 * RMA v RMC. If no step separates them (identical names), the first differing pair of forms is used; as a last resort
 * (identical codes, or a name too short to vary) the away label's final character becomes a digit. A side without a
 * name or code is "" and never forces the other to change.
 */
export function cardTeamAbbreviations(home: CardTeam, away: CardTeam): { home: string; away: string } {
  const homeCode = validTeamCode(home.code), awayCode = validTeamCode(away.code);
  const homeLabel = homeCode ?? teamAbbreviation(home.name), awayLabel = awayCode ?? teamAbbreviation(away.name);
  if (homeLabel !== awayLabel || homeLabel === "") return { home: homeLabel, away: awayLabel };
  const homeForms = homeCode ? [homeCode] : forms(home.name), awayForms = awayCode ? [awayCode] : forms(away.name);
  const at = (list: readonly string[], step: number) => list[step] ?? list[0]!;
  for (let step = 1; step < Math.max(homeForms.length, awayForms.length); step += 1) {
    const left = at(homeForms, step), right = at(awayForms, step);
    if (left !== right) return { home: left, away: right };
  }
  for (const left of homeForms) for (const right of awayForms) if (left !== right) return { home: left, away: right };
  const padded = awayLabel.padEnd(3, awayLabel.at(-1)!);
  return { home: homeLabel, away: padded.slice(0, -1) + (padded.endsWith("2") ? "3" : "2") };
}
