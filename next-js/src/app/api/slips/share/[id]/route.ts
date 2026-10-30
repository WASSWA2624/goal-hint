import { createReadSharedSlipHandler } from "@/server/slips/shared-slips-http";

const read = createReadSharedSlipHandler();
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return read(request, (await params).id);
}
