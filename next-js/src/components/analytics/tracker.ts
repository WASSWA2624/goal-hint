import { analyticsRules, analyticsStorageKeys, type ConsentChoice } from "@/domain/analytics-settings";
import type { AnalyticsEventInput, Attribution, CollectPayload } from "@/domain/analytics";
import { hasBrowserPrivacySignal, resolveAnalyticsConsent, type ConsentState } from "@/domain/analytics-consent";
import { randomId } from "@/components/ui/random-id";

/**
 * Consent-gated first-party tracker. Nothing is stored or sent until the visitor allows analytics.
 * Typed text, query strings and fragments are never collected; see docs/analytics.md.
 */

type StoredConsent = Readonly<{ v: 1; choice: ConsentChoice; at: number }>;
type StoredSession = Readonly<{ id: string; last: number }>;

const listeners = new Set<() => void>();
let memoryConsent: StoredConsent | null = null;

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
function readJson<T>(key: string): T | null {
  try { const value = store()?.getItem(key); return value ? JSON.parse(value) as T : null; } catch { return null; }
}
function writeJson(key: string, value: unknown) {
  try { store()?.setItem(key, JSON.stringify(value)); } catch { /* Storage may be full or blocked; tracking still works in memory. */ }
}
function remove(key: string) {
  try { store()?.removeItem(key); window.sessionStorage.removeItem(key); } catch { /* Nothing to clear. */ }
}

/** Global Privacy Control and Do Not Track count as a refusal without asking. */
export function hasPrivacySignal(): boolean {
  return hasBrowserPrivacySignal(navigator, window as Window & { doNotTrack?: string });
}

export function getConsentState(): ConsentState {
  if (typeof window === "undefined") return "unset";
  return resolveAnalyticsConsent({ stored: memoryConsent ?? readJson<StoredConsent>(analyticsStorageKeys.consent),
    now: Date.now(), maxAgeMs: analyticsRules.consentMaxAgeMs, automated: navigator.webdriver === true, signal: hasPrivacySignal() });
}
/** Pending markup uses the read-only initial consent check until hydration resolves the store. */
export const getServerConsentState = (): ConsentState | "pending" => "pending";

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === analyticsStorageKeys.consent) { memoryConsent = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function setConsent(choice: ConsentChoice): void {
  memoryConsent = { v: 1, choice, at: Date.now() };
  writeJson(analyticsStorageKeys.consent, memoryConsent);
  if (choice === "denied") {
    // Withdrawing consent forgets this browser's analytics identifiers immediately.
    remove(analyticsStorageKeys.visitor);
    remove(analyticsStorageKeys.session);
    remove(analyticsStorageKeys.lastPage);
    stopTracker();
  }
  for (const listener of listeners) listener();
}

/** Attribution survives the server's clean-URL redirect in the fragment `#gh_attr=…`; read it once, then drop it. */
export function readLandingAttribution(): Attribution | undefined {
  const marker = "#gh_attr=";
  if (!window.location.hash.startsWith(marker)) return undefined;
  let attribution: Attribution | undefined;
  try {
    const values = new URLSearchParams(decodeURIComponent(window.location.hash.slice(marker.length)));
    const pick = (key: string) => values.get(key)?.slice(0, 100) || undefined;
    const click = values.get("click");
    attribution = Object.fromEntries(Object.entries({ source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign"),
      term: pick("utm_term"), content: pick("utm_content"),
      click: click === "google" || click === "microsoft" || click === "meta" ? click : undefined }).filter(([, value]) => value !== undefined)) as Attribution;
  } catch { attribution = undefined; }
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return attribution && Object.keys(attribution).length > 0 ? attribution : undefined;
}

function externalReferrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const url = new URL(document.referrer);
    const host = (url.protocol === "android-app:" ? url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0] : url.hostname)?.toLowerCase();
    return host && host !== window.location.hostname.toLowerCase() && /^[a-z0-9.-]{1,255}$/.test(host) ? host : undefined;
  } catch { return undefined; }
}

const downloadPattern = /\.(pdf|csv|xlsx?|docx?|pptx?|zip|rar|7z|gz|png|jpe?g|gif|svg|webp|ics|json|txt|mp4|mp3)$/i;
const tracker = {
  running: false,
  landing: null as { ref?: string; utm?: Attribution; consumed: boolean } | null,
  pageview: null as string | null,
  pending: 0,
  activeSince: null as number | null,
  lastActivity: 0,
  queue: [] as AnalyticsEventInput[],
  flushTimer: 0 as number | ReturnType<typeof setTimeout>,
  heartbeat: 0 as number | ReturnType<typeof setInterval>,
  lastSearch: "",
  documentPageviews: 0,
};

/** Capture where this page load came from before consent, without storing it. */
export function rememberLanding(): void {
  if (tracker.landing) return;
  const utm = readLandingAttribution();
  const ref = externalReferrerHost();
  tracker.landing = { ...(ref ? { ref } : {}), ...(utm ? { utm } : {}), consumed: false };
}

function visitorId(): string {
  const stored = readJson<string>(analyticsStorageKeys.visitor);
  if (typeof stored === "string" && /^[0-9a-f-]{36}$/.test(stored)) return stored;
  const created = randomId();
  writeJson(analyticsStorageKeys.visitor, created);
  return created;
}

/** One visit across tabs; a new one starts after 30 idle minutes or when a tagged campaign link is opened. */
function sessionId(now: number, forceNew: boolean): Readonly<{ id: string; created: boolean }> {
  const stored = readJson<StoredSession>(analyticsStorageKeys.session);
  const reuse = !forceNew && stored && typeof stored.id === "string" && now - stored.last < analyticsRules.sessionIdleMs;
  const id = reuse ? stored.id : randomId();
  writeJson(analyticsStorageKeys.session, { id, last: now });
  return { id, created: !reuse };
}

function send(events: AnalyticsEventInput[]) {
  if (events.length === 0 || getConsentState() !== "granted") return;
  const now = Date.now();
  const startsVisit = events.some((event) => event.t === "pageview" && "utm" in event && event.utm !== undefined);
  const session = sessionId(now, startsVisit);
  if (session.created && !events.some((event) => event.t === "pageview")) {
    // A tab that returns after 30 idle minutes starts a new visit on the page it is showing.
    const pv = randomId();
    tracker.pageview = pv;
    events = [{ t: "pageview", id: pv, path: window.location.pathname.slice(0, 512), title: document.title.slice(0, 200) },
      ...events.map((event) => ("pv" in event ? { ...event, pv } : event))];
  }
  const payload: CollectPayload = {
    v: analyticsRules.schemaVersion, vid: visitorId(), sid: session.id,
    ctx: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 64), lang: navigator.language?.slice(0, 35),
      sw: Math.round(window.innerWidth), sh: Math.round(window.innerHeight), tp: Math.min(32, navigator.maxTouchPoints || 0) },
    events,
  };
  const body = JSON.stringify(payload);
  const queued = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(analyticsRules.collectPath, new Blob([body], { type: "text/plain" }));
  if (!queued) void fetch(analyticsRules.collectPath, { method: "POST", body, keepalive: true, credentials: "same-origin",
    headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

function flush() {
  clearTimeout(tracker.flushTimer);
  while (tracker.queue.length > 0) send(tracker.queue.splice(0, analyticsRules.maximumEventsPerBatch));
}
function enqueue(event: AnalyticsEventInput, immediate = false) {
  if (!tracker.running) return;
  tracker.queue.push(event);
  clearTimeout(tracker.flushTimer);
  if (immediate || tracker.queue.length >= analyticsRules.maximumEventsPerBatch) flush();
  else tracker.flushTimer = setTimeout(flush, 250);
}

function accrue(now: number) {
  if (tracker.activeSince === null) return;
  const end = Math.min(now, tracker.lastActivity + analyticsRules.idleAfterMs);
  if (end > tracker.activeSince) tracker.pending += end - tracker.activeSince;
  tracker.activeSince = now - tracker.lastActivity >= analyticsRules.idleAfterMs ? null : now;
}
function reportEngagement(immediate: boolean) {
  accrue(Date.now());
  if (tracker.pageview === null || tracker.pending < 1_000) return;
  while (tracker.pending >= 1_000) {
    const ms = Math.min(Math.round(tracker.pending), analyticsRules.maximumEngageDeltaMs);
    tracker.pending -= ms;
    enqueue({ t: "engage", pv: tracker.pageview, ms }, false);
  }
  tracker.pending = 0;
  if (immediate) flush();
}

function onActivity() {
  const now = Date.now();
  tracker.lastActivity = now;
  if (tracker.activeSince === null && document.visibilityState === "visible") tracker.activeSince = now;
}
function onVisibility() {
  if (document.visibilityState === "hidden") reportEngagement(true);
  else onActivity();
}
function onPageHide() { reportEngagement(true); }

function onClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest("a[href], button, [role='button'], summary, [data-analytics]") : null;
  if (!target || target.closest("[data-analytics-ignore]") || tracker.pageview === null) return;
  const text = (target.getAttribute("data-analytics") ?? target.getAttribute("aria-label") ?? target.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const pv = tracker.pageview;
  if (target instanceof HTMLAnchorElement) {
    let url: URL;
    try { url = new URL(target.href, window.location.href); } catch { return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") { enqueue({ t: "click", pv, label: text || url.protocol.replace(":", "") }, true); return; }
    if (target.hasAttribute("download") || downloadPattern.test(url.pathname)) { enqueue({ t: "download", pv, href: url.href.slice(0, 2048) }, true); return; }
    if (url.origin !== window.location.origin) { enqueue({ t: "outbound", pv, href: url.href.slice(0, 2048), ...(text ? { label: text } : {}) }, true); return; }
    enqueue({ t: "click", pv, label: text || url.pathname.slice(0, 120), href: url.pathname.slice(0, 512) });
    return;
  }
  if (text) enqueue({ t: "click", pv, label: text });
}

const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;

export function startTracker(): void {
  if (tracker.running || getConsentState() !== "granted") return;
  tracker.running = true;
  rememberLanding();
  onActivity();
  for (const name of activityEvents) window.addEventListener(name, onActivity, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("click", onClick, { capture: true });
  tracker.heartbeat = setInterval(() => { if (document.visibilityState === "visible") reportEngagement(true); }, analyticsRules.heartbeatMs);
}

export function stopTracker(): void {
  if (!tracker.running) return;
  for (const name of activityEvents) window.removeEventListener(name, onActivity, { capture: true });
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("pagehide", onPageHide);
  document.removeEventListener("click", onClick, { capture: true });
  clearInterval(tracker.heartbeat);
  clearTimeout(tracker.flushTimer);
  Object.assign(tracker, { running: false, pageview: null, pending: 0, activeSince: null, queue: [], lastSearch: "" });
}

/** A reload of the same page within ten seconds (such as the app's metadata recovery) continues the same page view. */
function reloadedPageview(path: string): string | null {
  if (tracker.documentPageviews > 0) return null;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation?.type !== "reload") return null;
  try {
    const last = JSON.parse(window.sessionStorage.getItem(analyticsStorageKeys.lastPage) ?? "null") as { id?: unknown; path?: unknown; at?: unknown } | null;
    return last && last.path === path && typeof last.id === "string" && typeof last.at === "number" && Date.now() - last.at < 10_000 ? last.id : null;
  } catch { return null; }
}

export function trackPageview(path: string, title: string): void {
  if (!tracker.running) return;
  reportEngagement(false);
  const landing = tracker.landing && !tracker.landing.consumed ? tracker.landing : null;
  if (tracker.landing) tracker.landing.consumed = true;
  tracker.pageview = reloadedPageview(path) ?? randomId();
  tracker.documentPageviews++;
  try { window.sessionStorage.setItem(analyticsStorageKeys.lastPage, JSON.stringify({ id: tracker.pageview, path, at: Date.now() })); }
  catch { /* Without session storage a quick reload simply counts again. */ }
  tracker.lastSearch = "";
  tracker.activeSince = document.visibilityState === "visible" ? Date.now() : null;
  tracker.lastActivity = Date.now();
  enqueue({ t: "pageview", id: tracker.pageview, path: path.slice(0, 512), title: title.slice(0, 200),
    ...(landing?.ref ? { ref: landing.ref } : {}), ...(landing?.utm ? { utm: landing.utm } : {}) }, true);
}

/** Record a search once per page view and term. */
export function trackSearch(term: string): void {
  const value = term.trim().slice(0, 200);
  if (!tracker.running || tracker.pageview === null || !value || value === tracker.lastSearch) return;
  tracker.lastSearch = value;
  enqueue({ t: "search", pv: tracker.pageview, term: value });
}

/** Named product events, e.g. `slip_build`; a no-op without consent. */
export function trackEvent(name: string): void {
  if (!tracker.running || tracker.pageview === null || !/^[a-z][a-z0-9_]{0,47}$/.test(name)) return;
  enqueue({ t: "custom", pv: tracker.pageview, name }, true);
}

