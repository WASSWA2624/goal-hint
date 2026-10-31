import { createSlipConfigurationsHandler } from "@/server/slips/slip-configurations-http";
import { services } from "../../../fixture";

export const dynamic = "force-dynamic";
export const GET = createSlipConfigurationsHandler("read", services);
export const POST = createSlipConfigurationsHandler("write", services);
