import { createSettingsHandlers } from "@/server/analytics/analytics-http";
import { analyticsServices } from "../../../fixture-analytics";

export const { GET, POST } = createSettingsHandlers(analyticsServices);
