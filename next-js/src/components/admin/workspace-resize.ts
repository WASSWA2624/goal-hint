"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { css } from "styled-components";

export const workspaceResizeRail = css`
  background: ${({ theme }) => theme.color.border};
  cursor: col-resize;
  touch-action: none;
  &:hover, &:focus-visible { background: ${({ theme }) => theme.color.brandSoft}; }
  &:focus-visible {
    outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * var(--gh-size-0_5));
  }
`;

export function useHorizontalResize({ width, min, max, defaultWidth, onChange, onDragEnd }: {
  width: number; min: number; max: number; defaultWidth?: number;
  onChange: (width: number, persist?: boolean) => void; onDragEnd?: () => void;
}) {
  const active = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    active.current = null;
    setResizing(false);
    onDragEnd?.();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const handle = {
    "aria-orientation": "vertical" as const,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": width,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || active.current) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = { pointerId: event.pointerId, x: event.clientX, width };
      setResizing(true);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const drag = active.current;
      if (drag?.pointerId === event.pointerId) onChange(clamp(drag.width + event.clientX - drag.x), false);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onDoubleClick: defaultWidth === undefined ? undefined : () => onChange(clamp(defaultWidth)),
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      const increment = event.shiftKey ? 32 : 8;
      const next = event.key === "ArrowLeft" ? width - increment : event.key === "ArrowRight" ? width + increment
        : event.key === "Home" ? min : event.key === "End" ? max : event.key === "Enter" ? defaultWidth : undefined;
      if (next === undefined) return;
      event.preventDefault();
      onChange(clamp(next));
    },
  };
  return { handle, resizing };
}
