import "server-only";

import { slipMatchRefreshRequestSchema, slipMatchRefreshResponseSchema, slipMatchRefreshRules,
  uniqueSlipMatchWatches, type SlipMatchRefreshResponse, type SlipMatchWatch } from "../../domain/slip-match-refresh.ts";
import { slipMatchStateForSelection, slipMatchStatesFromResults, type SlipMatchState } from "../../domain/slip-match-state.ts";
import { getAnalyticsServices, type AnalyticsServices } from "../analytics/analytics-http.ts";
import { developmentMemberToken } from "../demo/member.ts";
import { isSameOrigin, privateHeaders, readCookie, readLimitedBody } from "../http/private-http.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { privateMatchHeaders } from "../matches/public-http.ts";
import { memberCookieName } from "../members/member-sessions.ts";
import { takeMemberLimit } from "../members/rate-limit.ts";
import { viewerAccessFromRequest } from "../members/viewer-access.ts";
import { readSlipForecastResults } from "./slip-forecast.ts";

const json = (body: unknown, status: number, headers: Readonly<Record<string, string>>) => {
  const combined = new Headers(privateHeaders);
  for (const [name, value] of Object.entries(headers)) combined.set(name, value);
  return Response.json(body, { status, headers: combined });
};

const unknownState = (watch: SlipMatchWatch): SlipMatchState => ({
  fixtureId: watch.fixtureId, family: watch.family, selection: watch.selection,
  ...(watch.forecast ? { forecast: watch.forecast } : {}), status: "unknown", score: null, liveClock: null, outcome: "pending",
});

/** One bounded transaction reads sealed original-cycle evidence; requests never invoke a provider or rebuild slips. */
export function createStoredSlipMatchStates({ services = getAnalyticsServices, resolveResults = readSlipForecastResults }: {
  services?: () => Promise<Pick<AnalyticsServices, "database" | "config">>; resolveResults?: typeof readSlipForecastResults;
} = {}) {
  return async (input: readonly SlipMatchWatch[], request: Request): Promise<SlipMatchRefreshResponse> => {
    const watches = uniqueSlipMatchWatches(slipMatchRefreshRequestSchema.parse({ selections: input }).selections as readonly SlipMatchWatch[]);
    const { database, config } = await services();
    if (!database) throw new MatchFeedError("unavailable");
    const memberCookie = readCookie(request, memberCookieName(config.production));
    const memberSession = config.production ? memberCookie : developmentMemberToken(memberCookie);
    const sessions = [...new Set([readCookie(request, config.cookies.session), memberSession]
      .filter((value): value is string => value !== undefined && value.length > 0))];
    if (!sessions.length) throw new MatchFeedError("subscription-required");
    return database.transaction(async (tx) => {
      const [clock] = await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`;
      if (!clock) throw new MatchFeedError("unavailable");
      const asOf = clock.at.getTime();
      // Count both recognized cookies when present: rotating an invalid second cookie cannot bypass the valid session's budget.
      for (const session of sessions) {
        if (!await takeMemberLimit(tx, config, { purpose: "slip-match-refresh", value: session,
          maximum: slipMatchRefreshRules.requestsPerMinute, windowMs: 60_000 }, clock.at)) {
          throw new MatchFeedError("rate-limited", 20);
        }
      }
      // Unbound legacy snapshots cannot establish the original cycle and never inherit a current replacement.
      const bound = watches.filter((watch) => watch.forecast !== undefined);
      const results = bound.length ? await resolveResults(tx, bound, asOf) : [];
      const states = slipMatchStatesFromResults(bound, results);
      return { states: watches.map((watch) => slipMatchStateForSelection(watch, states) ?? unknownState(watch)), asOf };
    }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
  };
}

type StateReader = (selections: readonly SlipMatchWatch[], request: Request) => Promise<SlipMatchRefreshResponse>;

/** Access is checked before storage and again before releasing any original-selection observation. */
export function createSlipMatchStatesHandler({ access = viewerAccessFromRequest, read = createStoredSlipMatchStates() }: {
  access?: typeof viewerAccessFromRequest; read?: StateReader;
} = {}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403, privateMatchHeaders);
    try {
      if ((await access(request)).tier !== "full") return json({ error: "subscription-required" }, 403, privateMatchHeaders);
      if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) {
        return json({ error: "invalid-request" }, 400, privateMatchHeaders);
      }
      let body: unknown;
      try {
        const bytes = await readLimitedBody(request, slipMatchRefreshRules.maximumRequestBytes, { deadlineMs: slipMatchRefreshRules.requestDeadlineMs });
        if (bytes === null) return json({ error: "invalid-request" }, 413, privateMatchHeaders);
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch { return json({ error: "invalid-request" }, 400, privateMatchHeaders); }
      const parsed = slipMatchRefreshRequestSchema.safeParse(body);
      if (!parsed.success) return json({ error: "invalid-request" }, 400, privateMatchHeaders);
      const selections = uniqueSlipMatchWatches(parsed.data.selections as readonly SlipMatchWatch[]);
      const response = await read(selections, request);
      if ((await access(request)).tier !== "full") return json({ error: "subscription-required" }, 403, privateMatchHeaders);
      const validated = slipMatchRefreshResponseSchema.parse(response);
      // A reader can only release observations for exactly the submitted original identities.
      const states = selections.map((watch) => slipMatchStateForSelection(watch, validated.states as readonly SlipMatchState[]) ?? unknownState(watch));
      return json({ states, asOf: validated.asOf }, 200, privateMatchHeaders);
    } catch (error) {
      if (error instanceof MatchFeedError && error.code === "subscription-required") return json({ error: "subscription-required" }, 403, privateMatchHeaders);
      if (error instanceof MatchFeedError && error.code === "rate-limited") {
        const retryAfterSeconds = error.retryAfterSeconds ?? 20;
        return json({ error: "rate-limited", retryAfterSeconds }, 429, { ...privateMatchHeaders, "retry-after": String(retryAfterSeconds) });
      }
      return json({ error: "unavailable" }, 503, privateMatchHeaders);
    }
  };
}
