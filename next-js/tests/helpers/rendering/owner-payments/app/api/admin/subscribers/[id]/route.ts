import {adminRoute} from "@/server/admin/admin-http";
import {createSubscriberHandlers} from "@/server/admin/subscribers-http";
import {seed} from "../../../../fixture";
import {subscriberAction} from "../../../../subscriber-actions";
seed();
export const POST=adminRoute(async context => {
  const body: unknown = await context.request.clone().json().catch(() => null);
  if (body && typeof body === "object" && "action" in body && body.action === "password-reset") return createSubscriberHandlers().POST(context);
  return subscriberAction(context.request);
});
