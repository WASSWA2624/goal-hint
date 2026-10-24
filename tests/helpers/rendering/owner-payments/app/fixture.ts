import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { normalizePhone } from "@/domain/phone";
import { codeStatus } from "@/domain/subscription-period";
import type { OwnerAccount, OwnerCode } from "@/domain/owner-members";
import type { AnalyticsServices } from "@/server/analytics/analytics-http";
import { memberTokenHash } from "@/server/members/member-sessions";
import { fixturePaymentProof } from "./payment-proof";

export const fixtureAdminToken = "z".repeat(43), fixtureAdminPassword = "Synthetic owner fixture password", fixtureAdminPhone = "256700000991";
const fixtureKey = (purpose: string, value: string) => createHmac("sha256", "synthetic-owner-fixture-key").update(`${purpose}\0${value}`).digest("hex");

export const planId = "00000000-0000-4000-8000-000000000001";
export const accountId = "00000000-0000-4000-8000-000000000100";
export const paymentId = "00000000-0000-4000-8000-000000000200";
export const fixtureAuditSessionHash = "f".repeat(64);
const at = new Date("2026-10-19T09:00:00Z"), end = new Date("2026-10-26T09:00:00Z");
export const fixturePlan = { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 0, createdAt: at, updatedAt: at };
export const fixturePaymentPlans = [fixturePlan,
  { ...fixturePlan, id: "00000000-0000-4000-8000-000000000002", name: "Daily", durationDays: 1, priceUgx: 1000, sortOrder: 1 },
  { ...fixturePlan, id: "00000000-0000-4000-8000-000000000003", name: "Monthly", durationDays: 30, priceUgx: 15000, sortOrder: 2 }];
export type FixtureAccount = { id: string; phone: string | null; blockedAt: Date | null; blockedReason: string | null;
  ownerNote: string | null; erasedAt: Date | null; lastSignInAt: Date; trialRequestedAt: Date | null;
  trialDismissedAt: Date | null; passwordResetRequestedAt: Date | null };
export type FixtureCode = { id: string; accountId: string; reference: string; planName: string; durationDays: number;
  extensionDays: number; startsAt: Date; endsAt: Date; revokedAt: Date | null; source: string; createdAt: Date; paymentSubmissionId?: string };
type FixtureDevice = { accountId: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date; unlocked: boolean };
type FixturePayment = { id: string; reference: string; accountId: string; payerPhone: string | null; claimedNetwork: string;
  claimedTxnRef: string | null; claimedTxnKey: string | null; claimedAmountUgx: number; amountReceivedUgx: number | null; planId: string;
  planName: string; durationDays: number; priceUgx: number; submittedAt: Date; status: string; imageSha256: string | null;
  screenshot: { submissionId: string } | null; transactionRef: string | null; approvedTxnKey?: string | null; network?: string | null;
  rejectReason?: string | null; rejectText?: string | null };
type FixtureAudit = { id: bigint; at: Date; actor: string; action: string; accountId: string | null;
  targetType: string; targetId: string; details: Record<string, unknown> };
export type FixtureState = { accounts: FixtureAccount[]; codes: FixtureCode[]; devices: FixtureDevice[];
  payments: FixturePayment[]; audits: FixtureAudit[]; counter: number; paymentsExpanded?: boolean };
const fixtureGlobal = globalThis as typeof globalThis & { goalHintOwnerFixture?: FixtureState; goalHintAnalytics?: Promise<AnalyticsServices>;
  goalHintOwnerServices?: Map<boolean, AnalyticsServices> };

function initialAudits(codeId: string): FixtureAudit[] {
  const administrator = "member-admin:00000000-0000-4000-8000-000000000991", other = "00000000-0000-4000-8000-000000000102";
  const event = (id: number, instant: string, action: string, actor: string, account: string | null, targetType: string, targetId: string): FixtureAudit =>
    ({ id: BigInt(id), at: new Date(instant), actor, action, accountId: account, targetType, targetId, details: {} });
  return [
    event(1, "2026-10-19T09:00:00Z", "code_created", administrator, accountId, "access-code", codeId),
    event(2, "2026-10-23T09:30:00Z", "payment_approved", administrator, other, "payment", "00000000-0000-4000-8000-000000000201"),
    event(3, "2026-10-22T19:00:00Z", "member_blocked", "owner", "00000000-0000-4000-8000-000000000103", "member", "00000000-0000-4000-8000-000000000103"),
    event(4, "2026-10-23T07:00:00Z", "member_unblocked", administrator, accountId, "member", accountId),
    event(5, "2026-10-23T08:00:00Z", "settings_changed", administrator, null, "settings", "1"),
    event(6, "2026-10-22T11:00:00Z", "paywall_mode_changed", administrator, null, "settings", "1"),
    event(7, "2026-10-23T09:42:00Z", "owner_signed_in", administrator, null, "owner-session", "admin"),
    event(8, "2026-10-23T10:05:00Z", "owner_sign_in_refused", "unverified", null, "owner-session", "analytics"),
    event(9, "2026-10-22T22:30:00Z", "member_signed_out_all", administrator, accountId, "member", accountId),
    event(10, "2026-10-22T09:10:00Z", "password_reset", administrator, accountId, "member", accountId),
    event(11, "2026-10-21T12:00:00Z", "device_unlocked", "member", accountId, "member-session", fixtureAuditSessionHash),
    event(12, "2026-10-20T00:00:00Z", "members_purged", "system:members-purge", null, "settings", "1"),
    event(13, "2026-10-23T06:00:00Z", "future_feature_event", "system:maintenance", null, "future-record", "00000000-0000-4000-8000-000000000888"),
    event(14, "2026-10-21T19:00:00Z", "payment_rejected", administrator, other, "payment", "00000000-0000-4000-8000-000000000202"),
    event(15, "2026-10-20T15:00:00Z", "number_changed", "deleted-admin", other, "member", other),
    event(16, "2026-10-22T07:00:00Z", "plan_updated", administrator, null, "plan", planId),
    event(17, "2026-09-30T21:30:00Z", "trial_requested", "member", accountId, "member", accountId),
  ];
}

function initialState(): FixtureState {
  const primary: FixtureAccount = { id: accountId, phone: "256700000101", blockedAt: null, blockedReason: null,
    ownerNote: "Synthetic owner note", erasedAt: null, lastSignInAt: new Date("2026-10-23T09:42:00Z"),
    trialRequestedAt: at, trialDismissedAt: null, passwordResetRequestedAt: at };
  const other = { ...primary, trialRequestedAt: null, passwordResetRequestedAt: null, ownerNote: null };
  const codes: FixtureCode[] = [{ id: "00000000-0000-4000-8000-000000000300", accountId, reference: "CODE",
    planName: "Weekly", durationDays: 7, extensionDays: 0, startsAt: at, endsAt: end, revokedAt: null, source: "payment", createdAt: at }];
  return structuredClone({ accounts: [primary,
    { ...other, id: "00000000-0000-4000-8000-000000000102", phone: "256700000118", trialRequestedAt: at, lastSignInAt: new Date("2026-10-23T07:15:00Z") },
    { ...other, id: "00000000-0000-4000-8000-000000000103", phone: "256700000204", lastSignInAt: new Date("2026-10-22T18:32:00Z"), blockedAt: new Date("2026-10-22T19:00:00Z"), blockedReason: "Synthetic account review" },
    { ...other, id: "00000000-0000-4000-8000-000000000104", phone: null, lastSignInAt: new Date("2026-10-20T14:05:00Z"), erasedAt: new Date("2026-10-21T08:00:00Z") },
    { ...other, id: "00000000-0000-4000-8000-000000000105", phone: "447700900123", lastSignInAt: new Date("2026-10-18T11:20:00Z") },
    { ...other, id: "00000000-0000-4000-8000-000000000106", phone: "254700000105", lastSignInAt: new Date("2026-10-16T06:10:00Z") },
  ], codes, devices: [0, 1].map(index => ({ accountId, createdAt: at, lastSeenAt: new Date(+at + index * 3600000),
    expiresAt: new Date(Date.now() + 90 * 86400000), unlocked: true })),
  payments: [{ id: paymentId, reference: "TEST", accountId, payerPhone: "256700000102", claimedNetwork: "mtn",
    claimedTxnRef: "TEST1234", claimedTxnKey: "TEST1234", claimedAmountUgx: 5000, amountReceivedUgx: null,
    planId, planName: "Weekly", durationDays: 7, priceUgx: 5000, submittedAt: at, status: "pending", imageSha256: null, screenshot: null, transactionRef: null }],
  audits: initialAudits(codes[0]!.id), counter: 400 });
}

/** State belongs only to this isolated Next process. It never connects to business storage or a messaging provider. */
export function fixtureState(): FixtureState { return fixtureGlobal.goalHintOwnerFixture ??= initialState(); }
export function resetFixture() { fixtureGlobal.goalHintOwnerFixture = initialState(); }
/** Opt-in review data leaves the original subscriber/audit acceptance baseline unchanged. */
export function loadPaymentsFixture() {
  const state = fixtureState();
  if (state.paymentsExpanded) return;
  state.paymentsExpanded = true;
  const original = state.payments[0]!;
  // Keep a visible sender warning in the first review and duplicate evidence on the attached report.
  original.payerPhone = "256700000118";
  original.claimedAmountUgx = 4500;
  const payment = (suffix: string, values: Partial<FixturePayment>): FixturePayment => ({ ...original,
    id: `00000000-0000-4000-8000-0000000002${suffix}`, reference: `DEMO${suffix}`, accountId: "00000000-0000-4000-8000-000000000102",
    payerPhone: "256700000118", submittedAt: new Date(`2026-10-23T0${Number(suffix)}:00:00Z`), ...values });
  const monthly = fixturePaymentPlans[2]!, daily = fixturePaymentPlans[1]!;
  state.payments.push(
    payment("01", { planId: monthly.id, planName: monthly.name, durationDays: monthly.durationDays, priceUgx: monthly.priceUgx,
      claimedAmountUgx: 15000, claimedNetwork: "airtel", claimedTxnRef: "AIR2026102301", claimedTxnKey: "AIR2026102301",
      screenshot: { submissionId: "00000000-0000-4000-8000-000000000201" }, imageSha256: "a".repeat(64) }),
    payment("02", { accountId: "00000000-0000-4000-8000-000000000105", payerPhone: null,
      planId: daily.id, planName: daily.name, durationDays: daily.durationDays, priceUgx: daily.priceUgx,
      claimedAmountUgx: 1000, claimedTxnRef: null, claimedTxnKey: null }),
    payment("03", { status: "approved", claimedTxnRef: "MTN2026102203", claimedTxnKey: "MTN2026102203",
      amountReceivedUgx: 5000, network: "mtn", transactionRef: "MTN2026102203", approvedTxnKey: "mtn:MTN2026102203" }),
    payment("04", { status: "rejected", claimedTxnRef: "MTN2026102204", claimedTxnKey: "MTN2026102204",
      rejectReason: "not-received", rejectText: "Synthetic wallet check found no matching receipt." }),
    payment("05", { status: "superseded", accountId, claimedTxnRef: "AIR2026102301", claimedTxnKey: "AIR2026102301", imageSha256: "a".repeat(64) }),
    payment("06", { status: "reversed", claimedTxnRef: "MTN2026102206", claimedTxnKey: "MTN2026102206",
      amountReceivedUgx: 5000, network: "mtn", transactionRef: "MTN2026102206", approvedTxnKey: "mtn:MTN2026102206" }),
  );
}
export function fixtureAccountForPhone(phone: string): FixtureAccount {
  const state = fixtureState(), existing = state.accounts.find(row => row.phone === phone);
  if (existing) return existing;
  const account: FixtureAccount = { id: randomUUID(), phone, blockedAt: null, blockedReason: null, ownerNote: null,
    erasedAt: null, lastSignInAt: new Date(), trialRequestedAt: null, trialDismissedAt: null, passwordResetRequestedAt: null };
  state.accounts.push(account);return account;
}
export function grantFixtureAccess(account: FixtureAccount, days: number, source = "manual", planName = "Weekly", paymentSubmissionId?: string) {
  const state = fixtureState(), at = new Date(), latest = Math.max(+at, ...state.codes.filter(row => row.accountId === account.id && !row.revokedAt).map(row => +row.endsAt));
  const code: FixtureCode = { id: randomUUID(), accountId: account.id, reference: `F${String(++state.counter % 1000).padStart(3, "0")}`,
    planName, durationDays: days, extensionDays: 0, startsAt: new Date(latest), endsAt: new Date(latest + days * 86400000), revokedAt: null, source, createdAt: at,
    ...(paymentSubmissionId ? { paymentSubmissionId } : {}) };
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

type AccountQuery = { where?: { phone?: string | { in?: string[] }; passwordResetRequestedAt?: unknown; trialRequestedAt?: unknown; codes?: { none: object } } };
type OwnedQuery = { where?: { accountId?: string; codeEnteredAt?: unknown } };
type PaymentWhere = { accountId?: string; status?: string | { in: string[] }; claimedTxnKey?: { in: string[] };
  approvedTxnKey?: { in: string[] }; imageSha256?: { in: string[] }; OR?: PaymentWhere[] };
type PaymentOrder = { submittedAt?: "asc" | "desc"; id?: "asc" | "desc" };
type PaymentQuery = { where?: PaymentWhere; orderBy?: PaymentOrder | PaymentOrder[]; take?: number };
function paymentRows(rows: FixturePayment[], query: PaymentQuery = {}) {
  const matches = (row: FixturePayment, where: PaymentWhere): boolean => (!where.accountId || row.accountId === where.accountId)
    && (!where.status || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status)))
    && (!where.claimedTxnKey || row.claimedTxnKey !== null && where.claimedTxnKey.in.includes(row.claimedTxnKey))
    && (!where.approvedTxnKey || !!row.approvedTxnKey && where.approvedTxnKey.in.includes(row.approvedTxnKey))
    && (!where.imageSha256 || row.imageSha256 !== null && where.imageSha256.in.includes(row.imageSha256))
    && (!where.OR || where.OR.some(condition => matches(row, condition)));
  const matching = rows.filter(row => matches(row, query.where ?? {}));
  const orders = Array.isArray(query.orderBy) ? query.orderBy : query.orderBy ? [query.orderBy] : [];
  if (query.orderBy) matching.sort((a, b) => {
    for (const order of orders) {
      const difference = order.submittedAt ? (+a.submittedAt - +b.submittedAt) * (order.submittedAt === "asc" ? 1 : -1)
        : a.id.localeCompare(b.id) * (order.id === "asc" ? 1 : -1);
      if (difference) return difference;
    }
    return 0;
  });
  return query.take === undefined ? matching : matching.slice(0, query.take);
}
type AuditQuery = { where?: { action?: string; accountId?: string | { in: string[] }; at?: { gte?: Date; lte?: Date }; id?: { in: bigint[] } };
  take?: number; select?: Partial<Record<keyof FixtureAudit, boolean>> };
function auditRows(rows: FixtureAudit[], query: AuditQuery = {}) {
  const where = query.where;
  const matching = rows.filter(row => (!where?.action || row.action === where.action)
    && (!where?.accountId || (typeof where.accountId === "string" ? row.accountId === where.accountId : row.accountId !== null && where.accountId.in.includes(row.accountId)))
    && (!where?.at?.gte || row.at >= where.at.gte) && (!where?.at?.lte || row.at <= where.at.lte)
    && (!where?.id?.in || where.id.in.includes(row.id)))
    .sort((a, b) => +b.at - +a.at || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
  return query.take === undefined ? matching : matching.slice(0, query.take);
}
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
    subscriptionPlan: { findMany: async () => state.paymentsExpanded ? fixturePaymentPlans : [fixturePlan] },
    paymentSubmission: { findMany: async (query?: PaymentQuery) => paymentRows(state.payments, query).map(row => ({ ...row, account: { phone: phoneFor(row.accountId) } })),
      count: async (query?: PaymentQuery) => paymentRows(state.payments, query).length, aggregate: async () => ({ _sum: { amountReceivedUgx: 5000 } }) },
    paymentScreenshot: { findUnique: async ({ where }: { where: { submissionId: string } }) => state.payments.some(row => row.id === where.submissionId && row.screenshot)
      ? { data: fixturePaymentProof } : null },
    memberAccount: { findUnique: async (query: { where: { id: string } }) => state.accounts.find(row => row.id === query.where.id) ?? null,
      findMany: async (query: AccountQuery = {}) => {
        const where = query.where;
        if (where?.passwordResetRequestedAt) return state.accounts.filter(row => row.passwordResetRequestedAt && !row.blockedAt && !row.erasedAt && row.phone);
        if (where?.trialRequestedAt) return state.accounts.filter(row => row.trialRequestedAt && !row.trialDismissedAt && !row.blockedAt && !row.erasedAt && row.phone
          && (!where.codes || !state.codes.some(code => code.accountId === row.id)));
        const rows = emptySubscribers ? [] : [...state.accounts].sort((a, b) => +b.lastSignInAt - +a.lastSignInAt);
        if (typeof where?.phone === "string") return rows.filter(row => row.phone === where.phone);
        const phones = where?.phone?.in;
        return phones ? rows.filter(row => row.phone !== null && phones.includes(row.phone)) : rows;
      } },
    ownerAuditEvent: { findMany: async (query: AuditQuery = {}) => {
      const rows = auditRows(state.audits, query);
      return query.select ? rows.map(row => Object.fromEntries(Object.entries(query.select!).filter(([, included]) => included).map(([key]) => [key, row[key as keyof FixtureAudit]]))) : rows;
    }, count: async (query?: AuditQuery) => auditRows(state.audits, query).length }, rateLimitBucket: { findMany: async () => [] },
    accessCode: { findMany: async (query?: OwnedQuery) => ownedRows(state.codes, query).map(row => ({ ...row, account: { phone: phoneFor(row.accountId) } })),
      aggregate: async () => ({ _sum: { amountReceivedUgx: 3000 } }), count: async () => state.codes.length },
    subscriptionSettings: { findUnique: async () => ({ paymentNumbersChangedAt: at }) },
  };
}
export function seed({ emptySubscribers = false }: { emptySubscribers?: boolean } = {}) {
  const registered = fixtureGlobal.goalHintOwnerServices ??= new Map();
  let services = registered.get(emptySubscribers);
  if (!services) {
    services = { config: { production: false, key: fixtureKey, cookies: { session: "synthetic-owner", exclude: "synthetic-owner-exclude", secure: false } },
      database: { query: async (run: (client: unknown) => unknown) => run(createClient(emptySubscribers)) },
      auth: null } as unknown as AnalyticsServices;
    registered.set(emptySubscribers, services);
  }
  fixtureGlobal.goalHintAnalytics = Promise.resolve(services);
  return services;
}
