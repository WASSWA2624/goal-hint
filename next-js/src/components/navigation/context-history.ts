import { contextReturnDistance, navigationSurface } from "../../domain/context-navigation.ts";

type HistoryMarker = { surface: string; depth: number };
const markerKey = "goalHintContextBack";
let pending: { target: string; depth: number; until: number } | undefined;
let listening = false;
let backPending = false;

function marker(): HistoryMarker | undefined {
  const value = window.history.state?.[markerKey] as HistoryMarker | undefined;
  return value && typeof value.surface === "string" && Number.isSafeInteger(value.depth) && value.depth > 0 ? value : undefined;
}

export function rememberContextOrigin(href: string) {
  rememberContextArrival();
  const source = new URL(window.location.href), target = new URL(href, source);
  const destination = navigationSurface(target), origin = navigationSurface(source);
  pending = undefined;
  if (source.origin !== target.origin || !destination || !origin || source.href === target.href) return;
  const previous = marker(), depth = destination !== origin ? 1 : previous?.surface === origin ? previous.depth + 1 : 0;
  if (!depth) return;
  pending = { target: target.href, depth, until: Date.now() + 30_000 };
  if (!listening) {
    listening = true;
    window.addEventListener("popstate", () => { pending = undefined; });
  }
}

/** Confirm the Link arrived at its expected destination before allowing a browser-history return. */
export function rememberContextArrival() {
  if (!pending || pending.until < Date.now() || pending.target !== window.location.href) return;
  const surface = navigationSurface(new URL(pending.target));
  if (surface) {
    window.history.replaceState({ ...window.history.state, [markerKey]: { surface, depth: pending.depth } }, "");
  }
  pending = undefined;
}

/** Preserve context for widgets whose nested views are real browser history entries. */
export function writeContextHistory(state: Record<string, unknown>, url: string, mode: "push" | "replace") {
  const previous = marker(), surface = navigationSurface(new URL(url, window.location.href));
  const context = previous && previous.surface === surface ? { surface, depth: previous.depth + Number(mode === "push") } : undefined;
  const next = { ...state, ...(context ? { [markerKey]: context } : {}) };
  if (mode === "push") window.history.pushState(next, "", url);
  else window.history.replaceState(next, "", url);
}

/** Use an actual same-origin entry. Direct links keep the calling link's real fallback href. */
export function returnToContext(): boolean {
  rememberContextArrival();
  const current = new URL(window.location.href);
  // Older WebViews and browsers use the shared Link's history marker.
  const navigation = (window as Window & { navigation?: {
    currentEntry: { index: number } | null; entries(): { index: number; url?: string }[];
  } }).navigation;
  const index = navigation?.currentEntry?.index;
  const prior = index !== undefined && index > 0 ? navigation?.entries().slice(0, index).reverse().map(entry => entry.url ?? "") : null;
  const stored = marker();
  const distance = prior ? contextReturnDistance(current, prior) : stored?.surface === navigationSurface(current) ? stored.depth : null;
  if (!distance || !Number.isSafeInteger(distance) || distance >= window.history.length) return false;
  goHistoryBack(distance);
  return true;
}

export function interceptContextBack(event: { preventDefault(): void }) {
  if (returnToContext()) event.preventDefault();
}

export function goHistoryBack(distance = 1) {
  if (backPending) return;
  backPending = true;
  const timer = window.setTimeout(release, 1000);
  function release() {
    window.clearTimeout(timer);
    window.removeEventListener("popstate", release);
    backPending = false;
  }
  window.addEventListener("popstate", release, { once: true });
  window.history.go(-distance);
}
