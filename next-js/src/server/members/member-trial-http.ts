import "server-only";

import { json } from "../http/private-http.ts";
import { getMemberServices, memberRefusal, memberRoute, type MemberServicesSource } from "./member-http.ts";

export function createMemberTrialHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ services: resolved, member }) => {
    if (!resolved.codes) return json({ error: "unavailable", message: "Trial activation is unavailable. Try again later." }, 503);
    const outcome = await resolved.codes.activateTrial(member!);
    if (outcome.state === "active") return json(outcome);
    if (outcome.state === "forbidden") return json({ error: "forbidden", message: memberRefusal }, 403);
    return json({ error: outcome.state, message: outcome.state === "disabled" ? "Free trials are currently paused." : "This account has no free trial available." }, 409);
  }, { services, access: "account" });
}
