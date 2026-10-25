import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { modelIndependentSlip, parseSlipCriteria } from "../../domain/slip-builder.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices } from "../members/member-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { readPublicSlipBuild } from "./public-slips.ts";
import { createSavedSlips } from "./saved-slips.ts";

/** Rebuild from bounded criteria: a client cannot publish fabricated odds, probabilities or winning slips. */
export function createSaveSlipHandler({ members = getMemberServices, services = getAnalyticsServices,
  access = viewerAccessFromRequest, build = readPublicSlipBuild, now = Date.now } = {}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
    try {
      const viewer = await access(request);
      if (viewer.tier !== "full") return json({ error: "subscription-required" }, 403);
      const resolved = await members();
      const member = await resolved.sessions?.verify(readCookie(request, memberCookieName(resolved.config.production)));
      if (!member) return json({ error: "sign-in-required" }, 401);
      let body: unknown;
      try {
        if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid-request" }, 400);
        const bytes = await readLimitedBody(request, 8192, { deadlineMs: 15_000 });
        if (!bytes) return json({ error: "invalid-request" }, 400);
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch { return json({ error: "invalid-request" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== "criteria,slipId") return json({ error: "invalid-request" }, 400);
      const { criteria: query, slipId } = body as Record<string, unknown>;
      if (typeof query !== "string" || query.length > 2048 || typeof slipId !== "string" || slipId.length > 4096) return json({ error: "invalid-request" }, 400);
      let criteria;
      try { criteria = parseSlipCriteria(new URLSearchParams(query), getReportingDate(utcInstantFromEpochMilliseconds(now()))); }
      catch { return json({ error: "invalid-request" }, 400); }
      const result = await build(criteria), slip = result.data?.slips.find((item) => item.id === slipId);
      if (!slip) return json({ error: "changed", message: "These selections changed. Generate your slips again." }, 409);
      const { database, config } = await services();
      if (!database) return json({ error: "unavailable" }, 503);
      // Member saves keep the model-independent snapshot; an estimate without its model identity is not auditable.
      const saved = await createSavedSlips(database, config, now).save(member, modelIndependentSlip(slip));
      return saved === "saved" ? json({ saved: true }) : json({ error: saved }, saved === "busy" ? 429 : saved === "changed" ? 409 : 403);
    } catch { return json({ error: "unavailable", message: "Saving slips is unavailable. Please try again." }, 503); }
  };
}
