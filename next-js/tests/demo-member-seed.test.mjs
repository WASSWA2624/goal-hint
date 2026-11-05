import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { seedDemoMember } from "../src/server/demo/member-seed.ts";
import { demoMember } from "../src/server/demo/member.ts";
import { memberSessionRules } from "../src/server/members/member-sessions.ts";

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
      async upsert({ where, update, create }) {
        if (!rows.has(where[key])) rows.set(where[key], structuredClone(create));
        else Object.assign(rows.get(where[key]), structuredClone(update));
        return structuredClone(rows.get(where[key]));
      },
    };
  }
  const account = table("id"), session = table("tokenHash");
  session.updateMany = async ({ where, data }) => {
    const row = session.rows.get(where.tokenHash);
    if (!row || row.expiresAt > where.expiresAt.lte) return { count: 0 };
    Object.assign(row, structuredClone(data)); return { count: 1 };
  };
  const tx = { subscriptionSettings: table("id"), memberAccount: account, memberSession: session };
  return { account, session, database: { transaction: async (operation) => operation(tx) } };
}

test("demo bootstrap creates a normal sign-in identity without plans, paid access or synthetic credit", async (t) => {
  // No financial table methods are supplied: an attempt to recreate them fails.
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  const account = state.account.rows.get(demoMember.accountId), session = state.session.rows.get(tokenHash);
  assert.equal(account.phone, demoMember.phone);
  assert.equal(account.creditUgx, 0);
  assert.equal(session.authenticatedAt.getTime(), firstNow - dayMs);
  assert.equal(session.expiresAt.getTime(), firstNow + memberSessionRules.expiryMs);
  assert.equal(session.accessCodeId, undefined);
  assert.equal(session.codeEnteredAt, undefined);
});

test("repeated demo seeds preserve owner-edited account and active session state", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  const account = state.account.rows.get(demoMember.accountId), session = state.session.rows.get(tokenHash);
  account.ownerNote = "Owner edit";
  account.creditUgx = 7500;
  session.lastSeenAt = new Date(firstNow + dayMs);
  const originalAccount = structuredClone(account), originalSession = structuredClone(session);
  await seedDemoMember(state.database, firstNow + 2 * dayMs);
  assert.deepEqual(state.account.rows.get(account.id), originalAccount);
  assert.deepEqual(state.session.rows.get(tokenHash), originalSession);
});

test("an expired demo session refreshes its normal sign-in lifetime without granting access", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  const originalSession = structuredClone(state.session.rows.get(tokenHash)), nowMs = originalSession.expiresAt.getTime();
  await seedDemoMember(state.database, nowMs);
  assert.deepEqual(state.session.rows.get(tokenHash), { ...originalSession, expiresAt: new Date(nowMs + memberSessionRules.expiryMs) });
});

test("repeated catalog seeds respect a demo session deleted by sign-out", async (t) => {
  const state = seedDatabase(t);
  await seedDemoMember(state.database, firstNow);
  state.session.rows.delete(tokenHash);
  await seedDemoMember(state.database, firstNow + dayMs);
  assert.equal(state.session.rows.has(tokenHash), false);
});

test("the default demo member clock uses Date.now", async (t) => {
  const state = seedDatabase(t), nowMs = firstNow + 400 * dayMs;
  t.mock.method(Date, "now", () => nowMs);
  await seedDemoMember(state.database);
  assert.equal(state.session.rows.get(tokenHash).expiresAt.getTime(), nowMs + memberSessionRules.expiryMs);
});
