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
  scrollbar-width: none; touch-action: pan-y; outline: none;
  &::-webkit-scrollbar { display: none; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-stroke-strong)); }
  [role="option"] {
    position: absolute; inset-inline: 0; display: grid; place-items: center; block-size: var(--form-control-height);
    font-size: var(--gh-font-body); color: ${({ theme }) => theme.color.mutedText}; cursor: pointer; user-select: none;
  }
  [aria-selected="true"] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const Track = styled.div`position: relative;`;
const Frame = styled.div`
  position: absolute; inset-inline: 0; inset-block-start: var(--form-control-height); block-size: var(--form-control-height);
  background: ${({ theme }) => theme.color.brandSoft}; pointer-events: none;
  border-block: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
`;
const Step = styled.button`
  display: grid; place-items: center; inline-size: 100%; block-size: var(--form-control-height); padding: 0;
  border: 0; border-radius: ${({ theme }) => theme.radius.control}; background: transparent; color: ${({ theme }) => theme.color.link}; cursor: pointer;
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
  &[data-direction="up"] > svg { transform: rotate(180deg); }
  &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; }
  &:active:not(:disabled) { background: ${({ theme }) => theme.color.brandSoft}; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-stroke-strong)); }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
`;

/** A bounded, virtualized wheel: even a 9,999-year range renders only nearby rows. */
export function ScrollPickerColumn({ label, previousLabel, nextLabel, value, minimum, maximum, format = String, onChange }: {
  label: string; value: number; minimum: number; maximum: number; format?: (value: number) => string; onChange: (value: number) => void;
  previousLabel: string; nextLabel: string;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), wheel = useRef<HTMLDivElement>(null);
  const [row, setRow] = useState(0), [position, setPosition] = useState(value - minimum);
  const selected = useRef(value), settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const count = maximum - minimum + 1, index = value - minimum;
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
    if (selected.current !== value || Math.round(element.scrollTop / row) !== index) {
      clearTimeout(settle.current); element.scrollTop = index * row; setPosition(index);
    }
    selected.current = value;
  }, [value, minimum, row, index]);
  useEffect(() => () => clearTimeout(settle.current), []);
  function choose(next: number) {
    const bounded = Math.max(minimum, Math.min(maximum, next));
    wheel.current?.scrollTo({ top: (bounded - minimum) * row });
    selected.current = bounded; setPosition(bounded - minimum); onChange(bounded);
  }
  function keyboard(event: KeyboardEvent) {
    const offset = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : event.key === "PageDown" ? 5 : event.key === "PageUp" ? -5 : 0;
    if (offset || event.key === "Home" || event.key === "End") {
      event.preventDefault(); choose(event.key === "Home" ? minimum : event.key === "End" ? maximum : value + offset);
    }
  }
  const from = Math.max(0, Math.floor(position) - 5), to = Math.min(count - 1, Math.ceil(position) + 5);
  return <Root ref={root} data-scroll-picker-column={label}>
    <span id={`${id}-label`}>{label}</span>
    <Step type="button" data-direction="up" aria-label={previousLabel} disabled={value <= minimum} onClick={() => choose(value - 1)}><ChevronDownIcon /></Step>
    <div style={{ position: "relative" }}><Frame />
      <Wheel ref={wheel} role="listbox" aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-${value}`} tabIndex={0}
        onKeyDown={keyboard} onScroll={event => {
          if (!row) return;
          const top = event.currentTarget.scrollTop, next = Math.max(0, Math.min(count - 1, Math.round(top / row)));
          setPosition(top / row);
          if (selected.current !== next + minimum) { selected.current = next + minimum; onChange(next + minimum); }
          clearTimeout(settle.current); settle.current = setTimeout(() => {
            if (wheel.current && Math.abs(wheel.current.scrollTop - next * row) > 0.5) wheel.current.scrollTo({ top: next * row, behavior: "smooth" });
          }, 140);
        }}>
        <Track style={{ height: row * (count + 2) }}>{row > 0 && Array.from({ length: Math.max(0, to - from + 1) }, (_, offset) => {
          const option = minimum + from + offset;
          return <div key={option} id={`${id}-${option}`} role="option" aria-selected={option === value} aria-posinset={option - minimum + 1} aria-setsize={count}
            style={{ top: (option - minimum + 1) * row }} onClick={() => choose(option)}>{format(option)}</div>;
        })}</Track>
      </Wheel></div>
    <Step type="button" data-direction="down" aria-label={nextLabel} disabled={value >= maximum} onClick={() => choose(value + 1)}><ChevronDownIcon /></Step>
  </Root>;
}
