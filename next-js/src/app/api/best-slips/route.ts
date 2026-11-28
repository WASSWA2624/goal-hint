import { withRequestTiming } from "../../../server/http/request-timing.ts";
import { createBestSlipsHandler } from "@/server/slips/best-slips-http";

export const dynamic = "force-dynamic";
export const GET = withRequestTiming("best-slips-list", createBestSlipsHandler());
