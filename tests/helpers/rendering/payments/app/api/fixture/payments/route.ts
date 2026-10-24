import { isSameOrigin, json, readCookie } from "@/server/http/private-http";
import { fixtureScenarioFromHeaders, updateFixturePayment } from "../../../fixture";

/** Test-only state transitions exercise the unchanged polling flow without approving a real payment. */
export async function POST(request: Request) {
  if (!isSameOrigin(request) || !readCookie(request, "goal-hint-member")) return json({ error: "forbidden" }, 403);
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== "approve" && body?.action !== "reset") return json({ error: "invalid" }, 400);
  updateFixturePayment(fixtureScenarioFromHeaders(request.headers), body.action);
  return json({ status: "saved" });
}
