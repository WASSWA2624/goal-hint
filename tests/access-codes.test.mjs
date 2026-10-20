import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { codeFromFragment, extractCode, formatCode, normalizeCode } from "../src/domain/access-code.ts";
import { chainPeriods, codeStatus, extendPeriods, formatPeriodEnd, remainingDays, subscriptionDayMs as day } from "../src/domain/subscription-period.ts";
import { generateCode, hashCode, newReference, newSalt, transactionKey } from "../src/server/members/access-codes.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";

test("codes normalize Crockford aliases and extract only a complete dashed code or a complete input", () => {
  assert.equal(normalizeCode("o1il-abcd efgh"), "0111ABCDEFGH");
  assert.equal(formatCode("o1il-abcd efgh"), "0111-ABCD-EFGH");
  for (const message of ["Goal Hint code: 0123-4567-89AB\nTap: https://goalhint.com/en/account#code=0123-4567-89AB",
    "Tap to unlock: https://goalhint.com/en/account#code=0123-4567-89AB"]) assert.equal(extractCode(message), "0123456789AB");
  assert.equal(extractCode("xxxx-xxxx-xxxx then 0123-4567-89AB"), "XXXXXXXXXXXX");
  for (const input of ["0123456789AU", "code 0123456789AB", "x0123-4567-89AB", "0123-4567-89AB-x", "x".repeat(4097), null]) assert.equal(extractCode(input), null);
  for (const hash of ["#code=0123-4567-89ab", "#code=0123%204567%2089AB"]) assert.equal(codeFromFragment(hash), "0123456789AB");
  for (const hash of ["code=0123456789AB", "#other=0123456789AB", "#code=0123456789AB&x=1", "#code=%", "#code=0123456789AU"]) assert.equal(codeFromFragment(hash), null);
});

test("code storage has independent random codes, salts and references and a versioned unkeyed hash", () => {
  const code = generateCode(), salt = newSalt(), otherSalt = newSalt();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{12}$/u);
  assert.match(newReference(), /^C-[0-9A-HJKMNP-TV-Z]{4}$/u);
  assert.equal(salt.length, 16);
  assert.notEqual(hashCode(salt, code), hashCode(otherSalt, code));
  assert.equal(hashCode(salt, code), createHash("sha256").update("goal-hint-access-code:v1:").update(salt).update(code).digest("hex"));
  assert.equal(hashCode(salt, code), hashCode(salt, formatCode(code).toLowerCase()));
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
  let mode = "on", row = undefined, fail = false;
  const config = { production: false, cookies: { session: "owner" } };
  const resolver = createViewerAccess({ now: () => Date.parse("2026-10-19T09:00:00Z"),
    settings: async () => ({ settings: { ...defaultSubscriptionSettings, paywallMode: mode } }),
    services: async () => ({ config, auth: { verify: async (token, options) => { calls.owner.push(options); if (fail) throw Error(); return token === "yes" ? {} : null; } },
      database: { query: async (run) => run({ $queryRaw: async () => { calls.reads++; if (fail) throw Error(); return row ? [row] : []; } }) } }) });
  const cookies = (values) => (key) => values[key];
  assert.deepEqual(await resolver(cookies({})), { tier: "free", signedIn: false, mode: "on" });
  assert.equal(calls.owner.length, 0);
  assert.equal((await resolver(cookies({ owner: "yes" }))).tier, "full");
  assert.deepEqual(calls.owner, [{ touch: false }]);
  mode = "test";
  assert.equal((await resolver(cookies({}))).tier, "free");
  row = { accountId: "account", lastSeenAt: new Date("2026-10-19T09:00:00Z"), entitled: 0 };
  assert.deepEqual(await resolver(cookies({ "goal-hint-member": "t".repeat(43) })), { tier: "free", signedIn: true, mode: "test" });
  assert.equal(calls.reads, 1);
  row.entitled = 1n;
  assert.equal((await resolver(cookies({ "goal-hint-member": "t".repeat(43) }))).tier, "full");
  fail = true;
  assert.equal((await resolver(cookies({ "goal-hint-member": "t".repeat(43) }))).tier, "free");
  mode = "off";
  assert.equal((await resolver(cookies({ owner: "yes" }))).tier, "free");
  fail = false;
  assert.equal((await resolver(cookies({}))).tier, "free");
  assert.equal((await resolver(cookies({ "goal-hint-member": "t".repeat(43) }))).tier, "full");
  assert.equal((await resolver(cookies({ owner: "yes" }))).tier, "full");
});
