import { createReferralLinkHandler } from "../../../server/members/referral-attribution.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const capture = createReferralLinkHandler();
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  return capture(request, (await context.params).code);
}
