import "server-only";

import { z } from "zod";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import { getMemberServices } from "../members/member-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { takeMemberLimit } from "../members/rate-limit.ts";
import { lockMemberAccount } from "../members/access-codes.ts";
import { isSameOrigin, json, readCookie, readLimitedBody } from "../http/private-http.ts";
import { ensureSlipNumber } from "./slip-numbers.ts";
import { supportContactsOf } from "../../domain/support-contacts.ts";
import { readSharedSlip } from "./shared-slips.ts";
import { slipNumberFingerprint } from "../../domain/readable-code.ts";

const inputSchema = z.union([z.strictObject({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/u) }),
  z.strictObject({ token: z.string().regex(/^[a-f0-9]{32}$/u) })]);
export function createSlipNumberHandler({ services = getAnalyticsServices, members = getMemberServices, access = viewerAccessFromRequest,
  readShared = readSharedSlip, now = Date.now } = {}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
    try {
      const viewer = await access(request);
      const resolved = await members();
      const member = await resolved.sessions?.verify(readCookie(request, memberCookieName(resolved.config.production)));
      let input;
      try {
        if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "invalid-request" }, 400);
        const bytes = await readLimitedBody(request, 256, { deadlineMs: 15_000 });
        input = inputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes ?? new Uint8Array())));
      } catch { return json({ error: "invalid-request" }, 400); }
      const { database, config } = await services();
      if (!database) return json({ error: "unavailable" }, 503);
      const contacts = resolved.settings.settings ? supportContactsOf(resolved.settings.settings).slice(0, 2)
        .map(contact => `${contact.label}: +${contact.phone}`) : [];
      if ("token" in input) {
        const shared = await readShared(input.token);
        if (!shared) return json({ error: "not-found" }, 404);
        const number = await database.transaction(async tx => ensureSlipNumber(tx, await slipNumberFingerprint(shared.slip)));
        return json({ number, contacts });
      }
      if (viewer.tier !== "full") return json({ error: "subscription-required" }, 403);
      if (!member) return json({ error: "sign-in-required" }, 401);
      const fingerprint = input.fingerprint;
      const result = await database.transaction(async tx => {
        const account = await lockMemberAccount(tx, member.accountId), at = new Date(now());
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
        if (!account?.phone || account.blockedAt || account.erasedAt || session?.accountId !== account.id
          || !session.authenticatedAt || session.passwordResetAt || session.expiresAt <= at) return null;
        if (!await takeMemberLimit(tx, config, { purpose: "slip-number", value: account.id, maximum: 120, windowMs: 3_600_000 }, at)) return "limited";
        return ensureSlipNumber(tx, fingerprint);
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
      if ((await access(request)).tier !== "full") return json({ error: "subscription-required" }, 403);
      return result === "limited" ? json({ error: "limited" }, 429) : result ? json({ number: result, contacts }) : json({ error: "forbidden" }, 403);
    } catch { return json({ error: "unavailable" }, 503); }
  };
}
