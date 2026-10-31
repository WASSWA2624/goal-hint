import "server-only";

import { Prisma } from "../generated/prisma/client.ts";
import type { DatabaseRuntime } from "./client.ts";

export type DatabaseHealth = "ready" | "unavailable" | "schema-unavailable";

const accountTables = {
  MemberAccount: Prisma.MemberAccountScalarFieldEnum,
  MemberSession: Prisma.MemberSessionScalarFieldEnum,
  MemberVerification: Prisma.MemberVerificationScalarFieldEnum,
  MemberReferral: Prisma.MemberReferralScalarFieldEnum,
};
// Identifiers come only from these generated model fields and the fixed table names above.
const identifier = (name: string) => Prisma.raw(`\`${name}\``);

/** Private CLI probe: authenticate the application connection and check account schema without reading member data. */
export async function databaseHealth(database: Pick<DatabaseRuntime, "readiness" | "query">): Promise<DatabaseHealth> {
  if (await database.readiness() !== "ready") return "unavailable";
  try {
    await database.query(async client => {
      for (const [table, fields] of Object.entries(accountTables)) {
        await client.$queryRaw(Prisma.sql`SELECT ${Prisma.join(Object.values(fields).map(identifier))}
          FROM ${identifier(table)} WHERE 1 = 0`);
      }
    });
    return "ready";
  } catch { return "schema-unavailable"; }
}
