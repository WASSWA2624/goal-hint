"use client";

import { useEffect, type RefObject } from "react";

/** Wrap both the trigger and popup in root; keyboard dismissal stays with the component. */
export function useOutsideDismiss({ enabled, root, onDismiss }: {
  enabled: boolean;
  root: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const container = root.current;
    if (!enabled || !container) return;
    const ownerDocument = container.ownerDocument;
    const outside = (event: MouseEvent) => {
      if (!event.composedPath().includes(container)) onDismiss();
    };
    // Dismiss after the tap resolves its click target. Closing on pointerdown can shift the
    // layout before pointerup and send Apply/Clear taps to a match link underneath instead.
    // Capture still catches controls that stop bubbling to the document.
    ownerDocument.addEventListener("click", outside, true);
    return () => ownerDocument.removeEventListener("click", outside, true);
  }, [enabled, root, onDismiss]);
}

/** Closes a native <details> popover and returns focus to its summary only when focus was inside the popup. */
export function closeDetails(menu: HTMLDetailsElement | null, onClose: () => void) {
  if (!menu) return;
  const trigger = menu.querySelector("summary");
  const restoreFocus = menu.contains(menu.ownerDocument.activeElement) && menu.ownerDocument.activeElement !== trigger;
  menu.open = false;
  onClose();
  if (restoreFocus) trigger?.focus({ preventScroll: true });
}
