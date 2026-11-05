/** Pointer dismissal is opt-in for overlays whose removal cannot move the tapped target. */
export function listenForOutsideDismiss(container: HTMLElement, onDismiss: () => void, pointerDown = false): () => void {
  const ownerDocument = container.ownerDocument;
  const outside = (event: Event) => {
    if (!event.composedPath().includes(container)) onDismiss();
  };
  const options = { capture: true };
  ownerDocument.addEventListener("click", outside, options);
  if (pointerDown) ownerDocument.addEventListener("pointerdown", outside, options);
  return () => {
    ownerDocument.removeEventListener("click", outside, options);
    if (pointerDown) ownerDocument.removeEventListener("pointerdown", outside, options);
  };
}

/** Returns focus to the summary only when requested and focus was inside the popup. */
export function closeDetails(menu: HTMLDetailsElement | null, onClose: () => void, { restoreFocus = true }: { restoreFocus?: boolean } = {}) {
  if (!menu) return;
  const trigger = menu.querySelector("summary");
  const returnToTrigger = restoreFocus && menu.contains(menu.ownerDocument.activeElement) && menu.ownerDocument.activeElement !== trigger;
  menu.open = false;
  onClose();
  if (returnToTrigger) trigger?.focus({ preventScroll: true });
}
