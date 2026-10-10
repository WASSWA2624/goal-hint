import { createAction, createReducer } from "@reduxjs/toolkit";
import { parseReportingDate, utcInstantFromEpochMilliseconds, type UtcInstant } from "../domain/calendar.ts";
import { feedQueryKey, feedQueryRules, isFeedDatePreset, parseFeedQuery, serializeFeedQuery, type FeedQuery } from "../domain/feed-query.ts";
import { compareFixtureVersions, parseFixtureSnapshot } from "../domain/fixture-snapshot.ts";
import type { FeedBootstrap, FeedFailure, FeedPage, FeedRequest, FeedState, LoadedView } from "./contracts.ts";
import { restorationRules } from "../domain/feed-navigation.ts";

export { restorationRules } from "../domain/feed-navigation.ts";
export const queryApplied = createAction<FeedQuery>("feed/queryApplied");
export const draftChanged = createAction<FeedQuery>("feed/draftChanged");
export const calendarChanged = createAction<string>("feed/calendarChanged");
export const requestStarted = createAction<{ page: number; mode: FeedRequest["mode"] }>("feed/requestStarted");
export const pageReceived = createAction<{ request: FeedRequest; data: FeedPage }>("feed/pageReceived");
export const refreshFailed = createAction<{ request: FeedRequest; error: FeedFailure }>("feed/refreshFailed");
export const navigationSaved = createAction<{ entryId: string; scrollY: number; now: UtcInstant }>("feed/navigationSaved");
export const navigationRestored = createAction<{ entryId: string; query: FeedQuery; now: UtcInstant }>("feed/navigationRestored");

function emptyView(): LoadedView {
  return { ids: [], firstPage: null, lastPage: null, nextPage: null, scrollY: 0, error: null, phase: "idle" };
}
function normalizeQuery(query: FeedQuery, today: FeedState["today"]): FeedQuery {
  return parseFeedQuery(serializeFeedQuery(query, today), { today, locale: query.locale });
}
function normalizeDraft(query: FeedQuery, today: FeedState["today"]): FeedQuery {
  return { ...normalizeQuery({ ...query, search: "" }, today), search: query.search };
}
function validPage(data: FeedPage, pageSize: number): FeedPage {
  if (!Number.isSafeInteger(data.page) || data.page < 1 || data.page > feedQueryRules.maximumPage ||
      data.nextPage !== null && data.nextPage !== data.page + 1 ||
      data.nextPage !== null && data.nextPage > feedQueryRules.maximumPage || !Array.isArray(data.records) || data.records.length > pageSize) {
    throw new RangeError("Invalid feed page.");
  }
  const records = data.records.map(parseFixtureSnapshot);
  if (new Set(records.map((record) => record.fixtureId)).size !== records.length) throw new RangeError("Duplicate fixture in feed page.");
  return { records, page: data.page, nextPage: data.nextPage };
}
function matchesRequest(state: FeedState, request: FeedRequest): boolean {
  return state.request !== null && state.request.id === request.id && state.generation === request.generation &&
    state.queryKey === request.queryKey && state.request.page === request.page && state.request.mode === request.mode;
}
function applyQuery(state: FeedState, query: FeedQuery) {
  const checked = normalizeQuery(query, state.today);
  state.query = checked; state.draft = checked;
  state.queryKey = feedQueryKey(checked, state.today);
  state.generation += 1; state.request = null; state.view = emptyView();
}
function historyKey(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new RangeError("Invalid navigation entry.");
  return `entry:${id}`;
}

export function createFeedState(bootstrap: FeedBootstrap): FeedState {
  const today = parseReportingDate(bootstrap.today);
  const query = normalizeQuery(bootstrap.query, today);
  const state: FeedState = { query, draft: structuredClone(query), today, queryKey: feedQueryKey(query, today),
    generation: 0, requestSequence: 0, request: null, records: {}, view: emptyView(), history: {} };
  if (bootstrap.data !== null) {
    const data = validPage(bootstrap.data, query.pageSize);
    if (data.page !== query.page) throw new RangeError("Server handoff page does not match the query.");
    for (const record of data.records) state.records[record.fixtureId] = record;
    state.view = { ...emptyView(), ids: data.records.map((record) => record.fixtureId), firstPage: data.page,
      lastPage: data.page, nextPage: data.nextPage, phase: "ready" };
  }
  return state;
}

export function createFeedReducer(bootstrap: FeedBootstrap) {
  return createReducer(createFeedState(bootstrap), (builder) => {
    builder.addCase(queryApplied, (state, { payload }) => { applyQuery(state, payload); });
    builder.addCase(draftChanged, (state, { payload }) => { state.draft = normalizeDraft(payload, state.today); });
    builder.addCase(calendarChanged, (state, { payload }) => {
      const today = parseReportingDate(payload);
      if (today === state.today) return;
      if (today < state.today) throw new RangeError("Calendar events must not move reporting time backwards.");
      const draft = normalizeDraft(state.draft, today);
      state.today = today;
      if (isFeedDatePreset(state.query.dates.kind)) applyQuery(state, { ...state.query, page: 1 });
      state.draft = isFeedDatePreset(draft.dates.kind) ? { ...draft, page: 1 } : draft;
    });
    builder.addCase(requestStarted, (state, { payload }) => {
      if (!Number.isSafeInteger(payload.page) || payload.page < 1 || payload.page > feedQueryRules.maximumPage ||
          !["replace", "append", "refresh"].includes(payload.mode) ||
          payload.mode === "replace" && payload.page !== state.query.page ||
          payload.mode === "append" && (state.view.nextPage !== payload.page || state.view.phase === "loading") ||
          payload.mode === "refresh" && (state.view.firstPage === null || payload.page !== state.view.firstPage)) {
        throw new RangeError("Request does not match the active feed position.");
      }
      state.requestSequence += 1;
      state.request = { ...payload, id: state.requestSequence, generation: state.generation, queryKey: state.queryKey };
      state.view.phase = "loading"; state.view.error = null;
    });
    builder.addCase(pageReceived, (state, { payload }) => {
      if (!matchesRequest(state, payload.request)) return;
      let data: FeedPage;
      try {
        data = validPage(payload.data, state.query.pageSize);
        if (data.page !== payload.request.page) throw new RangeError("Wrong response page.");
      } catch {
        state.request = null; state.view.phase = "error"; state.view.error = "invalid-response"; return;
      }
      if (data.records.some((record) => Object.hasOwn(state.records, record.fixtureId) &&
          compareFixtureVersions(record.dataVersion, state.records[record.fixtureId]!.dataVersion) < 0)) {
        state.request = null; state.view.phase = "error"; state.view.error = "stale-data"; return;
      }
      for (const record of data.records) {
        const existing = Object.hasOwn(state.records, record.fixtureId) ? state.records[record.fixtureId] : undefined;
        if (!existing || compareFixtureVersions(record.dataVersion, existing.dataVersion) > 0) state.records[record.fixtureId] = record;
      }
      const ids = data.records.map((record) => record.fixtureId);
      if (payload.request.mode !== "refresh") {
        state.view.ids = payload.request.mode === "append" ? [...new Set([...state.view.ids, ...ids])] : ids;
        if (payload.request.mode === "replace") { state.view.firstPage = data.page; state.view.scrollY = 0; }
        state.view.lastPage = data.page; state.view.nextPage = data.nextPage;
      }
      state.request = null; state.view.phase = "ready"; state.view.error = null;
    });
    builder.addCase(refreshFailed, (state, { payload }) => {
      if (!matchesRequest(state, payload.request)) return;
      if (!["network", "unavailable", "invalid-response", "stale-data"].includes(payload.error)) throw new RangeError("Invalid public error code.");
      state.request = null; state.view.phase = "error"; state.view.error = payload.error;
    });
    builder.addCase(navigationSaved, (state, { payload }) => {
      if (!Number.isFinite(payload.scrollY) || payload.scrollY < 0 || payload.scrollY > 10_000_000) throw new RangeError("Invalid scroll position.");
      const savedAt = utcInstantFromEpochMilliseconds(payload.now);
      state.history[historyKey(payload.entryId)] = { queryKey: state.queryKey, query: normalizeQuery(state.query, state.today),
        view: { ...state.view, ids: [...state.view.ids], scrollY: payload.scrollY,
          phase: state.view.firstPage !== null ? "ready" : "idle", error: null }, savedAt };
      const entries = Object.entries(state.history).sort((a, b) => b[1].savedAt - a[1].savedAt);
      for (const [key] of entries.slice(restorationRules.maximumEntries)) delete state.history[key];
    });
    builder.addCase(navigationRestored, (state, { payload }) => {
      const checkpoint = state.history[historyKey(payload.entryId)];
      const now = utcInstantFromEpochMilliseconds(payload.now);
      applyQuery(state, payload.query);
      if (!checkpoint || checkpoint.queryKey !== state.queryKey || checkpoint.query.page !== state.query.page || now < checkpoint.savedAt ||
          now - checkpoint.savedAt > restorationRules.maximumAgeMilliseconds) return;
      state.view = { ...checkpoint.view, ids: checkpoint.view.ids.filter((id) => Object.hasOwn(state.records, id)) };
    });
  });
}
