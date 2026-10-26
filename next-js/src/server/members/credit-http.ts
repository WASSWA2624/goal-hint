import "server-only";

import { readJsonBody } from "../admin/admin-http.ts";
import { json } from "../http/private-http.ts";
import { getMemberServices, memberRefusal, memberRoute, type MemberServicesSource } from "./member-http.ts";

/**
 * A member's credit actions, as same-origin JSON: `{ action: "purchase", planId, requestKey, accepted }` buys a plan with credit
 * at once (requestKey, a client UUID, makes a repeated submit return the first purchase), and `{ action: "auto-renew", on,
 * planId, accepted }` turns auto-renewal on for a plan or off. Buying and turning auto-renewal on need open sales; turning it
 * off never does, so a member can always stop renewals. Every action needs a current session of an open account.
 */
export function createCreditHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (member!.blocked || member!.administrator) return json({ error: "forbidden", message: memberRefusal }, 403);
    if (!resolved.codes) return json({ error: "unavailable", message: "Member access is unavailable. Try again later." }, 503);
    const read = await readJsonBody(request);
    if ("refusal" in read) return read.refusal;
    const { action, planId, requestKey, accepted, on } = read.body;
    if (resolved.settings.settings?.paywallMode === "off" && !(action === "auto-renew" && on === false)) {
      return json({ error: "closed", message: "Subscriptions are not open yet." }, 403);
    }
    const outcome = action === "purchase"
      ? await resolved.codes.purchaseWithCredit(member!, { planId: String(planId ?? ""), requestKey: String(requestKey ?? ""), accepted: accepted === true })
      : action === "auto-renew" && typeof on === "boolean"
        ? await resolved.codes.setAutoRenew(member!, on ? { on, planId: String(planId ?? ""), accepted: accepted === true } : { on }) : null;
    if (!outcome) return json({ error: "invalid", message: "Check the values and try again." }, 400);
    switch (outcome.status) {
      case "created": return json({ status: "created", reference: outcome.grant.reference, startsAt: outcome.grant.startsAt.toISOString(),
        endsAt: outcome.grant.endsAt.toISOString(), balanceUgx: outcome.grant.credit?.balanceUgx ?? null }, 201);
      case "saved": return json({ status: "saved" });
      case "insufficient": return json({ error: "insufficient", message: outcome.message }, 409);
      case "invalid": return json({ error: "invalid", message: outcome.message }, 400);
      default: return json({ error: "forbidden", message: memberRefusal }, 403);
    }
  }, { services, access: "account" });
}
