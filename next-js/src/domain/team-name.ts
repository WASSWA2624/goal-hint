/**
 * Provider team codes (API-Football `team.code`, such as "MUN" or "B04"), stored by the spare-quota team-code import
 * and published on fixture snapshot teams. Match cards never display them: the owner asked for full team names on
 * every card, so codes stay data for other surfaces. The snapshot schema checks the stored form (`teamCodePattern`)
 * and the feed and detail read normalizes what the catalog holds (`validTeamCode`).
 */

/** A stored provider team code as published: 2–5 ASCII capital letters or digits. */
export const teamCodePattern = /^[A-Z0-9]{2,5}$/u;
/** Before uppercasing, so a letter that uppercases to ASCII ("ß" → "SS") never becomes a code. */
const rawCodePattern = /^[A-Za-z0-9]{2,5}$/u;

/** A provider team code, when it is 2–5 ASCII letters or digits after trimming (returned uppercase); anything else,
 * including a non-string, is null. Read paths store this form. */
export function validTeamCode(code: unknown): string | null {
  const value = typeof code === "string" ? code.trim() : "";
  return rawCodePattern.test(value) ? value.toUpperCase() : null;
}
