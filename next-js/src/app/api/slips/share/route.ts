import { withRequestTiming } from "../../../../server/http/request-timing.ts";
import { createShareSlipHandler } from "@/server/slips/shared-slips-http";

export const POST = withRequestTiming("slip-share", createShareSlipHandler());
