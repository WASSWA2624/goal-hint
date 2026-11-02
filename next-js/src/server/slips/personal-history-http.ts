import "server-only";

import { defaultBestSlipsQuery, parseBestSlipsQuery } from "../../domain/best-slips-query.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { json, readCookie } from "../http/private-http.ts";
import { getMemberServices } from "../members/member-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { createPersonalSlipHistory } from "./personal-history.ts";
import { gateSlipView } from "./slip-preview.ts";

export function createPersonalSlipHistoryHandler({ members = getMemberServices, services = getAnalyticsServices,
  access = viewerAccessFromRequest, read = createPersonalSlipHistory, now = Date.now } = {}) {
  return async (request: Request): Promise<Response> => {
    try {
      const resolved = await members(), token = readCookie(request, memberCookieName(resolved.config.production));
      const member = await resolved.sessions?.verify(token);
      if (!member || member.blocked) return json({ error: "sign-in-required" }, 401);
      const today = getReportingDate(utcInstantFromEpochMilliseconds(now())), parameters = new URL(request.url).searchParams;
      let query;
      try { query = parameters.size ? parseBestSlipsQuery(parameters, today) : defaultBestSlipsQuery(); }
      catch { return json({ error: "invalid-query" }, 400); }
      const { database } = await services();
      if (!database) return json({ error: "unavailable" }, 503);
      const result = await read(database, { now })(member.accountId, query, today);
      // Recheck both ownership and entitlement at the response boundary; no private cache or shared history reader.
      const current = await resolved.sessions?.verify(token), viewer = await access(request);
      if (!current || current.blocked || current.accountId !== member.accountId || current.tokenHash !== member.tokenHash || !viewer.signedIn)
        return json({ error: "sign-in-required" }, 401);
      return json({ ...result, access: { tier: viewer.tier, signedIn: true }, entitled: viewer.tier === "full",
        slips: result.slips.map((view) => gateSlipView(view, viewer)) });
    } catch { return json({ error: "unavailable" }, 503); }
  };
}
