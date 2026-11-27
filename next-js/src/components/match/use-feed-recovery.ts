"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReportingDate } from "@/domain/calendar";
import { checkedFeedPage, FeedPaginationError, feedPageApiHref } from "@/domain/feed-pagination";
import { feedQueryHref, type FeedQuery } from "@/domain/feed-query";
import type { FeedPageResult, MatchFeedResponse } from "@/domain/match-feed";
import { readJson } from "@/state/refresh-base";

const browserHref = () => location.pathname + location.search;
const isOffline = () => navigator.onLine === false;
const initiallyOnline = () => false;
const staticConnection = () => () => {};
const transientRetryDelayMs = 5_000;
// Allow the existing bounded server read to finish and deliver its body on mobile connections.
const recoveryDeadlineMs = 40_000;

function subscribeConnection(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

type FeedScope = { scope: string; initial: FeedPageResult };
type RecoveryWork = FeedScope & { controller: AbortController; automatic: boolean };

/** Recover the failed applied query without blanking the shell or the last accepted list. */
export function useFeedRecovery({ initial, query, today, access, suspended, recheckAccess }: {
  initial: FeedPageResult; query: FeedQuery; today: ReportingDate; access: MatchFeedResponse["access"];
  suspended: boolean; recheckAccess: () => void;
}) {
  const href = feedQueryHref(query, today);
  const scope = `${href}:${today}`;
  const [accepted, setAccepted] = useState<(FeedScope & { result: FeedPageResult }) | null>(null);
  const [pending, setPending] = useState<RecoveryWork | null>(null);
  const work = useRef<RecoveryWork | null>(null);
  const autoRetried = useRef<string | null>(null);
  const result = accepted?.scope === scope && accepted.initial === initial ? accepted.result : initial;
  const offline = useSyncExternalStore(result.error ? subscribeConnection : staticConnection, result.error ? isOffline : initiallyOnline, initiallyOnline);
  const active = pending?.scope === scope && pending.initial === initial ? pending : null;
  const { signedIn, tier } = access;

  const cancel = useCallback(() => {
    if (!work.current) return;
    work.current.controller.abort();
    work.current = null;
    setPending(null);
  }, []);

  useLayoutEffect(() => cancel, [cancel, initial, scope, suspended]);
  useEffect(() => {
    if (!initial.error) return;
    window.addEventListener("popstate", cancel);
    window.addEventListener("pagehide", cancel);
    return () => {
      window.removeEventListener("popstate", cancel);
      window.removeEventListener("pagehide", cancel);
    };
  }, [cancel, initial.error]);

  const retry = useCallback(async (automatic = false) => {
    if (!result.error || suspended || work.current) return;
    if (automatic) {
      if (result.error !== "unavailable" || autoRetried.current === scope || isOffline() || document.visibilityState !== "visible") return;
      autoRetried.current = scope;
    }
    const controller = new AbortController();
    const operation = { scope, initial, controller, automatic };
    const currentUrl = browserHref();
    work.current = operation;
    setPending(operation);
    const canCommit = () => work.current === operation && currentUrl === browserHref();
    try {
      const page = checkedFeedPage(await readJson(feedPageApiHref(query, today, query.page), controller.signal, recoveryDeadlineMs), query, today, query.page);
      if (!canCommit()) return;
      if (page.access.tier !== tier || page.access.signedIn !== signedIn) throw new FeedPaginationError("subscription-required");
      setAccepted({ scope, initial, result: { data: page, error: null } });
    } catch (cause) {
      if (!canCommit()) return;
      const code = cause instanceof FeedPaginationError ? cause.code : "unavailable";
      const error = code === "rate-limited" || code === "subscription-required" ? code : "unavailable";
      setAccepted({ scope, initial, result: { data: null, error } });
      if (error === "subscription-required") recheckAccess();
    } finally {
      if (work.current === operation) { work.current = null; setPending(null); }
    }
  }, [initial, query, recheckAccess, result.error, scope, signedIn, suspended, tier, today]);

  useEffect(() => {
    if (suspended || result.error !== "unavailable") return;
    const once = () => { void retry(true); };
    const reconnect = (event: Event) => { if (event.isTrusted && navigator.onLine === true) once(); };
    const timer = isOffline() ? undefined : window.setTimeout(once, transientRetryDelayMs);
    window.addEventListener("online", reconnect);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", reconnect);
    };
  }, [result.error, retry, suspended]);

  return { result, offline, retry, cancel, pending: active !== null, foreground: active?.automatic === false };
}
