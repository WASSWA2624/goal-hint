import "server-only";

import { EventEmitter } from "node:events";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool, type Pool } from "mariadb";
import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";
import { assertOperationAllowed, getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { assertSafeDatabaseDiagnostics, databasePoolOptions } from "./connection.ts";

type ErrorCode = "conflict" | "constraint" | "unavailable" | "failed" | "closed";

export class DatabaseOperationError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(`Database operation ${code}; private driver diagnostics are withheld.`);
    this.name = "DatabaseOperationError";
    this.code = code;
  }
}

function sanitized(error: unknown): DatabaseOperationError {
  let code: unknown;
  try { code = error !== null && typeof error === "object" && "code" in error ? error.code : null; }
  catch { return new DatabaseOperationError("failed"); }
  if (typeof code !== "string") return new DatabaseOperationError("failed");
  if (code === "P2034") return new DatabaseOperationError("conflict");
  if (["P2002", "P2003", "P2011", "P2014"].includes(code)) return new DatabaseOperationError("constraint");
  if (["P1000", "P1001", "P1002", "P1017", "P2024"].includes(code)) return new DatabaseOperationError("unavailable");
  return new DatabaseOperationError("failed");
}

export type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

export class DatabaseRuntime {
  #client: PrismaClient;
  #pool: Pool;
  #closing: Promise<void> | undefined;

  constructor(policy: RuntimePolicy, verifyEvidence?: EvidenceVerifier) {
    assertOperationAllowed(policy, "database", verifyEvidence);
    const options = databasePoolOptions(policy);
    let pool: Pool | undefined;
    try {
      pool = createPool(options);
      // Pool events must never print driver errors, statements or connection strings.
      // The connector's event overloads omit error, although its pool is an emitter.
      (pool as unknown as EventEmitter).on("error", () => {});
      const adapter = new PrismaMariaDb(pool, { database: options.database!, disposeExternalPool: false, onConnectionError: () => {} });
      this.#client = new PrismaClient({ adapter, log: [], errorFormat: "minimal" });
      this.#pool = pool;
    }
    catch {
      // Initialization may fail before Prisma owns a client; still close an owned pool.
      const ownedPool = pool;
      if (ownedPool !== undefined) void Promise.resolve().then(() => ownedPool.end()).catch(() => {});
      throw new DatabaseOperationError("failed");
    }
  }

  get closed(): boolean { return this.#closing !== undefined; }

  async query<Result>(operation: (client: PrismaClient) => Promise<Result>): Promise<Result> {
    if (this.closed) throw new DatabaseOperationError("closed");
    assertSafeDatabaseDiagnostics();
    try { return await operation(this.#client); }
    catch (error) { throw sanitized(error); }
  }

  async transaction<Result>(operation: (transaction: Prisma.TransactionClient) => Promise<Result>, options?: TransactionOptions): Promise<Result> {
    // No automatic retries: callbacks may contain effects requiring idempotency.
    return this.query((client) => client.$transaction(operation, options));
  }

  async readiness(): Promise<"ready" | "unavailable"> {
    try {
      await this.query((client) => client.$queryRaw`SELECT 1`);
      return "ready";
    } catch { return "unavailable"; }
  }

  disconnect(): Promise<void> {
    this.#closing ??= (async () => {
      let failure = false;
      try { await this.#client.$disconnect(); } catch { failure = true; }
      // The pool also needs closing when Prisma never connected or initialization failed.
      try { await this.#pool.end(); } catch { failure = true; }
      if (failure) throw new DatabaseOperationError("failed");
    })();
    return this.#closing;
  }
}

export function createDatabase(policy: RuntimePolicy, verifyEvidence?: EvidenceVerifier): DatabaseRuntime {
  return new DatabaseRuntime(policy, verifyEvidence);
}

const processState = globalThis as typeof globalThis & { goalHintDatabase?: DatabaseRuntime };

/** One lazy pool per Node process, retained across Next development module reloads. */
export function getDatabase(verifyEvidence?: EvidenceVerifier): DatabaseRuntime {
  const policy = getRuntimePolicy();
  assertOperationAllowed(policy, "database", verifyEvidence);
  if (processState.goalHintDatabase === undefined || processState.goalHintDatabase.closed) {
    processState.goalHintDatabase = createDatabase(policy, verifyEvidence);
  }
  return processState.goalHintDatabase;
}

/** Script/worker shutdown only; never call this in request cleanup. */
export async function disconnectDatabase(): Promise<void> {
  await processState.goalHintDatabase?.disconnect();
}
