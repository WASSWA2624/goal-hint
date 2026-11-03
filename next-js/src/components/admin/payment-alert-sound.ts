import { reviewAlertRules, reviewSound, type ReviewAlertFeed } from "../../domain/payment-alerts.ts";

let audio: HTMLAudioElement | null = null, timer: ReturnType<typeof setTimeout> | undefined;
let current: string[] = [], scope = "", initial = true, generation = 0;
let lifecycle = 0, activeEvents = new Set<string>();
let finishGap: (() => void) | undefined;
const nativeHost = () => /\bGoalHintNative\//u.test(navigator.userAgent);
const soundKey = (value: string) => `goal-hint-review-sound:${value}`;
const seenKey = (value: string) => `goal-hint-review-seen:${value}`;
function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Visual queue remains available. */ } }
function seen(value: string): string[] { try { const ids = JSON.parse(read(seenKey(value)) ?? "[]"); return Array.isArray(ids) ? ids.filter(id => typeof id === "string").slice(-250) : []; } catch { return []; } }
export function stopReviewSound() { generation++; clearTimeout(timer); timer = undefined; finishGap?.(); finishGap = undefined; audio?.pause(); if (audio) audio.currentTime = 0; current = []; }
export function resetReviewAlerts() { lifecycle++; stopReviewSound(); audio = null; initial = true; scope = ""; activeEvents.clear(); }
export function reviewSoundEnabled(value: string) { return read(soundKey(value)) === "true"; }
export async function setReviewSound(value: string, enabled: boolean) {
  write(soundKey(value), String(enabled)); stopReviewSound();
  if (enabled && !nativeHost()) { audio ??= new Audio(reviewSound); await audio.play(); }
}
async function play(repeats: number, ids: string[]) {
  stopReviewSound(); current = ids;
  const version = generation;
  audio ??= new Audio(reviewSound);
  for (let repeat = 0; repeat < Math.max(1, Math.min(3, repeats)); repeat++) {
    if (version !== generation) return;
    try { audio.currentTime = 0; await audio.play(); } catch { return; }
    if (repeat + 1 < repeats) await new Promise<void>(resolve => { finishGap = resolve; timer = setTimeout(() => { finishGap = undefined; resolve(); }, reviewAlertRules.soundDurationMs + reviewAlertRules.soundGapMs); });
  }
}
/** The existing count feed owns discovery. Web Locks serialize sound across a browser profile. */
export function acceptReviewAlertFeed(feed: ReviewAlertFeed) {
  if (!feed || typeof feed.scope !== "string" || !Array.isArray(feed.events)) return;
  if (scope !== feed.scope) { resetReviewAlerts(); scope = feed.scope; }
  activeEvents = new Set(feed.events.map(event => event.id));
  if (!feed.enabled || current.some(id => !feed.events.some(event => event.id === id))) stopReviewSound();
  const baseline = initial; initial = false;
  const version = lifecycle;
  if (!baseline && !nativeHost() && !document.hasFocus()) return;
  const process = async () => {
    if (version !== lifecycle || scope !== feed.scope) return;
    const previous = seen(feed.scope), next = feed.events.filter(event => activeEvents.has(event.id) && !previous.includes(event.id));
    write(seenKey(feed.scope), JSON.stringify([...new Set([...previous, ...feed.events.map(event => event.id)])].slice(-250)));
    if (!baseline && feed.enabled && !nativeHost() && document.visibilityState === "visible" && document.hasFocus()
      && reviewSoundEnabled(feed.scope) && next.some(event => Date.now() - Date.parse(event.createdAt) < 60_000)) await play(feed.repeats, next.map(event => event.id));
    // An owned worker can remove obsolete notifications even when the browser could not do so in the background.
    if ("serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage({ type: "payment-alert-reconcile", events: feed.enabled ? [...activeEvents] : [] });
  };
  if (navigator.locks) void navigator.locks.request("goal-hint-review-sound", process);
  else if (document.hasFocus()) void process();
}
