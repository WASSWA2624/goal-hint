import { fixtureAdminToken } from "../../../fixture";
import { settingsScenario } from "../../../fixture-settings";

/** Establishes only this isolated app's synthetic member cookie; no account, credential or business storage is used. */
export function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const location = parameters.get("page") === "audit" ? "/admin/audit"
    : parameters.get("page") === "plans" ? "/admin/plans?fixture=review"
    : parameters.get("page") === "payments" ? `/admin/payments?fixture=${parameters.get("scenario") === "queue" ? "queue" : "review"}`
    : parameters.get("page") === "settings" ? `/admin/settings?fixture=${settingsScenario(parameters.get("scenario"))}`
    : "/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100";
  return new Response(null, { status: 303, headers: { Location: location,
    "Set-Cookie": `goal-hint-member=${fixtureAdminToken}; Path=/; HttpOnly; SameSite=Lax`, "Cache-Control": "no-store" } });
}
