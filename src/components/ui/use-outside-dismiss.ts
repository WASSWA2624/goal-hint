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
