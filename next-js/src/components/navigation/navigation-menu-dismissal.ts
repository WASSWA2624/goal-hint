/** Navigation disclosures close without redirecting focus unless Escape is used from inside. */
export function watchNavigationMenu(menu: HTMLDetailsElement, onDismiss: (restoreFocus?: boolean) => void): () => void {
  const document = menu.ownerDocument, window = document.defaultView;
  const close = () => { if (menu.open) onDismiss(false); };
  const keydown = (event: KeyboardEvent) => {
    if (!menu.open || event.defaultPrevented || event.key !== "Escape") return;
    const target = event.target as Element | null;
    if (target?.closest?.('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss(menu.contains(document.activeElement));
  };
  const focus = (event: FocusEvent) => {
    if (!event.composedPath().includes(menu)) close();
  };
  const observer = new ResizeObserver(() => { if (!menu.getClientRects().length) close(); });
  observer.observe(menu);
  document.addEventListener("keydown", keydown);
  document.addEventListener("focusin", focus);
  window?.addEventListener("popstate", close);
  window?.addEventListener("hashchange", close);
  return () => {
    observer.disconnect();
    document.removeEventListener("keydown", keydown);
    document.removeEventListener("focusin", focus);
    window?.removeEventListener("popstate", close);
    window?.removeEventListener("hashchange", close);
  };
}
