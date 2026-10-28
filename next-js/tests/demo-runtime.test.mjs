import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { isDevelopmentDemo } from "../src/domain/development-demo.ts";
import { isCanonicalPhone } from "../src/domain/phone.ts";
import { normalizeCode } from "../src/domain/access-code.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { assertDemoDatabase, demoMember, developmentMemberToken } from "../src/server/demo/member.ts";

const development = { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" };

test("demo source and synthetic odds are strictly limited to development", () => {
  assert.equal(isDevelopmentDemo(development), true);
  assert.equal(isDevelopmentDemo({ NODE_ENV: "development" }), true);
  assert.equal(isDevelopmentDemo({ ...development, NEXT_PUBLIC_GOAL_HINT_DEMO: "false" }), false);
  for (const NODE_ENV of ["production", "test", undefined, "staging"]) {
    assert.equal(isDevelopmentDemo({ ...development, NODE_ENV }), false);
  }
});

test("only the documented public demo flag is accepted by the private runtime contract", () => {
  assert.equal(parseRuntimePolicy({ ...development, GOAL_HINT_DEMO: "true", GOAL_HINT_DEMO_MEMBER: "false" }).mode, "development");
  assert.equal(parseRuntimePolicy({ NODE_ENV: "production", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" }).mode, "production");
  for (const value of ["yes", "1", "secret"]) assert.throws(() => parseRuntimePolicy({ ...development, NEXT_PUBLIC_GOAL_HINT_DEMO: value }));
  assert.throws(() => parseRuntimePolicy({ ...development, NEXT_PUBLIC_OTHER_SETTING: "true" }));
});

test("demo identity fills only the absent cookie and never overrides a signed-out choice", () => {
  assert.equal(isCanonicalPhone(demoMember.phone), true);
  assert.equal(normalizeCode(demoMember.accessCode), demoMember.accessCode);
  assert.match(demoMember.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(developmentMemberToken(undefined, development), demoMember.token);
  for (const token of ["", "signed-out", "another-member-session"]) {
    assert.equal(developmentMemberToken(token, development), token);
  }
  assert.equal(developmentMemberToken(undefined, { ...development, GOAL_HINT_DEMO_MEMBER: "false" }), undefined);
  for (const NODE_ENV of ["test", "production", undefined]) {
    assert.equal(developmentMemberToken(undefined, { ...development, NODE_ENV }), undefined);
  }
});

test("demo writers refuse production and every non-isolated database target", () => {
  for (const DATABASE_URL of ["mysql://demo@127.0.0.1/goal_hint_demo", "mysql://demo@localhost/goal_hint_demo_tests",
    "mysql://demo@[::1]/goal_hint_demo"]) assert.doesNotThrow(() => assertDemoDatabase({ ...development, DATABASE_URL }));
  for (const DATABASE_URL of ["", "postgres://demo@localhost/goal_hint_demo", "mysql://demo@db.example/goal_hint_demo",
    "mysql://demo@127.0.0.1/goal_hint", "mysql://demo@127.0.0.1/goal_hint_demo/other"]) {
    assert.throws(() => assertDemoDatabase({ ...development, DATABASE_URL }));
  }
  assert.throws(() => assertDemoDatabase({ NODE_ENV: "production", NEXT_PUBLIC_GOAL_HINT_DEMO: "true", DATABASE_URL: "mysql://demo@localhost/goal_hint_demo" }));
});

test("development policy adapter uses local payloads without real credentials, fetch or account quota", () => {
  const script = `
    import assert from 'node:assert/strict';
    import { parseRuntimePolicy } from './src/server/config/runtime-policy.ts';
    import { createPolicyApiFootballAdapter } from './src/server/football/api-football-adapter.ts';
    import { parseUtcInstant } from './src/domain/calendar.ts';
    const at = parseUtcInstant('2026-10-28T09:00:00.000Z');
    globalThis.fetch = () => { throw new Error('Real network must never be called'); };
    const forbidden = () => { throw new Error('Real account quota must never be called'); };
    const adapter = createPolicyApiFootballAdapter({ accountId: 'a'.repeat(64),
      policy: parseRuntimePolicy({NODE_ENV:'development'}), clock: {now:()=>at},
      limiter: {reserve:forbidden,claimLaunch:forbidden,complete:forbidden},
      fetcher: forbidden });
    const result = await adapter.evidence.fixturesByDate('2026-10-28', {
      priority:'daily-inputs', deadlineAt:at+60000, timeoutMs:10000,
      maxRequests:2,maxPages:1,maxRows:1000,maxResponseBytes:4000000,
      retry:{maxAttempts:1,baseDelayMs:0,maxDelayMs:0},cacheMaxAgeMs:0 });
    assert.equal(result.status,'complete',JSON.stringify(result.error));
    assert.ok(result.data.length>=500);
    assert.equal(result.requestsDispatched,1);
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
