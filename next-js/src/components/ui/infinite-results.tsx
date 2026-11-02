"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "styled-components";
import { Button } from "./controls";
import { Inline } from "./layout";
import { createMessages } from "@/i18n/messages";

/** Automatic loading retains a native button when observation is unavailable or loading fails. */
export function InfiniteResults({ hasMore, busy, failed = false, onMore, locale }: {
  hasMore: boolean; busy: boolean; failed?: boolean; onMore: (automatic?: boolean) => void; locale: string;
}) {
  const target = useRef<HTMLButtonElement>(null), margin = useTheme().size[80], m = createMessages(locale);
  useEffect(() => {
    const element = target.current;
    if (!element || !hasMore || busy || failed || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (!requested && entries.some((entry) => entry.isIntersecting) && document.visibilityState === "visible") {
        requested = true; onMore(true);
      }
    }, { rootMargin: `${Number.parseFloat(margin) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)}px` });
    observer.observe(element); return () => observer.disconnect();
  }, [busy, failed, hasMore, margin, onMore]);
  return hasMore ? <Inline><Button ref={target} type="button" variant="secondary" disabled={busy} data-load-more onClick={() => onMore(false)}>
    {m.text(busy ? "history.loading" : failed ? "feed.retry" : "history.loadMore")}
  </Button></Inline> : null;
}
