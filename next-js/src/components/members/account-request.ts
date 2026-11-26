import { startRequestDeadline } from "../../domain/request-deadline.ts";
import { logoutUnconfirmedStatus } from "../../domain/member-navigation.ts";
import { authCopy } from "../../i18n/messages/auth.ts";

export type MemberLogoutAction = "/api/account/sign-out" | `/api/account/sign-out?${string}` | "/api/admin/logout";

const unavailable = "Unable to complete this request. Please try again.";
const navigationActions = new Set(["login", "register", "verify", "reset-code", "reset", "phone", "password"]);

export class AccountRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function localDestination(value: unknown): value is string {
  return typeof value === "string" && /^\/(?!\/)[^\\\s\p{Cc}]*$/u.test(value);
}

/** Bound account writes without retrying them: a timed-out request may already have reached the server. */
export async function accountRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  try {
    const response = await fetch(`/api/account/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const result: unknown = await response.json().catch(failure => {
      if (failure instanceof TypeError) throw failure;
      return null;
    });
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error(unavailable);
    if (!response.ok) throw new AccountRequestError("message" in result && typeof result.message === "string" ? result.message : unavailable, response.status);
    if (navigationActions.has(path) && !("next" in result && localDestination(result.next))) throw new Error(unavailable);
    return result as T;
  } catch (failure) {
    if (controller.signal.aborted) throw new Error("This request took too long. Check your connection and try again.");
    if (failure instanceof TypeError) throw new Error(path === "login" ? "Couldn't connect. Check your internet connection and try again." : unavailable);
    throw failure;
  } finally {
    clearDeadline();
  }
}

/** A handled storage failure clears the browser cookies and leads to the server's warning. */
export async function requestMemberLogout(action: MemberLogoutAction): Promise<string> {
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  try {
    const response = await fetch(action, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal: controller.signal });
    const result: unknown = await response.json();
    if (!controller.signal.aborted && result && typeof result === "object" && "phone" in result && result.phone === null
      && "next" in result && localDestination(result.next)
      && (response.ok || response.status === 503 && "error" in result && result.error === logoutUnconfirmedStatus)) return result.next;
    throw new Error(authCopy.logoutUnavailable);
  } finally { clearDeadline(); }
}
