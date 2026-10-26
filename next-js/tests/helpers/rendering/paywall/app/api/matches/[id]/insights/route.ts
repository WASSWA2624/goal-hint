import { createMatchInsightsHandler } from "@/server/matches/insights-service";
import { readInsights, readStatus, requestAccess } from "../../../../stored";
export const GET = createMatchInsightsHandler(readInsights, { readStatus, resolveAccess: requestAccess });
