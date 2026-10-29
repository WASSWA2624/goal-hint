import "server-only";

import { privateMatchHeaders } from "../matches/public-http.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { gateBestSlips, readBestSlips } from "./best-slips.ts";
import { BestSlipsQueryError, parseBestSlipsQuery } from "../../domain/best-slips-query.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { readBestSlipsBrowse } from "./best-slips-browse.ts";

export function createBestSlipsHandler({ read = readBestSlips, browse = readBestSlipsBrowse, access = viewerAccessFromRequest, now = Date.now } = {}) {
  return async (request: Request) => {
    try {
      const parameters = new URL(request.url).searchParams;
      const query = parameters.size ? parseBestSlipsQuery(parameters, getReportingDate(utcInstantFromEpochMilliseconds(now()))) : null;
      const viewer = await access(request);
      const result = query ? await browse(viewer, query) : await read(viewer);
      return Response.json(gateBestSlips(result, await access(request)), {
        status: query && result.state === "data-unavailable" ? 503 : 200, headers: privateMatchHeaders,
      });
    } catch (error) {
      if (error instanceof BestSlipsQueryError) return Response.json({ error: error.code }, { status: 400, headers: privateMatchHeaders });
      return Response.json({ error: "unavailable" }, { status: 503, headers: privateMatchHeaders });
    }
  };
}
