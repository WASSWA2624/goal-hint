"use client";

import { useLayoutEffect, type RefObject } from "react";
import { css } from "styled-components";

/** Keep local pickers beside their trigger while allowing either opening direction. */
export const anchoredPanel = css`
  --anchored-panel-edge: var(--gh-spacing-2);
  --anchored-panel-gap: var(--gh-spacing-1_5);
  position: absolute;
  inset-block-start: calc(100% + var(--anchored-panel-gap));
  left: var(--anchored-panel-left, 0px);
  right: auto;
  max-inline-size: var(--anchored-panel-width, calc(100vw - 2 * var(--anchored-panel-edge)));
  &[data-panel-above] {
    inset-block-start: auto;
    inset-block-end: calc(100% + var(--anchored-panel-gap));
  }
`;

/** Recheck after resizing or scrolling; measurements stay in viewport coordinates. */
export function useAnchoredPanel({ open, anchor, panel }: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
}) {
  useLayoutEffect(() => {
    const trigger = anchor.current, popup = panel.current;
    if (!open || !trigger || !popup) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const position = () => {
      frame = 0;
      const style = getComputedStyle(popup);
      const edge = Number.parseFloat(style.getPropertyValue("--anchored-panel-edge")) || 0;
      const gap = Number.parseFloat(style.getPropertyValue("--anchored-panel-gap")) || 0;
      const documentRoot = document.documentElement;
      // A protruding panel can enlarge a mobile visual viewport; never use that overflow as available room.
      const width = Math.min(documentRoot.clientWidth, viewport?.width ?? documentRoot.clientWidth);
      const height = Math.min(documentRoot.clientHeight, viewport?.height ?? documentRoot.clientHeight);
      const left = Math.max(0, Math.min(viewport?.offsetLeft ?? 0, documentRoot.clientWidth - width)) + edge;
      const top = Math.max(0, Math.min(viewport?.offsetTop ?? 0, documentRoot.clientHeight - height)) + edge;
      const right = left + width - edge * 2, bottom = top + height - edge * 2;
      popup.style.setProperty("--anchored-panel-width", `${Math.max(0, right - left)}px`);
      popup.style.removeProperty("--anchored-panel-space");
      popup.removeAttribute("data-panel-above");
      const triggerBounds = trigger.getBoundingClientRect();
      const below = Math.max(0, bottom - triggerBounds.bottom - gap);
      const above = Math.max(0, triggerBounds.top - top - gap);
      const opensAbove = popup.getBoundingClientRect().height > below && above > below;
      popup.toggleAttribute("data-panel-above", opensAbove);
      popup.style.setProperty("--anchored-panel-space", `${opensAbove ? above : below}px`);
      const bounds = popup.getBoundingClientRect();
      const desired = getComputedStyle(trigger).direction === "rtl" ? triggerBounds.right - bounds.width : triggerBounds.left;
      const x = Math.max(left, Math.min(desired, right - bounds.width));
      const parent = popup.offsetParent;
      const origin = parent ? parent.getBoundingClientRect().left + parent.clientLeft - parent.scrollLeft : 0;
      popup.style.setProperty("--anchored-panel-left", `${x - origin}px`);
    };
    const schedule = (event?: Event) => {
      if (event?.type === "scroll" && event.target instanceof Node && popup.contains(event.target)) return;
      if (!frame) frame = requestAnimationFrame(position);
    };
    position();
    const observer = new ResizeObserver(() => schedule());
    observer.observe(trigger);
    observer.observe(popup);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [open, anchor, panel]);
}
