import assert from "node:assert/strict";
import test from "node:test";
import { createAnalyticsConfig } from "../src/server/analytics/analytics-config.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { subscriptionCheckoutPublished } from "../src/server/members/sales-readiness.ts";

test("explicit staging enables test checkout while retaining production cookies and access rules", async () => {
  const settings = { paywallMode: "on" };
  const productionBuild = { NODE_ENV: "production" };
  const staging = await createAnalyticsConfig(parseRuntimePolicy({ ...productionBuild, GOAL_HINT_DEPLOYMENT_ENVIRONMENT: "staging" }));
  assert.equal(staging.cookies.secure, true);
  assert.equal(subscriptionCheckoutPublished(settings, staging), true);
  assert.equal(subscriptionCheckoutPublished({ paywallMode: "off" }, staging), false);
  assert.equal(subscriptionCheckoutPublished(null, staging), false);

  for (const deployment of [undefined, "production", "development", "unknown"]) {
    const config = await createAnalyticsConfig(parseRuntimePolicy({ ...productionBuild, GOAL_HINT_DEPLOYMENT_ENVIRONMENT: deployment }));
    assert.equal(subscriptionCheckoutPublished(settings, config), false);
  }
});
