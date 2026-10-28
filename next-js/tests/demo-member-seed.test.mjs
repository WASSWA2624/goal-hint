import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hashCode } from "../src/server/members/access-codes.ts";
import { seedDemoMember } from "../src/server/demo/member-seed.ts";
import { demoMember } from "../src/server/demo/member.ts";

const dayMs = 86_400_000, firstNow = Date.parse("2026-10-28T18:00:00Z");
const tokenHash = createHash("sha256").update(demoMember.token).digest("hex");

function seedDatabase(t) {
  const environment = { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true", DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_tests" };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  function table(key) {
    const rows = new Map();
    return { rows,
      async findUnique({ where }) { return structuredClone(rows.get(where[key]) ?? null); },
      async create({ data }) { assert.equal(rows.has(data[key]), false); rows.set(data[key], structuredClone(data)); return structuredClone(data); },
      async update({ where, data }) {
        const row = rows.get(where[key]); assert.ok(row); Object.assign(row, structuredClone(data)); return structuredClone(row);
      },
      async upsert({ where, update, create }) {
        if (!rows.has(where[key])) rows.set(where[key], structuredClone(create));
        else Object.assign(rows.get(where[key]), structuredClone(update));
        return structuredClone(rows.get(where[key]));
      },
    };
  }
  const account = table("id"), access = table("id"), session = table("tokenHash"), entries = [];
  session.updateMany = async ({ where, data }) => {
    const row = session.rows.get(where.tokenHash);
    if (!row || row.expiresAt > where.expiresAt.lte) return { count: 0 };
    Object.assign(row, structuredClone(data)); return { count: 1 };
  };
  const tx = { subscriptionSettings: table("id"), subscriptionPlan: table("id"), memberAccount: account, accessCode: access, memberSession: session,
    walletEntry: { count: async () => entries.length, create: async ({ data }) => { entries.push(structuredClone(data)); return data; } },
    async $queryRaw(sql) {
      const query = sql.join(" ");
      if (query.includes("SELECT creditUgx")) return [{ creditUgx: account.rows.get(demoMember.accountId).creditUgx }];
      assert.match(query, /SELECT entryNumber/u);
      return entries.length ? [{ entryNumber: entries.at(-1).entryNumber }] : [];
    },
  };
  return { account, access, session, entries, database: { transaction: async (operation) => operation(tx) } };
}

test("repeated demo seeds preserve active periods, sessions and wallet history", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  const access = state.access.rows.get(demoMember.accessCodeId), session = state.session.rows.get(tokenHash);
  assert.equal(access.startsAt.getTime(), firstNow - dayMs);
  assert.equal(access.endsAt.getTime(), firstNow + 365 * dayMs);
  assert.equal(access.codeHash, hashCode(access.codeSalt, demoMember.accessCode));
  assert.equal(state.account.rows.get(demoMember.accountId).phone, demoMember.phone);
  assert.equal(session.authenticatedAt.getTime(), firstNow - dayMs);
  assert.equal(session.accessCodeId, access.id);
  // A normal member action may have changed the current session since bootstrap.
  session.lastSeenAt = new Date(firstNow + dayMs);
  session.codeEnteredAt = null;
  session.accessCodeId = null;
  const originalAccess = structuredClone(access), originalSession = structuredClone(session);
  await seedDemoMember(state.database, firstNow + 2 * dayMs);
  assert.deepEqual(state.access.rows.get(access.id), originalAccess);
  assert.deepEqual(state.session.rows.get(tokenHash), originalSession);
  assert.equal(state.entries.length, 1);
  assert.equal(state.account.rows.get(demoMember.accountId).creditUgx, 100_000);
});

test("expired demo access and session renew from the supplied wall clock without resetting identity or unlock fields", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  const originalAccess = structuredClone(state.access.rows.get(demoMember.accessCodeId));
  const originalSession = structuredClone(state.session.rows.get(tokenHash));
  const renewedAt = originalAccess.endsAt.getTime();
  await seedDemoMember(state.database, renewedAt);
  const access = state.access.rows.get(demoMember.accessCodeId), session = state.session.rows.get(tokenHash);
  assert.equal(access.startsAt.getTime(), renewedAt - dayMs);
  assert.equal(access.endsAt.getTime(), renewedAt + 365 * dayMs);
  assert.deepEqual(access.createdAt, originalAccess.createdAt);
  assert.deepEqual(access.activatedAt, originalAccess.activatedAt);
  assert.deepEqual(session, { ...originalSession, expiresAt: access.endsAt });
  assert.equal(state.entries.length, 1);
});

test("an expired session extends to existing active access without moving the access period", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  const originalAccess = structuredClone(state.access.rows.get(demoMember.accessCodeId));
  const session = state.session.rows.get(tokenHash);
  session.expiresAt = new Date(firstNow + dayMs);
  session.codeEnteredAt = null;
  session.accessCodeId = null;
  const originalSession = structuredClone(session);
  await seedDemoMember(state.database, firstNow + 2 * dayMs);
  assert.deepEqual(state.access.rows.get(demoMember.accessCodeId), originalAccess);
  assert.deepEqual(state.session.rows.get(tokenHash), { ...originalSession, expiresAt: originalAccess.endsAt });
});

test("repeated catalog seeds respect a demo session deleted by sign-out", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  state.session.rows.delete(tokenHash);
  await seedDemoMember(state.database, firstNow + dayMs);
  assert.equal(state.session.rows.has(tokenHash), false);
  assert.equal(state.entries.length, 1);
});

test("the default demo member clock uses Date.now", async (t) => {
  const state = seedDatabase(t), nowMs = firstNow + 400 * dayMs;
  t.mock.method(Date, "now", () => nowMs);
  await seedDemoMember(state.database);
  assert.equal(state.access.rows.get(demoMember.accessCodeId).endsAt.getTime(), nowMs + 365 * dayMs);
  assert.equal(state.session.rows.get(tokenHash).expiresAt.getTime(), nowMs + 365 * dayMs);
});
