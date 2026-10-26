/** Share one observer for decorative remote images instead of downloading a long list
 * at the browser's much larger native lazy-loading distance. No proxy or media cache. */
const pending = new Map<HTMLImageElement, string>();
let observer: IntersectionObserver | undefined;

export function deferImage(image: HTMLImageElement, source: string): () => void {
  if (typeof IntersectionObserver === "undefined") {
    image.src = source;
    return () => {};
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const image = entry.target as HTMLImageElement, source = pending.get(image);
      if (source) image.src = source;
      pending.delete(image);
      observer!.unobserve(image);
    }
  }, { rootMargin: "120px" });
  pending.set(image, source);
  observer.observe(image);
  return () => {
    pending.delete(image);
    observer!.unobserve(image);
  };
}
