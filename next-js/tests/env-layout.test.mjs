import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesEnvLayout } from "../scripts/check-env-layout.mjs";

const template = "# Identity\r\nGOAL_HINT_DEPLOYMENT_ENVIRONMENT=development\r\n\r\n# Messaging\r\nYOOLA_SMS_API_KEY=\r\n";
const staging = "# Identity\r\nGOAL_HINT_DEPLOYMENT_ENVIRONMENT=staging\r\n\r\n# Messaging\r\nYOOLA_SMS_API_KEY=\"synthetic=value#private\"\r\n";

test("private RHS values can differ from the template", () => {
  assert.ok(matchesEnvLayout(template, staging));
});

test("comments, blank lines, line endings and assignment positions must match", () => {
  assert.equal(matchesEnvLayout(template, staging.replace("# Identity", "# Staging")), false);
  assert.equal(matchesEnvLayout(template, staging.replace("\r\n\r\n", "\r\n")), false);
  assert.equal(matchesEnvLayout(template, staging.replaceAll("\r\n", "\n")), false);
  assert.equal(matchesEnvLayout(template, staging.replace("YOOLA_SMS_API_KEY", "GOAL_HINT_ADMIN_PASSWORD")), false);
  assert.equal(matchesEnvLayout(template, staging.replace("# Messaging\r\n", "")), false);
});
