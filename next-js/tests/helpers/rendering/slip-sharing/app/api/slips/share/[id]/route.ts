import { createReadSharedSlipHandler } from "@/server/slips/shared-slips-http";
import { fixtureAccess, fixtureLanding } from "../../../../recipient";
const viewer = (request: Request) => request.headers.get("cookie")?.match(/fixture-sharing-viewer=([^;]+)/)?.[1];
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return createReadSharedSlipHandler({ access: async () => fixtureAccess(viewer(request)), read: async id => {
    const result = (await fixtureLanding(id, viewer(request))).result;
    return result.state === "available" ? result.shared : null;
  } })(request, (await params).id);
}
