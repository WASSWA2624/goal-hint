import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspect, parseEnv, promisify } from "node:util";
import { marketRules } from "../src/domain/markets.ts";
import * as publicExports from "../src/domain/public-policy.ts";
import {
  assertOperationAllowed,
  operatingRules,
  parseRuntimePolicy,
  RuntimePolicyError,
} from "../src/server/config/runtime-policy.ts";

const { publicPolicy } = publicExports;
const execFileAsync = promisify(execFile);
const operations = ["football", "research", "ai", "private-shadow", "publication"];
const verifySyntheticEvidence = () => true;

// These invented references and tokens exercise contracts only. No fixture is
// an approval, provider account, real credential, database, or quality evidence.
const syntheticTrial = {
  NODE_ENV: "production",
  GOAL_HINT_OPERATION_SCOPE: "trial",
  GOAL_HINT_FOOTBALL_ENABLED: "true",
  API_FOOTBALL_KEY: "synthetic-football-token",
  API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: "3900",
  GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
  GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: "synthetic-private-use-evidence",
  GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: "10",
};

const syntheticShadow = {
  ...syntheticTrial,
  GOAL_HINT_OPERATION_SCOPE: "shadow",
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: "synthetic-account-evidence",
  GOAL_HINT_COMPETITION_IDS: "100001,100002",
  GOAL_HINT_AI_ENABLED: "true",
  AI_API_KEY: "synthetic-ai-token",
  GOAL_HINT_AI_PROVIDER: "synthetic-ai-provider",
  GOAL_HINT_AI_MODEL: "synthetic-ai-model",
  GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: "2000",
  GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0",
  GOAL_HINT_CALIBRATION_REF: "synthetic-calibration-configuration",
  GOAL_HINT_EVIDENCE_POLICY_REF: "synthetic-evidence-policy",
  GOAL_HINT_FRESHNESS_POLICY_REF: "synthetic-freshness-policy",
  GOAL_HINT_PROBABILITY_SUM_TOLERANCE: "0.001",
  GOAL_HINT_CONSISTENCY_TOLERANCE: "0.002",
  GOAL_HINT_JOB_REQUEST_LIMIT: "5",
  GOAL_HINT_JOB_TOKEN_LIMIT: "1000",
  GOAL_HINT_JOB_TIMEOUT_SECONDS: "60",
  GOAL_HINT_SHADOW_MAX_JOBS: "3",
  GOAL_HINT_SHADOW_BUDGET_USD_CENTS: "100",
  GOAL_HINT_SHADOW_PROTOCOL_REF: "synthetic-private-shadow-protocol",
  GOAL_HINT_PIPELINE_INTEGRITY_REF: "synthetic-pipeline-integrity-evidence",
};

const syntheticProduction = {
  ...syntheticShadow,
  GOAL_HINT_OPERATION_SCOPE: "production",
  GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: "synthetic-display-rights-evidence",
  GOAL_HINT_QUALITY_QUALIFICATION_REF: "synthetic-quality-qualification",
  GOAL_HINT_RELEASE_APPROVAL_REF: "synthetic-release-approval",
};

const syntheticResearch = {
  GOAL_HINT_RESEARCH_ENABLED: "true",
  RESEARCH_API_KEY: "synthetic-research-token",
  GOAL_HINT_RESEARCH_PROVIDER: "synthetic-research-provider",
  GOAL_HINT_RESEARCH_LICENSE_REF: "synthetic-research-license",
  GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS: "500",
};

function policyError(action, fields = []) {
  let caught;
  assert.throws(action, (error) => {
    assert.ok(error instanceof RuntimePolicyError);
    assert.equal(error.name, "RuntimePolicyError");
    assert.ok(error.issues.length > 0);
    for (const issue of error.issues) {
      assert.ok(issue.field.length > 0);
      assert.ok(issue.reason.length > 0);
      assert.ok(error.message.includes(issue.field));
      assert.ok(error.message.includes(issue.reason));
    }
    for (const field of fields) {
      assert.ok(error.issues.some((issue) => issue.field === field), `${field}: ${error.message}`);
    }
    caught = error;
    return true;
  });
  return caught;
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test("public exports expose only the immutable browser-safe product projection", () => {
  assert.deepEqual(Object.keys(publicExports), ["publicPolicy"]);
  assert.deepEqual(Object.keys(publicPolicy).sort(), [
    "access", "defaultLocale", "features", "locales", "markets", "matchPeriod", "name", "origin",
    "predictionWindowDays", "reportingTimeZone", "theme", "totalGoalsLine",
  ].sort());
  assertDeepFrozen(publicPolicy);
  assert.throws(() => { publicPolicy.features.exactScores = true; }, TypeError);
  assert.throws(() => { publicPolicy.locales.push("fr"); }, TypeError);
});

test("consumers cannot mutate shared limits or enable request-triggered predictions", () => {
  const first = parseRuntimePolicy({});
  const second = parseRuntimePolicy({});
  assert.equal(first.rules, operatingRules);
  assert.equal(second.rules, operatingRules);
  assertDeepFrozen(operatingRules);
  const approvedCeiling = operatingRules.football.monthlyPayableCeilingUsdCents;
  assert.throws(() => { first.rules.football.monthlyPayableCeilingUsdCents = approvedCeiling + 1; }, TypeError);
  assert.throws(() => { first.rules.forecasts.visitorRequestsTriggerPredictions = true; }, TypeError);
  assert.equal(second.rules.football.monthlyPayableCeilingUsdCents, approvedCeiling);
  assert.equal(second.rules.forecasts.visitorRequestsTriggerPredictions, false);
  policyError(() => parseRuntimePolicy({ API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: String(approvedCeiling + 1) }), ["API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS"]);
});

test("the complete documented environment example parses safely without approvals or credentials", async () => {
  const source = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const env = parseEnv(source);
  const documentedKeys = new Set([
    ...Object.keys(syntheticProduction), ...Object.keys(syntheticResearch),
    "DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "GOAL_HINT_DATABASE_ENABLED", "GOAL_HINT_ADS_ENABLED", "GOAL_HINT_DARK_MODE_ENABLED",
    "GOAL_HINT_DATABASE_CONNECTION_MODE", "GOAL_HINT_DATABASE_POOL_LIMIT", "GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS",
    "GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS", "GOAL_HINT_DATABASE_IDLE_TIMEOUT_SECONDS", "GOAL_HINT_DATABASE_TLS_MODE", "GOAL_HINT_DATABASE_TLS_CA_FILE",
    "GOAL_HINT_DATABASE_ACCESS_REF",
    "GOAL_HINT_EXACT_SCORES_ENABLED", "GOAL_HINT_LOCALES", "GOAL_HINT_DEPLOYMENT_ENVIRONMENT",
  ]);
  documentedKeys.delete("NODE_ENV");
  assert.deepEqual(Object.keys(env).sort(), [...documentedKeys].sort());
  const policy = parseRuntimePolicy(env);
  assert.equal(policy.scope, "disabled");
  assert.ok(Object.values(policy.capabilities).every((value) => value === false));
  assert.ok(Object.values(policy.secrets).every((value) => value === null));
  function assertUnresolved(value) {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) assertUnresolved(child);
    } else {
      assert.equal(value, null);
    }
  }
  const { database, probabilitySumTolerance, consistencyTolerance, ...unresolvedChoices } = policy.choices;
  assertUnresolved(unresolvedChoices);
  assert.equal(probabilitySumTolerance, marketRules.probabilitySumTolerance);
  assert.equal(consistencyTolerance, marketRules.consistencyTolerance);
  assert.deepEqual(database, {
    connectionMode: null, poolLimit: null, connectTimeoutMs: 5000, acquireTimeoutMs: 10000,
    idleTimeoutSeconds: 30, tlsMode: null, tlsCaFile: null, accessRef: null,
  });
  for (const operation of ["database", "database-migration", ...operations]) {
    policyError(() => assertOperationAllowed(policy, operation, verifySyntheticEvidence));
  }
});

test("disabled defaults keep unresolved choices explicit in every deployment mode", () => {
  for (const mode of ["development", "production", "test"]) {
    const env = { NODE_ENV: mode };
    const policy = parseRuntimePolicy(env);
    assert.equal(policy.mode, mode);
    assert.equal(policy.scope, "disabled");
    assert.equal(policy.public, publicPolicy);
    assert.equal(policy.rules, operatingRules);
    assert.deepEqual(policy.capabilities, { database: false, football: false, ai: false, research: false });
    assert.ok(Object.values(policy.secrets).every((value) => value === null));
    assert.equal(policy.choices.competitionIds, null);
    assert.equal(policy.choices.budgets.aiMonthlyUsdCents, null);
    assert.equal(policy.choices.budgets.researchMonthlyUsdCents, null);
    assert.equal(policy.choices.budgets.infrastructureMonthlyUsdCents, null);
    assert.equal(policy.choices.qualityQualificationRef, null);
    assert.equal(policy.choices.releaseApprovalRef, null);
    assert.equal(policy.choices.probabilitySumTolerance, marketRules.probabilitySumTolerance);
    assert.equal(policy.choices.consistencyTolerance, marketRules.consistencyTolerance);
    assert.equal(policy.rules.forecasts.ruleVersion, marketRules.ruleVersion);
    assertDeepFrozen(policy);
    assert.deepEqual(env, { NODE_ENV: mode });
    for (const operation of ["database", "database-migration", ...operations]) {
      policyError(() => assertOperationAllowed(policy, operation));
    }
  }
  assert.equal(parseRuntimePolicy({}).mode, "development");
  assert.equal(parseRuntimePolicy({ GOAL_HINT_AI_PROVIDER: "   " }).choices.ai.provider, null);
});

test("approved market tolerances cannot drift through environment overrides", () => {
  for (const [field, choice, approved, alternatives] of [
    ["GOAL_HINT_PROBABILITY_SUM_TOLERANCE", "probabilitySumTolerance", "0.001", ["0.0001", "0.002", "0.1"]],
    ["GOAL_HINT_CONSISTENCY_TOLERANCE", "consistencyTolerance", "0.002", ["0.001", "0.003", "0.1"]],
  ]) {
    for (const value of [undefined, "", "   ", approved, approved + "0"]) {
      const policy = parseRuntimePolicy({ [field]: value });
      assert.equal(policy.choices[choice], Number(approved));
    }
    for (const value of alternatives) {
      for (const mode of ["development", "test", "production"]) {
        const error = policyError(() => parseRuntimePolicy({ NODE_ENV: mode, [field]: value }), [field]);
        assert.match(error.issues.find((issue) => issue.field === field).reason, /approved market rule version/);
      }
      policyError(() => parseRuntimePolicy({ ...syntheticProduction, [field]: value }), [field]);
    }
  }
  const production = parseRuntimePolicy({
    ...syntheticProduction,
    GOAL_HINT_PROBABILITY_SUM_TOLERANCE: undefined,
    GOAL_HINT_CONSISTENCY_TOLERANCE: undefined,
  });
  assert.equal(production.choices.probabilitySumTolerance, 0.001);
  assert.equal(production.choices.consistencyTolerance, 0.002);
  policyError(() => assertOperationAllowed(production, "publication"), ["GOAL_HINT_RELEASE_APPROVAL_REF"]);
  assert.doesNotThrow(() => assertOperationAllowed(production, "publication", verifySyntheticEvidence));
});

test("malformed settings reject booleans, money, counts, IDs, tolerances and URLs", () => {
  const invalid = [
    ["NODE_ENV", ["staging", ""]],
    ["GOAL_HINT_OPERATION_SCOPE", ["live", ""]],
    ["GOAL_HINT_AI_ENABLED", ["1", "TRUE", "yes", " true ", ""]],
    ["GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS", ["1.5", "-1", "1e3", "Infinity", "NaN", "01", "9007199254740992"]],
    ["API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS", ["4501", "45.00"]],
    ["GOAL_HINT_JOB_TIMEOUT_SECONDS", ["0", "-1", "1.5", "Infinity"]],
    ["GOAL_HINT_COMPETITION_IDS", ["1,1", "0", "1,0", "1, 2", "1,", "1.5", "9007199254740992"]],
    ["GOAL_HINT_PROBABILITY_SUM_TOLERANCE", ["0", "1", "-0.1", "1.01", "Infinity", "NaN", "1e-4", ".01"]],
    ["GOAL_HINT_CONSISTENCY_TOLERANCE", ["0", "1", "0.000" + "0".repeat(400) + "1"]],
    ["DATABASE_URL", ["https://synthetic.invalid/db", "mysql:///db", "mysql://synthetic.invalid/", "synthetic-database-url"]],
    ["TEST_DATABASE_URL", ["file:///synthetic.db", "mysql://synthetic.invalid/"]],
    ["MIGRATION_DATABASE_URL", ["https://synthetic.invalid/db", "mysql:///db"]],
    ["GOAL_HINT_DATABASE_CONNECTION_MODE", ["proxy", "pool", "synthetic-connection-mode"]],
    ["GOAL_HINT_DATABASE_POOL_LIMIT", ["0", "-1", "1.5", "9007199254740992"]],
    ["GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS", ["0", "-1", "1.5", "Infinity", "2147483648", "9007199254740992"]],
    ["GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS", ["0", "-1", "1.5", "Infinity", "2147483648", "9007199254740992"]],
    ["GOAL_HINT_DATABASE_IDLE_TIMEOUT_SECONDS", ["0", "-1", "1.5", "Infinity", "2147484", "9007199254740992"]],
    ["GOAL_HINT_DATABASE_TLS_MODE", ["insecure", "optional", "false"]],
    ["API_FOOTBALL_KEY", ["synthetic token", "synthetic\ntoken"]],
    ["GOAL_HINT_AI_PROVIDER", ["synthetic\nprovider", "synthetic\0provider"]],
  ];
  for (const [field, values] of invalid) {
    for (const value of values) policyError(() => parseRuntimePolicy({ [field]: value }), [field]);
  }
});

test("database settings accept MySQL targets and reject former PostgreSQL protocols without leaking credentials", () => {
  const sentinel = "synthetic-database-protocol-password-sentinel";
  for (const [field, secretKey] of [
    ["DATABASE_URL", "databaseUrl"], ["TEST_DATABASE_URL", "testDatabaseUrl"], ["MIGRATION_DATABASE_URL", "migrationDatabaseUrl"],
  ]) {
    const mysqlUrl = `mysql://synthetic:${sentinel}@synthetic.invalid:3306/synthetic_main`;
    const policy = parseRuntimePolicy({ [field]: mysqlUrl });
    assert.equal(policy.secrets[secretKey].read(), mysqlUrl);
    for (const protocol of ["postgres", "postgresql"]) {
      const error = policyError(() => parseRuntimePolicy({
        [field]: `${protocol}://synthetic:${sentinel}@synthetic.invalid:5432/synthetic_main`,
      }), [field]);
      for (const output of [error.message, error.stack, JSON.stringify(error), inspect(error, { depth: null })]) {
        assert.ok(!output.includes(sentinel));
      }
    }
  }
});

test("database acquisition timeout must leave time for connection establishment", () => {
  for (const acquisition of ["4999", "5000"]) {
    policyError(() => parseRuntimePolicy({
      GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "5000", GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: acquisition,
    }), ["GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS"]);
  }
  const policy = parseRuntimePolicy({
    GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "250", GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "500",
  });
  assert.equal(policy.choices.database.connectTimeoutMs, 250);
  assert.equal(policy.choices.database.acquireTimeoutMs, 500);
});

test("feature flags cannot silently extend the approved launch", () => {
  for (const field of ["GOAL_HINT_ADS_ENABLED", "GOAL_HINT_DARK_MODE_ENABLED", "GOAL_HINT_EXACT_SCORES_ENABLED"]) {
    policyError(() => parseRuntimePolicy({ [field]: "true" }), [field]);
    assert.equal(parseRuntimePolicy({ [field]: "false" }).public.features.exactScores, false);
  }
  policyError(() => parseRuntimePolicy({ GOAL_HINT_LOCALES: "en,fr" }), ["GOAL_HINT_LOCALES"]);
});

test("unknown policy keys and public environment overrides fail without exposing their values", () => {
  for (const [key, field] of [["GOAL_HINT_SYNTHETIC_TYPO", "GOAL_HINT_*"], ["NEXT_PUBLIC_AI_API_KEY", "NEXT_PUBLIC_*"]]) {
    const sentinel = "synthetic-unknown-setting-secret-sentinel";
    const error = policyError(() => parseRuntimePolicy({ [key]: sentinel }), [field]);
    for (const output of [error.message, error.stack, JSON.stringify(error), inspect(error)]) {
      assert.ok(!output.includes(sentinel));
    }
  }
  assert.equal(parseRuntimePolicy({ SYNTHETIC_UNRELATED_SYSTEM_SETTING: "ignored" }).scope, "disabled");
});

test("secret serialization and validation errors stay redacted while explicit reads work", () => {
  const sentinels = ["synthetic-football-secret-sentinel", "synthetic-ai-secret-sentinel", "synthetic-research-secret-sentinel"];
  const databaseSentinels = ["synthetic-database-password-sentinel", "synthetic-test-database-password-sentinel", "synthetic-migration-database-password-sentinel"];
  const policy = parseRuntimePolicy({
    API_FOOTBALL_KEY: sentinels[0], AI_API_KEY: sentinels[1], RESEARCH_API_KEY: sentinels[2],
    DATABASE_URL: `mysql://synthetic:${databaseSentinels[0]}@synthetic.invalid/synthetic_main`,
    TEST_DATABASE_URL: `mysql://synthetic:${databaseSentinels[1]}@synthetic.invalid/synthetic_test`,
    MIGRATION_DATABASE_URL: `mysql://synthetic-migrator:${databaseSentinels[2]}@synthetic.invalid/synthetic_main`,
  });
  assert.equal(policy.secrets.footballKey.read(), sentinels[0]);
  assert.equal(policy.secrets.aiKey.read(), sentinels[1]);
  assert.equal(policy.secrets.researchKey.read(), sentinels[2]);
  for (const [index, key] of ["databaseUrl", "testDatabaseUrl", "migrationDatabaseUrl"].entries()) {
    assert.ok(policy.secrets[key].read().includes(databaseSentinels[index]));
  }
  for (const output of [JSON.stringify(policy), inspect(policy, { depth: null }), String(policy.secrets.footballKey)]) {
    for (const sentinel of [...sentinels, ...databaseSentinels]) assert.ok(!output.includes(sentinel));
  }
  assert.equal(JSON.parse(JSON.stringify(policy)).secrets.aiKey, "[REDACTED]");

  const malformedSentinel = "synthetic-malformed-secret-sentinel";
  for (const url of [
    `https://synthetic:${malformedSentinel}@synthetic.invalid/synthetic_main`,
    `synthetic-invalid-url-${malformedSentinel}`,
  ]) {
    const error = policyError(() => parseRuntimePolicy({
      API_FOOTBALL_KEY: `${malformedSentinel} invalid`, DATABASE_URL: url,
    }), ["API_FOOTBALL_KEY", "DATABASE_URL"]);
    for (const output of [error.message, error.stack, JSON.stringify(error), inspect(error, { depth: null })]) {
      assert.ok(!output.includes(malformedSentinel));
    }
    assertDeepFrozen(error.issues);
  }
});

test("affected operations fail closed at parsing with actionable missing fields", () => {
  for (const [flag, fields] of [
    ["GOAL_HINT_DATABASE_ENABLED", ["DATABASE_URL"]],
    ["GOAL_HINT_FOOTBALL_ENABLED", ["API_FOOTBALL_KEY", "API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS", "GOAL_HINT_BUDGET_APPROVAL_REF"]],
    ["GOAL_HINT_AI_ENABLED", ["AI_API_KEY", "GOAL_HINT_AI_PROVIDER", "GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS", "GOAL_HINT_JOB_TOKEN_LIMIT"]],
    ["GOAL_HINT_RESEARCH_ENABLED", ["RESEARCH_API_KEY", "GOAL_HINT_RESEARCH_LICENSE_REF", "GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS"]],
  ]) {
    policyError(() => parseRuntimePolicy({ NODE_ENV: "production", [flag]: "true" }), fields);
  }
});

test("bounded trial authorization does not invent later qualification prerequisites", () => {
  const trial = parseRuntimePolicy(syntheticTrial);
  assert.doesNotThrow(() => assertOperationAllowed(trial, "football", verifySyntheticEvidence));
  assert.equal(trial.choices.competitionIds, null);
  assert.equal(trial.choices.football.publicRightsRef, null);
  assert.equal(trial.choices.football.accountEvidenceRef, null);
  assert.equal(trial.choices.qualityQualificationRef, null);
  assert.equal(trial.choices.releaseApprovalRef, null);
  policyError(() => assertOperationAllowed(trial, "publication"), ["GOAL_HINT_OPERATION_SCOPE"]);
  assert.equal(parseRuntimePolicy({ ...syntheticTrial, API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: "0" }).choices.football.payableMonthlyUsdCents, 0,
    "a free provider plan records a zero payable amount");
  policyError(() => parseRuntimePolicy({ ...syntheticTrial, API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: undefined }), ["API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS"]);
  policyError(() => parseRuntimePolicy({ ...syntheticTrial, API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: "4501" }), ["API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS"]);
  policyError(() => parseRuntimePolicy({ ...syntheticTrial, GOAL_HINT_BUDGET_APPROVAL_REF: "" }), ["GOAL_HINT_BUDGET_APPROVAL_REF"]);
});

test("separate AI and research caps must be positive and approved for paid calls", () => {
  const env = { ...syntheticShadow, GOAL_HINT_OPERATION_SCOPE: "trial", ...syntheticResearch };
  const policy = parseRuntimePolicy(env);
  assert.doesNotThrow(() => assertOperationAllowed(policy, "ai", verifySyntheticEvidence));
  assert.doesNotThrow(() => assertOperationAllowed(policy, "research", verifySyntheticEvidence));
  for (const field of ["GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS", "GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS"]) {
    policyError(() => parseRuntimePolicy({ ...env, [field]: "0" }), [field]);
    policyError(() => parseRuntimePolicy({ ...env, [field]: undefined }), [field]);
  }
  policyError(() => parseRuntimePolicy({ ...env, GOAL_HINT_BUDGET_APPROVAL_REF: undefined }), ["GOAL_HINT_BUDGET_APPROVAL_REF"]);
});

test("private shadow can collect quality evidence with bounded approved prerequisites", () => {
  for (const mode of ["development", "production"]) {
    const policy = parseRuntimePolicy({ ...syntheticShadow, NODE_ENV: mode });
    assert.doesNotThrow(() => assertOperationAllowed(policy, "private-shadow", verifySyntheticEvidence));
    assert.equal(policy.choices.football.publicRightsRef, null);
    assert.equal(policy.choices.qualityQualificationRef, null);
    assert.equal(policy.choices.releaseApprovalRef, null);
    policyError(() => assertOperationAllowed(policy, "publication"), ["GOAL_HINT_OPERATION_SCOPE"]);
  }
  for (const field of ["GOAL_HINT_FOOTBALL_PRIVATE_USE_REF", "GOAL_HINT_PIPELINE_INTEGRITY_REF", "GOAL_HINT_SHADOW_PROTOCOL_REF", "GOAL_HINT_SHADOW_MAX_JOBS", "GOAL_HINT_SHADOW_BUDGET_USD_CENTS"]) {
    policyError(() => parseRuntimePolicy({ ...syntheticShadow, [field]: undefined }), [field]);
  }
});

test("production publication requires measured qualification and release approval", () => {
  const policy = parseRuntimePolicy(syntheticProduction);
  assert.doesNotThrow(() => assertOperationAllowed(policy, "publication", verifySyntheticEvidence));
  policyError(() => assertOperationAllowed(policy, "private-shadow"), ["GOAL_HINT_OPERATION_SCOPE"]);
  for (const field of ["GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF", "GOAL_HINT_QUALITY_QUALIFICATION_REF", "GOAL_HINT_RELEASE_APPROVAL_REF"]) {
    policyError(() => parseRuntimePolicy({ ...syntheticProduction, [field]: undefined }), [field]);
  }
  policyError(() => parseRuntimePolicy({ ...syntheticProduction, NODE_ENV: "development" }), ["NODE_ENV"]);
  const database = { GOAL_HINT_DATABASE_ENABLED: "true" };
  const local = parseRuntimePolicy({ ...syntheticProduction, ...database, NODE_ENV: "development",
    DATABASE_URL: "mysql://synthetic:secret@127.0.0.1:3307/goal_hint_local" });
  assert.equal(local.scope, "production");
  assert.doesNotThrow(() => assertOperationAllowed(local, "publication", verifySyntheticEvidence));
  policyError(() => parseRuntimePolicy({ ...syntheticProduction, ...database, NODE_ENV: "development",
    DATABASE_URL: "mysql://synthetic:secret@db.example.test:3306/goal_hint" }), ["NODE_ENV"]);
  policyError(() => parseRuntimePolicy({ ...syntheticProduction, ...database, NODE_ENV: "test",
    TEST_DATABASE_URL: "mysql://synthetic:secret@127.0.0.1:3307/goal_hint_test" }), ["NODE_ENV"]);
});

test("fallback-only publication keeps every non-AI gate when AI is disabled", () => {
  const withoutAi = Object.fromEntries(Object.entries(syntheticProduction).filter(([key]) =>
    !["GOAL_HINT_AI_ENABLED", "AI_API_KEY", "GOAL_HINT_AI_PROVIDER", "GOAL_HINT_AI_MODEL", "GOAL_HINT_JOB_TOKEN_LIMIT",
      "GOAL_HINT_CALIBRATION_REF"].includes(key)));
  const policy = parseRuntimePolicy(withoutAi);
  assert.equal(policy.capabilities.ai, false);
  assert.doesNotThrow(() => assertOperationAllowed(policy, "publication", verifySyntheticEvidence));
  assert.doesNotThrow(() => assertOperationAllowed(policy, "football", verifySyntheticEvidence));
  policyError(() => assertOperationAllowed(policy, "ai", verifySyntheticEvidence), ["GOAL_HINT_AI_ENABLED"]);
  for (const field of ["GOAL_HINT_JOB_REQUEST_LIMIT", "GOAL_HINT_JOB_TIMEOUT_SECONDS", "GOAL_HINT_PIPELINE_INTEGRITY_REF",
    "GOAL_HINT_RELEASE_APPROVAL_REF", "GOAL_HINT_QUALITY_QUALIFICATION_REF", "GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF"]) {
    policyError(() => parseRuntimePolicy({ ...withoutAi, [field]: undefined }), [field]);
  }
  for (const requirement of ["release-approval", "quality-qualification", "pipeline-integrity", "football-public-rights"]) {
    policyError(() => assertOperationAllowed(policy, "publication", (_reference, requested) => requested !== requirement));
  }
  const verified = [];
  assertOperationAllowed(policy, "publication", (_reference, requirement) => { verified.push(requirement); return true; });
  assert.ok(!verified.includes("calibration-configuration"));
  policyError(() => parseRuntimePolicy({ ...withoutAi, GOAL_HINT_AI_ENABLED: "true" }), ["AI_API_KEY", "GOAL_HINT_JOB_TOKEN_LIMIT"]);
  policyError(() => parseRuntimePolicy({ ...syntheticProduction, GOAL_HINT_CALIBRATION_REF: undefined }), ["GOAL_HINT_CALIBRATION_REF"]);
});

test("references require a trusted verifier at the affected operation boundary", () => {
  for (const [env, operation] of [
    [syntheticTrial, "football"],
    [{ ...syntheticShadow, ...syntheticResearch }, "research"],
    [syntheticShadow, "ai"],
    [syntheticShadow, "private-shadow"],
    [syntheticProduction, "publication"],
  ]) {
    const policy = parseRuntimePolicy(env);
    policyError(() => assertOperationAllowed(policy, operation));
    policyError(() => assertOperationAllowed(policy, operation, () => false));
    policyError(() => assertOperationAllowed(policy, operation, () => "synthetic-truthy-response"));
    const sentinel = "synthetic-verifier-secret-sentinel";
    const error = policyError(() => assertOperationAllowed(policy, operation, () => {
      throw new Error(sentinel);
    }));
    for (const output of [error.message, error.stack, JSON.stringify(error), inspect(error, { depth: null })]) {
      assert.ok(!output.includes(sentinel));
    }
    const verified = [];
    assert.doesNotThrow(() => assertOperationAllowed(policy, operation, (reference, requirement) => {
      assert.equal(typeof reference, "string");
      assert.ok(reference.startsWith("synthetic-"));
      assert.equal(typeof requirement, "string");
      assert.ok(requirement.length > 0);
      verified.push(reference);
      return true;
    }));
    assert.ok(verified.length > 0);
  }
});

test("each critical evidence prerequisite must verify independently", () => {
  const shadow = parseRuntimePolicy({ ...syntheticShadow, ...syntheticResearch });
  const production = parseRuntimePolicy(syntheticProduction);
  for (const [policy, operation, requirement, field] of [
    [shadow, "private-shadow", "budget-approval", "GOAL_HINT_BUDGET_APPROVAL_REF"],
    [shadow, "private-shadow", "football-private-use", "GOAL_HINT_FOOTBALL_PRIVATE_USE_REF"],
    [shadow, "private-shadow", "football-account", "GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF"],
    [shadow, "private-shadow", "research-license", "GOAL_HINT_RESEARCH_LICENSE_REF"],
    [shadow, "private-shadow", "pipeline-integrity", "GOAL_HINT_PIPELINE_INTEGRITY_REF"],
    [shadow, "private-shadow", "shadow-protocol", "GOAL_HINT_SHADOW_PROTOCOL_REF"],
    [production, "publication", "football-public-rights", "GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF"],
    [production, "publication", "quality-qualification", "GOAL_HINT_QUALITY_QUALIFICATION_REF"],
    [production, "publication", "release-approval", "GOAL_HINT_RELEASE_APPROVAL_REF"],
  ]) {
    policyError(() => assertOperationAllowed(policy, operation, (_reference, requested) => requested !== requirement), [field]);
  }
});

test("provider operations cannot bypass the surrounding shadow or production evidence gates", () => {
  const shadow = parseRuntimePolicy({ ...syntheticShadow, ...syntheticResearch });
  const production = parseRuntimePolicy({ ...syntheticProduction, ...syntheticResearch });
  for (const operation of ["football", "ai", "research"]) {
    policyError(() => assertOperationAllowed(shadow, operation, (_reference, requirement) => requirement !== "pipeline-integrity"), ["GOAL_HINT_PIPELINE_INTEGRITY_REF"]);
    policyError(() => assertOperationAllowed(production, operation, (_reference, requirement) => requirement !== "quality-qualification"), ["GOAL_HINT_QUALITY_QUALIFICATION_REF"]);
    assert.doesNotThrow(() => assertOperationAllowed(shadow, operation, verifySyntheticEvidence));
    assert.doesNotThrow(() => assertOperationAllowed(production, operation, verifySyntheticEvidence));
  }
  policyError(() => assertOperationAllowed(shadow, "synthetic-unknown-operation", verifySyntheticEvidence));
});

test("shadow infrastructure must be explicitly budgeted without inventing a paid allowance", () => {
  policyError(() => parseRuntimePolicy({
    ...syntheticShadow, GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: undefined,
  }), ["GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS"]);
  const policy = parseRuntimePolicy(syntheticShadow);
  assert.equal(policy.choices.budgets.infrastructureMonthlyUsdCents, 0);
  assert.doesNotThrow(() => assertOperationAllowed(policy, "private-shadow", verifySyntheticEvidence));
});

test("test mode refuses every provider and forecasting operation even with complete synthetic inputs", () => {
  for (const scope of ["trial", "shadow", "production"]) {
    policyError(() => parseRuntimePolicy({
      ...syntheticProduction, ...syntheticResearch, NODE_ENV: "test", GOAL_HINT_OPERATION_SCOPE: scope,
    }), ["NODE_ENV"]);
  }
  const policy = parseRuntimePolicy({
    ...syntheticProduction, ...syntheticResearch,
    NODE_ENV: "test", GOAL_HINT_OPERATION_SCOPE: "disabled",
    GOAL_HINT_FOOTBALL_ENABLED: "false", GOAL_HINT_AI_ENABLED: "false", GOAL_HINT_RESEARCH_ENABLED: "false",
  });
  for (const operation of operations) policyError(() => assertOperationAllowed(policy, operation), ["NODE_ENV"]);
});

test("trial and shadow allowances reject contradictions even before enabling capabilities", () => {
  policyError(() => parseRuntimePolicy({ GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: "100001" }), ["GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT"]);
  assert.equal(parseRuntimePolicy({ GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: "100000" }).choices.football.trialRequestLimit, 100000);
  policyError(() => parseRuntimePolicy({ GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: "100", GOAL_HINT_SHADOW_BUDGET_USD_CENTS: "101" }), ["GOAL_HINT_SHADOW_BUDGET_USD_CENTS"]);
  policyError(() => parseRuntimePolicy({ ...syntheticShadow, GOAL_HINT_SHADOW_BUDGET_USD_CENTS: "2001" }), ["GOAL_HINT_SHADOW_BUDGET_USD_CENTS"]);
  const withResearch = parseRuntimePolicy({
    ...syntheticShadow, ...syntheticResearch, GOAL_HINT_SHADOW_BUDGET_USD_CENTS: "2500",
  });
  assert.doesNotThrow(() => assertOperationAllowed(withResearch, "private-shadow", verifySyntheticEvidence));
  policyError(() => parseRuntimePolicy({
    ...syntheticShadow, ...syntheticResearch, GOAL_HINT_SHADOW_BUDGET_USD_CENTS: "2501",
  }), ["GOAL_HINT_SHADOW_BUDGET_USD_CENTS"]);
});

test("test database use requires its separate URL and never falls back to production", () => {
  const main = "mysql://synthetic:synthetic-main-password@127.0.0.1/synthetic_main";
  const isolated = "mysql://synthetic:synthetic-test-password@127.0.0.1/synthetic_test";
  policyError(() => parseRuntimePolicy({ NODE_ENV: "test", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: main }), ["TEST_DATABASE_URL"]);
  policyError(() => parseRuntimePolicy({ NODE_ENV: "production", GOAL_HINT_DATABASE_ENABLED: "true", TEST_DATABASE_URL: isolated }), ["DATABASE_URL"]);
  policyError(() => parseRuntimePolicy({ NODE_ENV: "test", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: main, TEST_DATABASE_URL: main }), ["TEST_DATABASE_URL"]);
  const testPolicy = parseRuntimePolicy({ NODE_ENV: "test", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: main, TEST_DATABASE_URL: isolated });
  assert.doesNotThrow(() => assertOperationAllowed(testPolicy, "database"));
  assert.equal(testPolicy.secrets.testDatabaseUrl.read(), isolated);
  const productionPolicy = parseRuntimePolicy({
    NODE_ENV: "production", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: main,
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "required",
    GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-database-access-evidence",
    GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0",
    GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-zero-infrastructure-budget-approval",
  });
  assert.doesNotThrow(() => assertOperationAllowed(productionPolicy, "database", verifySyntheticEvidence));
});

test("production database access requires an explicit direct pool and verified TLS configuration", () => {
  const env = {
    NODE_ENV: "production", GOAL_HINT_DATABASE_ENABLED: "true",
    DATABASE_URL: "mysql://synthetic:synthetic-main-password@synthetic.invalid/synthetic_main",
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "required",
    GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-database-access-evidence",
    GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
  };
  for (const field of ["GOAL_HINT_DATABASE_CONNECTION_MODE", "GOAL_HINT_DATABASE_POOL_LIMIT", "GOAL_HINT_DATABASE_TLS_MODE", "GOAL_HINT_DATABASE_ACCESS_REF"]) {
    policyError(() => parseRuntimePolicy({ ...env, [field]: undefined }), [field]);
  }
  policyError(() => parseRuntimePolicy({ ...env, GOAL_HINT_DATABASE_TLS_MODE: "disabled" }), ["GOAL_HINT_DATABASE_TLS_MODE"]);
  const policy = parseRuntimePolicy(env);
  policyError(() => assertOperationAllowed(policy, "database"), ["GOAL_HINT_BUDGET_APPROVAL_REF"]);
  policyError(() => assertOperationAllowed(policy, "database", (_reference, requirement) => requirement !== "database-access"), ["GOAL_HINT_DATABASE_ACCESS_REF"]);
  assert.doesNotThrow(() => assertOperationAllowed(policy, "database", verifySyntheticEvidence));
});

test("remote database access cannot bypass target ownership and budget evidence through development or test mode", () => {
  for (const mode of ["development", "test"]) {
    const targetField = mode === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
    const env = {
      NODE_ENV: mode, GOAL_HINT_DATABASE_ENABLED: "true",
      [targetField]: "mysql://synthetic:synthetic-remote-password@synthetic.invalid/synthetic_isolated_target",
      GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "required",
      GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-database-access-evidence",
      GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
    };
    for (const field of ["GOAL_HINT_DATABASE_ACCESS_REF", "GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS", "GOAL_HINT_BUDGET_APPROVAL_REF"]) {
      policyError(() => parseRuntimePolicy({ ...env, [field]: undefined }), [field]);
    }
    const policy = parseRuntimePolicy(env);
    policyError(() => assertOperationAllowed(policy, "database"), ["GOAL_HINT_DATABASE_ACCESS_REF", "GOAL_HINT_BUDGET_APPROVAL_REF"]);
    for (const blocked of ["database-access", "budget-approval"]) {
      policyError(() => assertOperationAllowed(policy, "database", (_reference, requirement) => requirement !== blocked), [
        blocked === "database-access" ? "GOAL_HINT_DATABASE_ACCESS_REF" : "GOAL_HINT_BUDGET_APPROVAL_REF",
      ]);
    }
    assert.doesNotThrow(() => assertOperationAllowed(policy, "database", verifySyntheticEvidence));
  }
});

test("migration authorization checks its actual target instead of inheriting a local application allowance", () => {
  for (const mode of ["development", "test"]) {
    const applicationField = mode === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
    const env = {
      NODE_ENV: mode, GOAL_HINT_DATABASE_ENABLED: "true",
      [applicationField]: "mysql://synthetic@127.0.0.1/synthetic_local_app",
      MIGRATION_DATABASE_URL: "mysql://synthetic-migrator@synthetic.invalid/synthetic_remote_migration",
    };
    const localApplication = parseRuntimePolicy(env);
    assert.doesNotThrow(() => assertOperationAllowed(localApplication, "database"));
    policyError(() => assertOperationAllowed(localApplication, "database-migration"), [
      "GOAL_HINT_DATABASE_ACCESS_REF", "GOAL_HINT_BUDGET_APPROVAL_REF", "GOAL_HINT_DATABASE_TLS_MODE",
    ]);
    const configured = parseRuntimePolicy({
      ...env, GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "2", GOAL_HINT_DATABASE_TLS_MODE: "required",
      GOAL_HINT_DATABASE_ACCESS_REF: "synthetic-migration-target-access-evidence",
      GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: "0", GOAL_HINT_BUDGET_APPROVAL_REF: "synthetic-budget-approval",
    });
    policyError(() => assertOperationAllowed(configured, "database-migration"), ["GOAL_HINT_DATABASE_ACCESS_REF", "GOAL_HINT_BUDGET_APPROVAL_REF"]);
    policyError(() => assertOperationAllowed(configured, "database-migration", (_reference, requirement) => requirement !== "database-access"), ["GOAL_HINT_DATABASE_ACCESS_REF"]);
    assert.doesNotThrow(() => assertOperationAllowed(configured, "database-migration", verifySyntheticEvidence));
    const missingMigration = parseRuntimePolicy({ ...env, MIGRATION_DATABASE_URL: undefined });
    policyError(() => assertOperationAllowed(missingMigration, "database-migration"), ["MIGRATION_DATABASE_URL"]);
  }
});

test("the process accessor validates once and retains its immutable policy until restart", async () => {
  const moduleUrl = new URL("../src/server/config/runtime-policy.ts", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import { getRuntimePolicy } from ${JSON.stringify(moduleUrl)};
    const first = getRuntimePolicy();
    assert.equal(first.mode, "production");
    assert.equal(first.scope, "disabled");
    process.env.GOAL_HINT_AI_ENABLED = "synthetic-invalid-boolean";
    assert.equal(getRuntimePolicy(), first);
    assert.ok(Object.isFrozen(first));
    process.stdout.write("synthetic isolated process cache passed");
  `;
  const { stdout, stderr } = await execFileAsync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", script], {
    env: { NODE_ENV: "production" }, windowsHide: true, timeout: 10000,
  });
  assert.equal(stdout, "synthetic isolated process cache passed");
  assert.equal(stderr, "");
});
