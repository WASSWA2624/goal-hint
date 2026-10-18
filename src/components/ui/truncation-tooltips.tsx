"use client";

import { useEffect } from "react";

/** Text the layout cut short with an ellipsis: `text-overflow: ellipsis` and content wider than its box. */
export function isEllipsized(element: HTMLElement): boolean {
  return element.scrollWidth - element.clientWidth > 1 && getComputedStyle(element).textOverflow === "ellipsis";
}

/**
 * Hovering text that an ellipsis cut short shows its full value as a native tooltip, everywhere in the app. Full-card
 * links lie on top of their text, so the text is found under the pointer (`elementsFromPoint`) and the tooltip goes on
 * the topmost hovered element. The full value is the text's own title when it has one, otherwise its rendered text. A
 * title that the page set on the hovered element is left alone; touch input never shows tooltips and is ignored.
 */
export function TruncationTooltips() {
  useEffect(() => {
    let frame = 0, pointer: { x: number; y: number } | null = null, owner: HTMLElement | null = null;
    const clear = () => {
      if (owner?.dataset.truncationTitle !== undefined) { owner.removeAttribute("title"); delete owner.dataset.truncationTitle; }
      owner = null;
    };
    const update = () => {
      frame = 0;
      if (!pointer) return clear();
      const hits = document.elementsFromPoint(pointer.x, pointer.y);
      const target = hits[0], label = hits.find((element): element is HTMLElement => element instanceof HTMLElement && isEllipsized(element));
      const text = label ? label.getAttribute("title")?.trim() || label.innerText.trim() : "";
      if (target !== owner) clear();
      if (!(target instanceof HTMLElement) || !text || (target !== owner && target.hasAttribute("title"))) return clear();
      owner = target;
      owner.dataset.truncationTitle = "";
      if (owner.title !== text) owner.title = text;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) { pointer = null; schedule(); } };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    // Scrolling moves text under a still pointer.
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("scroll", schedule, { capture: true });
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, []);
  return null;
}
