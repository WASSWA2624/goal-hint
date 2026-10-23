/** Client-only account identity. Public page HTML and browser storage never contain the phone. */
let phone: string | null = null;
let administrator = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const getMemberSessionSnapshot = (): string | null => phone;
export const getServerMemberSessionSnapshot = (): null => null;
export const getAdminSessionSnapshot = (): boolean => administrator;
export const getServerAdminSessionSnapshot = (): false => false;

/** Desktop and phone headers share one in-flight request, including React's development remounts. */
export function refreshMemberSession(): Promise<void> {
  if (pending) return pending;
  pending = Promise.resolve().then(async () => {
    try {
      const response = await fetch("/api/account/session", {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const session: unknown = await response.json();
      if (!session || typeof session !== "object" || !("phone" in session) ||
        session.phone !== null && typeof session.phone !== "string") return;
      const nextAdministrator = "administrator" in session && session.administrator === true;
      if (phone === session.phone && administrator === nextAdministrator) return;
      phone = session.phone;
      administrator = nextAdministrator;
      for (const listener of listeners) listener();
    } catch { /* A temporary network failure preserves the last confirmed identity. */ }
    finally { pending = null; }
  });
  return pending;
}

const recheckSession = () => { void refreshMemberSession(); };
const onRestore = (event: PageTransitionEvent) => { if (event.persisted) recheckSession(); };

export function subscribeMemberSession(listener: () => void): () => void {
  const browser = window;
  listeners.add(listener);
  if (listeners.size === 1) {
    browser.addEventListener("focus", recheckSession);
    browser.addEventListener("pageshow", onRestore);
    recheckSession();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    browser.removeEventListener("focus", recheckSession);
    browser.removeEventListener("pageshow", onRestore);
  };
}
