import { createExportHandler } from "@/server/analytics/analytics-http";
import { analyticsServices } from "../../../fixture-analytics";

export const GET = createExportHandler(analyticsServices);
