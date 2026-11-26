import { fixture, fixtureAccount } from "../../../fixture-state";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const account = fixtureAccount(request);
  const phone = account ? `256700000${account === "default" ? "101" : account.slice(-3)}` : null;
  return Response.json({ phone, administrator: fixture.role === "admin" && account === "default",
    subscription: { activeUntil: ["active", "trial"].includes(fixture.role) ? "2030-01-01T00:00:00Z" : null, paymentPending: false, canSubscribe: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false } });
}
