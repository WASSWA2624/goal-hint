import { cookie, isSameOrigin, json, redirect } from "@/server/http/private-http";
import { paymentScenarios, updateFixturePayment } from "../../../fixture";

/** Native form setup for the isolated fixture; no real account or wallet is accessed. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
  const body = await request.formData().catch(() => null);
  if (!body) return json({ error: "invalid" }, 400);
  const scenario = paymentScenarios.find(value => value === body.get("scenario"));
  const action = body.get("action");
  if (!scenario || !["start", "reset", "approve"].includes(String(action))
    || body.getAll("scenario").length !== 1 || body.getAll("action").length !== 1) return json({ error: "invalid" }, 400);
  updateFixturePayment(scenario, action === "approve" ? "approve" : "reset");
  const config = { cookies: { secure: false } };
  return redirect(`/en/subscribe?${new URLSearchParams({ state: scenario })}`, [
    cookie(config, "goal-hint-member", "synthetic", 3600, "Lax"),
    cookie(config, "payment-fixture-state", scenario, 3600, "Lax"),
  ]);
}
