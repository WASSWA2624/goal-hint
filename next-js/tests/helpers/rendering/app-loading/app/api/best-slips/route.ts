import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { archiveFixture } from "../../archive-fixture";

export const dynamic = "force-dynamic";
export const GET = createBestSlipsHandler({
  access: async () => ({ tier: "free", signedIn: false, mode: "off" }),
  snapshot: async query => archiveFixture(query),
});
