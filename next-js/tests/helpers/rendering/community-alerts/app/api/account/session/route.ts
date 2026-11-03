import { fixture } from "../../../fixture-state";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ phone: fixture.role === "visitor" ? null : "256700000101", administrator: fixture.role === "admin",
    subscription: { activeUntil: ["active", "trial"].includes(fixture.role) ? "2030-01-01T00:00:00Z" : null, paymentPending: false, canSubscribe: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false } });
}
