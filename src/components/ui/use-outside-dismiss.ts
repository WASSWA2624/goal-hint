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
    const outside = (event: PointerEvent) => {
      if (!event.composedPath().includes(container)) onDismiss();
    };
    // Capture also catches clicks in controls that stop bubbling to the document.
    ownerDocument.addEventListener("pointerdown", outside, true);
    return () => ownerDocument.removeEventListener("pointerdown", outside, true);
  }, [enabled, root, onDismiss]);
}
