import "server-only";
import { ZodError } from "zod";
import { reviewIdSchema } from "../../domain/payment-alerts.ts";
import { json } from "../http/private-http.ts";
import { readJsonBody, type AdminContext } from "./admin-http.ts";
import { createReviewAlertRegistry, reviewAlertFeed, reviewEventWhere, reviewSessionHash } from "./payment-alerts.ts";
import { createReviewTransports } from "./payment-alert-transports.ts";

export function createPaymentAlertHandlers() {
  return {
    async GET({ services, request }: AdminContext) {
      if (!services.database) return json({ message: "Notification storage is unavailable." }, 503);
      try {
        const hash = reviewSessionHash(request, services.config), registry = createReviewAlertRegistry(services.database, services.config);
        const params = new URL(request.url).searchParams;
        if (params.has("eventId")) {
          const eventId = reviewIdSchema.parse(params.get("eventId")), endpointId = reviewIdSchema.parse(params.get("endpointId"));
          const event = await services.database.query(tx => tx.paymentAlertDelivery.findFirst({ where: { eventId, endpointId,
            endpoint: { sessionHash: hash, enabled: true }, event: reviewEventWhere(new Date()) }, select: { eventId: true } }));
          const enabled = await services.database.query(tx => tx.subscriptionSettings.findFirst({ where: { id: 1, paymentAlertsEnabled: true } }));
          return json({ allowed: !!event && !!enabled });
        }
        const transports = createReviewTransports();
        return json({ ...(await reviewAlertFeed(services.database, hash, services.config)), endpoints: await registry.endpoints(hash),
          publicKey: transports.configured("web") ? process.env.GOAL_HINT_PUSH_PUBLIC_KEY : null,
          transports: { web: transports.configured("web"), fcm: transports.configured("fcm"), windowsClosed: false } });
      } catch { return json({ message: "Payment alerts are unavailable." }, 503); }
    },
    async POST({ services, request }: AdminContext) {
      if (!services.database) return json({ message: "Notification storage is unavailable." }, 503);
      const read = await readJsonBody(request); if ("refusal" in read) return read.refusal;
      try {
        const hash = reviewSessionHash(request, services.config), registry = createReviewAlertRegistry(services.database, services.config), body = read.body;
        if (body.action === "register") return json(await registry.register(hash, body.registration));
        const id = reviewIdSchema.parse(body.endpointId);
        if (body.action === "mute") { await registry.mute(hash, id); return json({ status: "muted" }); }
        if (body.action === "test") return json(await registry.test(hash, id));
        if (body.action === "ack" && ["displayed", "opened"].includes(String(body.state))) {
          await registry.acknowledge(hash, id, reviewIdSchema.parse(body.eventId), body.state as "displayed" | "opened");
          return json({ status: "recorded" });
        }
        return json({ message: "Choose a valid alert action." }, 400);
      } catch (error) { return json({ message: error instanceof RangeError ? error.message : error instanceof ZodError ? "Choose a valid alert action." : "The alert setting could not be changed." }, error instanceof RangeError || error instanceof ZodError ? 400 : 503); }
    },
  };
}
