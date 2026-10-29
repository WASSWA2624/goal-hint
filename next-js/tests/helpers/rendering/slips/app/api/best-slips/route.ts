import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { fixtureBestSlips, fixtureBestSlipsAccess, fixtureBestSlipsNow, fixtureBrowseBestSlips } from "../../best-slips-filter-data";

export const dynamic = "force-dynamic";
export const GET = createBestSlipsHandler({ read: fixtureBestSlips, browse: fixtureBrowseBestSlips,
  access: fixtureBestSlipsAccess, now: fixtureBestSlipsNow });
