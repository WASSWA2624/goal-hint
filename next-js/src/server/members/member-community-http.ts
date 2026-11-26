import "server-only";

import { z } from "zod";
import { communityInvitationLinks, publicCommunityLinks } from "../../domain/community.ts";
import { readJsonBody } from "../admin/admin-http.ts";
import { json } from "../http/private-http.ts";
import { getMemberServices, memberRefusal, memberRoute, type MemberServicesSource } from "./member-http.ts";

const accountKeySchema = z.string().regex(/^[0-9a-f]{64}$/u);
const command = z.union([
  z.strictObject({ action: z.literal("status") }),
  z.strictObject({ action: z.literal("reconcile"), accountKey: accountKeySchema }),
  z.strictObject({ action: z.enum(["claim", "attempt", "yes", "no"]), accountKey: accountKeySchema, attemptId: z.uuidv4().toLowerCase() }),
]);

export function createMemberCommunityHandler(services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (!member || member.blocked) return json({ error: "forbidden", message: memberRefusal }, 403);
    if (!resolved.community) return json({ error: "unavailable", message: "Community is temporarily unavailable." }, 503);
    const read = await readJsonBody(request, 512);
    if ("refusal" in read) return read.refusal;
    const action = command.safeParse(read.body);
    if (!action.success) return json({ error: "invalid", message: "Choose a Community action." }, 400);
    const accountKey = resolved.config.key("community-account", member.accountId);
    if (action.data.action !== "status" && action.data.accountKey !== accountKey) {
      return json({ error: "forbidden", message: memberRefusal }, 403);
    }
    const { settings, source } = resolved.settings;
    const canInvite = action.data.action === "claim" && source !== "last-good" && !!settings?.communityVisible
      && communityInvitationLinks(publicCommunityLinks(settings.communityLinks)).length > 0;
    const outcome = await resolved.community.apply(member, action.data, canInvite);
    if (outcome.status === "ok") {
      const { joined, invited, retryAt } = outcome;
      return json({ accountKey, joined, invited, retryAt });
    }
    if (outcome.status === "stale") return json({ error: "stale", message: "This Community invitation has ended." }, 409);
    return json({ error: "forbidden", message: memberRefusal }, 403);
  }, { services, access: "account" });
}
