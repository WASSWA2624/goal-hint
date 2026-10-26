import { createLogoutHandler } from "@/server/analytics/analytics-http";
import { fixtureAdminServices } from "../../../fixture-admin";
export const POST = createLogoutHandler(fixtureAdminServices);
