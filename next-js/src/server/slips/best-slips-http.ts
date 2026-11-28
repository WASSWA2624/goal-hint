import "server-only";

import { timedRequestPhase } from "../http/request-timing.ts";
import { privateMatchHeaders } from "../matches/public-http.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { BestSlipsQueryError, parseBestSlipsQuery } from "../../domain/best-slips-query.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { readBestSlipsBrowseSnapshot } from "./best-slips-browse.ts";
import { gateBestSlips } from "./slip-preview.ts";

export function createBestSlipsHandler({ snapshot = readBestSlipsBrowseSnapshot, access = viewerAccessFromRequest, now = Date.now } = {}) {
  return async (request: Request) => {
    try {
      const parameters = new URL(request.url).searchParams;
      const query = parseBestSlipsQuery(parameters, getReportingDate(utcInstantFromEpochMilliseconds(now())), "all");
      // The audited snapshot has no viewer projection. Gate it once, immediately before the response.
      const result = await snapshot(query);
      if (result.state === "data-unavailable") return Response.json({ error: "unavailable" }, { status: 503, headers: privateMatchHeaders });
      const viewer = await timedRequestPhase("access", () => access(request));
      return Response.json(gateBestSlips(result, viewer), {
        headers: privateMatchHeaders,
      });
    } catch (error) {
      if (error instanceof BestSlipsQueryError) return Response.json({ error: error.code }, { status: 400, headers: privateMatchHeaders });
      return Response.json({ error: "unavailable" }, { status: 503, headers: privateMatchHeaders });
    }
  };
}
