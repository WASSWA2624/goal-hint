import "server-only";

import { alertRegistrationSchema } from "../../domain/payment-alerts.ts";

export type AlertPayload = Readonly<{ eventId: string; paymentId: string | null; endpointId: string; createdAt: string; resolved?: boolean }>;
export type DeliveryResult = "accepted" | "invalid" | "retry" | "failed" | "unconfigured";
export type ReviewTransports = Readonly<{ configured(transport: string): boolean; send(transport: string, subscription: unknown, payload: AlertPayload): Promise<DeliveryResult> }>;

export function fcmReviewMessage(fid: string, payload: AlertPayload) {
  return { fid, data: { eventId: payload.eventId, paymentId: payload.paymentId ?? "", endpointId: payload.endpointId, createdAt: payload.createdAt,
    ...(payload.resolved ? { resolved: "true" } : {}) }, android: { priority: "high" as const, ttl: 3_600_000,
    // Clearing one old alert must not replace the newest pending-review message.
    ...(payload.resolved ? {} : { collapseKey: "payment-reviews" }), restrictedPackageName: "com.goalhint.goal_hint" } };
}

/** Only server-side credentials. No SMS/WhatsApp fallback or private financial payloads. */
export function createReviewTransports(environment: NodeJS.ProcessEnv = process.env): ReviewTransports {
  const vapid = { subject: environment.GOAL_HINT_PUSH_SUBJECT ?? "", publicKey: environment.GOAL_HINT_PUSH_PUBLIC_KEY ?? "", privateKey: environment.GOAL_HINT_PUSH_PRIVATE_KEY ?? "" };
  const configured = (transport: string) => transport === "web" ? !!(vapid.subject && vapid.publicKey && vapid.privateKey)
    : transport === "fcm" && environment.GOAL_HINT_FCM_ENABLED === "true" && !!environment.GOOGLE_APPLICATION_CREDENTIALS;
  return {
    configured,
    async send(transport, subscription, payload) {
      if (!configured(transport)) return "unconfigured";
      const parsed = alertRegistrationSchema.safeParse({ transport, subscription });
      if (!parsed.success) return "invalid";
      try {
        if (parsed.data.transport === "web") {
          const webPush = (await import("web-push")).default;
          await webPush.sendNotification({ endpoint: parsed.data.subscription.endpoint, keys: parsed.data.subscription.keys }, JSON.stringify(payload), { vapidDetails: vapid, TTL: 3600,
            urgency: "high", timeout: 10_000 });
        } else if (parsed.data.transport === "fcm") {
          const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
          const { getMessaging } = await import("firebase-admin/messaging");
          const name = "goal-hint-payment-alerts";
          const app = getApps().find(app => app.name === name) ?? initializeApp({ credential: applicationDefault() }, name);
          // The pinned Flutter Messaging 17 SDK registers FIDs. Data-only messages
          // let one native handler deduplicate before display in every lifecycle.
          await getMessaging(app).send(fcmReviewMessage(parsed.data.subscription.fid, payload));
        } else return "unconfigured";
        return "accepted";
      } catch (error) {
        const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : null;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (status === 404 || status === 410 || ["messaging/installation-id-not-registered", "messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) return "invalid";
        if (status && status >= 400 && status < 500 && ![408, 429].includes(status) || ["messaging/invalid-argument", "messaging/mismatched-credential"].includes(code)) return "failed";
        return "retry";
      }
    },
  };
}
