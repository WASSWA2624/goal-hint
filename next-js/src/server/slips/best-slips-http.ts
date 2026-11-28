import "server-only";

import { timedRequestPhase } from "../http/request-timing.ts";
import { privateMatchHeaders } from "../matches/public-http.ts";
import { viewerContentAccessFromRequest } from "../members/viewer-access.ts";
import { BestSlipsQueryError, parseBestSlipsQuery, parseBestSlipsWindow } from "../../domain/best-slips-query.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { matchFeedRules } from "../../domain/match-feed-rules.ts";
import { readBestSlipsBrowseSnapshot, readBestSlipsBrowseWindowSnapshot } from "./best-slips-browse.ts";
import { gateBestSlips } from "./slip-preview.ts";

export function createBestSlipsHandler({ snapshot = readBestSlipsBrowseSnapshot, windowSnapshot = readBestSlipsBrowseWindowSnapshot,
  access = viewerContentAccessFromRequest, now = Date.now } = {}) {
  return async (request: Request) => {
    try {
      const parameters = new URL(request.url).searchParams;
      const query = parseBestSlipsQuery(parameters, getReportingDate(utcInstantFromEpochMilliseconds(now())), "all");
      const through = parameters.getAll("through"), known = parameters.getAll("knownVersion");
      if (through.length > 1 || known.length > 1 || known.length && !through.length) throw new BestSlipsQueryError("invalid-query");
      if (through.length) {
        const result = await windowSnapshot(query, parseBestSlipsWindow(query, through[0]!, known[0]));
        if (result.pages.some(page => page.state === "data-unavailable")) {
          return Response.json({ error: "unavailable" }, { status: 503, headers: privateMatchHeaders });
        }
        const viewer = await timedRequestPhase("access", () => access(request));
        const json = JSON.stringify({ ...result, pages: result.pages.map(page => gateBestSlips(page, viewer)) });
        if (Buffer.byteLength(json, "utf8") > matchFeedRules.maximumResponseBytes) {
          return Response.json({ error: "unavailable" }, { status: 503, headers: privateMatchHeaders });
        }
        return new Response(json, { headers: { ...privateMatchHeaders, "content-type": "application/json; charset=utf-8" } });
      }
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
