import "server-only";

import { emptySubscriberDirectoryQuery, subscriberSearchTerms, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "../../domain/subscriber-directory.ts";
import { networkForPrefix } from "../../domain/phone.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export const subscriberDirectoryLimit = 100;

/** SQL predicates compose before the result cap; one bounded relation selection enriches the list. */
export function subscriberDirectoryWhere(query: SubscriberDirectoryQuery, at: Date): Prisma.MemberAccountWhereInput {
  const current: Prisma.AccessCodeWhereInput = { revokedAt: null, endsAt: { gt: at } };
  const active: Prisma.AccessCodeWhereInput = { ...current, startsAt: { lte: at } };
  const queued: Prisma.AccessCodeWhereInput = { ...current, startsAt: { gt: at } };
  const conditions: Prisma.MemberAccountWhereInput[] = [];
  if (query.status === "open") conditions.push({ erasedAt: null, blockedAt: null });
  else if (query.status === "blocked") conditions.push({ erasedAt: null, blockedAt: { not: null } });
  else if (query.status === "erased") conditions.push({ erasedAt: { not: null } });
  if (query.access === "active") conditions.push({ codes: { some: active } });
  else if (query.access === "queued") conditions.push({ codes: { none: active, some: queued } });
  else if (query.access === "none") conditions.push({ codes: { none: current } });
  if (query.plan === "none") conditions.push({ codes: { none: current } });
  else if (query.plan !== "all") conditions.push({ codes: { some: { ...current, planName: query.plan } } });
  if (query.recent !== "all") conditions.push({ lastSignInAt: { gte: new Date(+at - Number(query.recent) * 86_400_000), lte: at } });
  for (const term of subscriberSearchTerms(query.search)) {
    const reference = term.replace(/^[CP]-/iu, "");
    const alternatives: Prisma.MemberAccountWhereInput[] = [
      { phone: { contains: term } }, { id: { contains: term } }, { ownerNote: { contains: term } },
      { codes: { some: { OR: [{ reference: { contains: reference } }, { planName: { contains: term } }] } } },
      { submissions: { some: { reference: { contains: reference } } } },
    ];
    switch (term.toLowerCase()) {
      case "open": alternatives.push({ erasedAt: null, blockedAt: null }); break;
      case "blocked": alternatives.push({ erasedAt: null, blockedAt: { not: null } }); break;
      case "erased": alternatives.push({ erasedAt: { not: null } }); break;
      case "active": alternatives.push({ codes: { some: active } }); break;
      case "queued": alternatives.push({ codes: { none: active, some: queued } }); break;
    }
    conditions.push({ OR: alternatives });
  }
  return conditions.length ? { AND: conditions } : {};
}

/** Carrier artwork is used only when an explicitly configured prefix table identifies it. */
export async function readSubscriberDirectory(database: DatabaseRuntime, query: SubscriberDirectoryQuery = emptySubscriberDirectoryQuery,
  now: (() => number) | number = Date.now): Promise<readonly SubscriberDirectoryAccount[]> {
  const at = new Date(typeof now === "function" ? now() : now);
  return database.query(async client => {
    const rows = await client.memberAccount.findMany({ where: subscriberDirectoryWhere(query, at),
      orderBy: [{ lastSignInAt: "desc" }, { id: "asc" }], take: subscriberDirectoryLimit,
      select: { id: true, phone: true, blockedAt: true, erasedAt: true, lastSignInAt: true,
        codes: { where: { revokedAt: null, endsAt: { gt: at } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: subscriberDirectoryLimit,
          select: { planName: true, startsAt: true } } } });
    return rows.map<SubscriberDirectoryAccount>(row => ({ id: row.id, phone: row.phone, status: row.erasedAt ? "erased" : row.blockedAt ? "blocked" : "open",
      lastSignInAt: row.lastSignInAt.toISOString(), access: row.codes.some(code => code.startsAt <= at) ? "active" : row.codes.length ? "queued" : "none",
      planNames: [...new Set(row.codes.map(code => code.planName))], network: row.phone ? networkForPrefix(row.phone) : null }));
  });
}
