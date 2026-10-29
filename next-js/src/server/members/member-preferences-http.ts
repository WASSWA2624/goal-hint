import "server-only";

import { readJsonBody } from "../admin/admin-http.ts";
import { json } from "../http/private-http.ts";
import { getMemberServices, memberRefusal, memberRoute, type MemberServicesSource } from "./member-http.ts";

/** Only the signed-in recipient can enable or withdraw account-update consent, including while subscriptions are closed. */
export function createMemberPreferencesHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (member!.blocked || member!.administrator) return json({ error: "forbidden", message: memberRefusal }, 403);
    if (!resolved.preferences) return json({ error: "unavailable", message: "Account preferences are unavailable. Try again later." }, 503);
    const read = await readJsonBody(request);
    if ("refusal" in read) return read.refusal;
    if (Object.keys(read.body).length !== 1 || typeof read.body.whatsappNotifications !== "boolean") {
      return json({ error: "invalid", message: "Choose whether to receive WhatsApp account updates." }, 400);
    }
    const outcome = await resolved.preferences.setWhatsAppNotifications(member!, read.body.whatsappNotifications);
    return outcome.status === "saved" ? json(outcome) : json({ error: "forbidden", message: memberRefusal }, 403);
  }, { services, access: "account" });
}
