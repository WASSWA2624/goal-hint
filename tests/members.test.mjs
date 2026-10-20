import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatPlanLength, formatUgx, parsePlanFields, planRules } from "../src/domain/subscription-plans.ts";
import { applySettingsChanges, defaultSubscriptionSettings, editableSettingFields, modeRequirements, parseSettingsChanges,
  protectedSettingFields } from "../src/domain/subscription-settings.ts";
import { auditDetails, auditTextErrors, ownerSignInAudit, UnsafeAuditDetailsError, writeOwnerAudit } from "../src/server/admin/audit.ts";
import { createSettingsHandlers } from "../src/server/admin/settings-http.ts";
import { createPlansService } from "../src/server/members/plans.ts";
import { accessMode, createSettingsService, settingsCacheRules } from "../src/server/members/settings.ts";
import { createMemberCodeHandler, createMemberSignInHandler, createMemberSignOutHandler } from "../src/server/members/member-http.ts";
import { memberCookieName } from "../src/server/members/member-sessions.ts";
import { memberReturnPath } from "../src/domain/member-navigation.ts";

// Synthetic owner numbers only; real receiving and support identity comes from server environment configuration.
const OWNER_MTN = "256700000901", OWNER_CONTACT = "256700000902";
const settingsWith = (fields) => Object.freeze({ ...defaultSubscriptionSettings, ...fields });
const ready = { activePlans: 1, privacyReleaseReady: true, termsReleaseReady: true };

function memberFixture({ mode = "test", production = false, member = null } = {}) {
  const calls = { signIn: [], signOut: [], devices: [] };
  const services = { config: { production, cookies: { secure: production } }, settings: { settings: { ...defaultSubscriptionSettings, paywallMode: mode } },
    sessions: { async signIn(...args) { calls.signIn.push(args); return { status: "signed-in", token: "t".repeat(43) }; },
      async verify() { return member; }, async signOut(token) { calls.signOut.push(token); },
      async signOutOthers(value) { calls.devices.push(value); return true; } } };
  return { services, resolve: async () => services, calls };
}
const memberRequest = (fields, { json = true, headers = {} } = {}) => new Request("http://localhost:3000/api/account/sign-in", { method: "POST",
  headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", "content-type": json ? "application/json" : "application/x-www-form-urlencoded", ...headers },
  body: json ? JSON.stringify(fields) : new URLSearchParams(fields) });

test("member sign-in normalizes the complete phone table, bounds and whitelists input, and never puts a phone in a URL", async () => {
  const { resolve, calls } = memberFixture(), handler = createMemberSignInHandler(resolve);
  for (const input of ["0772123456", "772123456", "+256772123456", "00256772123456", "256 772-123 456", "2560772123456",
    "256256772123456", "256+256772123456", "25600256772123456", "256 0772 123 456", "254712345678", "256+254712345678", "25600254712345678"]) {
    const response = await handler(memberRequest({ phone: input, destination: "subscribe", return: "/en/matches/test-id/home-away" }));
    assert.equal(response.status, 200, input);
    assert.equal(calls.signIn.at(-1)[0], input.includes("254") ? "254712345678" : "256772123456");
    const body = await response.json();
    assert.equal(body.next, "/en/subscribe?return=%2Fen%2Fmatches%2Ftest-id%2Fhome-away");
    assert.doesNotMatch(JSON.stringify(body), /256772|254712/);
    assert.match(response.headers.get("set-cookie"), /^goal-hint-member=t{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=34560000$/);
  }
  for (const phone of ["256254712345678", "25677212345", "256672123456", "0201234567", "012345678901"]) {
    const response = await handler(memberRequest({ phone }, { json: false }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/en/account?status=invalid-phone");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  for (const fields of [{ phone: "0772123456", accountId: "other" }, { phone: "x".repeat(3000) }]) {
    assert.equal((await handler(memberRequest(fields))).status, 400);
  }
  const secure = await createMemberSignInHandler(memberFixture({ production: true }).resolve)(memberRequest({ phone: "0772123456" }));
  assert.match(secure.headers.get("set-cookie"), /^__Host-goal-hint-member=.*; HttpOnly; SameSite=Lax; Max-Age=34560000; Secure$/);
  assert.equal(memberCookieName(true), "__Host-goal-hint-member");
  for (const path of ["https://evil.test", "//evil.test", "/en?phone=256772123456", "/en#code=x", "/en/matches/a/b?x=1", "/en/matches/a/%2f", "/en/../admin"]) {
    assert.equal(memberReturnPath(path), null, path);
    const response = await handler(memberRequest({ phone: "0772123456", destination: path, return: path }, { json: false }));
    assert.equal(response.headers.get("location"), "/en/account");
  }
});

test("member sign-out clears the Lax cookie and cache even with mode off or failing storage", async () => {
  const fixture = memberFixture({ mode: "off" });
  fixture.services.sessions.signOut = async () => { throw new Error("down"); };
  const response = await createMemberSignOutHandler(fixture.resolve)(memberRequest({}));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/en/account?status=signed-out");
  assert.equal(response.headers.get("clear-site-data"), '"cache"');
  assert.match(response.headers.get("set-cookie"), /^goal-hint-member=; .*SameSite=Lax; Max-Age=0$/);
});

test("closed subscriptions allow phone sign-in but never activate a code", async () => {
  const fixture = memberFixture({ mode: "off" });
  const handler = createMemberSignInHandler(fixture.resolve);
  assert.equal((await handler(memberRequest({ phone: "256700000999" }))).status, 200);
  assert.equal(fixture.calls.signIn.length, 1);
  assert.equal((await handler(memberRequest({ phone: "256700000999", code: "0123-4567-89AB" }))).status, 403);
  assert.equal(fixture.calls.signIn.length, 1);
  assert.equal((await createMemberCodeHandler(fixture.resolve)(memberRequest({ code: "0123-4567-89AB" }))).status, 403);
});

test("phone plus code uses the atomic code path, redirects only to safe paths, and retains codes only in request bodies", async () => {
  const fixture = memberFixture(), calls = [];
  fixture.services.codes = { async signInWithCode(...args) { calls.push(args); return { status: "accepted", token: "c".repeat(43) }; } };
  fixture.services.settings.settings.maxUnlockedDevices = 2;
  let response = await createMemberSignInHandler(fixture.resolve)(memberRequest({ phone: "0772123456", code: "0123-4567-89AB", return: "/en" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { next: "/en" });
  assert.equal(fixture.calls.signIn.length, 0);
  assert.equal(calls[0][0], "256772123456");
  assert.equal(calls[0][1], "0123-4567-89AB");
  assert.match(response.headers.get("set-cookie"), /goal-hint-member=c{43}/u);
  fixture.services.codes.signInWithCode = async () => ({ status: "not-recognized" });
  response = await createMemberSignInHandler(fixture.resolve)(memberRequest({ phone: "0772123456", code: "0123-4567-89AB" }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await response.json()).message, "Code not recognized. Codes work only on the number they were sent to.");
  const signed = memberFixture({ member: { blocked: false } });
  signed.services.codes = { async redeem() { return { status: "ended", endsAt: new Date("2026-10-20T11:30:00Z") }; } };
  response = await createMemberCodeHandler(signed.resolve)(memberRequest({ code: "0123-4567-89AB", return: "https://evil.test" }, { json: false }));
  assert.equal(response.status, 303);
  const target = response.headers.get("location");
  assert.match(target, /^\/en\/account\?status=code-ended&ended=/u);
  assert.doesNotMatch(target, /0123|evil/u);
});

test("settings fields parse to canonical numbers, tested shortcuts, trimmed text and in-range whole numbers", () => {
  const parsed = parseSettingsChanges({ mtnNumber: "0700 000 901", airtelNumber: "+256 700-000-903", contactPhone: "2560700000902",
    whatsappPhone: "447700900001", mtnName: "  TEST PAYEE  ", mtnMenuShortcut: " *165*3* {amount} # ", airtelName: "", copyFormat: "local",
    paymentNote: "Line one\r\nLine two ", reviewTime: "Usually within 30 minutes", maxUnlockedDevices: 5, trialDays: 0, screenshotRetentionDays: 7 });
  assert.deepEqual(parsed, { ok: true, changes: { mtnNumber: OWNER_MTN, airtelNumber: "256700000903", contactPhone: OWNER_CONTACT,
    whatsappPhone: "447700900001", mtnName: "TEST PAYEE", mtnMenuShortcut: "*165*3*{amount}#", airtelName: null, copyFormat: "local",
    paymentNote: "Line one\nLine two", reviewTime: "Usually within 30 minutes", maxUnlockedDevices: 5, trialDays: 0, screenshotRetentionDays: 7 } });
  assert.deepEqual(parseSettingsChanges({ mtnNumber: "", contactPhone: null }), { ok: true, changes: { mtnNumber: null, contactPhone: null } },
    "An empty number clears it.");
  const refused = parseSettingsChanges({ mtnNumber: "256254712345678", airtelNumber: "0201234567", mtnMenuShortcut: "*165*{price}#",
    airtelMenuShortcut: "#".repeat(61), mtnName: "x".repeat(65), reviewTime: "two\nlines", copyFormat: "national", maxUnlockedDevices: 6,
    trialDays: 8, screenshotRetentionDays: 6, paymentNote: "bell\u0007" });
  assert.equal(refused.ok, false);
  assert.deepEqual(Object.keys(refused.errors).sort(), ["airtelMenuShortcut", "airtelNumber", "copyFormat", "maxUnlockedDevices", "mtnMenuShortcut",
    "mtnName", "mtnNumber", "paymentNote", "reviewTime", "screenshotRetentionDays", "trialDays"].sort());
  assert.match(refused.errors.mtnNumber, /^For a number outside Uganda, delete 256/);
  for (const [field, values] of [["maxUnlockedDevices", [0, 1.5, "2"]], ["trialDays", [-1]], ["screenshotRetentionDays", [366]]]) {
    for (const value of values) assert.equal(parseSettingsChanges({ [field]: value }).ok, false, `${field} = ${value}`);
  }
  for (const [field, value] of [["maxUnlockedDevices", 1], ["trialDays", 7], ["screenshotRetentionDays", 365]]) {
    assert.equal(parseSettingsChanges({ [field]: value }).ok, true, `${field} = ${value}`);
  }
  assert.match(parseSettingsChanges({ paywallMode: "on" }).errors.changes, /Unknown setting: paywallMode/, "The mode is never saved with the form.");
  assert.equal(parseSettingsChanges([]).ok, false);
});

test("a changed payment number clears its tested shortcut unless the same save sets a new one; a shortcut needs its number", () => {
  const current = settingsWith({ mtnNumber: OWNER_MTN, mtnName: "TEST PAYEE", mtnMenuShortcut: "*165*3#", airtelNumber: "256700000903",
    airtelMenuShortcut: "*185#" });
  const moved = applySettingsChanges(current, { mtnNumber: "256700000904" });
  assert.equal(moved.ok, true);
  assert.equal(moved.change.next.mtnMenuShortcut, null);
  assert.deepEqual(moved.change.cleared, ["mtnMenuShortcut"]);
  assert.deepEqual(moved.change.changed, ["mtnNumber", "mtnMenuShortcut"]);
  assert.deepEqual(moved.change.protectedChanged, ["mtnNumber", "mtnMenuShortcut"]);
  assert.equal(moved.change.paymentNumbersChanged, true);
  assert.equal(moved.change.next.airtelMenuShortcut, "*185#", "The other network keeps its shortcut.");
  const resent = applySettingsChanges(current, { mtnNumber: "256700000904", mtnMenuShortcut: "*165*3#" });
  assert.equal(resent.change.next.mtnMenuShortcut, null, "Sending the old shortcut again is not a new one.");
  const retested = applySettingsChanges(current, { mtnNumber: "256700000904", mtnMenuShortcut: "*165*4*{amount}#" });
  assert.equal(retested.change.next.mtnMenuShortcut, "*165*4*{amount}#");
  assert.deepEqual(retested.change.cleared, []);
  assert.deepEqual(applySettingsChanges(current, { airtelNumber: null }).change.next.airtelMenuShortcut, null, "Removing a number removes its shortcut.");
  assert.deepEqual(applySettingsChanges(settingsWith({}), { mtnMenuShortcut: "*165#" }), { ok: false,
    errors: { mtnMenuShortcut: "Add the payment number first: a menu shortcut works only beside it." } });
  const unchanged = applySettingsChanges(current, { mtnNumber: OWNER_MTN, trialDays: 2 });
  assert.deepEqual([unchanged.change.changed, unchanged.change.paymentNumbersChanged], [[], false], "Same values change nothing.");
  const contact = applySettingsChanges(current, { contactPhone: OWNER_CONTACT, paymentNote: "Note" });
  assert.deepEqual([contact.change.protectedChanged, contact.change.paymentNumbersChanged], [["contactPhone"], false]);
});

test("exactly the eight payment and contact fields are protected", () => {
  assert.deepEqual([...protectedSettingFields].sort(), ["airtelMenuShortcut", "airtelName", "airtelNumber", "contactPhone", "mtnMenuShortcut", "mtnName",
    "mtnNumber", "whatsappPhone"]);
  assert.ok(protectedSettingFields.every((field) => editableSettingFields.includes(field)));
});

test("test and on need an active plan, a named payment number and a contact; on also needs release-ready privacy and terms", () => {
  const keys = (settings, mode, facts) => modeRequirements(settings, mode, facts).map(({ key }) => key);
  assert.deepEqual(keys(defaultSubscriptionSettings, "off", { activePlans: 0, privacyReleaseReady: false, termsReleaseReady: false }), []);
  assert.deepEqual(keys(defaultSubscriptionSettings, "test", { ...ready, activePlans: 0 }), ["plan", "payment-number", "contact"]);
  const complete = settingsWith({ mtnNumber: OWNER_MTN, mtnName: "TEST PAYEE", whatsappPhone: OWNER_CONTACT });
  assert.deepEqual(keys(complete, "test", ready), []);
  assert.deepEqual(keys(settingsWith({ mtnNumber: OWNER_MTN, airtelName: "TEST PAYEE", contactPhone: OWNER_CONTACT }), "test", ready), ["payment-number"],
    "A name must sit beside its own number.");
  assert.deepEqual(keys(complete, "on", { ...ready, privacyReleaseReady: false }), ["privacy"]);
  assert.deepEqual(keys(complete, "on", { ...ready, termsReleaseReady: false }), ["terms"]);
  assert.deepEqual(keys(complete, "on", ready), []);
});

/** A database whose settings read is scripted: a row, null (missing), or an error. */
function scriptedDatabase(script) {
  const state = { reads: 0, row: null, failing: false };
  Object.assign(state, script);
  return { state, database: { async query(run) {
    return run({ subscriptionSettings: { async findUnique() {
      state.reads++;
      await new Promise((resolve) => setImmediate(resolve));
      if (state.failing) throw new Error("Too many connections");
      return state.row;
    } } });
  } } };
}
const row = (fields) => ({ ...defaultSubscriptionSettings, id: 1, paymentNumbersChangedAt: null, lastMembersPurgeAt: null,
  updatedAt: new Date("2026-10-19T07:00:00.000Z"), updatedBy: "owner", ...fields });

test("environment identity overrides stored history and managed updates fail before database or password work", async () => {
  const { database, state } = scriptedDatabase({ row: row({ mtnNumber: OWNER_MTN, mtnName: "OLD PAYEE", whatsappPhone: OWNER_CONTACT }) });
  const environment = { mtnNumber: "256700000910", mtnName: "ENV PAYEE", airtelNumber: null, airtelName: null,
    mtnMenuShortcut: null, airtelMenuShortcut: null, contactPhone: "256700000911", whatsappPhone: null };
  const service = createSettingsService(database, { environment });
  assert.deepEqual(service.environmentFields, protectedSettingFields);
  const settings = (await service.current()).settings;
  for (const [key, value] of Object.entries(environment)) assert.equal(settings[key], value, key);
  assert.equal(state.row.mtnNumber, OWNER_MTN, "stored history is preserved");
  assert.equal(state.row.whatsappPhone, OWNER_CONTACT, "an absent environment value never falls back to storage");
  const reads = state.reads;
  for (const field of protectedSettingFields) {
    const refused = await service.save("owner", { [field]: null }, { password: "unused", confirm() { assert.fail("password must not be checked"); } });
    assert.equal(refused.status, "invalid");
    assert.match(refused.errors[field], /environment variables/u);
  }
  assert.equal(state.reads, reads, "managed fields are rejected before any database access");
});

test("public reads cache settings for 30 s, serve the last good value on failure, and resolve to free with none", async () => {
  const clock = { now: 0 };
  const { state, database } = scriptedDatabase({});
  const service = createSettingsService(database, { environment: null, now: () => clock.now });
  const missing = await service.current();
  assert.deepEqual({ source: missing.source, mode: missing.settings.paywallMode, trialDays: missing.settings.trialDays }, { source: "defaults", mode: "off", trialDays: 2 },
    "A missing row reads off with a 2-day trial.");
  assert.equal(accessMode(missing), "off");
  state.row = row({ paywallMode: "test" });
  clock.now += settingsCacheRules.freshMs - 1;
  assert.equal((await service.current()).settings.paywallMode, "off", "Within 30 s the cached value is served.");
  assert.equal(state.reads, 1);
  clock.now += 1;
  const [first, second] = await Promise.all([service.current(), service.current()]);
  assert.equal(first, second, "Concurrent readers share one query.");
  assert.deepEqual([first.source, first.settings.paywallMode, state.reads], ["stored", "test", 2]);
  assert.equal(first.settings.updatedAt, "2026-10-19T07:00:00.000Z");
  state.failing = true;
  clock.now += settingsCacheRules.freshMs;
  const stale = await service.current();
  assert.deepEqual([stale.source, accessMode(stale)], ["last-good", "test"], "A failed read keeps the last good value.");
  clock.now += settingsCacheRules.failureRetryMs - 1;
  await service.current();
  assert.equal(state.reads, 3, "A failure is retried after 5 s, not on every request.");
  clock.now += 1;
  state.failing = false; state.row = row({ paywallMode: "maybe" });
  assert.equal((await service.current()).source, "last-good", "A row outside the reviewed shape counts as a failed read.");

  const cold = createSettingsService(scriptedDatabase({ failing: true }).database, { environment: null, now: () => clock.now });
  const none = await cold.current();
  assert.deepEqual([none.source, none.settings, accessMode(none)], ["unavailable", null, "free"],
    "With no good value, access resolves to free, so an outage never opens subscriber content.");
});

test("audit details refuse images, full codes and subscriber phones; owner settings may name the owner's numbers", () => {
  assert.deepEqual(auditDetails({ at: new Date("2026-10-19T07:00:00.000Z"), plan: "8b6f2c1e-4a3d-4f5e-9a1b-123456789012", reference: "C-7K2Q",
    changes: { mtnNumber: { from: null, to: OWNER_MTN }, paymentNote: { from: null, to: `Call ${OWNER_CONTACT}` } }, ending: "ending 456" }),
  { at: "2026-10-19T07:00:00.000Z", plan: "8b6f2c1e-4a3d-4f5e-9a1b-123456789012", reference: "C-7K2Q",
    changes: { mtnNumber: { from: null, to: OWNER_MTN }, paymentNote: { from: null, to: `Call ${OWNER_CONTACT}` } }, ending: "ending 456" });
  for (const [label, details] of [["a subscriber phone", { account: "256700000101" }], ["a plus phone", { note: "paid from +256700000101" }],
    ["a phone in a list", { numbers: ["256700000101"] }], ["a full code", { code: "7K2Q-9MXA-4TPB" }], ["a code in text", { text: "code 7K2Q-9MXA-4TPB sent" }],
    ["image bytes", { image: Buffer.from([0xff, 0xd8]) }], ["typed bytes", { image: new Uint8Array(2) }], ["a class instance", { map: new Map() }]]) {
    assert.throws(() => auditDetails(details), UnsafeAuditDetailsError, label);
  }
});

test("plan ids never read as access codes, and owner text the audit would refuse is invalid before anything is read or written", async () => {
  // Lowercase UUIDs whose all-digit groups sit between dashes, as about 1 random plan id in 120 does.
  const ids = ["a0a91f8c-c12a-4408-8298-2803f2e10e62", "1dbb6a34-9058-4788-8390-6b0520d7f810", "bc53c263-f1d6-4547-9618-7968d7ebf028"];
  for (const id of [...ids, ...ids.map((id) => id.toUpperCase())]) assert.deepEqual(auditDetails({ from: [id], to: [id] }), { from: [id], to: [id] }, id);
  for (let sample = 0; sample < 20_000; sample++) auditDetails({ plan: randomUUID() });
  for (const text of ["code: 7K2Q-9MXA-4TPB", "#code=7K2Q-9MXA-4TPB", "(7K2Q-9MXA-4TPB).", "1234-5678-9012"]) {
    assert.throws(() => auditDetails({ text }), UnsafeAuditDetailsError, text);
  }
  assert.deepEqual(auditTextErrors({ name: "Promo 2025-2026-XMAS", durationDays: 1 }), { name: "Remove what reads as an access code: the owner audit never stores one." });
  assert.deepEqual(auditTextErrors({ name: "Call 256700000101" }), { name: "Remove what reads as a phone number: the owner audit never stores one." });
  assert.equal(auditTextErrors({ name: "Weekly", durationDays: 7, priceUgx: 5000 }), null);
  assert.equal(auditTextErrors({ paymentNote: `Call ${OWNER_CONTACT}` }, { ownerSetting: true }), null, "Owner settings may name the owner's numbers.");

  // Refused before the transaction, so the owner sees which field to change instead of "storage is unavailable".
  const untouched = { async query() { throw new Error("unexpected read"); }, async transaction() { throw new Error("unexpected write"); } };
  const plans = createPlansService(untouched);
  for (const outcome of [await plans.create("owner", { name: "Promo 2025-2026-XMAS", durationDays: 1, priceUgx: 1000 }),
    await plans.edit("owner", ids[2], { name: "Call 256700000101" })]) assert.deepEqual([outcome.status, Object.keys(outcome.errors)], ["invalid", ["name"]]);
  const saved = await createSettingsService(untouched, { environment: null }).save("owner", { paymentNote: "Ref 1234-5678-9012" },
    { password: null, async confirm() { throw new Error("unexpected password check"); } });
  assert.deepEqual([saved.status, Object.keys(saved.errors)], ["invalid", ["paymentNote"]]);
});

test("the sign-in audit writes owner sign-ins, sign-outs and counted refusals without credentials", async () => {
  const rows = [];
  const database = { query: async (run) => run({ ownerAuditEvent: { async create({ data }) { rows.push(data); } } }) };
  const audit = ownerSignInAudit(async () => ({ database }), "analytics", { now: () => Date.parse("2026-10-19T07:00:00.000Z") });
  await audit({ action: "sign-in", username: "owner" });
  await audit({ action: "sign-in-refused", reason: "locked" });
  await audit({ action: "sign-out", username: "owner" });
  assert.deepEqual(rows.map(({ at, actor, action, accountId, targetType, targetId, details }) => [at.toISOString(), actor, action, accountId, targetType, targetId, details]), [
    ["2026-10-19T07:00:00.000Z", "owner", "owner_signed_in", null, "owner-session", "analytics", { surface: "analytics" }],
    ["2026-10-19T07:00:00.000Z", "unverified", "owner_sign_in_refused", null, "owner-session", "analytics", { surface: "analytics", reason: "locked" }],
    ["2026-10-19T07:00:00.000Z", "owner", "owner_signed_out", null, "owner-session", "analytics", { surface: "analytics" }],
  ]);
  await ownerSignInAudit(async () => ({ database: null }), "admin")({ action: "sign-in", username: "owner" });
  assert.equal(rows.length, 3, "Without storage nothing is written and nothing throws.");
  await assert.rejects(writeOwnerAudit({ ownerAuditEvent: { async create() { throw new Error("unexpected write"); } } },
    { at: new Date(), actor: "owner", action: "settings_changed", targetType: "settings", targetId: "1", details: { payer: "256700000101" } }),
  UnsafeAuditDetailsError, "Unsafe details are refused before anything is written.");
});

test("plans take a name of at most 40 characters, 1-366 days and UGX 100-10,000,000; edits may send some fields", () => {
  assert.deepEqual(parsePlanFields({ name: "  Weekly ", durationDays: 7, priceUgx: 5000 }), { ok: true, fields: { name: "Weekly", durationDays: 7, priceUgx: 5000 } });
  assert.deepEqual(parsePlanFields({ name: "x".repeat(planRules.nameMaxLength), durationDays: 366, priceUgx: 10_000_000 }).ok, true);
  for (const plan of [{ name: "", durationDays: 7, priceUgx: 5000 }, { name: "x".repeat(41), durationDays: 7, priceUgx: 5000 },
    { name: "Daily", durationDays: 0, priceUgx: 1000 }, { name: "Daily", durationDays: 367, priceUgx: 1000 }, { name: "Daily", durationDays: 1.5, priceUgx: 1000 },
    { name: "Daily", durationDays: 1, priceUgx: 99 }, { name: "Daily", durationDays: 1, priceUgx: 10_000_001 }, { name: "Daily", durationDays: "1", priceUgx: 1000 },
    { name: "Daily", durationDays: 1, priceUgx: 1000, features: ["tips"] }, { name: "Daily" }]) {
    assert.equal(parsePlanFields(plan).ok, false, JSON.stringify(plan));
  }
  assert.deepEqual(parsePlanFields({ priceUgx: 20_000 }, { partial: true }), { ok: true, fields: { priceUgx: 20_000 } });
  assert.equal(parsePlanFields({}, { partial: true }).ok, false);
  assert.deepEqual([formatUgx(1000), formatUgx(10_000_000), formatPlanLength(1), formatPlanLength(30)], ["UGX 1,000", "UGX 10,000,000", "24 hours", "30 days"]);
});

test("no code path deletes a plan, settings or an audit row", async () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const files = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "generated") await walk(full); }
      else if (/\.(ts|tsx)$/u.test(entry.name)) files.push(full);
    }
  };
  await walk(root);
  assert.ok(files.length > 100, `scanned ${files.length} files`);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /\b(subscriptionPlan|subscriptionSettings|ownerAuditEvent)\.delete(Many)?\(/u, file);
    assert.doesNotMatch(text, /DELETE\s+FROM\s+`?(SubscriptionPlan|SubscriptionSettings|OwnerAuditEvent)\b/iu, file);
  }
});

test("settings answers: wrong-password locks are 429 with Retry-After, unmet requirements 409, failures 503", async () => {
  const owner = { username: "owner", expiresAt: new Date() };
  const outcomes = [
    [{ status: "password-refused", check: { status: "locked", retryAfterSeconds: 600, newlyLocked: true, ownerUsername: true } }, 429, "locked"],
    [{ status: "password-refused", check: { status: "unavailable" } }, 503, "unavailable"],
    [{ status: "requirements", mode: "test", missing: [{ key: "plan", message: "Add an active plan on the Plans page." }] }, 409, "requirements"],
    [new Error("Too many connections"), 503, "unavailable"],
  ];
  for (const [outcome, status, error] of outcomes) {
    const service = () => ({ async save() { if (outcome instanceof Error) throw outcome; return outcome; } });
    const { POST } = createSettingsHandlers({ service });
    const response = await POST({ owner, services: { database: {}, auth: null }, request: new Request("http://localhost:3000/api/admin/settings",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", changes: {}, password: "x" }) }) });
    assert.equal(response.status, status, error);
    assert.equal((await response.json()).error, error);
    if (status === 429) assert.equal(response.headers.get("retry-after"), "600");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("a committed save or mode switch answers saved even when the page data cannot be read again", async () => {
  const owner = { username: "owner", expiresAt: new Date() };
  const stored = settingsWith({ paywallMode: "test", updatedAt: "2026-10-19T07:00:00.000Z", updatedBy: "owner" });
  const requirements = { test: [], on: [{ key: "privacy", message: "The privacy notice is not release-ready yet." }] };
  const saved = { status: "saved", settings: stored, changed: ["mtnMenuShortcut"], cleared: ["mtnMenuShortcut"] };
  for (const readable of [true, false]) {
    for (const body of [{ action: "mode", mode: "test" }, { action: "save", changes: { mtnMenuShortcut: null } }]) {
      const service = () => ({ async save() { return saved; }, async setMode() { return saved; },
        async overview() { if (!readable) throw new Error("Too many connections"); return { settings: stored, source: "stored", requirements }; } });
      const { POST } = createSettingsHandlers({ service });
      const response = await POST({ owner, services: { database: {}, auth: null }, request: new Request("http://localhost:3000/api/admin/settings",
        { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.8" }, body: JSON.stringify(body) }) });
      assert.equal(response.status, 200, `${body.action}, page data ${readable ? "read" : "unreadable"}`);
      const reply = await response.json();
      assert.deepEqual([reply.settings, reply.changed, reply.cleared, reply.protectedFields, reply.diagnostics.address],
        [stored, ["mtnMenuShortcut"], ["mtnMenuShortcut"], [...protectedSettingFields], "203.0.113.8"]);
      assert.deepEqual([reply.source, reply.requirements], readable ? ["stored", requirements] : [undefined, undefined],
        "Requirements come only from a fresh read; the page keeps its own until a reload.");
    }
  }
});

test("owner revenue periods use Kampala civil month/week boundaries",async()=>{
 const {revenueBounds}=await import("../src/server/admin/subscribers.ts");
 const before=revenueBounds(Date.parse("2026-11-01T20:59:59Z"));assert.equal(before.week.toISOString(),"2026-10-25T21:00:00.000Z");
 const after=revenueBounds(Date.parse("2026-11-01T21:00:00Z"));assert.equal(after.week.toISOString(),"2026-11-01T21:00:00.000Z");assert.equal(after.month.toISOString(),"2026-10-31T21:00:00.000Z");
});
