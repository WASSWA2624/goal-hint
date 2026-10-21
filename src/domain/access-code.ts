export const accessCodeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Access periods keep a random code's salted hash (068): the code is never shown, sent or typed, only normalized for hashing. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const code = input.toUpperCase().replace(/[\s-]/gu, "").replace(/O/gu, "0").replace(/[IL]/gu, "1");
  return /^[0-9A-HJKMNP-TV-Z]{12}$/u.test(code) ? code : null;
}
