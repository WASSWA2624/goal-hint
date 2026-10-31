import { createSlipConfigurationsHandler } from "@/server/slips/slip-configurations-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createSlipConfigurationsHandler("read");
export const POST = createSlipConfigurationsHandler("write");
