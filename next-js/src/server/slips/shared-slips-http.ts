import "server-only";

import { parseReportingDate } from "../../domain/calendar.ts";
import { modelIndependentSlip } from "../../domain/slip-builder.ts";
import { sharedSlipRules, shareSlipSourceSchema } from "../../domain/shared-slips.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { getMemberServices } from "../members/member-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { readSharedSlip } from "./shared-slips.ts";
import { publicBestSlipPath } from "../../domain/public-best-slip.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { readWithSlipAccess } from "./slip-access.ts";
import { slipNumberFingerprint } from "../../domain/readable-code.ts";
import { ensureSlipNumber } from "./slip-numbers.ts";
import { supportContactsOf } from "../../domain/support-contacts.ts";

/** The browser submits only a server selection identity and its bounded source, never a claimed snapshot. */
export function createShareSlipHandler({ members = getMemberServices, services = getAnalyticsServices,
  access = viewerAccessFromRequest,
  published = (database: Parameters<typeof createPublishedSlips>[0]) => createPublishedSlips(database) } = {}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
    try {
      const viewer = await access(request);
      const resolved = await members();
      const member = await resolved.sessions?.verify(readCookie(request, memberCookieName(resolved.config.production)));
      if (viewer.tier === "full" && !member) return json({ error: "sign-in-required" }, 401);
      let input;
      try {
        if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid-request" }, 400);
        const bytes = await readLimitedBody(request, sharedSlipRules.maximumRequestBytes, { deadlineMs: 15_000 });
        if (!bytes) return json({ error: "invalid-request" }, 400);
        input = shareSlipSourceSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      } catch { return json({ error: "invalid-request" }, 400); }
      const { database } = await services();
      if (!database) return json({ error: "unavailable" }, 503);
      let day;
      try { day = parseReportingDate(input.day); } catch { return json({ error: "invalid-request" }, 400); }
      const result = await published(database).day(day);
      const view = result?.slips.find(candidate => candidate.slip?.id === input.slipId);
      if (!view?.slip || !view.id || !view.publishedAt) return json({ error: "changed" }, 409);
      if (!view.completed && (viewer.tier !== "full" || (await access(request)).tier !== "full")) return json({ error: "subscription-required" }, 403);
      const number = await database.transaction(async tx => ensureSlipNumber(tx, await slipNumberFingerprint(view.slip!)));
      if (!view.completed && (await access(request)).tier !== "full") return json({ error: "subscription-required" }, 403);
      const contacts = resolved.settings.settings ? supportContactsOf(resolved.settings.settings).slice(0, 2).map(contact => `${contact.label}: +${contact.phone}`) : [];
      return json({ id: view.id.slice(0, 32), number, contacts, status: view.status,
        createdAt: new Date(view.publishedAt).toISOString(),
        url: new URL(publicBestSlipPath("en", day, view.rank), publicPolicy.origin).toString(), slip: modelIndependentSlip(view.slip) });
    } catch { return json({ error: "unavailable" }, 503); }
  };
}

export function createReadSharedSlipHandler({ read = readSharedSlip, access = viewerAccessFromRequest } = {}) {
  return async (request: Request, id: string): Promise<Response> => {
    try {
      const shared = await readWithSlipAccess((viewer) => read(id, viewer), () => access(request));
      return shared ? json(shared) : json({ error: "not-found" }, 404);
    }
    catch { return json({ error: "unavailable" }, 503); }
  };
}
