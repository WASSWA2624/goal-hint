import { isOwnerPage } from "../../domain/private-paths.ts";

const singletonSelectors = ["title", 'meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:url"]'] as const;

/** Observe only head insertions; never edit nodes owned by React or add timers. */
export function watchNavigationMetadata(head: HTMLHeadElement, recover: () => void, pathname?: () => string): () => void {
  let active = true;
  const stop = () => { active = false; observer.disconnect(); };
  const inspect = () => {
    // The URL can change before the previous page's effect cleanup, so check it at the point of recovery too.
    if (!active || pathname && isOwnerPage(pathname()) || !singletonSelectors.some((selector) => head.querySelectorAll(selector).length > 1)) return;
    stop();
    recover();
  };
  const observer = new MutationObserver(inspect);
  observer.observe(head, { childList: true });
  // Metadata may already have committed or may arrive in a later stream chunk.
  inspect();
  return stop;
}
