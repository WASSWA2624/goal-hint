import { createReadSharedSlipHandler } from "@/server/slips/shared-slips-http";

const read = createReadSharedSlipHandler();
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return read((await params).id);
}
