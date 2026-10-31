import "server-only";

import { randomUUID } from "node:crypto";
import { canonicalSlipConfigurationParameters, slipConfigurationMutationSchema, slipConfigurationRules,
  type SlipConfiguration, type SlipConfigurationFailure, type SlipConfigurationMutation } from "../../domain/slip-configurations.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import type { Prisma, SlipConfiguration as ConfigurationRow } from "../generated/prisma/client.ts";
import type { MemberIdentity } from "../members/member-sessions.ts";

type Outcome = Readonly<{ status: "saved"; configurations: readonly SlipConfiguration[] }>
  | Readonly<{ status: SlipConfigurationFailure }>;
const order = [{ createdAt: "asc" }, { id: "asc" }] satisfies Prisma.SlipConfigurationOrderByWithRelationInput[];
const view = (row: ConfigurationRow): SlipConfiguration => ({ id: row.id, name: row.name, parameters: canonicalSlipConfigurationParameters(row.parameters),
  revision: row.revision, isDefault: row.isDefault === true, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

/** Account locking protects the ten-item cap, single default, and session/erasure races across server processes. */
export function createSlipConfigurations({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  async function authorized(tx: Prisma.TransactionClient, member: MemberIdentity, at: Date) {
    if (member.blocked) return false;
    await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${member.accountId} FOR UPDATE`;
    const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, include: { account: true } });
    return !!session && session.accountId === member.accountId && !!session.authenticatedAt && !session.passwordResetAt && session.expiresAt > at
      && !session.account.blockedAt && !session.account.erasedAt && !!session.account.phone
      && (!!session.account.passwordHash || member.administrator === true)
      && session.account.phone === member.phone && (!!session.account.phoneVerifiedAt || member.administrator === true);
  }
  const list = async (tx: Prisma.TransactionClient, accountId: string) =>
    (await tx.slipConfiguration.findMany({ where: { accountId }, orderBy: order })).map(view);
  return Object.freeze({
    async read(member: MemberIdentity): Promise<Outcome> {
      return database.transaction(async tx => await authorized(tx, member, new Date(now()))
        ? { status: "saved", configurations: await list(tx, member.accountId) } : { status: "forbidden" }, { isolationLevel: "ReadCommitted" });
    },
    async mutate(member: MemberIdentity, input: SlipConfigurationMutation): Promise<Outcome> {
      let mutation: SlipConfigurationMutation;
      try {
        mutation = slipConfigurationMutationSchema.parse(input);
        if ("parameters" in mutation) mutation = { ...mutation, parameters: canonicalSlipConfigurationParameters(mutation.parameters) };
      } catch { return { status: "invalid" }; }
      try {
        return await database.transaction<Outcome>(async tx => {
          const at = new Date(now());
          if (!await authorized(tx, member, at)) return { status: "forbidden" };
          const rows = await tx.slipConfiguration.findMany({ where: { accountId: member.accountId }, orderBy: order });
          const selectedId = mutation.action === "create" ? null : mutation.id;
          const current = rows.find(row => row.id === selectedId);
          if (mutation.action === "create" && rows.length >= slipConfigurationRules.maximum) return { status: "limit" };
          if (mutation.action !== "create") {
            if (!current) return { status: "not-found" };
            if (current.revision !== mutation.revision) return { status: "conflict" };
          }
          const name = "name" in mutation ? mutation.name : current!.name;
          const nameKey = name.toLowerCase();
          if (rows.some(row => row.id !== current?.id && row.nameKey === nameKey)) return { status: "name-taken" };
          if ((mutation.action === "create" || mutation.action === "default") && mutation.isDefault) {
            await tx.slipConfiguration.updateMany({ where: { accountId: member.accountId, isDefault: true,
              ...(current ? { id: { not: current.id } } : {}) }, data: { isDefault: null, updatedAt: at, revision: { increment: 1 } } });
          }
          if (mutation.action === "create") {
            await tx.slipConfiguration.create({ data: { id: randomUUID(), accountId: member.accountId, name, nameKey,
              parameters: mutation.parameters, isDefault: mutation.isDefault ? true : null, createdAt: at, updatedAt: at } });
          } else if (mutation.action === "delete") {
            await tx.slipConfiguration.delete({ where: { id: current!.id } });
          } else {
            const data = mutation.action === "rename" ? { name, nameKey } : mutation.action === "update" ? { parameters: mutation.parameters }
              : { isDefault: mutation.isDefault ? true as const : null };
            await tx.slipConfiguration.update({ where: { id: current!.id }, data: { ...data, updatedAt: at, revision: { increment: 1 } } });
          }
          return { status: "saved", configurations: await list(tx, member.accountId) };
        }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
      } catch (error) {
        if (error instanceof DatabaseOperationError && error.code === "constraint") return { status: "conflict" };
        throw error;
      }
    },
  });
}
export type SlipConfigurationsService = ReturnType<typeof createSlipConfigurations>;
