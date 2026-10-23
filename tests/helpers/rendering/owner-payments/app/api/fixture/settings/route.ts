import { adminRoute, readJsonBody } from "@/server/admin/admin-http";
import { json } from "@/server/http/private-http";
import { seed } from "../../../fixture";
import { requestSettingsScenario, resetSettings, settingsSnapshot } from "../../../fixture-settings";

seed();
export const GET = adminRoute(async ({ request }) => json(settingsSnapshot(requestSettingsScenario(request))));
export const POST = adminRoute(async ({ request }) => { const body = await readJsonBody(request); if ("refusal" in body) return body.refusal;
  const scenario = requestSettingsScenario(request); resetSettings(scenario); return json({ status: "reset" }); });
