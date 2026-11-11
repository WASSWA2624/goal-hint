import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { normalizeCode } from "../src/domain/access-code.ts";
import { chainPeriods, codeStatus, extendPeriods, formatPeriodEnd, remainingDays, subscriptionDayMs as day } from "../src/domain/subscription-period.ts";
import { generateCode, hashCode, newReference, newSalt, transactionKey } from "../src/server/members/access-codes.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";

test("internal period hashes normalize Crockford aliases and refuse invalid values", () => {
  assert.equal(normalizeCode("o1il-abcd efgh"), "0111ABCDEFGH");
  assert.equal(normalizeCode("0123-4567-89ab"), "0123456789AB");
  for (const input of ["0123456789AU", "code 0123456789AB", "x0123-4567-89AB", "0123-4567-89AB-x", "x".repeat(65), null]) assert.equal(normalizeCode(input), null);
});

test("code storage has independent random codes, salts and references and a versioned unkeyed hash", () => {
  const code = generateCode(), salt = newSalt(), otherSalt = newSalt();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{12}$/u);
  assert.match(newReference(), /^C-[0-9A-HJKMNP-TV-Z]{4}$/u);
  assert.equal(salt.length, 16);
  assert.notEqual(hashCode(salt, code), hashCode(otherSalt, code));
  assert.equal(hashCode(salt, code), createHash("sha256").update("goal-hint-access-code:v1:").update(salt).update(code).digest("hex"));
  assert.equal(hashCode(salt, code), hashCode(salt, code.toLowerCase().match(/.{4}/gu).join("-")));
  assert.throws(() => hashCode(new Uint8Array(15), code), RangeError);
  assert.equal(transactionKey("tx. 10-01"), "TX1001");
});

test("periods use exact 24-hour blocks, preserve history and rechain without overlapping after revoke or extend", () => {
  const now = new Date("2026-10-19T11:30:00Z");
  const period = (id, start, days, fields = {}) => ({ id, startsAt: new Date(+now + start * day), endsAt: new Date(+now + (start + days) * day),
    revokedAt: null, durationDays: days, extensionDays: 0, ...fields });
  const active = period("active", -2, 7), queued = period("queued", 5, 7), later = period("later", 12, 1);
  assert.equal(codeStatus(active, now), "active");
  assert.equal(codeStatus(queued, now), "queued");
  assert.equal(codeStatus(active, active.endsAt), "expired");
  const revoked = { ...active, revokedAt: now };
  assert.equal(codeStatus(revoked, now), "revoked");
  const moved = chainPeriods([later, revoked, queued], now);
  assert.deepEqual([moved[1].startsAt, moved[1].endsAt, moved[2].startsAt], [now, new Date(+now + 7 * day), new Date(+now + 7 * day)]);
  const extended = chainPeriods([{ ...active, extensionDays: 2, endsAt: new Date(+active.endsAt + 2 * day) }, queued, later], now);
  assert.equal(+extended[1].startsAt, +now + 7 * day);
  assert.equal(+extended[2].startsAt, +now + 14 * day);
  const lateExtension = extendPeriods([period("old", -3, 1), active, queued], "old", 1);
  assert.equal(+lateExtension[1].endsAt, +active.endsAt + day, "extending an expired period still shifts an active renewal by exactly one day");
  const remainder = period("remainder", -3 + 5 / 24, 7);
  assert.equal(remainingDays([remainder, period("week", 4 + 5 / 24, 7), revoked], now), 12);
  assert.equal(remainingDays([period("short", -4 + 5 / 24, 7), queued], now), 11);
  assert.match(formatPeriodEnd(new Date(+now + day)), /Tue.*20.*Oct.*14:30.*EAT/u);
  assert.equal(active.extensionDays, 0, "pure chaining does not mutate snapshots");
});

test("viewer access resolves in order, avoids absent owner cookies, checks a member once, and fails closed", async () => {
  const calls = { owner: [], reads: 0 };
  let mode = "on", source = "stored", allowUnsubscribedMembers = false, row, fail = false;
  const config = { production: false, cookies: { session: "owner" } };
  const resolver = createViewerAccess({ now: () => Date.parse("2026-10-19T09:00:00Z"),
    settings: async () => ({ source, settings: source === "unavailable" ? null
      : { ...defaultSubscriptionSettings, paywallMode: mode, allowUnsubscribedMembers } }),
    services: async () => ({ config, auth: { verify: async (token, options) => { calls.owner.push(options); if (fail) throw Error(); return token === "yes" ? {} : null; } },
      database: { query: async (run) => run({ $queryRaw: async (query) => {
        calls.reads++;
        assert.doesNotMatch(query.join(""), /codeEnteredAt|accessCodeId/u);
        if (fail) throw Error();
        return row ? [row] : [];
      } }) } }) });
  const cookies = (values) => (key) => values[key];
  const guest = () => resolver(cookies({}));
  const member = () => resolver(cookies({ "goal-hint-member": "t".repeat(43) }));
  assert.deepEqual(await guest(), { tier: "free", signedIn: false, mode: "on" });
  assert.equal(calls.owner.length, 0);
  assert.equal((await resolver(cookies({ owner: "yes" }))).tier, "full");
  assert.deepEqual(calls.owner, [{ touch: false }]);
  const at = new Date("2026-10-19T09:00:00Z");
  row = { accountId: "account", phone: "256700000901", passwordHash: "stored-password-hash", blockedAt: null,
    lastSeenAt: at, phoneVerifiedAt: at, entitled: 0 };
  assert.deepEqual(await member(), { tier: "free", signedIn: true, mode: "on" });
  assert.equal(calls.reads, 1);
  allowUnsubscribedMembers = true;
  assert.equal((await guest()).tier, "free");
  assert.deepEqual(await member(), { tier: "full", signedIn: true, mode: "on" });
  source = "last-good";
  assert.equal((await member()).tier, "free");
  source = "stored";
  row.blockedAt = at;
  assert.equal((await member()).tier, "free");
  row.blockedAt = null;
  row.phoneVerifiedAt = null;
  assert.deepEqual(await member(), { tier: "free", signedIn: false, mode: "on" });
  row.phoneVerifiedAt = at;
  allowUnsubscribedMembers = false;
  row.entitled = 1n;
  assert.equal((await member()).tier, "full");
  source = "unavailable";
  assert.equal((await member()).tier, "free");
  source = "stored";
  fail = true;
  assert.equal((await member()).tier, "free");
  mode = "off";
  assert.equal((await member()).tier, "full");
  fail = false;
  row.entitled = 0;
  assert.deepEqual(await guest(), { tier: "full", signedIn: false, mode: "off" });
  assert.deepEqual(await member(), { tier: "full", signedIn: true, mode: "off" });
  assert.equal((await resolver(cookies({ owner: "yes" }))).tier, "full");
  source = "last-good";
  assert.deepEqual(await guest(), { tier: "free", signedIn: false, mode: "free" });
});
