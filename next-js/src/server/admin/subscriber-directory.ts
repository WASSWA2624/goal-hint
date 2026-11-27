import "server-only";

import { emptySubscriberDirectoryQuery, subscriberDirectoryPageSize, subscriberSearchTerms, type SubscriberDirectoryAccount, type SubscriberDirectoryCursor,
  type SubscriberDirectoryPage, type SubscriberDirectoryQuery } from "../../domain/subscriber-directory.ts";
import { normalizePhone } from "../../domain/phone.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { isMemberAdminPhone } from "../members/member-admin.ts";

const currentAccess = (at: Date) => ({ revokedAt: null, endsAt: { gt: at } }) satisfies Prisma.AccessCodeWhereInput;

/** SQL predicates compose before counting and paging. */
export function subscriberDirectoryWhere(query: SubscriberDirectoryQuery, at: Date): Prisma.MemberAccountWhereInput {
  const current = currentAccess(at);
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

/** Count and page in the same snapshot, fetching only the fields needed for the directory. */
export async function readSubscriberDirectory(database: DatabaseRuntime, query: SubscriberDirectoryQuery = emptySubscriberDirectoryQuery,
  requestedPage = 1, now: (() => number) | number = Date.now, after?: SubscriberDirectoryCursor):
  Promise<SubscriberDirectoryPage & Readonly<{ adminPhone?: string }>> {
  const at = new Date(typeof now === "function" ? now() : now), where = subscriberDirectoryWhere(query, at);
  return database.transaction(async client => {
    const total = await client.memberAccount.count({ where });
    const pages = Math.max(1, Math.ceil(total / subscriberDirectoryPageSize));
    const page = Math.min(requestedPage, pages);
    const lastSignInAt = after ? new Date(after.lastSignInAt) : undefined;
    const window = after && lastSignInAt ? { AND: [where, { OR: [
      { lastSignInAt: { lt: lastSignInAt } }, { lastSignInAt, id: { gt: after.id } },
    ] }] } : where;
    const rows = total === 0 ? [] : await client.memberAccount.findMany({ where: window,
      orderBy: [{ lastSignInAt: "desc" }, { id: "asc" }], skip: after ? 0 : (page - 1) * subscriberDirectoryPageSize,
      take: subscriberDirectoryPageSize + Number(Boolean(after)),
      select: { id: true, phone: true, blockedAt: true, erasedAt: true, lastSignInAt: true } });
    const hasMore = rows.length > subscriberDirectoryPageSize;
    if (hasMore) rows.pop();
    // The earliest current period distinguishes active from queued with one result per account.
    const periods = rows.length ? await client.accessCode.groupBy({ by: ["accountId"],
      where: { ...currentAccess(at), accountId: { in: rows.map(row => row.id) } }, _min: { startsAt: true } }) : [];
    const firstStart = new Map(periods.map(period => [period.accountId, period._min.startsAt]));
    const accounts = rows.map<SubscriberDirectoryAccount>(row => {
      const startsAt = firstStart.get(row.id);
      return { id: row.id, phone: row.phone, status: row.erasedAt ? "erased" : row.blockedAt ? "blocked" : "open",
        lastSignInAt: row.lastSignInAt.toISOString(), access: startsAt ? startsAt <= at ? "active" : "queued" : "none" };
    });
    const phone = !accounts.length && query.search ? normalizePhone(query.search) : null;
    return { accounts, page, pages, total, asOf: at.toISOString(), ...(after ? { hasMore } : {}),
      ...(phone && isMemberAdminPhone(phone) ? { adminPhone: phone } : {}) };
  }, { isolationLevel: "RepeatableRead" });
}
