import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { canonicalSlipConfigurationParameters, slipConfigurationCriteria, slipConfigurationHref, slipConfigurationMutationSchema } from "../src/domain/slip-configurations.ts";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria } from "../src/domain/slip-builder.ts";
import { createSlipConfigurationsHandler } from "../src/server/slips/slip-configurations-http.ts";
import { memberTokenHash } from "../src/server/members/member-sessions.ts";

import { slipConfigurationFixture as fixture } from "./helpers/slip-configuration-fixture.mjs";

const at = new Date("2026-10-31T09:00:00Z"), DAY = 86_400_000;
const parameters = serializeSlipCriteria({ ...defaultSlipCriteria("2026-10-31"), probMin: 82.123, oddsMax: 375,
  markets: ["match-result", "both-teams-to-score"], outcomes: { "match-result": ["home-win", "draw"] }, reuse: true }).toString();
const create = (name, isDefault = false) => ({ action: "create", name, parameters, isDefault });


const request = (token, body, headers = {}) => new Request("http://localhost:3000/api/account/slip-configurations", {
  method: body ? "POST" : "GET", headers: { "sec-fetch-site": "same-origin", host: "localhost:3000", cookie: `goal-hint-member=${token}`,
    ...(body ? { "content-type": "application/json" } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
});

test("configuration filters preserve reusable fields without dates or generation/navigation flags", () => {
  const canonical = canonicalSlipConfigurationParameters(parameters, "2026-10-31");
  const saved = new URLSearchParams(canonical);
  assert.equal(saved.has("dateFrom"), false); assert.equal(saved.has("dateTo"), false);
  const expected = { ...parseSlipCriteria(new URLSearchParams(parameters), "2026-10-31"), timeFrom: "00:00", timeTo: "23:59" };
  assert.deepEqual(parseSlipCriteria(saved, "2026-10-31"), expected);
  const url = new URL(slipConfigurationHref({ id: randomUUID(), parameters: canonical }, "en", "2026-11-01"), "https://example.test");
  assert.equal(url.pathname, "/en/slips"); assert.equal(url.searchParams.has("build"), false);
  assert.equal(url.searchParams.get("dateFrom"), "2026-11-01"); assert.equal(url.searchParams.get("dateTo"), "2026-11-01");
  assert.equal(url.searchParams.get("probMin"), "82.123"); assert.ok(url.searchParams.has("configuration"));
  for (const query of [`${parameters}&build=1`, `${parameters}&configuration=${randomUUID()}`, `${parameters}&accountId=${randomUUID()}`,
    "markets=", "timeFrom=25%3A00&timeTo=26%3A00", "x".repeat(2049)]) {
    assert.throws(() => canonicalSlipConfigurationParameters(query));
  }
});

test("legacy dated configurations load for each current reporting day while retaining the chosen time range", () => {
  const query = new URLSearchParams(parameters);
  query.set("dateFrom", "2020-01-01"); query.set("dateTo", "2020-01-15");
  query.set("timeFrom", "09:30"); query.set("timeTo", "18:45");
  const legacy = { id: randomUUID(), parameters: query.toString() };
  const canonical = canonicalSlipConfigurationParameters(legacy.parameters, "2026-10-31");
  assert.equal(new URLSearchParams(canonical).has("dateFrom"), false);
  assert.equal(canonicalSlipConfigurationParameters(canonical, "2026-11-01"), canonical);
  for (const day of ["2026-10-31", "2026-11-01"]) {
    const draft = slipConfigurationCriteria(legacy.parameters, day);
    const loaded = new URL(slipConfigurationHref(legacy, "en", day), "https://example.test").searchParams;
    assert.deepEqual(draft, parseSlipCriteria(new URLSearchParams(canonical), day));
    assert.equal(draft.dateFrom, day); assert.equal(draft.dateTo, day);
    assert.equal(loaded.get("dateFrom"), day); assert.equal(loaded.get("dateTo"), day);
    assert.equal(loaded.get("timeFrom"), "09:30"); assert.equal(loaded.get("timeTo"), "18:45");
    assert.equal(loaded.has("build"), false);
  }
});

test("save, restart/read, rename and replace filters persist independently of subscriptions and sessions", async () => {
  const f = fixture(), member = f.first.member;
  const saved = await f.service.mutate(member, create("  Morning picks  "));
  assert.equal(saved.status, "saved"); let record = saved.configurations[0];
  assert.equal(record.name, "Morning picks"); assert.equal(record.isDefault, false);
  assert.equal(new URLSearchParams([...f.rows.values()][0].parameters).has("dateFrom"), false);
  const anotherDevice = { ...member, tokenHash: memberTokenHash("c".repeat(43)) };
  f.sessions.set(anotherDevice.tokenHash, { ...f.first.session, tokenHash: anotherDevice.tokenHash });
  assert.deepEqual((await f.restart().read(anotherDevice)).configurations, saved.configurations);
  let changed = await f.restart().mutate(member, { action: "rename", id: record.id, revision: record.revision, name: "Evening picks" });
  record = changed.configurations[0]; assert.equal(record.name, "Evening picks"); assert.equal(record.revision, 2);
  const next = serializeSlipCriteria({ ...defaultSlipCriteria("2026-11-01"), timeFrom: "08:15", timeTo: "21:30", teamsMin: 3, teamsMax: 8, slips: 9 }).toString();
  changed = await f.service.mutate(member, { action: "update", id: record.id, revision: record.revision, parameters: next });
  record = changed.configurations[0]; assert.equal(record.name, "Evening picks");
  const updated = new URLSearchParams(record.parameters);
  assert.equal(updated.has("dateFrom"), false); assert.equal(updated.has("dateTo"), false);
  assert.equal(updated.get("timeFrom"), "08:15"); assert.equal(updated.get("timeTo"), "21:30"); assert.equal(record.revision, 3);
  assert.equal((await f.restart().read(anotherDevice)).configurations[0].parameters, record.parameters);
  assert.ok(f.locks.every(lock => /FOR UPDATE/u.test(lock.sql)), "Every operation revalidates under the account lock");
});

test("reading an existing dated save removes legacy dates without altering its time range or revision", async () => {
  const f = fixture();
  const saved = (await f.service.mutate(f.first.member, create("Legacy filters"))).configurations[0];
  const legacy = new URLSearchParams(parameters);
  legacy.set("dateFrom", "2020-01-01"); legacy.set("dateTo", "2020-12-31");
  legacy.set("timeFrom", "07:45"); legacy.set("timeTo", "22:15");
  f.rows.get(saved.id).parameters = legacy.toString();
  const current = (await f.restart().read(f.first.member)).configurations[0];
  const filters = new URLSearchParams(current.parameters);
  assert.equal(filters.has("dateFrom"), false); assert.equal(filters.has("dateTo"), false);
  assert.equal(filters.get("timeFrom"), "07:45"); assert.equal(filters.get("timeTo"), "22:15");
  assert.equal(current.revision, saved.revision);
});

test("concurrent saves never exceed ten per owner and deleting frees a slot", async () => {
  const f = fixture(), results = await Promise.all(Array.from({ length: 13 }, (_, i) => f.service.mutate(f.first.member, create(`Configuration ${i}`))));
  assert.equal(results.filter(result => result.status === "saved").length, 10);
  assert.equal(results.filter(result => result.status === "limit").length, 3);
  assert.equal((await f.service.mutate(f.second.member, create("Other account"))).status, "saved");
  const record = (await f.service.read(f.first.member)).configurations[0];
  assert.equal((await f.service.mutate(f.first.member, { action: "delete", id: record.id, revision: record.revision })).configurations.length, 9);
  assert.equal((await f.service.mutate(f.first.member, create("Replacement"))).configurations.length, 10);
});

test("the optional default is unique, can be changed/cleared/deleted, and changes invalidate stale revisions", async () => {
  const f = fixture();
  const original = (await f.service.mutate(f.first.member, create("First", true))).configurations[0];
  let records = (await f.service.mutate(f.first.member, create("Second", true))).configurations;
  assert.equal(records.filter(row => row.isDefault).length, 1); assert.equal(records.find(row => row.isDefault).name, "Second");
  assert.equal((await f.service.mutate(f.first.member, { action: "rename", id: original.id, revision: original.revision, name: "Stale" })).status, "conflict");
  let record = records.find(row => row.name === "First");
  records = (await f.service.mutate(f.first.member, { action: "default", id: record.id, revision: record.revision, isDefault: true })).configurations;
  record = records.find(row => row.isDefault); assert.equal(record.name, "First");
  records = (await f.service.mutate(f.first.member, { action: "default", id: record.id, revision: record.revision, isDefault: false })).configurations;
  assert.equal(records.some(row => row.isDefault), false); assert.ok([...f.rows.values()].every(row => row.isDefault === null));
  record = records[0]; records = (await f.service.mutate(f.first.member, { action: "default", id: record.id, revision: record.revision, isDefault: true })).configurations;
  record = records.find(row => row.isDefault);
  records = (await f.service.mutate(f.first.member, { action: "delete", id: record.id, revision: record.revision })).configurations;
  assert.equal(records.some(row => row.isDefault), false);
});

test("owner-scoped operations reject another user's IDs, duplicate names and invalid filters without changes", async () => {
  const f = fixture(), original = (await f.service.mutate(f.first.member, create("Morning"))).configurations[0];
  for (const action of [{ action: "rename", name: "Stolen" }, { action: "update", parameters }, { action: "delete" }, { action: "default", isDefault: true }]) {
    assert.equal((await f.service.mutate(f.second.member, { ...action, id: original.id, revision: original.revision })).status, "not-found");
  }
  assert.deepEqual((await f.service.read(f.second.member)).configurations, []);
  assert.equal((await f.service.mutate(f.first.member, create("MORNING"))).status, "name-taken");
  assert.equal((await f.service.mutate(f.first.member, { ...create("Broken", true), parameters: `${parameters}&build=1` })).status, "invalid");
  assert.equal((await f.service.mutate(f.first.member, { ...create("Injected"), accountId: f.second.account.id })).status, "invalid");
  assert.equal(f.rows.size, 1); assert.equal((await f.service.read(f.first.member)).configurations[0].isDefault, false);
  for (const name of ["", " ", "x".repeat(61), "Line\nbreak"]) assert.equal(slipConfigurationMutationSchema.safeParse(create(name)).success, false);
});

test("the service rechecks revoked, expired, blocked, unverified, erased and mismatched sessions", async () => {
  for (const invalidate of [f => f.sessions.clear(), f => f.advance(DAY), f => { f.first.session.authenticatedAt = null; },
    f => { f.first.session.passwordResetAt = at; }, f => { f.first.account.blockedAt = at; }, f => { f.first.account.erasedAt = at; },
    f => { f.first.account.phoneVerifiedAt = null; }, f => { f.first.account.phone = "256700000099"; }, f => { f.first.session.accountId = f.second.account.id; }]) {
    const f = fixture(); invalidate(f);
    assert.equal((await f.service.read(f.first.member)).status, "forbidden");
    assert.equal((await f.service.mutate(f.first.member, create("Refused"))).status, "forbidden"); assert.equal(f.rows.size, 0);
  }
});

test("HTTP contracts are private, authenticated, bounded and available with closed/expired subscription access", async () => {
  const f = fixture(), source = async () => f.services, write = createSlipConfigurationsHandler("write", source), read = createSlipConfigurationsHandler("read", source);
  const saved = await write(request(f.first.token, create("My filters", true)));
  assert.equal(saved.status, 200); assert.equal(saved.headers.get("cache-control"), "no-store");
  assert.deepEqual(await (await read(request(f.first.token))).json(), await saved.json());
  for (const [body, headers, code] of [[create("Cross-site"), { "sec-fetch-site": "cross-site" }, 403],
    [create("Unsigned"), { cookie: "" }, 403], [create("Wrong content"), { "content-type": "text/plain" }, 400],
    [{ ...create("Wrong owner"), accountId: f.second.account.id }, {}, 400], [{ ...create("Too large"), parameters: "x".repeat(9000) }, {}, 400]]) {
    assert.equal((await write(request(f.first.token, body, headers))).status, code);
  }
  assert.equal(f.rows.size, 1);
  const record = [...f.rows.values()][0];
  assert.equal((await write(request(f.second.token, { action: "delete", id: record.id, revision: record.revision }))).status, 404);
  f.services.configurations = null;
  assert.equal((await read(request(f.first.token))).status, 503);
});
