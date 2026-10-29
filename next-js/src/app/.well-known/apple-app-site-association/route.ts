import { slipAppLinkResponse } from "@/server/slips/slip-app-links";

export const dynamic = "force-dynamic";
export const GET = () => slipAppLinkResponse("ios");
