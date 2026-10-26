import { adminRoute } from "@/server/admin/admin-http";
import { createSettingsHandlers } from "@/server/admin/settings-http";
import { seed } from "../../../fixture";
import { fixtureSettingsService, requestSettingsScenario } from "../../../fixture-settings";

seed();
export const GET = adminRoute(context => createSettingsHandlers({ service: () => fixtureSettingsService(requestSettingsScenario(context.request)) }).GET(context));
export const POST = adminRoute(context => createSettingsHandlers({ service: () => fixtureSettingsService(requestSettingsScenario(context.request)) }).POST(context));
