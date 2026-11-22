import { createFlutterwaveReturnHandler } from "@/server/members/flutterwave-http";

export const runtime = "nodejs";
const handleReturn = createFlutterwaveReturnHandler();

export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  return handleReturn(request, (await params).reference);
}
