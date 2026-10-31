import "server-only";

import { referralAppealSchema, referralReviewCursor } from "../../domain/referral-reviews.ts";
import { json, readLimitedBody } from "../http/private-http.ts";
import { memberRoute, type MemberServicesSource, getMemberServices } from "./member-http.ts";

export function createMemberReferralReviewHandler(action: "read" | "appeal", services: MemberServicesSource = getMemberServices) {
  return memberRoute(async ({ request, services: resolved, member }) => {
    if (!member || member.blocked || member.administrator) return json({ error: "forbidden" }, 403);
    if (!resolved.referralReviews) return json({ error: "unavailable" }, 503);
    try {
      if (action === "read") {
        const query = new URL(request.url).searchParams;
        if ([...query.keys()].some(key => key !== "before") || query.getAll("before").length > 1
          || query.has("before") && !referralReviewCursor(query.get("before"))) return json({ error: "invalid" }, 400);
        const cases = await resolved.referralReviews.member(member, query.get("before") ?? undefined);
        return cases ? json({ cases }) : json({ error: "forbidden" }, 403);
      }
      if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid" }, 400);
      let body: unknown;
      try {
        const bytes = await readLimitedBody(request, 2048, { deadlineMs: 15_000 });
        if (!bytes) return json({ error: "invalid" }, 400);
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch { return json({ error: "invalid" }, 400); }
      const input = referralAppealSchema.safeParse(body);
      if (!input.success) return json({ error: "invalid" }, 400);
      const result = await resolved.referralReviews.appeal(member, input.data);
      return result.status === "saved" ? json(result) : json({ error: result.status }, result.status === "conflict" ? 409 : result.status === "forbidden" ? 403 : result.status === "not-found" ? 404 : 400);
    } catch { return json({ error: "unavailable" }, 503); }
  }, { services, access: "account" });
}
