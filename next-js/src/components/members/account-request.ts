import { startRequestDeadline } from "../../domain/request-deadline.ts";

const unavailable = "Unable to complete this request. Please try again.";
const navigationActions = new Set(["login", "register", "verify", "reset-code", "reset", "phone", "password"]);

function localDestination(value: unknown): value is string {
  return typeof value === "string" && /^\/(?!\/)[^\\\s\p{Cc}]*$/u.test(value);
}

/** Bound account writes without retrying them: a timed-out request may already have reached the server. */
export async function accountRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  try {
    const response = await fetch(`/api/account/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const result: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error(unavailable);
    if (!response.ok) throw new Error("message" in result && typeof result.message === "string" ? result.message : unavailable);
    if (navigationActions.has(path) && !("next" in result && localDestination(result.next))) throw new Error(unavailable);
    return result as T;
  } catch (failure) {
    if (controller.signal.aborted) throw new Error("This request took too long. Check your connection and try again.");
    if (failure instanceof TypeError) throw new Error(unavailable);
    throw failure;
  } finally {
    clearDeadline();
  }
}
