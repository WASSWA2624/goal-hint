export const contactPageRules = Object.freeze({ emailMaxLength: 254 });

// A public mailbox uses one ASCII dot-atom address, never a display name, URI or mail header.
const emailPattern = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/u;

export function parseContactPageEmail(input: unknown): Readonly<{ ok: true; email: string | null }> | Readonly<{ ok: false; error: string }> {
  if (input === null || input === "") return { ok: true, email: null };
  if (typeof input !== "string") return { ok: false, error: "Enter a valid email address, or leave it blank." };
  const email = input.trim();
  if (!email) return { ok: true, email: null };
  if (email.length > contactPageRules.emailMaxLength || email.indexOf("@") > 64 || !emailPattern.test(email)) {
    return { ok: false, error: "Enter one valid email address, without a link or message details." };
  }
  return { ok: true, email };
}

/** Escape mailbox punctuation so a valid address cannot add mailto query parameters or fragments. */
export function contactPageEmailHref(email: string): string { return `mailto:${encodeURIComponent(email).replace("%40", "@")}`; }
