"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";

const TextControl = styled.button`
  display: block; min-inline-size: 0; max-inline-size: 100%; padding: 0; margin: 0;
  border: 0; background: none; color: inherit; font: inherit; line-height: inherit; text-align: start;
  cursor: default;
  &[tabindex="0"] { cursor: help; }
  > [data-ellipsis-text] { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;

const Tooltip = styled.span`
  position: fixed; z-index: 100; inline-size: max-content; max-inline-size: min(35rem, calc(100vw - 16px));
  padding: 6px 8px; border: 1px solid ${({ theme }) => theme.color.border}; border-radius: 0;
  color: ${({ theme }) => theme.color.surface}; background: ${({ theme }) => theme.color.text};
  font-size: 0.75rem; line-height: 1.5; white-space: normal; overflow-wrap: anywhere;
`;

function FullTextTooltip({ id, text, anchor, onEnter, onLeave }: {
  id: string; text: string; anchor: RefObject<HTMLButtonElement | null>; onEnter: () => void; onLeave: () => void;
}) {
  const tip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const trigger = anchor.current?.getBoundingClientRect(), bubble = tip.current?.getBoundingClientRect();
    if (!trigger || !bubble) return;
    setPosition({
      left: Math.max(8, Math.min(trigger.left, window.innerWidth - bubble.width - 8)),
      top: trigger.bottom + bubble.height + 14 <= window.innerHeight ? trigger.bottom + 6 : Math.max(8, trigger.top - bubble.height - 6),
    });
  }, [anchor, text]);
  return createPortal(<Tooltip ref={tip} id={id} role="tooltip" style={position} onMouseEnter={onEnter} onMouseLeave={onLeave}>{text}</Tooltip>, document.body);
}

/** Only clipped names enter the tab order; their full text stays in the DOM and is visible on focus or hover. */
export function TruncatedText({ text }: { text: string }) {
  const trigger = useRef<HTMLButtonElement>(null), label = useRef<HTMLSpanElement>(null), id = useId();
  const hovered = useRef(false), tooltipHovered = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [truncated, setTruncated] = useState(false), [open, setOpen] = useState(false);
  const cancelClose = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } };
  const show = () => {
    cancelClose();
    const clipped = Boolean(label.current && label.current.clientWidth > 0 && label.current.scrollWidth > label.current.clientWidth + 1);
    setTruncated(clipped); setOpen(clipped);
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (!hovered.current && !tooltipHovered.current && document.activeElement !== trigger.current) setOpen(false);
      timer.current = null;
    }, 120);
  };
  useEffect(() => {
    const element = label.current;
    if (!element) return;
    const measure = () => {
      const clipped = element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1;
      setTruncated(clipped);
      if (!clipped) setOpen(false);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => { observer.disconnect(); if (timer.current !== null) clearTimeout(timer.current); };
  }, [text]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [open]);
  return <>
    <TextControl ref={trigger} type="button" data-truncation data-full-text={text} title="" tabIndex={truncated ? 0 : -1}
      aria-label={text} aria-describedby={open ? id : undefined} onFocus={show} onBlur={scheduleClose}
      onMouseEnter={() => { hovered.current = true; show(); }} onMouseLeave={() => { hovered.current = false; scheduleClose(); }} onClick={show}>
      <span ref={label} data-ellipsis-text title="">{text}</span>
    </TextControl>
    {open && <FullTextTooltip id={id} text={text} anchor={trigger}
      onEnter={() => { tooltipHovered.current = true; cancelClose(); }} onLeave={() => { tooltipHovered.current = false; scheduleClose(); }} />}
  </>;
}
