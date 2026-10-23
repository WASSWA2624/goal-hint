import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { normalizePhone } from "@/domain/phone";
import { codeStatus } from "@/domain/subscription-period";
import type { OwnerAccount, OwnerCode } from "@/domain/owner-members";
import type { AnalyticsServices } from "@/server/analytics/analytics-http";
import { memberTokenHash } from "@/server/members/member-sessions";

export const fixtureAdminToken = "z".repeat(43), fixtureAdminPassword = "Synthetic owner fixture password", fixtureAdminPhone = "256700000991";
const fixtureKey = (purpose: string, value: string) => createHmac("sha256", "synthetic-owner-fixture-key").update(`${purpose}\0${value}`).digest("hex");

export const planId = "00000000-0000-4000-8000-000000000001";
export const accountId = "00000000-0000-4000-8000-000000000100";
export const paymentId = "00000000-0000-4000-8000-000000000200";
const at = new Date("2026-10-19T09:00:00Z"), end = new Date("2026-10-26T09:00:00Z");
export const fixturePlan = { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 0, createdAt: at, updatedAt: at };
export type FixtureAccount = { id: string; phone: string | null; blockedAt: Date | null; blockedReason: string | null;
  ownerNote: string | null; erasedAt: Date | null; lastSignInAt: Date; trialRequestedAt: Date | null;
  trialDismissedAt: Date | null; passwordResetRequestedAt: Date | null };
export type FixtureCode = { id: string; accountId: string; reference: string; planName: string; durationDays: number;
  extensionDays: number; startsAt: Date; endsAt: Date; revokedAt: Date | null; source: string; createdAt: Date };
type FixtureDevice = { accountId: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date; unlocked: boolean };
type FixturePayment = { id: string; reference: string; accountId: string; payerPhone: string | null; claimedNetwork: string;
  claimedTxnRef: string; claimedTxnKey: string; claimedAmountUgx: number; amountReceivedUgx: number | null; planId: string;
  planName: string; priceUgx: number; submittedAt: Date; status: string; imageSha256: null; screenshot: null; transactionRef: string | null };
type FixtureAudit = { id: bigint; at: Date; actor: string; action: string; accountId: string | null;
  targetType: string; targetId: string; details: Record<string, unknown> };
export type FixtureState = { accounts: FixtureAccount[]; codes: FixtureCode[]; devices: FixtureDevice[];
  payments: FixturePayment[]; audits: FixtureAudit[]; counter: number };
const fixtureGlobal = globalThis as typeof globalThis & { goalHintOwnerFixture?: FixtureState; goalHintAnalytics?: Promise<AnalyticsServices> };

function initialState(): FixtureState {
  const primary: FixtureAccount = { id: accountId, phone: "256700000101", blockedAt: null, blockedReason: null,
    ownerNote: "Synthetic owner note", erasedAt: null, lastSignInAt: new Date("2026-10-23T09:42:00Z"),
    trialRequestedAt: at, trialDismissedAt: null, passwordResetRequestedAt: at };
  const other = { ...primary, trialRequestedAt: null, passwordResetRequestedAt: null, ownerNote: null };
  const codes: FixtureCode[] = [{ id: "00000000-0000-4000-8000-000000000300", accountId, reference: "CODE",
    planName: "Weekly", durationDays: 7, extensionDays: 0, startsAt: at, endsAt: end, revokedAt: null, source: "payment", createdAt: at }];
  return structuredClone({ accounts: [primary,
    { ...other, id: "00000000-0000-4000-8000-000000000102", phone: "256700000118", lastSignInAt: new Date("2026-10-23T07:15:00Z") },
    { ...other, id: "00000000-0000-4000-8000-000000000103", phone: "256700000204", lastSignInAt: new Date("2026-10-22T18:32:00Z"), blockedAt: new Date("2026-10-22T19:00:00Z"), blockedReason: "Synthetic account review" },
    { ...other, id: "00000000-0000-4000-8000-000000000104", phone: null, lastSignInAt: new Date("2026-10-20T14:05:00Z"), erasedAt: new Date("2026-10-21T08:00:00Z") },
    { ...other, id: "00000000-0000-4000-8000-000000000105", phone: "447700900123", lastSignInAt: new Date("2026-10-18T11:20:00Z") },
    { ...other, id: "00000000-0000-4000-8000-000000000106", phone: "254700000105", lastSignInAt: new Date("2026-10-16T06:10:00Z") },
  ], codes, devices: [0, 1].map(index => ({ accountId, createdAt: at, lastSeenAt: new Date(+at + index * 3600000),
    expiresAt: new Date(Date.now() + 90 * 86400000), unlocked: true })),
  payments: [{ id: paymentId, reference: "TEST", accountId, payerPhone: "256700000102", claimedNetwork: "mtn",
    claimedTxnRef: "TEST1234", claimedTxnKey: "TEST1234", claimedAmountUgx: 5000, amountReceivedUgx: null,
    planId, planName: "Weekly", priceUgx: 5000, submittedAt: at, status: "pending", imageSha256: null, screenshot: null, transactionRef: null }],
  audits: [{ id: 1n, at, actor: "synthetic-owner", action: "code_created", accountId, targetType: "access-code", targetId: codes[0]!.id, details: {} }], counter: 400 });
}

/** State belongs only to this isolated Next process. It never connects to business storage or a messaging provider. */
export function fixtureState(): FixtureState { return fixtureGlobal.goalHintOwnerFixture ??= initialState(); }
export function resetFixture() { fixtureGlobal.goalHintOwnerFixture = initialState(); }
export function fixtureAccountForPhone(phone: string): FixtureAccount {
  const state = fixtureState(), existing = state.accounts.find(row => row.phone === phone);
  if (existing) return existing;
  const account: FixtureAccount = { id: randomUUID(), phone, blockedAt: null, blockedReason: null, ownerNote: null,
    erasedAt: null, lastSignInAt: new Date(), trialRequestedAt: null, trialDismissedAt: null, passwordResetRequestedAt: null };
  state.accounts.push(account);return account;
}
export function grantFixtureAccess(account: FixtureAccount, days: number, source = "manual", planName = "Weekly") {
  const state = fixtureState(), at = new Date(), latest = Math.max(+at, ...state.codes.filter(row => row.accountId === account.id && !row.revokedAt).map(row => +row.endsAt));
  const code: FixtureCode = { id: randomUUID(), accountId: account.id, reference: `F${String(++state.counter % 1000).padStart(3, "0")}`,
    planName, durationDays: days, extensionDays: 0, startsAt: new Date(latest), endsAt: new Date(latest + days * 86400000), revokedAt: null, source, createdAt: at };
  state.codes.push(code);
  const devices = state.devices.filter(row => row.accountId === account.id && row.expiresAt > at);
  for (const device of devices) device.unlocked = true;
  recordFixtureAudit("access_granted", account.id, "access-code", code.id);
  return { status: "granted", endsAt: code.endsAt.toISOString(), devicesUnlocked: devices.length };
}
export function recordFixtureAudit(action: string, id: string, targetType = "member", targetId = id) {
  const state = fixtureState();state.audits.push({ id: BigInt(++state.counter), at: new Date(), actor: "synthetic-owner",
    action, accountId: id, targetType, targetId, details: {} });
}
export function searchSubscribers(value: string): readonly OwnerAccount[] {
  const phone = normalizePhone(value);
  return fixtureState().accounts.filter(row => !value || phone !== null && row.phone === phone)
    .sort((a, b) => +b.lastSignInAt - +a.lastSignInAt).map(row => ({ id: row.id, phone: row.phone,
      status: row.erasedAt ? "erased" : row.blockedAt ? "blocked" : "open", lastSignInAt: row.lastSignInAt.toISOString() }));
}
export function fixtureCodes(search = "", status = "all"): readonly OwnerCode[] {
  const state = fixtureState(), now = Date.now(), phone = normalizePhone(search), reference = search.trim().toUpperCase().replace(/^[PC]-/u, "");
  return state.codes.map(row => ({ id: row.id, accountId: row.accountId, reference: `C-${row.reference}`,
    phone: state.accounts.find(account => account.id === row.accountId)?.phone ?? null, planName: row.planName,
    source: row.source, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), status: codeStatus(row, new Date(now)),
    daysLeft: Math.max(0, Math.ceil((+row.endsAt - Math.max(now, +row.startsAt)) / 86400000)) }))
    .filter(row => (status === "all" || row.status === status) && (!search || row.phone === phone || row.reference === `C-${reference}`));
}
/** Redacted fixture diagnostics for harness assertions: no tokens, password hashes or temporary passwords exist here. */
export function fixtureSnapshot() {
  const state = fixtureState();
  return { accounts: state.accounts.map(row => ({ ...searchSubscribers("").find(account => account.id === row.id)!,
    ownerNote: row.ownerNote, blockedReason: row.blockedReason,
    devices: state.devices.filter(device => device.accountId === row.id && device.unlocked).length })),
    codes: fixtureCodes(), payments: state.payments.map(row => ({ id: row.id, accountId: row.accountId, payerPhone: row.payerPhone, status: row.status })),
    audits: state.audits.map(row => ({ accountId: row.accountId, action: row.action })), plans: [fixturePlan.id] };
}

type AccountQuery = { where?: { phone?: string | { in?: string[] }; passwordResetRequestedAt?: unknown; trialRequestedAt?: unknown } };
type OwnedQuery = { where?: { accountId?: string; codeEnteredAt?: unknown } };
const ownedRows = <T extends { accountId: string }>(rows: T[], query?: OwnedQuery) => query?.where?.accountId
  ? rows.filter(row => row.accountId === query.where!.accountId) : rows;
function createClient(emptySubscribers: boolean) {
  const state = fixtureState(), phoneFor = (id: string) => state.accounts.find(row => row.id === id)?.phone ?? null;
  return {
    $executeRaw: async () => 0, $queryRaw: async () => [{ total: 1n }],
    memberSession: { findMany: async (query?: OwnedQuery) => ownedRows(state.devices, query).filter(row => !query?.where?.codeEnteredAt || row.unlocked),
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash !== memberTokenHash(fixtureAdminToken)) return null;
        const now = new Date();
        return { tokenHash: where.tokenHash, accountId: "00000000-0000-4000-8000-000000000991", authenticatedAt: now, lastSeenAt: now,
          expiresAt: new Date(+now + 86_400_000), passwordResetAt: null, codeEnteredAt: null, accessCodeId: null,
          adminPasswordVersion: fixtureKey("admin-password-version", `plain:${fixtureAdminPassword}`),
          account: { phone: fixtureAdminPhone, passwordHash: null, phoneVerifiedAt: now, blockedAt: null, erasedAt: null } };
      }, updateMany: async () => ({ count: 0 }) },
    subscriptionPlan: { findMany: async () => [fixturePlan] },
    paymentSubmission: { findMany: async (query?: OwnedQuery) => ownedRows(state.payments, query).map(row => ({ ...row, account: { phone: phoneFor(row.accountId) } })),
      count: async () => state.payments.filter(row => row.status === "pending").length, aggregate: async () => ({ _sum: { amountReceivedUgx: 5000 } }) },
    memberAccount: { findUnique: async (query: { where: { id: string } }) => state.accounts.find(row => row.id === query.where.id) ?? null,
      findMany: async (query: AccountQuery = {}) => {
        const where = query.where;
        if (where?.passwordResetRequestedAt) return state.accounts.filter(row => row.passwordResetRequestedAt && !row.blockedAt && !row.erasedAt && row.phone);
        if (where?.trialRequestedAt) return state.accounts.filter(row => row.trialRequestedAt && !row.trialDismissedAt && !row.blockedAt && !row.erasedAt && row.phone);
        const rows = emptySubscribers ? [] : [...state.accounts].sort((a, b) => +b.lastSignInAt - +a.lastSignInAt);
        if (typeof where?.phone === "string") return rows.filter(row => row.phone === where.phone);
        const phones = where?.phone?.in;
        return phones ? rows.filter(row => row.phone !== null && phones.includes(row.phone)) : rows;
      } },
    ownerAuditEvent: { findMany: async () => state.audits, count: async () => 0 }, rateLimitBucket: { findMany: async () => [] },
    accessCode: { findMany: async (query?: OwnedQuery) => ownedRows(state.codes, query).map(row => ({ ...row, account: { phone: phoneFor(row.accountId) } })),
      aggregate: async () => ({ _sum: { amountReceivedUgx: 3000 } }), count: async () => state.codes.length },
    subscriptionSettings: { findUnique: async () => ({ paymentNumbersChangedAt: at }) },
  };
}
export function seed({ emptySubscribers = false }: { emptySubscribers?: boolean } = {}) {
  fixtureGlobal.goalHintAnalytics = Promise.resolve({ config: { production: false, key: fixtureKey, cookies: { session: "synthetic-owner", exclude: "synthetic-owner-exclude", secure: false } },
    database: { query: async (run: (client: unknown) => unknown) => run(createClient(emptySubscribers)) },
    auth: null } as unknown as AnalyticsServices);
}
