"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronLeftIcon, ChevronRightIcon, FirstPageIcon, LastPageIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { paginationWindow } from "@/domain/feed-presentation";
import type { Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { paginationControlStyles } from "./pagination-styles";

type Labels = Readonly<{
  navigation: string; numbers: string; instructions: string; backward: string; forward: string; first: string; last: string;
  page: (page: number) => string; number: (page: number) => string;
}>;
type Navigation = Readonly<{ href: (page: number) => string; onPage?: never }> | Readonly<{ onPage: (page: number) => void; href?: never }>;
export type NumberedPaginationProps = Readonly<{ page: number; pages: number; labels: Labels; compact?: boolean; className?: string; disabled?: boolean }> & Navigation;
type HoldInput = { button: HTMLButtonElement; direction: -1 | 1 } &
  ({ kind: "pointer"; pointer: number } | { kind: "keyboard"; key: "Enter" | " " });
type ScrollHold = HoldInput & { previousTime: number | null; moved: boolean };

export function numberedPaginationLabels(messages: Pick<Messages, "text" | "number">, navigation: string): Labels {
  return { navigation, numbers: messages.text("pagination.numbers"), instructions: messages.text("pagination.instructions"),
    backward: messages.text("pagination.scrollPrevious"), forward: messages.text("pagination.scrollNext"),
    first: messages.text("pagination.firstPage"), last: messages.text("pagination.lastPage"),
    page: (page) => messages.text("feed.pagination.pageLink", { page: messages.number(page) }), number: (page) => messages.number(page) };
}

const Frame = styled.nav<{ $compact: boolean }>`
  --pagination-min-cell: 2rem;
  --pagination-cell-height: 2rem;
  --pagination-gap: 4px;
  --pagination-cell-width: max(var(--pagination-min-cell), calc(var(--pagination-digits) * 1ch + 12px));
  --pagination-step: calc(var(--pagination-cell-width) + var(--pagination-gap));
  display: grid;
  /* First page, scroll back, the number rail, scroll forward, last page. */
  grid-template-columns: var(--pagination-min-cell) var(--pagination-min-cell) minmax(0, 1fr) var(--pagination-min-cell) var(--pagination-min-cell);
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
const ScrollButton = styled.button`
  ${paginationControlStyles}
  touch-action: none;
  user-select: none;
`;
/** First and last page jumps at the outer ends: links in the feed, buttons where pages change in place. */
const EndLink = styled(Link)`${paginationControlStyles}`;
const EndButton = styled.button`${paginationControlStyles}`;

function EndControl({ target, current, label, icon, href, onPage, disabled }: Readonly<{
  target: number; current: number; label: string; icon: ReactNode;
  href?: ((page: number) => string) | undefined; onPage?: ((page: number) => void) | undefined; disabled: boolean;
}>) {
  const end = target === 1 ? "first" : "last";
  // Already on that page: a disabled control keeps the layout and is skipped by Tab.
  if (disabled || target === current) return <EndButton type="button" disabled aria-label={label} title={label} data-pagination-end={end}>{icon}</EndButton>;
  return href
    ? <EndLink href={href(target)} prefetch={false} aria-label={label} title={label} data-pagination-end={end}>{icon}</EndLink>
    : <EndButton type="button" onClick={() => onPage?.(target)} aria-label={label} title={label} data-pagination-end={end}>{icon}</EndButton>;
}
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
export function NumberedPagination({ page, pages, labels, compact = false, className, disabled = false, href, onPage }: NumberedPaginationProps) {
  const count = Number.isSafeInteger(pages) && pages > 0 ? pages : 0;
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), count || 1);
  const viewport = useRef<HTMLDivElement>(null), list = useRef<HTMLOListElement>(null);
  const step = useRef(36), cell = useRef(32), frame = useRef<number | null>(null), pendingFocus = useRef<number | null>(null);
  const scrollTarget = useRef<number | null>(null);
  const holdFrame = useRef<number | null>(null), holdDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<ScrollHold | null>(null);
  const suppressClick = useRef(false);
  const id = useId(), instructionsId = `${id}-instructions`;
  const [visibleRange, setVisibleRange] = useState(() => paginationWindow(count, current, 12));
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [bounds, setBounds] = useState({ backward: current > 1, forward: current < count });
  const mountedRange = visibleRange.from < 1 || visibleRange.to > count ? paginationWindow(count, current, 12) : visibleRange;

  const stopHold = useCallback(() => {
    if (holdDelay.current !== null) { clearTimeout(holdDelay.current); holdDelay.current = null; }
    if (holdFrame.current !== null) { cancelAnimationFrame(holdFrame.current); holdFrame.current = null; }
    const active = held.current;
    held.current = null;
    if (!active) return;
    // A held pointer has already scrolled; its release must not add a normal click step.
    suppressClick.current = active.kind === "pointer" && active.moved;
    if (active.kind === "pointer" && active.button.hasPointerCapture(active.pointer)) active.button.releasePointerCapture(active.pointer);
  }, []);
  const repeatHold = useCallback(function repeat(time: number) {
    const active = held.current, element = viewport.current;
    if (!active || !element) return;
    const elapsed = active.previousTime === null ? 0 : Math.min(time - active.previousTime, 50);
    active.previousTime = time;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    const next = Math.max(0, Math.min(maximum, element.scrollLeft + active.direction * step.current * 6 * elapsed / 1000));
    if (elapsed > 0) {
      scrollTarget.current = null;
      if (Math.abs(next - element.scrollLeft) < 0.01) { stopHold(); return; }
      active.moved = true;
      // Press-controlled motion advances directly, without queuing smooth animations after release.
      element.scrollTo({ left: next, behavior: "instant" });
    }
    holdFrame.current = requestAnimationFrame(repeat);
  }, [stopHold]);
  const beginHold = (input: HoldInput) => {
    stopHold();
    suppressClick.current = false;
    if (input.kind === "pointer") input.button.setPointerCapture(input.pointer);
    held.current = { ...input, previousTime: null, moved: false };
    holdDelay.current = setTimeout(() => { holdDelay.current = null; holdFrame.current = requestAnimationFrame(repeatHold); }, 350);
  };
  const startHold = (event: PointerEvent<HTMLButtonElement>, direction: -1 | 1) => {
    if (event.isPrimary && event.button === 0) beginHold({ kind: "pointer", pointer: event.pointerId, button: event.currentTarget, direction });
  };
  const endHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (held.current?.kind === "pointer" && held.current.pointer === event.pointerId && held.current.button === event.currentTarget) stopHold();
  };
  const blurHold = (event: FocusEvent<HTMLButtonElement>) => {
    // Pointerdown precedes focus transfer: blurring the other arrow must not cancel a new hold.
    if (held.current?.button === event.currentTarget) stopHold();
  };

  useEffect(() => {
    const hidden = () => { if (document.hidden) stopHold(); };
    window.addEventListener("blur", stopHold);
    document.addEventListener("visibilitychange", hidden);
    return () => { stopHold(); window.removeEventListener("blur", stopHold); document.removeEventListener("visibilitychange", hidden); };
  }, [stopHold]);

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
      stopHold();
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
  }, [current, count, measure, update, stopHold]);

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
  const clickScroll = (direction: -1 | 1, detail: number) => {
    if (detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
    scroll(direction);
  };
  const keyDownHold = (event: KeyboardEvent<HTMLButtonElement>, direction: -1 | 1) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Browser key repeat and the native release click would otherwise scroll twice.
    event.preventDefault();
    if (event.repeat) return;
    beginHold({ kind: "keyboard", key: event.key, button: event.currentTarget, direction });
  };
  const keyUpHold = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const active = held.current;
    if (active?.kind !== "keyboard" || active.key !== event.key || active.button !== event.currentTarget) return;
    stopHold();
    if (!active.moved) scroll(active.direction);
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
    data-current-page={current} aria-busy={disabled || undefined} style={{ "--pagination-digits": String(count).length } as CSSProperties}>
    <EndControl target={1} current={current} label={labels.first} icon={<FirstPageIcon />} href={href} onPage={onPage} disabled={disabled} />
    <ScrollButton type="button" onClick={(event) => clickScroll(-1, event.detail)} disabled={!bounds.backward} aria-label={labels.backward} title={labels.backward}
      onPointerDown={(event) => startHold(event, -1)} onPointerUp={endHold} onPointerCancel={endHold} onLostPointerCapture={endHold}
      onKeyDown={(event) => keyDownHold(event, -1)} onKeyUp={keyUpHold}
      onBlur={blurHold} onContextMenu={(event) => { if (held.current) event.preventDefault(); }}
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
          {href && !disabled ? <Link href={href(number)} prefetch={false} aria-current={number === current ? "page" : undefined}
            rel={number === current - 1 ? "prev" : number === current + 1 ? "next" : undefined}
            aria-label={labels.page(number)} data-pagination-page={number}>{labels.number(number)}</Link>
            : <button type="button" disabled={disabled} onClick={() => onPage?.(number)} aria-current={number === current ? "page" : undefined}
              aria-label={labels.page(number)} data-pagination-page={number}>{labels.number(number)}</button>}
        </li>])}
        {spacer(count - numbers[numbers.length - 1]!, "after")}
      </Numbers>
    </Viewport>
    <ScrollButton type="button" onClick={(event) => clickScroll(1, event.detail)} disabled={!bounds.forward} aria-label={labels.forward} title={labels.forward}
      onPointerDown={(event) => startHold(event, 1)} onPointerUp={endHold} onPointerCancel={endHold} onLostPointerCapture={endHold}
      onKeyDown={(event) => keyDownHold(event, 1)} onKeyUp={keyUpHold}
      onBlur={blurHold} onContextMenu={(event) => { if (held.current) event.preventDefault(); }}
      aria-controls={id} data-pagination-scroll="next"><ChevronRightIcon /></ScrollButton>
    <EndControl target={count} current={current} label={labels.last} icon={<LastPageIcon />} href={href} onPage={onPage} disabled={disabled} />
    <VisuallyHidden id={instructionsId}>{labels.instructions}</VisuallyHidden>
    <noscript><style>{`[data-numbered-pagination]{grid-template-columns:var(--pagination-min-cell) minmax(0,1fr) var(--pagination-min-cell)}[data-numbered-pagination] [data-pagination-spacer],[data-numbered-pagination] [data-pagination-scroll]{display:none}[data-numbered-pagination] [data-pagination-viewport]{overflow:visible}[data-numbered-pagination] ol{inline-size:auto;flex-wrap:wrap}`}</style></noscript>
  </Frame>;
}
