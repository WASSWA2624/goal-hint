import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { fixtureBestSlipsAccess, fixtureBestSlipsNow, fixtureBestSlipsSnapshot } from "../../best-slips-filter-data";

export const dynamic = "force-dynamic";
export const GET = createBestSlipsHandler({ snapshot: fixtureBestSlipsSnapshot,
  access: fixtureBestSlipsAccess, now: fixtureBestSlipsNow });
