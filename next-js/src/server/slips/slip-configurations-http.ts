import "server-only";

import { slipConfigurationMutationSchema, slipConfigurationRules, type SlipConfigurationFailure } from "../../domain/slip-configurations.ts";
import { json, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices, memberRoute, type MemberServicesSource } from "../members/member-http.ts";

const statusCodes: Record<SlipConfigurationFailure, number> = { forbidden: 403, invalid: 400, limit: 409, "name-taken": 409, "not-found": 404, conflict: 409 };

/** Both operations use account access, so saving/managing filters does not depend on an active subscription. */
export function createSlipConfigurationsHandler(action: "read" | "write", services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (!resolved.configurations) return json({ error: "unavailable" }, 503);
    if (member!.blocked) return json({ error: "forbidden" }, 403);
    let outcome;
    if (action === "read") outcome = await resolved.configurations.read(member!);
    else {
      let mutation;
      try {
        if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid" }, 400);
        const bytes = await readLimitedBody(request, slipConfigurationRules.requestBytes, { deadlineMs: 15_000 });
        if (!bytes) return json({ error: "invalid" }, 400);
        mutation = slipConfigurationMutationSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      } catch { return json({ error: "invalid" }, 400); }
      outcome = await resolved.configurations.mutate(member!, mutation);
    }
    return outcome.status === "saved" ? json({ configurations: outcome.configurations })
      : json({ error: outcome.status }, statusCodes[outcome.status]);
  }, { services, access: "account" });
}
