import "server-only";

import { cookies } from "next/headers.js";
import { z } from "zod";
import { referralReviewCursor, referralReviewMutationSchema, referralReviewStatuses } from "../../domain/referral-reviews.ts";
import { json, readCookie } from "../http/private-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { verifyMemberAdminSession } from "../members/member-admin-access.ts";
import { createReferralReviews } from "../members/referral-reviews.ts";
import type { AnalyticsServices } from "../analytics/analytics-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";

const lookup = z.strictObject({ action: z.literal("grants"), search: z.string().trim().max(60) });
const fail = (status: string) => json({ error: status, message: status === "conflict" ? "This case changed. Refresh and try again."
  : status === "forbidden" ? "Sign in again with an administrator account." : "Unable to apply this action. Check the case and try again." },
status === "conflict" ? 409 : status === "forbidden" ? 403 : status === "not-found" ? 404 : 400);

export function createReferralReviewHandlers({ verify = verifyMemberAdminSession, create = createReferralReviews } = {}) {
  async function run({ request, services }: AdminContext) {
    if (!services.database) return json({ error: "unavailable" }, 503);
    try {
      const admin = await verify(services, readCookie(request, memberCookieName(services.config.production)));
      if (!admin) return fail("forbidden");
      const review = create({ database: services.database, config: services.config });
      if (request.method === "GET") {
        const query = new URL(request.url).searchParams;
        if ([...query.keys()].some(key => !["id", "status", "before"].includes(key)) || query.getAll("id").length > 1 || query.getAll("status").length > 1 || query.getAll("before").length > 1
          || query.has("id") && !z.uuid().safeParse(query.get("id")).success
          || query.has("before") && !referralReviewCursor(query.get("before"))
          || query.has("status") && !["all", ...referralReviewStatuses].includes(query.get("status")!)) return fail("invalid");
        const result = query.has("id") ? await review.detail(admin, query.get("id")!) : await review.list(admin, query.get("status") ?? "all", query.get("before") ?? undefined);
        return result ? json(query.has("id") ? { case: result } : { cases: result }) : fail("not-found");
      }
      const read = await readJsonBody(request, 4096); if ("refusal" in read) return read.refusal;
      if (read.body.action === "grants") {
        const input = lookup.safeParse(read.body); if (!input.success) return fail("invalid");
        const grants = await review.grants(admin, input.data.search);
        return grants ? json({ grants }) : fail("forbidden");
      }
      const input = referralReviewMutationSchema.safeParse(read.body); if (!input.success) return fail("invalid");
      const result = await review.mutate(admin, input.data);
      return result.status === "saved" ? json(result) : fail(result.status);
    } catch { return json({ error: "unavailable", message: "Referral review is temporarily unavailable." }, 503); }
  }
  return { GET: run, POST: run };
}

/** The page guard runs first; a second current-session check protects the service snapshot from revocation races. */
export async function readAdminReferralReviews(services: AnalyticsServices) {
  if (!services.database) return null;
  const jar = await cookies(), admin = await verifyMemberAdminSession(services, jar.get(memberCookieName(services.config.production))?.value);
  return admin ? createReferralReviews({ database: services.database, config: services.config }).list(admin, "all") : null;
}
