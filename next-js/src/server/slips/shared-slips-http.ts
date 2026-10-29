import "server-only";

import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { parseSlipCriteria } from "../../domain/slip-builder.ts";
import { sharedSlipRules, shareSlipSourceSchema } from "../../domain/shared-slips.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices } from "../members/member-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { readPublicSlipBuild } from "./public-slips.ts";
import { createSharedSlips, readSharedSlip } from "./shared-slips.ts";

/** The browser submits only a server selection identity and its bounded source, never a claimed snapshot. */
export function createShareSlipHandler({ members = getMemberServices, services = getAnalyticsServices,
  access = viewerAccessFromRequest, build = readPublicSlipBuild,
  published = (database: Parameters<typeof createPublishedSlips>[0]) => createPublishedSlips(database), share = createSharedSlips, now = Date.now } = {}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
    try {
      if ((await access(request)).tier !== "full") return json({ error: "subscription-required" }, 403);
      const resolved = await members();
      const member = await resolved.sessions?.verify(readCookie(request, memberCookieName(resolved.config.production)));
      if (!member) return json({ error: "sign-in-required" }, 401);
      let input;
      try {
        if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid-request" }, 400);
        const bytes = await readLimitedBody(request, sharedSlipRules.maximumRequestBytes, { deadlineMs: 15_000 });
        if (!bytes) return json({ error: "invalid-request" }, 400);
        input = shareSlipSourceSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      } catch { return json({ error: "invalid-request" }, 400); }
      const { database, config } = await services();
      if (!database) return json({ error: "unavailable" }, 503);
      let slip;
      if (input.source === "builder") {
        let criteria;
        try { criteria = parseSlipCriteria(new URLSearchParams(input.criteria), getReportingDate(utcInstantFromEpochMilliseconds(now()))); }
        catch { return json({ error: "invalid-request" }, 400); }
        const result = await build(criteria);
        slip = result.data?.slips.find((candidate) => candidate.id === input.slipId);
      } else {
        let day;
        try { day = parseReportingDate(input.day); } catch { return json({ error: "invalid-request" }, 400); }
        const result = await published(database).day(day);
        slip = result?.slips.find((candidate) => candidate.slip?.id === input.slipId)?.slip;
      }
      if (!slip) return json({ error: "changed" }, 409);
      const result = await share(database, config, now).publish(member, slip, input.source);
      return result.state === "shared" ? json(result.shared) : json({ error: result.state },
        result.state === "busy" ? 429 : result.state === "changed" ? 409 : result.state === "too-large" ? 413 : 403);
    } catch { return json({ error: "unavailable" }, 503); }
  };
}

export function createReadSharedSlipHandler(read = readSharedSlip) {
  return async (id: string): Promise<Response> => {
    try { const shared = await read(id); return shared ? json(shared) : json({ error: "not-found" }, 404); }
    catch { return json({ error: "unavailable" }, 503); }
  };
}
