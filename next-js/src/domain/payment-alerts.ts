import { z } from "zod";

export const reviewAlertRules = Object.freeze({ maximumAttempts: 5, leaseMs: 60_000, lifetimeMs: 86_400_000, maximumBatch: 50, pollMs: 15_000, soundDurationMs: 850, soundGapMs: 650 });
export const reviewIdSchema = z.uuid();
export const reviewHref = (paymentId: string) => `/admin/payments?paymentId=${reviewIdSchema.parse(paymentId)}`;
export const reviewEntryHref = (paymentId: string) => `/payment-review/${reviewIdSchema.parse(paymentId)}`;
export function reviewReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/admin\/payments\?paymentId=([a-f0-9-]{36})$/u.exec(value);
  return match && reviewIdSchema.safeParse(match[1]).success ? value : null;
}
export type ReviewAlert = { id: string; paymentId: string | null; createdAt: string };
export type ReviewAlertFeed = { events: ReviewAlert[]; enabled: boolean; repeats: number; scope: string };
export const reviewAlertTitle = "Payment awaiting review";
export const reviewAlertBody = "Open to review this payment.";
export const reviewSound = "/sounds/payment-review-v1.wav";

/** Restrict push services before server-side requests, including nonstandard ports and userinfo. */
export function validWebPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 2048 && url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash
      && (["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/u.test(url.hostname))
      && url.pathname.length > 1;
  } catch { return false; }
}
export const alertRegistrationSchema = z.discriminatedUnion("transport", [
  z.object({ transport: z.literal("web"), subscription: z.object({ endpoint: z.string().refine(validWebPushEndpoint),
    expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/u), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/u) }).strict() }).strict() }).strict(),
  z.object({ transport: z.literal("fcm"), subscription: z.object({ fid: z.string().regex(/^[A-Za-z0-9_-]{22}$/u) }).strict() }).strict(),
  z.object({ transport: z.literal("windows-local"), subscription: z.object({}).strict() }).strict(),
]);
export type AlertRegistration = z.infer<typeof alertRegistrationSchema>;
export function retryDelay(attempt: number) { return Math.min(900_000, 5_000 * 2 ** Math.max(0, attempt - 1)); }
