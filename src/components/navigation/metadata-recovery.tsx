"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { watchNavigationMetadata } from "./watch-navigation-metadata";

/** Recover Next's initial head-hydration race without changing normal navigation. */
export function MetadataRecovery() {
  const pathname = usePathname(), search = useSearchParams().toString();
  const previous = useRef<string | null>(null);
  const navigated = useRef(false);
  useEffect(() => {
    const href = pathname + (search ? `?${search}` : "");
    // This effect can first hydrate after a link has already navigated. The
    // browser's document request still identifies the original page in that case.
    const request = performance.getEntriesByType("navigation")[0];
    const initial = request ? new URL(request.name) : null;
    const initialSearch = initial?.searchParams.toString();
    const from = previous.current ?? (initial ? initial.pathname + (initialSearch ? `?${initialSearch}` : "") : href);
    previous.current = href;
    navigated.current ||= from !== href;
    if (!navigated.current) return;
    // A reload replaces this history entry and starts with server-owned metadata.
    // The new document has no client navigation, so it cannot enter a reload loop.
    return watchNavigationMetadata(document.head, () => window.location.reload());
  }, [pathname, search]);
  return null;
}
