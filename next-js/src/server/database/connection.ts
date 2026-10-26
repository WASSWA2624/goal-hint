import "server-only";

import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";
import type { PoolConfig } from "mariadb";
import { isLoopbackDatabaseHost, RuntimePolicyError, type RuntimePolicy } from "../config/runtime-policy.ts";

const debugAtModuleLoad = Boolean(process.env.DEBUG?.trim());

export function assertSafeDatabaseDiagnostics(): void {
  if (debugAtModuleLoad || process.env.DEBUG?.trim()) {
    throw new RuntimePolicyError([{ field: "DEBUG", reason: "Disable process DEBUG before database access; driver debug namespaces may reveal queries and credentials." }]);
  }
}

function policyFailure(field: string, reason: string): never {
  throw new RuntimePolicyError([{ field, reason }]);
}

function connection(policy: RuntimePolicy, purpose: "application" | "migration") {
  const test = purpose === "application" && policy.mode === "test";
  const field = purpose === "migration" ? "MIGRATION_DATABASE_URL" : test ? "TEST_DATABASE_URL" : "DATABASE_URL";
  const secret = purpose === "migration" ? policy.secrets.migrationDatabaseUrl
    : test ? policy.secrets.testDatabaseUrl : policy.secrets.databaseUrl;
  const fail = policyFailure;
  const value = secret === null
    ? policyFailure(field, "Configure the separate required MySQL target; no credentials are substituted.") : secret.read();
  const url = new URL(value);
  if (url.search !== "") fail(field, "URL query overrides are unsupported; use the documented pool and TLS fields.");
  const local = isLoopbackDatabaseHost(url.hostname);
  const options = policy.choices.database;
  if (options.connectionMode === null && !local) fail("GOAL_HINT_DATABASE_CONNECTION_MODE", "Approve direct TCP access before connecting to a remote target.");
  const tls = options.tlsMode ?? (local && policy.mode !== "production" ? "disabled" : null);
  if (tls === null || (tls === "disabled" && (!local || policy.mode === "production"))) {
    fail("GOAL_HINT_DATABASE_TLS_MODE", "Remote and production MySQL connections require verified TLS.");
  }
  if (options.tlsCaFile !== null && tls !== "required") {
    fail("GOAL_HINT_DATABASE_TLS_CA_FILE", "A CA file requires TLS mode required.");
  }
  let user = "";
  let password = "";
  let database = "";
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    fail(field, "Use valid percent encoding for the MySQL connection components.");
  }
  if (!user || /[\0\r\n]/.test(user) || !database || /[\0/\\]/.test(database) || database.length > 64) {
    fail(field, "Supply a MySQL username and one valid database name.");
  }
  return { url, user, password, database, tls, options, fail };
}

// Connector 3.5.4 implements permitRedirect but omits it from its public types.
export function databasePoolOptions(policy: RuntimePolicy): PoolConfig & { permitRedirect: false } {
  assertSafeDatabaseDiagnostics();
  const { url, user, password, database, tls, options, fail } = connection(policy, "application");
  let ca: Buffer | undefined;
  if (options.tlsCaFile !== null) {
    try {
      ca = readFileSync(resolve(options.tlsCaFile));
    } catch {
      fail("GOAL_HINT_DATABASE_TLS_CA_FILE", "The approved CA PEM file must be readable by this runtime.");
    }
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ssl = tls === "required" ? {
    host, ...(isIP(host) === 0 ? { servername: host } : {}),
    rejectUnauthorized: true, ...(ca === undefined ? {} : { ca }),
  } : false;
  return {
    host, port: Number(url.port || 3306), user, password, database,
    connectionLimit: options.poolLimit ?? 5, minimumIdle: 0,
    connectTimeout: options.connectTimeoutMs, acquireTimeout: options.acquireTimeoutMs,
    idleTimeout: options.idleTimeoutSeconds, prepareCacheLength: 0,
    // Server redirects would change the approved target and reuse its credentials.
    permitRedirect: false,
    // MySQL's cold caching_sha2_password authentication needs RSA without TLS.
    // Key retrieval is restricted to local development/test without TLS.
    allowPublicKeyRetrieval: tls === "disabled" && policy.mode !== "production" && isLoopbackDatabaseHost(url.hostname),
    timezone: "+00:00", sessionVariables: { time_zone: "+00:00" },
    ssl,
    debug: false, trace: false, logParam: false,
  };
}

/** Translate the same approved TLS policy to Prisma Migrate's native connector. */
export function migrationConnectionUrl(policy: RuntimePolicy): string | null {
  if (policy.secrets.migrationDatabaseUrl === null) return null;
  const { url, tls, options, fail } = connection(policy, "migration");
  if (policy.mode === "production" && policy.secrets.databaseUrl !== null
    && decodeURIComponent(new URL(policy.secrets.databaseUrl.read()).username) === decodeURIComponent(url.username)) {
    fail("MIGRATION_DATABASE_URL", "Production migrations require a separate privileged role from the application connection.");
  }
  url.searchParams.set("connect_timeout", String(Math.ceil(options.connectTimeoutMs / 1_000)));
  url.searchParams.set("prefer_socket", "false");
  if (tls === "required") {
    url.searchParams.set("sslaccept", "strict");
    if (options.tlsCaFile !== null) url.searchParams.set("sslcert", resolve(options.tlsCaFile));
  }
  return url.href;
}
