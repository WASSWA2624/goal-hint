import { withRequestTiming } from "../../../../../server/http/request-timing.ts";
import { createReadSharedSlipHandler } from "@/server/slips/shared-slips-http";

const read = withRequestTiming("shared-slip", createReadSharedSlipHandler());
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return read(request, (await params).id);
}
