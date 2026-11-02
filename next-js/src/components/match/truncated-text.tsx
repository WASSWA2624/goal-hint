"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styled, { css, useTheme } from "styled-components";
import Link from "@/components/navigation/navigation-link";

const textControlStyles = css`
  display: block; min-inline-size: 0; min-block-size: 0; max-inline-size: 100%; padding: 0; margin: 0;
  border: 0; background: none; color: inherit; font: inherit; line-height: inherit; text-align: start;
  cursor: default;
  &[tabindex="0"] { cursor: help; }
  > [data-ellipsis-text] { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;
const StaticText = styled.span`${textControlStyles}`;
const TextControl = styled.button`${textControlStyles}`;
const TextLink = styled(Link)`
  ${textControlStyles}
  text-decoration: none;
  && { cursor: pointer; }
`;

const Tooltip = styled.span`
  position: fixed; z-index: var(--gh-layer-notification); inline-size: max-content; max-inline-size: min(var(--gh-size-140), calc(100vw - var(--gh-size-4)));
  padding: var(--gh-spacing-1_5) var(--gh-spacing-2); border: 0; border-radius: ${({ theme }) => theme.radius.overlay};
  color: ${({ theme }) => theme.color.surface}; background: ${({ theme }) => theme.color.text};
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal); white-space: normal; overflow-wrap: anywhere;
`;

function FullTextTooltip({ id, text, anchor, onEnter, onLeave }: {
  id: string; text: string; anchor: RefObject<HTMLElement | null>; onEnter: () => void; onLeave: () => void;
}) {
  const metrics = useTheme().ui.tooltip;
  const tip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: metrics.edge, top: metrics.edge });
  useLayoutEffect(() => {
    const trigger = anchor.current?.getBoundingClientRect(), bubble = tip.current?.getBoundingClientRect();
    if (!trigger || !bubble) return;
    setPosition({
      left: Math.max(metrics.edge, Math.min(trigger.left, window.innerWidth - bubble.width - metrics.edge)),
      top: trigger.bottom + bubble.height + metrics.clearance <= window.innerHeight ? trigger.bottom + metrics.gap
        : Math.max(metrics.edge, trigger.top - bubble.height - metrics.gap),
    });
  }, [anchor, text, metrics]);
  return createPortal(<Tooltip ref={tip} id={id} role="tooltip" style={position} onMouseEnter={onEnter} onMouseLeave={onLeave}>{text}</Tooltip>, document.body);
}

/** Only clipped names enter the tab order; their full text stays in the DOM and is visible on focus or hover. */
export function TruncatedText({ text, href, interactive = true }: { text: string; href?: string | undefined; interactive?: boolean }) {
  const trigger = useRef<HTMLButtonElement | HTMLAnchorElement>(null), label = useRef<HTMLSpanElement>(null), id = useId();
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
  }, [text, href]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [open]);
  const controlProps = {
    "data-truncation": "", "data-full-text": text, title: "", tabIndex: truncated ? 0 : -1,
    "aria-label": text, "aria-describedby": open ? id : undefined, onFocus: show, onBlur: scheduleClose,
    onMouseEnter: () => { hovered.current = true; show(); },
    onMouseLeave: () => { hovered.current = false; scheduleClose(); },
  };
  const content = <span ref={label} data-ellipsis-text title="">{text}</span>;
  if (!interactive) return <StaticText data-truncation title={text}>{content}</StaticText>;
  return <>
    {href ? <TextLink {...controlProps} ref={(element) => { trigger.current = element; }} href={href} prefetch={false}
      data-match-link-alias>{content}</TextLink>
      : <TextControl {...controlProps} ref={(element) => { trigger.current = element; }} type="button" onClick={show}>{content}</TextControl>}
    {open && <FullTextTooltip id={id} text={text} anchor={trigger}
      onEnter={() => { tooltipHovered.current = true; cancelClose(); }} onLeave={() => { tooltipHovered.current = false; scheduleClose(); }} />}
  </>;
}
