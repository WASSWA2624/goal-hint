import {adminRoute} from "@/server/admin/admin-http";
import {createUserHandlers} from "@/server/admin/users-http";
import {seed} from "../../../../fixture";
import {userAction} from "../../../../user-actions";
seed();
export const GET=adminRoute(createUserHandlers().GET);
export const POST=adminRoute(async context => {
  const body: unknown = await context.request.clone().json().catch(() => null);
  if (body && typeof body === "object" && "action" in body && body.action === "password-reset") return createUserHandlers().POST(context);
  return userAction(context.request);
});
