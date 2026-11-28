import { startRequestDeadline } from "../../domain/request-deadline.ts";
import { authCopy } from "../../i18n/messages/auth.ts";

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

function loginFailure(response: Response): string | null {
  if (response.status === 401) return authCopy.loginInvalidCredentials;
  if (response.status >= 500) return authCopy.loginServiceUnavailable;
  if (response.status !== 429) return null;
  const header = response.headers.get("retry-after");
  const seconds = !header ? NaN : /^\d+$/u.test(header) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return "Too many attempts. Please wait before trying again.";
  return `Too many attempts. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}

/** Bound account writes without retrying them: a timed-out request may already have reached the server. */
export async function accountRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  try {
    const response = await fetch(`/api/account/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const failure = path === "login" ? loginFailure(response) : null;
    if (failure) {
      void response.body?.cancel().catch(() => {});
      throw new AccountRequestError(failure, response.status);
    }
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
    if (controller.signal.aborted) throw new Error(path === "login" ? "The login request took too long. Try again."
      : "This request took too long. Check your connection and try again.");
    if (failure instanceof TypeError) throw new Error(path === "login" ? "Couldn't connect. Check your internet connection and try again." : unavailable);
    throw failure;
  } finally {
    clearDeadline();
  }
}
