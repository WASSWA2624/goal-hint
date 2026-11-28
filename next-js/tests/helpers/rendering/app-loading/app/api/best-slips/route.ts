import { cookies } from "next/headers";
import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { archiveFixture, archiveWindowFixture } from "../../archive-fixture";

export const dynamic = "force-dynamic";
const epoch = async () => (await cookies()).get("synthetic-best-slips-epoch")?.value;
export const GET = createBestSlipsHandler({
  access: async () => ({ tier: "free", signedIn: false, mode: "off" }),
  snapshot: async query => archiveFixture(query, await epoch()),
  windowSnapshot: async (query, window) => archiveWindowFixture(query, window, await epoch()),
});
