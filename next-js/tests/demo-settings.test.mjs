import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";

test("demo receiving details use the isolated row and missing support environment values preserve the stored contacts and wallets", async (t) => {
  const previous = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_GOAL_HINT_DEMO: process.env.NEXT_PUBLIC_GOAL_HINT_DEMO };
  Object.assign(process.env, { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" });
  const { createSettingsService } = await import("../src/server/members/settings.ts");
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const row = { ...defaultSubscriptionSettings, id: 1, mtnEnabled: true, mtnNumber: "256700000080", mtnName: "Goal Hint Demo MTN",
    airtelEnabled: true, airtelNumber: "256700000081", airtelName: "Goal Hint Demo Airtel", contactPhone: "256700000082", whatsappPhone: "256700000082",
    paymentNumbersChangedAt: null, lastMembersPurgeAt: null, updatedAt: new Date(), updatedBy: "development-demo" };
  const database = { query: async (operation) => operation({ subscriptionSettings: { findUnique: async () => row } }) };
  const demo = createSettingsService(database);
  assert.deepEqual(demo.environmentFields, []);
  const state = await demo.current();
  assert.equal(state.settings.mtnNumber, row.mtnNumber); assert.equal(state.settings.mtnName, row.mtnName);
  assert.equal(state.settings.airtelNumber, row.airtelNumber); assert.equal(state.settings.contactPhone, row.contactPhone);
  const identity = { mtnNumber: "256700000090", mtnName: "Configured wallet", mtnMenuShortcut: null,
    airtelNumber: null, airtelName: null, airtelMenuShortcut: null, contactPhone: null, whatsappPhone: null };
  const unmanaged = createSettingsService(database, { environment: identity });
  assert.deepEqual(unmanaged.environmentFields, []);
  const effective = (await unmanaged.current()).settings;
  assert.equal(effective.mtnNumber, row.mtnNumber);
  assert.equal(effective.contactPhone, row.contactPhone);
  assert.equal(effective.whatsappPhone, row.whatsappPhone);
});

test("a public demo flag cannot unlock production-managed support settings", () => {
  const source = "import {createSettingsService} from './src/server/members/settings.ts'; "
    + "if(createSettingsService({}).environmentFields.join()!=='contactPhone')process.exit(1)";
  execFileSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", source], {
    cwd: new URL("..", import.meta.url), env: { NODE_ENV: "production", NEXT_PUBLIC_GOAL_HINT_DEMO: "true",
      GOAL_HINT_CUSTOMER_SUPPORT_NUMBER: "256700000090", GOAL_HINT_CUSTOMER_SUPPORT_WHATSAPP_NUMBER: "" }, stdio: "pipe",
  });
});
