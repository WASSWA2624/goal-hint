const singletonSelectors = ["title", 'meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:url"]'] as const;

/** Observe only head insertions; never edit nodes owned by React or add timers. */
export function watchNavigationMetadata(head: HTMLHeadElement, recover: () => void): () => void {
  let active = true;
  const stop = () => { active = false; observer.disconnect(); };
  const inspect = () => {
    if (!active || !singletonSelectors.some((selector) => head.querySelectorAll(selector).length > 1)) return;
    stop();
    recover();
  };
  const observer = new MutationObserver(inspect);
  observer.observe(head, { childList: true });
  // Metadata may already have committed or may arrive in a later stream chunk.
  inspect();
  return stop;
}
