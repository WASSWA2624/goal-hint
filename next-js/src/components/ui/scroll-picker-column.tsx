"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { ChevronDownIcon } from "./icons";

const Root = styled.div`
  position: relative; min-inline-size: 0;
  > span { display: block; text-align: center; font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.mutedText}; padding-block-end: var(--gh-spacing-1); }
`;
const Wheel = styled.div`
  position: relative; block-size: calc(var(--form-control-height) * 3); overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: none; overflow-anchor: none; touch-action: pan-y; outline: none;
  &::-webkit-scrollbar { display: none; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-stroke-strong)); }
  [data-wheel-option] {
    position: absolute; inset-inline: 0; display: grid; place-items: center; block-size: var(--form-control-height);
    font-size: var(--gh-font-body); color: ${({ theme }) => theme.color.mutedText}; cursor: pointer; user-select: none;
  }
  [aria-selected="true"] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const Track = styled.div`position: relative;`;
const WheelFrame = styled.div`position: relative; margin-block: var(--gh-spacing-0_5);`;
const Frame = styled.div`
  position: absolute; inset-inline: 0; inset-block-start: var(--form-control-height); block-size: var(--form-control-height);
  background: ${({ theme }) => theme.color.brandSoft}; pointer-events: none;
  border-block: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
`;
const Step = styled.button`
  display: grid; place-items: center; inline-size: min(100%, var(--form-control-height)); block-size: var(--form-control-height);
  margin-inline: auto; padding: 0;
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.section}; color: ${({ theme }) => theme.color.link}; cursor: pointer;
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  &[data-direction="up"] > svg { transform: rotate(180deg); }
  &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; }
  &:active:not(:disabled) { background: ${({ theme }) => theme.color.brandSoft}; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-stroke-strong)); }
  &:disabled { background: transparent; color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
`;

const cycleIndex = (index: number, count: number) => ((index % count) + count) % count;

/** Repeated tracks keep native scrolling continuous while rendering only nearby options. */
export function ScrollPickerColumn({ label, previousLabel, nextLabel, value, minimum, maximum, wrap = false, format = String, onChange }: {
  label: string; value: number; minimum: number; maximum: number; format?: (value: number) => string; onChange: (value: number) => void;
  previousLabel: string; nextLabel: string; wrap?: boolean;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), wheel = useRef<HTMLDivElement>(null);
  const count = maximum - minimum + 1;
  const cyclic = wrap && count > 1;
  const bufferCycles = cyclic ? 4 : 0;
  const length = count * (2 * bufferCycles + 1);
  const middle = count * bufferCycles;
  const [row, setRow] = useState(0), [position, setPosition] = useState(middle + value - minimum);
  const selected = useRef(value), settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const geometry = useRef({ row, minimum, maximum, cyclic });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setRow(parseFloat(getComputedStyle(element).getPropertyValue("--form-control-height")));
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = wheel.current;
    if (!element || !row) return;
    const previous = geometry.current;
    if (selected.current !== value || previous.row !== row || previous.minimum !== minimum || previous.maximum !== maximum || previous.cyclic !== cyclic) {
      const index = middle + value - minimum;
      clearTimeout(settle.current);
      element.scrollTop = index * row;
      setPosition(index);
    }
    geometry.current = { row, minimum, maximum, cyclic };
    selected.current = value;
  }, [value, minimum, maximum, row, cyclic, middle]);
  useEffect(() => () => clearTimeout(settle.current), []);

  function select(index: number) {
    setPosition(index);
    const next = minimum + cycleIndex(index, count);
    if (selected.current !== next) {
      selected.current = next;
      onChange(next);
    }
  }
  function choose(index: number) {
    if (!wheel.current || !row) return;
    const next = cyclic && (index < 0 || index >= length)
      ? middle + cycleIndex(index, count)
      : Math.max(0, Math.min(length - 1, index));
    clearTimeout(settle.current);
    wheel.current.scrollTop = next * row;
    select(next);
  }
  function keyboard(event: KeyboardEvent) {
    const offset = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : event.key === "PageDown" ? 5 : event.key === "PageUp" ? -5 : 0;
    if (offset || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const cycleStart = position - cycleIndex(position, count);
      choose(event.key === "Home" ? cycleStart : event.key === "End" ? cycleStart + count - 1 : position + offset);
    }
  }
  const from = Math.max(0, position - 5), to = Math.min(length - 1, position + 5);
  // When a restricted range repeats inside the window, expose only the copy nearest the selection.
  const firstExposed = position - Math.floor((count - 1) / 2);
  return <Root ref={root} data-scroll-picker-column={label}>
    <span id={`${id}-label`}>{label}</span>
    <Step type="button" data-direction="up" aria-label={previousLabel} disabled={!cyclic && value <= minimum} onClick={() => choose(position - 1)}><ChevronDownIcon /></Step>
    <WheelFrame><Frame />
      <Wheel ref={wheel} role="listbox" aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-${position}`} tabIndex={0}
        onKeyDown={keyboard} onScroll={event => {
          if (!row) return;
          const element = event.currentTarget;
          let slot = element.scrollTop / row;
          // Keep a long gesture away from the finite DOM track's edges.
          if (cyclic && (slot < count || slot >= length - count)) {
            slot = middle + cycleIndex(slot, count);
            element.scrollTop = slot * row;
          }
          const index = Math.max(0, Math.min(length - 1, Math.round(slot)));
          select(index);
          clearTimeout(settle.current);
          settle.current = setTimeout(() => {
            const target = cyclic ? middle + cycleIndex(index, count) : index;
            if (Math.abs(element.scrollTop - target * row) > 0.5) element.scrollTop = target * row;
          }, 140);
        }}>
        <Track style={{ height: row * (length + 2) }}>{row > 0 && Array.from({ length: Math.max(0, to - from + 1) }, (_, offset) => {
          const slot = from + offset;
          const option = cycleIndex(slot, count);
          const exposed = !cyclic || (slot >= firstExposed && slot < firstExposed + count);
          return <div key={slot} id={`${id}-${slot}`} data-wheel-option role={exposed ? "option" : undefined} aria-hidden={!exposed || undefined}
            aria-selected={exposed ? slot === position : undefined} aria-posinset={exposed ? option + 1 : undefined} aria-setsize={exposed ? count : undefined}
            style={{ top: (slot + 1) * row }} onClick={() => choose(slot)}>{format(minimum + option)}</div>;
        })}</Track>
      </Wheel></WheelFrame>
    <Step type="button" data-direction="down" aria-label={nextLabel} disabled={!cyclic && value >= maximum} onClick={() => choose(position + 1)}><ChevronDownIcon /></Step>
  </Root>;
}
