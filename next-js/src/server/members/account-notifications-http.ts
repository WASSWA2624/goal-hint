import "server-only";
import { notificationCursor, notificationId } from "../../domain/account-notifications.ts";
import { json, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices, memberRoute, type MemberServicesSource } from "./member-http.ts";

export function createAccountNotificationsHandler(action: "read" | "write", services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (member!.blocked || member!.administrator) return json({ error: "forbidden" }, 403);
    if (!resolved.notifications) return json({ error: "unavailable" }, 503);
    if (action === "read") {
      const parameters = new URL(request.url).searchParams, before = parameters.get("before");
      if ([...parameters.keys()].some(key => !["before", "summary"].includes(key)) || parameters.getAll("before").length > 1
        || parameters.getAll("summary").length > 1 || parameters.has("summary") && parameters.get("summary") !== "1"
        || before && !notificationCursor(before)) return json({ error: "invalid" }, 400);
      const page = await resolved.notifications.read(member!, before, parameters.get("summary") === "1");
      return page ? json(page) : json({ error: "forbidden" }, 403);
    }
    let value: unknown;
    try {
      if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid" }, 400);
      const body = await readLimitedBody(request, 1024, { deadlineMs: 15_000 });
      if (!body) return json({ error: "invalid" }, 400);
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch { return json({ error: "invalid" }, 400); }
    if (!value || typeof value !== "object" || Array.isArray(value) || !("action" in value)
      || typeof value.action !== "string" || !["read", "dismiss", "read-all"].includes(value.action)) return json({ error: "invalid" }, 400);
    const data = value as { action: "read" | "dismiss" | "read-all"; id?: unknown };
    if (Object.keys(value).some(key => !["action", "id"].includes(key))
      || data.action === "read-all" && Object.keys(value).length !== 1 || data.action !== "read-all" && !notificationId(data.id)) return json({ error: "invalid" }, 400);
    return await resolved.notifications.update(member!, data.action, data.id) ? json({ status: "saved" }) : json({ error: "not-found" }, 404);
  }, { services, access: "account" });
}
