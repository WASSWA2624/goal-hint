"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { paginationWindow } from "@/domain/feed-presentation";
import type { Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { paginationControlStyles } from "./pagination-styles";

type Labels = Readonly<{
  navigation: string; numbers: string; instructions: string; backward: string; forward: string;
  page: (page: number) => string; number: (page: number) => string;
}>;
type Navigation = Readonly<{ href: (page: number) => string; onPage?: never }> | Readonly<{ onPage: (page: number) => void; href?: never }>;
export type NumberedPaginationProps = Readonly<{ page: number; pages: number; labels: Labels; compact?: boolean; className?: string }> & Navigation;

export function numberedPaginationLabels(messages: Pick<Messages, "text" | "number">, navigation: string): Labels {
  return { navigation, numbers: messages.text("pagination.numbers"), instructions: messages.text("pagination.instructions"),
    backward: messages.text("pagination.scrollPrevious"), forward: messages.text("pagination.scrollNext"),
    page: (page) => messages.text("feed.pagination.pageLink", { page: messages.number(page) }), number: (page) => messages.number(page) };
}

const Frame = styled.nav<{ $compact: boolean }>`
  --pagination-min-cell: 2rem;
  --pagination-cell-height: 2rem;
  --pagination-gap: 4px;
  --pagination-cell-width: max(var(--pagination-min-cell), calc(var(--pagination-digits) * 1ch + 12px));
  --pagination-step: calc(var(--pagination-cell-width) + var(--pagination-gap));
  display: grid;
  grid-template-columns: var(--pagination-min-cell) minmax(0, 1fr) var(--pagination-min-cell);
  align-items: center;
  gap: var(--pagination-gap);
  inline-size: 100%;
  max-inline-size: 100%;
  min-inline-size: 0;
  font-size: 0.8125rem;
  > noscript { display: none; }
  ${media.desktop} {
    --pagination-min-cell: ${({ $compact }) => $compact ? "1.75rem" : "2.25rem"};
    --pagination-cell-height: var(--pagination-min-cell);
    --pagination-gap: ${({ $compact }) => $compact ? "4px" : "6px"};
    font-size: ${({ $compact }) => $compact ? "0.75rem" : "0.875rem"};
  }
`;
const ScrollButton = styled.button`${paginationControlStyles}`;
const Viewport = styled.div`
  min-inline-size: 0;
  max-inline-size: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: -3px;
  }
`;
const Numbers = styled.ol`
  display: flex;
  align-items: center;
  gap: var(--pagination-gap);
  inline-size: max-content;
  min-inline-size: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  > li { flex: 0 0 var(--pagination-cell-width); min-inline-size: 0; }
  > li[data-pagination-spacer] { block-size: 1px; }
  > li > a, > li > button { ${paginationControlStyles} }
`;

/** A real scroll rail with a bounded number of mounted links, even at the feed's 10,000-page limit. */
export function NumberedPagination({ page, pages, labels, compact = false, className, href, onPage }: NumberedPaginationProps) {
  const count = Number.isSafeInteger(pages) && pages > 0 ? pages : 0;
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), count || 1);
  const viewport = useRef<HTMLDivElement>(null), list = useRef<HTMLOListElement>(null);
  const step = useRef(36), cell = useRef(32), frame = useRef<number | null>(null), pendingFocus = useRef<number | null>(null);
  const scrollTarget = useRef<number | null>(null);
  const id = useId(), instructionsId = `${id}-instructions`;
  const [visibleRange, setVisibleRange] = useState(() => paginationWindow(count, current, 12));
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [bounds, setBounds] = useState({ backward: current > 1, forward: current < count });
  const mountedRange = visibleRange.from < 1 || visibleRange.to > count ? paginationWindow(count, current, 12) : visibleRange;

  const measure = useCallback(() => {
    const control = list.current?.querySelector<HTMLElement>("[data-pagination-page]");
    if (!control || !list.current) return;
    cell.current = control.getBoundingClientRect().width;
    // Spacers multiply the CSS flex basis before layout rounds individual cells to device fractions.
    const basis = control.parentElement ? Number.parseFloat(getComputedStyle(control.parentElement).flexBasis) : NaN;
    step.current = (Number.isFinite(basis) ? basis : cell.current) + (Number.parseFloat(getComputedStyle(list.current).columnGap) || 0);
  }, []);
  const update = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    measure();
    if (scrollTarget.current !== null && Math.abs(element.scrollLeft - scrollTarget.current) < 1) scrollTarget.current = null;
    const next = paginationWindow(count, Math.floor(element.scrollLeft / step.current) + 1,
      Math.max(1, Math.ceil(element.clientWidth / step.current)));
    setVisibleRange((previous) => previous.from === next.from && previous.to === next.to ? previous : next);
    const backward = element.scrollLeft > 1, forward = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setBounds((previous) => previous.backward === backward && previous.forward === forward ? previous : { backward, forward });
  }, [count, measure]);
  const scheduleUpdate = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { frame.current = null; update(); });
  }, [update]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const revealCurrent = () => {
      measure();
      scrollTarget.current = null;
      element.scrollTo({ left: current === count ? element.scrollWidth - element.clientWidth
        : Math.max(0, (current - 1) * step.current - (element.clientWidth - cell.current) / 2), behavior: "auto" });
      update();
    };
    revealCurrent();
    let measuredWidth = element.clientWidth, measuredStep = step.current;
    const observer = new ResizeObserver(() => {
      measure();
      // Virtual spacer rounding can change list width; recenter only when actual cell or viewport geometry changes.
      if (element.clientWidth !== measuredWidth || Math.abs(step.current - measuredStep) > 0.01) {
        measuredWidth = element.clientWidth;
        measuredStep = step.current;
        revealCurrent();
      }
    });
    observer.observe(element);
    if (list.current) observer.observe(list.current);
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [current, count, measure, update]);

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const control = list.current?.querySelector<HTMLElement>(`[data-pagination-page="${pendingFocus.current}"]`);
    if (control) { control.focus({ preventScroll: true }); pendingFocus.current = null; }
  }, [mountedRange.from, mountedRange.to]);

  const scroll = (direction: -1 | 1) => {
    const element = viewport.current;
    if (!element) return;
    measure();
    scrollTarget.current = Math.max(0, Math.min(element.scrollWidth - element.clientWidth,
      (scrollTarget.current ?? element.scrollLeft) + direction * step.current));
    element.scrollTo({ left: scrollTarget.current,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const focusPage = (target: number) => {
    const element = viewport.current;
    if (!element) return;
    scrollTarget.current = null;
    measure();
    const position = (target - 1) * step.current;
    if (position < element.scrollLeft) element.scrollTo({ left: position, behavior: "auto" });
    else if (position + cell.current > element.scrollLeft + element.clientWidth) {
      element.scrollTo({ left: position + cell.current - element.clientWidth, behavior: "auto" });
    }
    const control = list.current?.querySelector<HTMLElement>(`[data-pagination-page="${target}"]`);
    if (control) control.focus({ preventScroll: true });
    else {
      pendingFocus.current = target;
      setVisibleRange(paginationWindow(count, target, Math.max(1, Math.ceil(element.clientWidth / step.current))));
    }
    update();
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const control = (event.target as HTMLElement).closest<HTMLElement>("[data-pagination-page]");
    const focused = control ? Number(control.dataset.paginationPage) : Math.floor((viewport.current?.scrollLeft ?? 0) / step.current) + 1;
    const outsideWindow = focused < mountedRange.from || focused > mountedRange.to;
    let target: number;
    if (event.key === "Home") target = 1;
    else if (event.key === "End") target = count;
    else if (event.key === "ArrowLeft") target = Math.max(1, focused - 1);
    else if (event.key === "ArrowRight") target = Math.min(count, focused + 1);
    else if (event.key === "Tab" && control && (event.shiftKey ? (outsideWindow || focused === mountedRange.from) && focused > 1
      : (outsideWindow || focused === mountedRange.to) && focused < count)) {
      target = focused + (event.shiftKey ? -1 : 1);
    } else return;
    event.preventDefault();
    focusPage(target);
  };

  if (!count) return null;
  const numbers = Array.from({ length: mountedRange.to - mountedRange.from + 1 }, (_, index) => mountedRange.from + index);
  if (focusedPage !== null && focusedPage <= count && !numbers.includes(focusedPage)) numbers.push(focusedPage);
  numbers.sort((left, right) => left - right);
  const spacer = (amount: number, key: string) => amount > 0 ? <li key={key} role="presentation" aria-hidden="true" data-pagination-spacer
    style={{ flexBasis: `calc(var(--pagination-step) * ${amount} - var(--pagination-gap))` }} /> : null;
  return <Frame $compact={compact} className={className} aria-label={labels.navigation} data-numbered-pagination data-page-count={count}
    data-current-page={current} style={{ "--pagination-digits": String(count).length } as CSSProperties}>
    <ScrollButton type="button" onClick={() => scroll(-1)} disabled={!bounds.backward} aria-label={labels.backward} title={labels.backward}
      aria-controls={id} data-pagination-scroll="previous"><ChevronLeftIcon /></ScrollButton>
    <Viewport id={id} ref={viewport} tabIndex={0} role="group" aria-label={labels.numbers} aria-describedby={instructionsId}
      onScroll={scheduleUpdate} onKeyDown={keyboard} onPointerDown={() => { scrollTarget.current = null; }}
      onWheel={() => { scrollTarget.current = null; }} data-pagination-viewport
      onFocusCapture={(event) => {
        const control = (event.target as HTMLElement).closest<HTMLElement>("[data-pagination-page]");
        if (control) { scrollTarget.current = null; setFocusedPage(Number(control.dataset.paginationPage)); }
      }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedPage(null); }}>
      <Numbers ref={list}>
        {numbers.flatMap((number, index) => [spacer(number - (numbers[index - 1] ?? 0) - 1, `before-${number}`),
          <li key={number} value={number} aria-posinset={number} aria-setsize={count}>
          {href ? <Link href={href(number)} prefetch={false} aria-current={number === current ? "page" : undefined}
            rel={number === current - 1 ? "prev" : number === current + 1 ? "next" : undefined}
            aria-label={labels.page(number)} data-pagination-page={number}>{labels.number(number)}</Link>
            : <button type="button" onClick={() => onPage?.(number)} aria-current={number === current ? "page" : undefined}
              aria-label={labels.page(number)} data-pagination-page={number}>{labels.number(number)}</button>}
        </li>])}
        {spacer(count - numbers[numbers.length - 1]!, "after")}
      </Numbers>
    </Viewport>
    <ScrollButton type="button" onClick={() => scroll(1)} disabled={!bounds.forward} aria-label={labels.forward} title={labels.forward}
      aria-controls={id} data-pagination-scroll="next"><ChevronRightIcon /></ScrollButton>
    <VisuallyHidden id={instructionsId}>{labels.instructions}</VisuallyHidden>
    <noscript><style>{`[data-numbered-pagination]{grid-template-columns:minmax(0,1fr)}[data-numbered-pagination] [data-pagination-spacer],[data-numbered-pagination] [data-pagination-scroll]{display:none}[data-numbered-pagination] [data-pagination-viewport]{overflow:visible}[data-numbered-pagination] ol{inline-size:auto;flex-wrap:wrap}`}</style></noscript>
  </Frame>;
}
