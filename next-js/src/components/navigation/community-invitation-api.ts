import { startRequestDeadline } from "../../domain/request-deadline.ts";

type CommunityAction = { action: "status" } | { action: "reconcile"; accountKey: string }
  | { action: "claim" | "attempt" | "yes" | "no"; accountKey: string; attemptId: string };

type CommunityResult = { status: "ok"; accountKey: string; joined: boolean; invited: boolean }
  | { status: "denied" | "stale" | "unavailable" };

export async function postCommunityAction(action: CommunityAction, keepalive = false): Promise<CommunityResult> {
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  try {
    const response = await fetch("/api/account/community", {
      method: "POST", cache: "no-store", credentials: "same-origin", keepalive, signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(action),
    });
    if (response.status === 401 || response.status === 403) return { status: "denied" };
    if (response.status === 409) return { status: "stale" };
    if (!response.ok) return { status: "unavailable" };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("accountKey" in body) || typeof body.accountKey !== "string" || !body.accountKey
      || !("joined" in body) || typeof body.joined !== "boolean" || "accountKey" in action && body.accountKey !== action.accountKey
      || action.action === "claim" && (!("invited" in body) || typeof body.invited !== "boolean")) return { status: "unavailable" };
    return { status: "ok", accountKey: body.accountKey, joined: body.joined,
      invited: "invited" in body && body.invited === true };
  } catch { return { status: "unavailable" }; }
  finally { clearDeadline(); }
}
