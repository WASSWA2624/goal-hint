/**
 * Display forms of a team name for tight spots such as phone match cards. The full name always comes first; a
 * provider code or a shortened name only stands in when the full name does not fit (the component measures), and an
 * ellipsis is the last resort. Provider codes arrive through the spare-quota team-code import, so many teams have
 * none for a while (small clubs, youth and women's sides often never get one). For them, shortening is deliberately
 * minimal: it only swaps in forms fans already read as the same club, and never drops a word.
 *
 * 1. Whitespace collapses and the name is NFC-normalized.
 * 2. "Manchester United/City" → "Man Utd/City".
 * 3. "United" → "Utd" and "Athletic" → "Ath" when they follow another word ("Leeds Utd", "Wigan Ath"), but not when
 *    they lead ("United Arab Emirates", "Athletic Club") or follow a club token ("FC United of Manchester").
 * 4. "Saint" → "St" ("St Mirren", "St-Étienne").
 *
 * Club tokens (FC, CF, SC, CD, AFC, FK…) are never removed: what remains is often a city, a country or another
 * club's name ("Andorra CF", "Hong Kong FC", "Internacional SC", "CD Olimpia"), or an adjective ("Chemnitzer FC").
 * Qualifiers (II, B, U21, W, Women, Reserves) and club prefixes (AC Milan, AS Roma) are never touched either.
 */

const clubTokens: ReadonlySet<string> = new Set(["FC", "CF", "AFC", "SC", "FK", "CD"]);
/** A stored provider team code as published: 2–5 ASCII capital letters or digits. */
export const teamCodePattern = /^[A-Z0-9]{2,5}$/u;
/** Before uppercasing, so a letter that uppercases to ASCII ("ß" → "SS") never becomes a code. */
const rawCodePattern = /^[A-Za-z0-9]{2,5}$/u;

function normalize(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function isClubToken(token: string): boolean {
  // Dotted forms count too: "F.C.", "A.F.C.", "C.D.".
  return /^(?:[A-Za-z]\.?){2,3}$/u.test(token) && clubTokens.has(token.replaceAll(".", "").toUpperCase());
}

function widelyUsedForm(token: string, index: number, tokens: readonly string[]): string {
  if (/^Manchester$/iu.test(token) && /^(?:United|Utd|City)$/iu.test(tokens[index + 1] ?? "")) return "Man";
  const follows = index > 0 && !isClubToken(tokens[index - 1]!);
  if (follows && /^United$/iu.test(token)) return "Utd";
  if (follows && /^Athletic$/iu.test(token)) return "Ath";
  return token.replace(/^Saint(?=-|$)/iu, "St");
}

/** The shortened name (see the module rules); returns the normalized name when no rule applies. */
export function shortTeamName(name: string): string {
  const tokens = normalize(name).split(" ").filter(Boolean);
  return tokens.map(widelyUsedForm).join(" ");
}

/** A provider team code, when it is 2–5 ASCII letters or digits after trimming (returned uppercase); anything else,
 * including a non-string, is null. Read paths store this form, and the phone card re-checks it before display. */
export function validTeamCode(code: unknown): string | null {
  const value = typeof code === "string" ? code.trim() : "";
  return rawCodePattern.test(value) ? value.toUpperCase() : null;
}

/**
 * Ordered display candidates for a fitter: the full name, then the code (when valid), then the shortened name (when
 * it differs). Duplicates are dropped, so a single entry means the name has no shorter form.
 */
export function teamDisplayCandidates(name: string, code?: string | null): readonly string[] {
  const full = normalize(name);
  const candidates = [full];
  for (const candidate of [validTeamCode(code), shortTeamName(full)]) {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  }
  return Object.freeze(candidates);
}
