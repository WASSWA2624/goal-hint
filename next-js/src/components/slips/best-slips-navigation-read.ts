import { defaultBestSlipsQuery, serializeBestSlipsQuery } from "../../domain/best-slips-query.ts";
import { bestSlipsHref } from "../../domain/navigation-paths.ts";

const route = bestSlipsHref("en");
const archive = `/api/best-slips?${serializeBestSlipsQuery(defaultBestSlipsQuery())}`;
const navigationLifetimeMs = 10_000;
type NavigationRead = {
  controller: AbortController;
  timer: number;
  pending: Promise<{ response: Response; publicResult: boolean } | null>;
};
let navigationRead: NavigationRead | undefined;

function clearNavigationRead() {
  if (!navigationRead) return;
  window.clearTimeout(navigationRead.timer);
  navigationRead.controller.abort();
  navigationRead = undefined;
}

/** Start on a real router navigation. Hover and Next's shell prefetch never read the archive. */
export function prepareBestSlipsNavigation(href: string) {
  clearNavigationRead();
  if (href !== route || href === window.location.pathname + window.location.search) return;
  const controller = new AbortController();
  const pending = fetch(archive, { signal: controller.signal, cache: "no-store", credentials: "same-origin" }).then(async response => {
    if (!response.ok) return { response, publicResult: true };
    const result = await response.clone().json();
    return { response, publicResult: result?.access?.tier === "free" && result.access.signedIn === false };
  }).catch(() => null);
  navigationRead = { controller, pending, timer: window.setTimeout(clearNavigationRead, navigationLifetimeMs) };
}

/** Once mounted, the exact route takes ownership and controls cancellation. A
 * response that already completed outside the screen can only supply public data. */
export async function takeBestSlipsNavigation(href: string, signal: AbortSignal): Promise<Response | null> {
  const current = navigationRead;
  if (!current || href !== archive || window.location.pathname + window.location.search !== route) return null;
  navigationRead = undefined;
  window.clearTimeout(current.timer);
  const cancel = () => current.controller.abort(signal.reason);
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  try {
    const settled = await Promise.race([current.pending, Promise.resolve(undefined)]);
    if (settled !== undefined) return settled?.publicResult ? settled.response : null;
    return (await current.pending)?.response ?? null;
  } finally { signal.removeEventListener("abort", cancel); }
}
