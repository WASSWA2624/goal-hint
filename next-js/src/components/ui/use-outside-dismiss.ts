"use client";

import { useEffect, type RefObject } from "react";
import { listenForOutsideDismiss } from "./outside-dismiss";
export { closeDetails } from "./outside-dismiss";

/** Wrap both the trigger and popup in root; keyboard dismissal stays with the component. */
export function useOutsideDismiss({ enabled, root, onDismiss, pointerDown = false }: {
  enabled: boolean;
  root: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  pointerDown?: boolean;
}) {
  useEffect(() => {
    const container = root.current;
    if (!enabled || !container) return;
    // Dismiss after the tap resolves its click target. Closing on pointerdown can shift the
    // layout before pointerup and send Apply/Clear taps to a match link underneath instead.
    // Capture still catches controls that stop bubbling to the document.
    return listenForOutsideDismiss(container, onDismiss, pointerDown);
  }, [enabled, root, onDismiss, pointerDown]);
}
