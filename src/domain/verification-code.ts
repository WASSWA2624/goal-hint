/** A copied code is one complete value, never digits extracted from a message or a longer number. */
export function parseVerificationCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const code = value.trim();
  return /^[0-9]{6}$/u.test(code) ? code : null;
}
