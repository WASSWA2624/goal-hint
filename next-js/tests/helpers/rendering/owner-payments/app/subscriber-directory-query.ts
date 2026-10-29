import type { Prisma } from "@/server/generated/prisma/client";
import type { FixtureState } from "./fixture";

export type SubscriberDirectoryFixtureQuery = Prisma.MemberAccountFindManyArgs;
type Row = Readonly<Record<string, unknown>>;
const object = (value: unknown): value is Row => value !== null && typeof value === "object" && !(value instanceof Date);
const conditions = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [value];
const comparable = (value: unknown): string | number | null => value instanceof Date ? +value
  : typeof value === "string" || typeof value === "number" ? value : null;

function scalarMatches(value: unknown, condition: unknown): boolean {
  if (!object(condition)) return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
  return Object.entries(condition).every(([operator, target]) => {
    if (operator === "not") return !scalarMatches(value, target);
    if (operator === "equals") return scalarMatches(value, target);
    if (operator === "in") return Array.isArray(target) && target.some(item => scalarMatches(value, item));
    if (operator === "contains") return typeof value === "string" && typeof target === "string"
      && value.toLocaleLowerCase("en").includes(target.toLocaleLowerCase("en"));
    const left = comparable(value), right = comparable(target);
    if (left === null || right === null) return false;
    return operator === "gt" ? left > right : operator === "gte" ? left >= right
      : operator === "lt" ? left < right : operator === "lte" ? left <= right : false;
  });
}

function matches(row: Row, where: unknown): boolean {
  if (where === undefined) return true;
  if (!object(where)) return false;
  return Object.entries(where).every(([field, condition]) => {
    if (field === "AND") return conditions(condition).every(item => matches(row, item));
    if (field === "OR") return conditions(condition).some(item => matches(row, item));
    if (field === "NOT") return conditions(condition).every(item => !matches(row, item));
    if (field !== "codes" && field !== "submissions") return scalarMatches(row[field], condition);
    const related = row[field];
    return Array.isArray(related) && object(condition) && Object.entries(condition).every(([operator, terms]) => {
      const matching = related.some(item => object(item) && matches(item, terms));
      return operator === "some" ? matching : operator === "none" ? !matching
        : operator === "every" ? related.every(item => object(item) && matches(item, terms)) : false;
    });
  });
}

function ordered<T extends Row>(rows: T[], orderBy: unknown): T[] {
  if (!orderBy) return rows;
  return rows.sort((left, right) => {
    for (const order of conditions(orderBy)) {
      if (!object(order)) continue;
      for (const [field, direction] of Object.entries(order)) {
        const a = comparable(left[field]), b = comparable(right[field]);
        const difference = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
        if (difference) return difference * (direction === "desc" ? -1 : 1);
      }
    }
    return 0;
  });
}

function byAccount<T extends { accountId: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const existing = groups.get(row.accountId);
    if (existing) existing.push(row);
    else groups.set(row.accountId, [row]);
  }
  return groups;
}

/** Exercise the real directory predicates against isolated account, code and payment fixtures. */
export function fixtureSubscriberDirectory(state: FixtureState, query: SubscriberDirectoryFixtureQuery) {
  const codeSelection = query.select?.codes;
  if (!codeSelection || typeof codeSelection !== "object") throw new Error("Select the directory's current codes.");
  const codes = byAccount(state.codes), submissions = byAccount(state.payments);
  const rows = state.accounts.map(row => ({ ...row, codes: codes.get(row.id) ?? [], submissions: submissions.get(row.id) ?? [] }));
  return ordered(rows.filter(row => matches(row, query.where)), query.orderBy).slice(0, query.take ?? rows.length)
    .map(row => ({ id: row.id, phone: row.phone, blockedAt: row.blockedAt, erasedAt: row.erasedAt, lastSignInAt: row.lastSignInAt,
      codes: ordered(row.codes.filter(code => matches(code, codeSelection.where)), codeSelection.orderBy)
        .slice(0, codeSelection.take ?? row.codes.length).map(code => ({ planName: code.planName, startsAt: code.startsAt })) }));
}
