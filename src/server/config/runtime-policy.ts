import "server-only";

import { z } from "zod";
import { publicPolicy } from "../../domain/public-policy.ts";

type Environment = Readonly<Record<string, string | undefined>>;
type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object
  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Secrets require an explicit read and are redacted by JSON/string conversion. */
class Secret {
  #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  read(): string {
    return this.#value;
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return this.toString();
  }
}

export const operatingRules = freeze({
  calendar: {
    storedTimeZone: "UTC",
    dailyRunTime: "00:00",
    dailyRunUtcCron: "0 21 * * *",
    windowDays: publicPolicy.predictionWindowDays,
    cutoffSecondsBeforeKickoff: 300,
    publicationStrictlyBeforeCutoff: true,
    observedPlayClosesPublication: true,
  },
  forecasts: {
    primary: "ai",
    fallback: "api-football",
    completeRevisionSnapshots: true,
    retainEligiblePreviousWhenAllMarketsUnavailable: true,
    probabilityMinimumExclusive: 0,
    probabilityMaximumExclusive: 1,
    sourceConflictRule: "preserve-valid-ai-groups-omit-conflicting-fallback",
    visitorRequestsTriggerPredictions: false,
  },
  football: {
    provider: "API-Football",
    vendor: "API-Sports",
    subscription: "direct-mega",
    monthlyPayableCeilingUsdCents: 4_500,
    advertisedMonthlyUsdCents: 3_900,
    advertisedRequestsPerDay: 150_000,
    requestsPerRollingSecond: 12,
    requestsPerRollingMinute: 720,
    requestsPerProviderDay: 120_000,
    essentialReserveRequests: 20_000,
    unusedDailyHeadroomRequests: 30_000,
    allAccountCallersShareLimits: true,
    pauseWhenSharedLimiterUnavailable: true,
    providerDayResetRequiresVerification: true,
  },
  refresh: {
    livePollSeconds: 15,
    dateAndResultsPollSeconds: 60,
    crossMidnightPollSeconds: 60,
    visibleClientMinimumSeconds: 15,
    visibleClientMaximumSeconds: 30,
    oneLeasedPoller: true,
    pollingTriggersPredictions: false,
  },
  images: { thirdParty: "remote-https-only", firstPartyBrandMayBeBundled: true },
} as const);

const optional = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional().transform((value) => value ?? null),
  );
const text = optional(z.string().trim().min(1).regex(/^[^\r\n\0]+$/));
const token = optional(z.string().min(1).regex(/^\S+$/));
const integer = z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.int().nonnegative());
const count = optional(integer.refine((value) => value > 0));
const money = optional(integer);
const tolerance = optional(
  z.string().regex(/^(0|1)(\.\d+)?$/).transform(Number).pipe(z.number().gt(0).lt(1)),
);
const enabled = z.enum(["true", "false"]).transform((value) => value === "true").default(false);
const disabledFeature = z.literal("false").optional();
const databaseUrl = optional(z.string().refine((value) => {
  try {
    const url = new URL(value);
    const user = decodeURIComponent(url.username);
    const database = decodeURIComponent(url.pathname.slice(1));
    decodeURIComponent(url.password);
    return url.protocol === "mysql:" && url.hostname.length > 0 && /^\/[^/]+$/.test(url.pathname)
      && user.length > 0 && !/[\0\r\n]/.test(user)
      && database.length > 0 && database.length <= 64 && !/[\0/\\]/.test(database)
      && url.hash === "" && (url.port === "" || Number(url.port) > 0);
  } catch {
    return false;
  }
}));

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
    .describe("Use development, test or production."),
  GOAL_HINT_OPERATION_SCOPE: z.enum(["disabled", "trial", "shadow", "production"]).default("disabled")
    .describe("Use disabled, trial, shadow or production; deployment mode does not qualify forecasts."),
  GOAL_HINT_DATABASE_ENABLED: enabled.describe("Use true or false; database integration belongs to prompt 003."),
  GOAL_HINT_FOOTBALL_ENABLED: enabled.describe("Use true or false; paid calls require approved bounded policy."),
  GOAL_HINT_AI_ENABLED: enabled.describe("Use true or false; AI calls require an approved separate budget."),
  GOAL_HINT_RESEARCH_ENABLED: enabled.describe("Use true or false; research calls require licensing and a separate budget."),
  DATABASE_URL: databaseUrl.describe("Supply a MySQL connection URL with a host and one database (003)."),
  TEST_DATABASE_URL: databaseUrl.describe("Supply a separate isolated MySQL test URL (003)."),
  MIGRATION_DATABASE_URL: databaseUrl.describe("Supply separate direct MySQL migration credentials; never fall back to the application URL (003)."),
  GOAL_HINT_DATABASE_CONNECTION_MODE: optional(z.literal("direct")).describe("Approve direct MySQL TCP access; hosted proxy compatibility remains a deployment decision (003/046)."),
  GOAL_HINT_DATABASE_POOL_LIMIT: count.describe("Set the positive per-process pool limit; production sizing must be explicit (003/046)."),
  GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: count.transform((value) => value ?? 5_000).pipe(z.int().positive().max(2_147_483_647)).describe("Use a positive connection timeout within the platform timer range, in milliseconds (003)."),
  GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: count.transform((value) => value ?? 10_000).pipe(z.int().positive().max(2_147_483_647)).describe("Use a positive acquisition timeout within the timer range, greater than the connection timeout (003)."),
  GOAL_HINT_DATABASE_IDLE_TIMEOUT_SECONDS: count.transform((value) => value ?? 30).pipe(z.int().positive().max(2_147_483)).describe("Use a positive idle timeout within the platform timer range, in seconds (003)."),
  GOAL_HINT_DATABASE_TLS_MODE: optional(z.enum(["disabled", "required"])).describe("Require verified TLS remotely/in production; disabled is permitted only for local development/tests (003)."),
  GOAL_HINT_DATABASE_TLS_CA_FILE: text.describe("Supply the approved CA PEM file path when system trust is insufficient; never disable certificate verification (003)."),
  GOAL_HINT_DATABASE_ACCESS_REF: text.describe("Reference verified target ownership, connection/TLS policy, application/migration grants and test isolation for remote/production access (003)."),
  API_FOOTBALL_KEY: token.describe("Supply a server-only credential without whitespace (007)."),
  AI_API_KEY: token.describe("Supply a server-only credential without whitespace (012)."),
  RESEARCH_API_KEY: token.describe("Supply a server-only credential without whitespace (011)."),
  API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: optional(integer.pipe(z.int().nonnegative().max(operatingRules.football.monthlyPayableCeilingUsdCents)))
    .describe("Use integer US cents within the settled US$45 payable ceiling (008)."),
  GOAL_HINT_COMPETITION_IDS: optional(
    z.string().regex(/^[1-9]\d*(,[1-9]\d*)*$/)
      .transform((value) => value.split(",").map(Number))
      .pipe(z.array(z.int().positive()).min(1))
      .refine((values) => new Set(values).size === values.length),
  ).describe("Use unique positive provider IDs separated by commas; leave unset until selected (008)."),
  GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: text.describe("Record evidence permitting bounded private API use (008)."),
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: text.describe("Record verified active limits, reset, expiry and coverage (008)."),
  GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: text.describe("Record verified prediction/data/logo public display and reuse rights (008)."),
  GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT: count.describe("Use a positive counted trial request allowance within the shared ceiling (008)."),
  GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: money.describe("Use an explicitly approved separate AI cap in integer US cents (010)."),
  GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS: money.describe("Use an explicitly approved separate research cap in integer US cents (010)."),
  GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: money.describe("Record an approved infrastructure cap in integer US cents (003/020/046)."),
  GOAL_HINT_BUDGET_APPROVAL_REF: text.describe("Reference recorded approvals for the configured caps and paid operation (008/010)."),
  GOAL_HINT_AI_PROVIDER: text.describe("Select the primary predictor provider without inventing one (010/012)."),
  GOAL_HINT_AI_MODEL: text.describe("Record the selected model/version (012)."),
  GOAL_HINT_CALIBRATION_REF: text.describe("Record the selected calibration configuration; this does not claim calibration quality (012/014)."),
  GOAL_HINT_RESEARCH_PROVIDER: text.describe("Select a licensed research provider (010/011)."),
  GOAL_HINT_RESEARCH_LICENSE_REF: text.describe("Record permitted research retrieval and reuse (011)."),
  GOAL_HINT_EVIDENCE_POLICY_REF: text.describe("Record minimum evidence, conflicts and missing-data rules (011)."),
  GOAL_HINT_FRESHNESS_POLICY_REF: text.describe("Record source/status freshness and unknown-update-time handling (008/011/022)."),
  GOAL_HINT_PROBABILITY_SUM_TOLERANCE: tolerance.describe("Choose a finite tolerance strictly between zero and one (005)."),
  GOAL_HINT_CONSISTENCY_TOLERANCE: tolerance.describe("Choose a finite cross-market tolerance strictly between zero and one (005)."),
  GOAL_HINT_JOB_REQUEST_LIMIT: count.describe("Set a positive per-job request limit (010/020)."),
  GOAL_HINT_JOB_TOKEN_LIMIT: count.describe("Set a positive per-job token limit (010/012)."),
  GOAL_HINT_JOB_TIMEOUT_SECONDS: count.describe("Set a positive bounded job timeout (010/020)."),
  GOAL_HINT_SHADOW_MAX_JOBS: count.describe("Set the approved maximum private shadow jobs (014/047)."),
  GOAL_HINT_SHADOW_BUDGET_USD_CENTS: money.describe("Set an approved bounded private shadow budget in integer US cents (014/047)."),
  GOAL_HINT_SHADOW_PROTOCOL_REF: text.describe("Record the private shadow protocol and evidence collection plan (014/047)."),
  GOAL_HINT_PIPELINE_INTEGRITY_REF: text.describe("Record passing quota, publication, cutoff, settlement and recovery prerequisites (020–027/047)."),
  GOAL_HINT_QUALITY_QUALIFICATION_REF: text.describe("Record measured prospective sample, baseline, calibration and coverage qualification (014/047)."),
  GOAL_HINT_RELEASE_APPROVAL_REF: text.describe("Record production release approval, including legal, operational and recovery readiness (048/049)."),
  GOAL_HINT_ADS_ENABLED: disabledFeature.describe("Advertising is disabled at launch; approval and consent requirements remain unresolved."),
  GOAL_HINT_DARK_MODE_ENABLED: disabledFeature.describe("Dark mode is disabled at launch."),
  GOAL_HINT_EXACT_SCORES_ENABLED: disabledFeature.describe("Exact scores are excluded until explicit approval and score-distribution validation."),
  GOAL_HINT_LOCALES: z.literal("en").optional().describe("English is the only launch locale."),
});

export type PolicyIssue = Readonly<{ field: string; reason: string }>;

export class RuntimePolicyError extends Error {
  readonly issues: readonly PolicyIssue[];

  constructor(issues: readonly PolicyIssue[]) {
    super(`Runtime policy is invalid:\n${issues.map(({ field, reason }) => `- ${field}: ${reason}`).join("\n")}`);
    this.name = "RuntimePolicyError";
    this.issues = freeze([...issues]);
  }
}

const secret = (value: string | null) => value === null ? null : new Secret(value);

function assemble(settings: z.output<typeof environmentSchema>) {
  return freeze({
    mode: settings.NODE_ENV,
    scope: settings.GOAL_HINT_OPERATION_SCOPE,
    public: publicPolicy,
    rules: operatingRules,
    capabilities: {
      database: settings.GOAL_HINT_DATABASE_ENABLED,
      football: settings.GOAL_HINT_FOOTBALL_ENABLED,
      ai: settings.GOAL_HINT_AI_ENABLED,
      research: settings.GOAL_HINT_RESEARCH_ENABLED,
    },
    secrets: {
      databaseUrl: secret(settings.DATABASE_URL),
      testDatabaseUrl: secret(settings.TEST_DATABASE_URL),
      migrationDatabaseUrl: secret(settings.MIGRATION_DATABASE_URL),
      footballKey: secret(settings.API_FOOTBALL_KEY),
      aiKey: secret(settings.AI_API_KEY),
      researchKey: secret(settings.RESEARCH_API_KEY),
    },
    choices: {
      database: {
        connectionMode: settings.GOAL_HINT_DATABASE_CONNECTION_MODE,
        poolLimit: settings.GOAL_HINT_DATABASE_POOL_LIMIT,
        connectTimeoutMs: settings.GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS,
        acquireTimeoutMs: settings.GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS,
        idleTimeoutSeconds: settings.GOAL_HINT_DATABASE_IDLE_TIMEOUT_SECONDS,
        tlsMode: settings.GOAL_HINT_DATABASE_TLS_MODE,
        tlsCaFile: settings.GOAL_HINT_DATABASE_TLS_CA_FILE,
        accessRef: settings.GOAL_HINT_DATABASE_ACCESS_REF,
      },
      competitionIds: settings.GOAL_HINT_COMPETITION_IDS,
      football: {
        payableMonthlyUsdCents: settings.API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS,
        privateUseRef: settings.GOAL_HINT_FOOTBALL_PRIVATE_USE_REF,
        accountEvidenceRef: settings.GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF,
        publicRightsRef: settings.GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF,
        trialRequestLimit: settings.GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT,
      },
      budgets: {
        aiMonthlyUsdCents: settings.GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS,
        researchMonthlyUsdCents: settings.GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS,
        infrastructureMonthlyUsdCents: settings.GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS,
        approvalRef: settings.GOAL_HINT_BUDGET_APPROVAL_REF,
      },
      ai: { provider: settings.GOAL_HINT_AI_PROVIDER, model: settings.GOAL_HINT_AI_MODEL, calibrationRef: settings.GOAL_HINT_CALIBRATION_REF },
      research: { provider: settings.GOAL_HINT_RESEARCH_PROVIDER, licenseRef: settings.GOAL_HINT_RESEARCH_LICENSE_REF },
      evidencePolicyRef: settings.GOAL_HINT_EVIDENCE_POLICY_REF,
      freshnessPolicyRef: settings.GOAL_HINT_FRESHNESS_POLICY_REF,
      probabilitySumTolerance: settings.GOAL_HINT_PROBABILITY_SUM_TOLERANCE,
      consistencyTolerance: settings.GOAL_HINT_CONSISTENCY_TOLERANCE,
      job: { requestLimit: settings.GOAL_HINT_JOB_REQUEST_LIMIT, tokenLimit: settings.GOAL_HINT_JOB_TOKEN_LIMIT, timeoutSeconds: settings.GOAL_HINT_JOB_TIMEOUT_SECONDS },
      shadow: { maximumJobs: settings.GOAL_HINT_SHADOW_MAX_JOBS, budgetUsdCents: settings.GOAL_HINT_SHADOW_BUDGET_USD_CENTS, protocolRef: settings.GOAL_HINT_SHADOW_PROTOCOL_REF },
      pipelineIntegrityRef: settings.GOAL_HINT_PIPELINE_INTEGRITY_REF,
      qualityQualificationRef: settings.GOAL_HINT_QUALITY_QUALIFICATION_REF,
      releaseApprovalRef: settings.GOAL_HINT_RELEASE_APPROVAL_REF,
    },
  });
}

export type RuntimePolicy = ReturnType<typeof assemble>;
const operations = ["database", "database-migration", "football", "research", "ai", "private-shadow", "publication"] as const;
export type Operation = typeof operations[number];

export function isLoopbackDatabaseHost(host: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(host);
}

function databaseApprovalRequired(policy: RuntimePolicy, migration = false): boolean {
  const target = migration ? policy.secrets.migrationDatabaseUrl
    : policy.mode === "test" ? policy.secrets.testDatabaseUrl : policy.secrets.databaseUrl;
  return policy.mode === "production" || (target !== null && !isLoopbackDatabaseHost(new URL(target.read()).hostname));
}

/** Pure parsing for isolated contracts/tests; never mutates env or performs I/O. */
export function parseRuntimePolicy(env: Environment): RuntimePolicy {
  const issues: PolicyIssue[] = [];
  const shape = environmentSchema.shape;
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      issues.push({ field: "NEXT_PUBLIC_*", reason: "Runtime settings must stay server-owned; public settings come from publicPolicy." });
    } else if (key.startsWith("GOAL_HINT_") && !(key in shape)) {
      issues.push({ field: "GOAL_HINT_*", reason: "Unknown policy setting; use the documented environment contract." });
    }
  }
  const result = environmentSchema.safeParse(Object.fromEntries(Object.keys(shape).map((key) => [key, env[key]])));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof typeof shape;
      issues.push({ field: key, reason: shape[key].description ?? "Invalid setting." });
    }
  }
  if (issues.length > 0 || !result.success) throw new RuntimePolicyError(issues);
  const policy = assemble(result.data);
  const contradictions = consistencyIssues(policy);
  if (contradictions.length > 0) throw new RuntimePolicyError(contradictions);
  // A declared capability is checked at startup as well as at each later operation.
  if (policy.capabilities.database) validateOperationConfiguration(policy, "database");
  for (const operation of ["football", "research", "ai"] as const) {
    if (policy.capabilities[operation]) validateOperationConfiguration(policy, operation);
  }
  if (policy.scope === "shadow") validateOperationConfiguration(policy, "private-shadow");
  if (policy.scope === "production") validateOperationConfiguration(policy, "publication");
  return policy;
}

function validateOperationConfiguration(policy: RuntimePolicy, operation: Operation): void {
  const issues: PolicyIssue[] = [];
  const need = (field: keyof typeof environmentSchema.shape, value: unknown) => {
    if (value === null || value === false || value === undefined || (typeof value === "number" && value <= 0)) {
      issues.push({ field, reason: environmentSchema.shape[field].description ?? "Required for this operation." });
    }
  };
  if (operation === "database" || operation === "database-migration") {
    const migration = operation === "database-migration";
    need("GOAL_HINT_DATABASE_ENABLED", policy.capabilities.database);
    need(migration ? "MIGRATION_DATABASE_URL" : policy.mode === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL",
      migration ? policy.secrets.migrationDatabaseUrl : policy.mode === "test" ? policy.secrets.testDatabaseUrl : policy.secrets.databaseUrl);
    if (databaseApprovalRequired(policy, migration)) {
      need("GOAL_HINT_DATABASE_CONNECTION_MODE", policy.choices.database.connectionMode);
      need("GOAL_HINT_DATABASE_POOL_LIMIT", policy.choices.database.poolLimit);
      if (policy.choices.database.tlsMode !== "required") need("GOAL_HINT_DATABASE_TLS_MODE", null);
      need("GOAL_HINT_DATABASE_ACCESS_REF", policy.choices.database.accessRef);
      if (policy.choices.budgets.infrastructureMonthlyUsdCents === null) need("GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS", null);
      need("GOAL_HINT_BUDGET_APPROVAL_REF", policy.choices.budgets.approvalRef);
    }
  } else {
    if (policy.mode === "test") issues.push({ field: "NODE_ENV", reason: "Test configuration cannot authorize paid/provider calls, shadow runs or public publication." });
    if (policy.scope === "disabled") issues.push({ field: "GOAL_HINT_OPERATION_SCOPE", reason: "Live operations are disabled; select an approved bounded trial or qualified later phase." });

    const football = () => {
      need("GOAL_HINT_FOOTBALL_ENABLED", policy.capabilities.football);
      need("API_FOOTBALL_KEY", policy.secrets.footballKey);
      need("API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS", policy.choices.football.payableMonthlyUsdCents);
      need("GOAL_HINT_BUDGET_APPROVAL_REF", policy.choices.budgets.approvalRef);
      need("GOAL_HINT_FOOTBALL_PRIVATE_USE_REF", policy.choices.football.privateUseRef);
      if (policy.scope === "trial") need("GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT", policy.choices.football.trialRequestLimit);
      else {
        need("GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF", policy.choices.football.accountEvidenceRef);
        need("GOAL_HINT_COMPETITION_IDS", policy.choices.competitionIds);
      }
    };
    const job = () => {
      need("GOAL_HINT_JOB_REQUEST_LIMIT", policy.choices.job.requestLimit);
      need("GOAL_HINT_JOB_TIMEOUT_SECONDS", policy.choices.job.timeoutSeconds);
      need("GOAL_HINT_BUDGET_APPROVAL_REF", policy.choices.budgets.approvalRef);
    };
    const ai = () => {
      need("GOAL_HINT_AI_ENABLED", policy.capabilities.ai);
      need("AI_API_KEY", policy.secrets.aiKey);
      need("GOAL_HINT_AI_PROVIDER", policy.choices.ai.provider);
      need("GOAL_HINT_AI_MODEL", policy.choices.ai.model);
      need("GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS", policy.choices.budgets.aiMonthlyUsdCents);
      need("GOAL_HINT_JOB_TOKEN_LIMIT", policy.choices.job.tokenLimit);
      job();
    };
    const research = () => {
      need("GOAL_HINT_RESEARCH_ENABLED", policy.capabilities.research);
      need("RESEARCH_API_KEY", policy.secrets.researchKey);
      need("GOAL_HINT_RESEARCH_PROVIDER", policy.choices.research.provider);
      need("GOAL_HINT_RESEARCH_LICENSE_REF", policy.choices.research.licenseRef);
      need("GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS", policy.choices.budgets.researchMonthlyUsdCents);
      job();
    };
    if (operation === "football") football();
    if (operation === "ai") ai();
    if (operation === "research") research();
    if (operation === "private-shadow" || operation === "publication") {
      football(); ai();
      if (policy.capabilities.research) research();
      need("GOAL_HINT_CALIBRATION_REF", policy.choices.ai.calibrationRef);
      need("GOAL_HINT_EVIDENCE_POLICY_REF", policy.choices.evidencePolicyRef);
      need("GOAL_HINT_FRESHNESS_POLICY_REF", policy.choices.freshnessPolicyRef);
      need("GOAL_HINT_PROBABILITY_SUM_TOLERANCE", policy.choices.probabilitySumTolerance);
      need("GOAL_HINT_CONSISTENCY_TOLERANCE", policy.choices.consistencyTolerance);
      need("GOAL_HINT_PIPELINE_INTEGRITY_REF", policy.choices.pipelineIntegrityRef);
      if (policy.choices.budgets.infrastructureMonthlyUsdCents === null) need("GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS", null);
      if (operation === "private-shadow") {
        if (policy.scope !== "shadow") issues.push({ field: "GOAL_HINT_OPERATION_SCOPE", reason: "Private shadow runs require the explicit shadow scope." });
        need("GOAL_HINT_SHADOW_MAX_JOBS", policy.choices.shadow.maximumJobs);
        need("GOAL_HINT_SHADOW_BUDGET_USD_CENTS", policy.choices.shadow.budgetUsdCents);
        need("GOAL_HINT_SHADOW_PROTOCOL_REF", policy.choices.shadow.protocolRef);
      } else {
        if (policy.scope !== "production") issues.push({ field: "GOAL_HINT_OPERATION_SCOPE", reason: "Trials and private shadow runs cannot publish production forecasts." });
        need("GOAL_HINT_QUALITY_QUALIFICATION_REF", policy.choices.qualityQualificationRef);
        need("GOAL_HINT_RELEASE_APPROVAL_REF", policy.choices.releaseApprovalRef);
        need("GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF", policy.choices.football.publicRightsRef);
      }
    }
  }
  if (issues.length > 0) throw new RuntimePolicyError(issues);
}

function consistencyIssues(policy: RuntimePolicy): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  if (policy.choices.database.acquireTimeoutMs <= policy.choices.database.connectTimeoutMs) {
    issues.push({ field: "GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS", reason: "Pool acquisition timeout must exceed the connection timeout." });
  }
  if (policy.scope === "production" && policy.mode !== "production") {
    issues.push({ field: "NODE_ENV", reason: "Public production publication requires production mode." });
  }
  if (policy.secrets.databaseUrl !== null && policy.secrets.testDatabaseUrl !== null
    && new URL(policy.secrets.databaseUrl.read()).href === new URL(policy.secrets.testDatabaseUrl.read()).href) {
    issues.push({ field: "TEST_DATABASE_URL", reason: "The isolated test target must differ from DATABASE_URL; prompt 003 must also verify actual database isolation." });
  }
  if (policy.choices.football.trialRequestLimit !== null
    && policy.choices.football.trialRequestLimit > operatingRules.football.requestsPerProviderDay - operatingRules.football.essentialReserveRequests) {
    issues.push({ field: "GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT", reason: "Trial allowance must fit inside the nonessential shared daily ceiling; the limiter still counts every dispatch." });
  }
  const { aiMonthlyUsdCents, researchMonthlyUsdCents } = policy.choices.budgets;
  const researchAllowance = policy.capabilities.research ? researchMonthlyUsdCents : 0;
  if (policy.choices.shadow.budgetUsdCents !== null && aiMonthlyUsdCents !== null
    && researchAllowance !== null
    && policy.choices.shadow.budgetUsdCents > aiMonthlyUsdCents + researchAllowance) {
    issues.push({ field: "GOAL_HINT_SHADOW_BUDGET_USD_CENTS", reason: "The shadow AI/research allowance must fit inside the separately approved monthly caps; category limits still apply." });
  }
  return issues;
}

export type EvidenceRequirement =
  | "budget-approval" | "database-access" | "football-private-use" | "football-account" | "football-public-rights"
  | "research-license" | "calibration-configuration" | "evidence-policy" | "freshness-policy"
  | "shadow-protocol" | "pipeline-integrity" | "quality-qualification" | "release-approval";
export type EvidenceVerifier = (reference: string, requirement: EvidenceRequirement) => boolean;

/** References alone never authorize work. Future consumers verify the underlying records. */
export function assertOperationAllowed(policy: RuntimePolicy, operation: Operation, verifyEvidence?: EvidenceVerifier): void {
  if (!operations.includes(operation)) throw new RuntimePolicyError([{ field: "operation", reason: "Unknown operation; no authorization is granted." }]);
  validateOperationConfiguration(policy, operation);
  // Individual paid calls cannot bypass the enclosing shadow or release gate.
  const databaseOperation = operation === "database" || operation === "database-migration";
  const databaseNeedsApproval = databaseApprovalRequired(policy, operation === "database-migration");
  if (!databaseOperation && operation !== "private-shadow" && operation !== "publication") {
    if (policy.scope === "shadow") assertOperationAllowed(policy, "private-shadow", verifyEvidence);
    if (policy.scope === "production") assertOperationAllowed(policy, "publication", verifyEvidence);
  }
  const requirements: [keyof typeof environmentSchema.shape, string | null, EvidenceRequirement][] = [];
  const { choices } = policy;
  if (!databaseOperation || databaseNeedsApproval) {
    requirements.push(["GOAL_HINT_BUDGET_APPROVAL_REF", choices.budgets.approvalRef, "budget-approval"]);
  }
  if (databaseOperation && databaseNeedsApproval) {
    requirements.push(["GOAL_HINT_DATABASE_ACCESS_REF", choices.database.accessRef, "database-access"]);
  }
  if (operation === "football" || operation === "private-shadow" || operation === "publication") {
    requirements.push(["GOAL_HINT_FOOTBALL_PRIVATE_USE_REF", choices.football.privateUseRef, "football-private-use"]);
    if (policy.scope !== "trial") requirements.push(["GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF", choices.football.accountEvidenceRef, "football-account"]);
  }
  if (operation === "research" || ((operation === "private-shadow" || operation === "publication") && policy.capabilities.research)) {
    requirements.push(["GOAL_HINT_RESEARCH_LICENSE_REF", choices.research.licenseRef, "research-license"]);
  }
  if (operation === "private-shadow" || operation === "publication") {
    requirements.push(
      ["GOAL_HINT_CALIBRATION_REF", choices.ai.calibrationRef, "calibration-configuration"],
      ["GOAL_HINT_EVIDENCE_POLICY_REF", choices.evidencePolicyRef, "evidence-policy"],
      ["GOAL_HINT_FRESHNESS_POLICY_REF", choices.freshnessPolicyRef, "freshness-policy"],
      ["GOAL_HINT_PIPELINE_INTEGRITY_REF", choices.pipelineIntegrityRef, "pipeline-integrity"],
    );
    if (operation === "private-shadow") requirements.push(["GOAL_HINT_SHADOW_PROTOCOL_REF", choices.shadow.protocolRef, "shadow-protocol"]);
    else requirements.push(
      ["GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF", choices.football.publicRightsRef, "football-public-rights"],
      ["GOAL_HINT_QUALITY_QUALIFICATION_REF", choices.qualityQualificationRef, "quality-qualification"],
      ["GOAL_HINT_RELEASE_APPROVAL_REF", choices.releaseApprovalRef, "release-approval"],
    );
  }
  const issues: PolicyIssue[] = [];
  for (const [field, reference, requirement] of requirements) {
    let verified = false;
    try {
      verified = reference !== null && verifyEvidence?.(reference, requirement) === true;
    } catch {
      // A verifier may fail with a credential-bearing cause; never propagate it.
    }
    if (!verified) issues.push({ field, reason: `Verified ${requirement} evidence is required at this operation boundary; configuration references alone are insufficient.` });
  }
  if (issues.length > 0) throw new RuntimePolicyError(issues);
}

let cachedPolicy: RuntimePolicy | undefined;

/** Validated once per process; restart after changing configuration. */
export function getRuntimePolicy(): RuntimePolicy {
  cachedPolicy ??= parseRuntimePolicy(process.env);
  return cachedPolicy;
}
