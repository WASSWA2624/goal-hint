import "server-only";
import { authCopy } from "../../i18n/messages/auth.ts";

import { createHash, randomUUID } from "node:crypto";
import { alertRegistrationSchema, reviewAlertRules, type ReviewAlertFeed } from "../../domain/payment-alerts.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { readCookie } from "../http/private-http.ts";
import { isMemberAdminPhone, memberAdminCredential } from "../members/member-admin.ts";
import { memberCookieName, memberTokenHash, validMemberToken } from "../members/member-sessions.ts";
import { decide } from "../members/settings.ts";

/** Keep expected refusals outside the database runtime's private-error sanitiser. */
async function registryTransaction<T>(database: DatabaseRuntime, run: (tx: Prisma.TransactionClient, refuse: (message: string) => never) => Promise<T>): Promise<T> {
  const result = await decide<{ value: T } | { refusal: string }>(database, async (tx, rollback) => ({
    value: await run(tx, message => rollback({ refusal: message })),
  }));
  if ("refusal" in result) throw new RangeError(result.refusal);
  return result.value;
}

type Session = Prisma.MemberSessionGetPayload<{ include: { account: true } }>;
export function reviewerSessionValid(session: Session | null, config: Pick<AnalyticsConfig, "key">, at: Date): boolean {
  const credential = memberAdminCredential();
  return !!(session?.authenticatedAt && !session.passwordResetAt && session.expiresAt > at && !session.account.blockedAt
    && !session.account.erasedAt && isMemberAdminPhone(session.account.phone) && credential
    && session.adminPasswordVersion === config.key("admin-password-version", credential));
}
export function reviewSessionHash(request: Request, config: Pick<AnalyticsConfig, "production">) {
  const token = readCookie(request, memberCookieName(config.production));
  if (!validMemberToken(token)) throw new RangeError(authCopy.loginAgain);
  return memberTokenHash(token);
}
export const reviewEventWhere = (at: Date) => ({ resolvedAt: null, createdAt: { gt: new Date(+at - reviewAlertRules.lifetimeMs) },
  OR: [{ paymentId: null }, { payment: { status: { in: ["pending", "disputed"] } } }] });

export async function reviewAlertFeed(database: DatabaseRuntime, sessionHash: string, config: Pick<AnalyticsConfig, "key">, at = new Date()): Promise<ReviewAlertFeed> {
  return database.query(async tx => {
    const settings = await tx.subscriptionSettings.findUnique({ where: { id: 1 }, select: { paymentAlertsEnabled: true, paymentAlertRepeats: true } });
    const events = await tx.paymentReviewEvent.findMany({ where: { ...reviewEventWhere(at), OR: [
      { payment: { status: { in: ["pending", "disputed"] } } },
      { paymentId: null, testEndpointId: { in: (await tx.paymentAlertEndpoint.findMany({ where: { sessionHash, enabled: true }, select: { id: true } })).map(row => row.id) } },
    ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, paymentId: true, createdAt: true } });
    return { events: events.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), enabled: settings?.paymentAlertsEnabled ?? false,
      repeats: Math.max(1, Math.min(3, settings?.paymentAlertRepeats ?? 1)), scope: config.key("payment-alert-scope", sessionHash) };
  });
}

export function createReviewAlertRegistry(database: DatabaseRuntime, config: Pick<AnalyticsConfig, "key">, now = Date.now) {
  return Object.freeze({
    async register(sessionHash: string, input: unknown) {
      const parsed = alertRegistrationSchema.safeParse(input);
      if (!parsed.success) throw new RangeError("This notification endpoint is invalid or unsupported.");
      const registration = parsed.data, at = new Date(now());
      return registryTransaction(database, async (tx, refuse) => {
        // Registration shares session eviction's account lock; a stale request cannot resurrect a logged-out endpoint.
        const initial = await tx.memberSession.findUnique({ where: { tokenHash: sessionHash } });
        if (!initial) return refuse(authCopy.loginAgain);
        await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${initial.accountId} FOR UPDATE`;
        const session = await tx.memberSession.findUnique({ where: { tokenHash: sessionHash }, include: { account: true } });
        if (!reviewerSessionValid(session, config, at)) return refuse(authCopy.administratorRequired);
        const value = registration.transport === "web" ? registration.subscription.endpoint
          : registration.transport === "fcm" ? registration.subscription.fid : sessionHash;
        const fingerprint = createHash("sha256").update(`${registration.transport}:${value}`).digest("hex");
        // A device/profile belongs to its most recently authenticated session, never two simultaneous owners.
        await tx.paymentAlertEndpoint.deleteMany({ where: { fingerprint, sessionHash: { not: sessionHash } } });
        return tx.paymentAlertEndpoint.upsert({ where: { sessionHash_transport: { sessionHash, transport: registration.transport } },
          create: { id: randomUUID(), sessionHash, transport: registration.transport, fingerprint, subscription: registration.subscription, createdAt: at, updatedAt: at },
          update: { fingerprint, subscription: registration.subscription, enabled: true, updatedAt: at }, select: { id: true, transport: true, enabled: true } });
      });
    },
    async endpoints(sessionHash: string) {
      return database.query(tx => tx.paymentAlertEndpoint.findMany({ where: { sessionHash }, select: { id: true, transport: true, enabled: true,
        deliveries: { orderBy: { nextAttemptAt: "desc" }, take: 1, select: { status: true, acceptedAt: true, displayedAt: true, openedAt: true } } } }));
    },
    async mute(sessionHash: string, id: string) {
      return database.query(tx => tx.paymentAlertEndpoint.updateMany({ where: { id, sessionHash }, data: { enabled: false, updatedAt: new Date(now()) } }));
    },
    async test(sessionHash: string, id: string) {
      return registryTransaction(database, async (tx, refuse) => {
        await tx.$queryRaw`SELECT id FROM PaymentAlertEndpoint WHERE id = ${id} FOR UPDATE`;
        const endpoint = await tx.paymentAlertEndpoint.findFirst({ where: { id, sessionHash, enabled: true } });
        if (!endpoint) return refuse("Enable alerts on this device first.");
        if (!await tx.subscriptionSettings.findFirst({ where: { id: 1, paymentAlertsEnabled: true } })) return refuse("Outbound payment alerts are disabled.");
        const at = new Date(now());
        if (await tx.paymentReviewEvent.count({ where: { testEndpointId: id, createdAt: { gt: new Date(+at - 60_000) } } })) return refuse("Wait a minute before another test.");
        const eventId = randomUUID();
        await tx.paymentReviewEvent.create({ data: { id: eventId, eventKey: `test:${eventId}`, testEndpointId: id, createdAt: at } });
        return { eventId, status: "queued" };
      });
    },
    async acknowledge(sessionHash: string, id: string, eventId: string, state: "displayed" | "opened") {
      const at = new Date(now());
      return database.query(tx => tx.paymentAlertDelivery.updateMany({ where: { eventId, endpointId: id, endpoint: { sessionHash, enabled: true } },
        data: state === "opened" ? { openedAt: at } : { displayedAt: at } }));
    },
  });
}
