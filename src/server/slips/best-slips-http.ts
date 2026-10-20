import "server-only";

import { privateMatchHeaders } from "../matches/public-http.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { gateBestSlips, readBestSlips } from "./best-slips.ts";

export function createBestSlipsHandler({ read = readBestSlips, access = viewerAccessFromRequest } = {}) {
  return async (request: Request) => {
    try {
      const result = await read(await access(request));
      return Response.json(gateBestSlips(result, await access(request)), { headers: privateMatchHeaders });
    } catch {
      return Response.json({ error: "unavailable" }, { status: 503, headers: privateMatchHeaders });
    }
  };
}
