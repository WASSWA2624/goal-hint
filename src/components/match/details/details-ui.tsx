"use client";

import { createContext, useContext, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import styled, { css, type DefaultTheme } from "styled-components";
import { ChevronRightIcon } from "@/components/ui/icons";
import { TeamLogo } from "@/components/match/team-row";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { paginationItems } from "@/domain/feed-presentation";
import type { FormLetter } from "@/domain/match-details";
import type { MatchDetailResponse } from "@/domain/match-detail";
import type { InsightsPreview } from "@/domain/match-insights";
import { defaultMatchView, type MatchView } from "@/domain/match-view";
import { createMessages } from "@/i18n/messages";
import { media, type AccentName } from "@/styles/theme";
import type { ViewNavigation, ViewUpdate } from "./use-match-view";

export type Messages = ReturnType<typeof createMessages>;
/** Values that change only with the data, never with the view. */
export type StableDetails = Readonly<{
  data: MatchDetailResponse; preview: InsightsPreview | null; locale: string; messages: Messages;
  go: (next: MatchView, mode?: ViewNavigation) => void; update: ViewUpdate;
  home: string; away: string; fixtureId: string; history: ReactNode;
}>;
export type DetailsContextValue = StableDetails & Readonly<{ view: MatchView }>;
const DetailsContext = createContext<StableDetails | null>(null);
export const DetailsProvider = DetailsContext.Provider;
/** The view as one card sees it; closed cards receive a value that only changes with the open section. */
const ViewContext = createContext<MatchView>(defaultMatchView);
export const ViewProvider = ViewContext.Provider;
/** For components that read no view: they skip every view-only change. Handlers use `update`. */
export function useStableDetails(): StableDetails {
  const value = useContext(DetailsContext);
  if (!value) throw new Error("Match details context is missing.");
  return value;
}
export function useDetails(): DetailsContextValue {
  return { ...useStableDetails(), view: useContext(ViewContext) };
}

export const desktop = media.desktop;
/** One step of the compact type scale (theme.typography.scale). */
export const size = (step: keyof DefaultTheme["typography"]["scale"]) => ({ theme }: { theme: DefaultTheme }) => theme.typography.scale[step];
export const focusRing = css`
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
/** Focus targets clear the sticky desktop header and the phone tab bar. */
export const scrollClearance = css`
  scroll-margin-block: 0.75rem 4.5rem;
  ${media.desktop} { scroll-margin-block: 5rem 1rem; }
`;

/** Compact card; open sections widen to the full content width. */
export const Card = styled.section<{ $open?: boolean; $accent?: AccentName }>`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 8px;
  min-inline-size: 0;
  padding: 9px 8px 10px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme, $open, $accent = "blue" }) => $open ? theme.color.accent[$accent].solid : theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme, $open }) => $open ? theme.shadow.cardHover : theme.shadow.card};
  container: details-card / inline-size;
  ${scrollClearance}
  ${desktop} { padding: 11px 14px 12px; gap: 10px; }
`;

const HeadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  > h2 { flex: 1; min-inline-size: 0; margin: 0; font-size: inherit; }
`;
/** Two-up phone cards leave the title about 6rem: titles wrap between words, in balanced lines. */
const HeadButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  inline-size: 100%;
  min-block-size: 1.875rem;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  > span[data-title] {
    min-inline-size: 0;
    font-size: ${size("body")};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: 1.15;
    ${media.belowDesktop} { overflow-wrap: normal; text-wrap: balance; }
    ${desktop} { font-size: 1rem; line-height: 1.2; }
  }
  > small { min-inline-size: 0; overflow: hidden; color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; white-space: nowrap; text-overflow: ellipsis; ${desktop} { font-size: ${size("secondary")}; } }
  @container details-card (max-width: 16rem) { > small { display: none; } }
  > svg:last-child { flex: none; margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("secondary")}; transition: transform 160ms ease; }
  &[aria-expanded="true"] > svg:last-child { transform: rotate(90deg); color: ${({ theme }) => theme.color.accent.blue.solid}; }
  ${media.hover} { &:hover > span[data-title] { color: ${({ theme }) => theme.color.accent.blue.text}; } }
  ${desktop} { gap: 8px; > svg:last-child { font-size: 0.9375rem; } }
  @media (prefers-reduced-motion: reduce) { > svg:last-child { transition: none; } }
`;
export const IconBadge = styled.span<{ $accent: AccentName }>`
  display: inline-grid;
  flex: none;
  place-items: center;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  color: ${({ theme, $accent }) => theme.color.accent[$accent].solid};
  background: ${({ theme, $accent }) => theme.color.accent[$accent].soft};
  border-radius: 4px;
  font-size: ${size("secondary")};
  ${desktop} { inline-size: 1.625rem; block-size: 1.625rem; font-size: 0.9375rem; }
`;

/** The section heading is a disclosure button; extra header controls sit beside it, never inside. */
export function CardHeader({ icon, accent, title, meta, open, controls, onToggle, headingId, buttonRef, children }: {
  icon: ReactNode; accent: AccentName; title: string; meta?: string | null | undefined; open: boolean; controls: string; onToggle: () => void;
  headingId: string; buttonRef?: Ref<HTMLButtonElement>; children?: ReactNode;
}) {
  return <HeadRow>
    <h2 id={headingId}>
      <HeadButton ref={buttonRef} type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
        <IconBadge $accent={accent}>{icon}</IconBadge><span data-title>{title}</span>{meta && <small>{meta}</small>}<ChevronRightIcon />
      </HeadButton>
    </h2>
    {children}
  </HeadRow>;
}

/** Clicking anywhere on a preview opens its section; keyboard users use the heading or View all buttons. */
export const PreviewArea = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  min-inline-size: 0;
  cursor: pointer;
  border-radius: 3px;
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
`;

/** Text-like action; its arrow icon flows with the last line of wrapped text. */
export const LinkButton = styled.button`
  display: inline;
  justify-self: start;
  text-align: start;
  min-block-size: 1.5rem;
  padding: 0;
  color: ${({ theme }) => theme.color.accent.blue.solid};
  background: none;
  border: 0;
  font: inherit;
  font-size: ${size("secondary")};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  > svg { margin-inline-start: 4px; font-size: ${size("emphasis")}; vertical-align: -0.15em; }
  ${media.hover} { &:hover { text-decoration: underline; } }
  ${focusRing}
`;

export const Breadcrumb = styled.nav`
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${size("caption")};
  > ol { display: flex; flex-wrap: wrap; gap: 2px 6px; margin: 0; padding: 0; list-style: none; }
  > ol > li { display: inline-flex; gap: 6px; min-inline-size: 0; }
  > ol > li + li::before { content: "/"; color: ${({ theme }) => theme.color.border}; }
  button { padding: 0; color: ${({ theme }) => theme.color.accent.blue.solid}; background: none; border: 0; font: inherit; cursor: pointer; ${focusRing} }
  [aria-current] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
  ${desktop} { font-size: ${size("secondary")}; }
`;
export function Crumbs({ items }: { items: readonly { label: string; onSelect?: () => void }[] }) {
  const { messages } = useStableDetails();
  return <Breadcrumb aria-label={messages.text("details.breadcrumb")}>
    <ol>{items.map((item, index) => <li key={index}>
      {item.onSelect ? <button type="button" onClick={item.onSelect}>{item.label}</button> : <span aria-current="location">{item.label}</span>}
    </li>)}</ol>
  </Breadcrumb>;
}

/** Heading of an opened panel; receives focus when the panel opens. */
export const PanelHeading = styled.h3`
  margin: 0;
  font-size: ${size("emphasis")};
  line-height: 1.25;
  outline: none;
  overflow-wrap: anywhere;
  ${scrollClearance}
  ${desktop} { font-size: 1.0625rem; }
`;
/** Focus target for an opened section whose visible title is already the card heading. */
export const HiddenHeading = styled.h3`
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  outline: none;
`;
export const Panel = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  min-inline-size: 0;
  padding-block-start: 8px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
`;
export const PanelBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  min-inline-size: 0;
`;

/** Filter choices: real buttons with pressed state, scrolling inside their own row when long. */
export const Choices = styled.div`
  display: flex;
  gap: 4px;
  min-inline-size: 0;
  max-inline-size: 100%;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  > button {
    flex: none;
    min-block-size: 1.625rem;
    padding-inline: 9px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surfaceMuted};
    border: ${({ theme }) => theme.border.width} solid transparent;
    border-radius: 4px;
    font: inherit;
    font-size: ${size("caption")};
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    cursor: pointer;
    ${focusRing}
    ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.border}; } }
    &[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.accent.blue.solid}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
    ${desktop} { font-size: ${size("secondary")}; }
  }
`;
export function ChoiceGroup<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <Choices role="group" aria-label={label}>
    {options.map((option) => <button key={String(option.value)} type="button" aria-pressed={option.value === value}
      onClick={() => { if (option.value !== value) onChange(option.value); }}>{option.label}</button>)}
  </Choices>;
}

export const Note = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${size("secondary")};
  line-height: 1.45;
  ${desktop} { font-size: ${size("body")}; }
`;
export const Strong = styled.strong`font-weight: ${({ theme }) => theme.typography.weight.bold};`;

/** Section-level loading and failure; the preview above stays visible and only this section retries. */
export function SectionState({ loading, error, onRetry }: { loading: boolean; error: boolean; onRetry: () => void }) {
  const { messages } = useStableDetails();
  if (error) return <Note role="alert">{messages.text("details.sectionFailed")}{" "}
    <LinkButton type="button" onClick={onRetry}>{messages.text("feed.retry")}</LinkButton></Note>;
  return loading ? <Note role="status">{messages.text("details.sectionLoading")}</Note> : null;
}

/** The fill width is a custom property, so every value shares one class per accent and direction. */
const Track = styled.span<{ $accent?: AccentName; $reverse?: boolean }>`
  position: relative;
  display: block;
  flex: 1;
  min-inline-size: 2rem;
  block-size: 6px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: 3px;
  &::after {
    content: "";
    position: absolute;
    inset-block: 0;
    ${({ $reverse }) => $reverse ? "inset-inline-end: 0;" : "inset-inline-start: 0;"}
    inline-size: calc(var(--track, 0) * 100%);
    background: ${({ theme, $accent = "orange" }) => theme.color.accent[$accent].gradient};
    border-radius: 3px;
  }
`;
/** A probability or comparison bar; `value` is clamped to 0–1. */
export function Bar({ value, style, ...rest }: { value: number; $accent?: AccentName; $reverse?: boolean } & HTMLAttributes<HTMLSpanElement>) {
  return <Track {...rest} style={{ ...style, "--track": Math.max(0, Math.min(1, value)) } as CSSProperties} />;
}

const LetterChip = styled.abbr<{ $letter: FormLetter }>`
  display: inline-grid;
  place-items: center;
  inline-size: 1.125rem;
  block-size: 1.125rem;
  color: ${({ theme, $letter }) => $letter === "D" ? theme.color.text : theme.color.onBrand};
  background: ${({ theme, $letter }) => $letter === "W" ? theme.color.accent.emerald.solid : $letter === "L" ? theme.color.accent.red.solid : theme.color.border};
  border-radius: 50%;
  font-size: ${size("micro")};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  cursor: default;
`;
const Letters = styled.span`display: inline-flex; flex-wrap: wrap; gap: 3px;`;
/** W/D/L letters, oldest first, with full words for assistive technology. */
export function FormLetters({ letters, label }: { letters: readonly FormLetter[]; label: string }) {
  const { messages } = useStableDetails();
  if (letters.length === 0) return <Note>{messages.text("details.noResults")}</Note>;
  return <Letters role="img" aria-label={`${label}: ${letters.map((letter) => messages.text(`details.result.${letter}`)).join(", ")}`}>
    {letters.map((letter, index) => <LetterChip key={index} $letter={letter} title={messages.text(`details.result.${letter}`)} aria-hidden="true">{letter}</LetterChip>)}
  </Letters>;
}

const CrestBox = styled.span<{ $size: number }>`
  --gh-logo-size: ${({ $size }) => `${$size}px`};
  --gh-logo-font: ${({ $size }) => `${Math.max(9, Math.round($size / 2.6))}px`};
  --gh-logo-radius: 50%;
  display: inline-flex;
  flex: none;
`;
export function Crest({ name, url, size = 20, eager = false }: { name: string | null; url: string | null | undefined; size?: number; eager?: boolean }) {
  return <CrestBox $size={size}><TeamLogo name={name} url={url ?? undefined} eager={eager} /></CrestBox>;
}

const PagerList = styled.ol`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1.75rem);
  justify-content: start;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  > li > button, > li > span {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 1.75rem;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 4px;
    font: inherit;
    font-size: ${size("secondary")};
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    ${focusRing}
  }
  > li > button[aria-current="page"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.accent.blue.solid}; border-color: transparent; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > li > span { border: 0; color: ${({ theme }) => theme.color.mutedText}; cursor: default; }
  > li > button:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
`;
/** Every page of a section's complete collection; the URL keeps the page for Back and refresh. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const { messages } = useStableDetails();
  if (pages <= 1) return null;
  return <nav aria-label={messages.text("details.pages")}>
    <PagerList>
      <li><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={messages.text("feed.pagination.previous")}>‹</button></li>
      {paginationItems(page, pages).map((item) => item.kind === "gap" ? <li key={item.key}><span aria-hidden="true">…</span></li>
        : <li key={item.page}><button type="button" aria-current={item.current ? "page" : undefined} onClick={() => onPage(item.page)}
          aria-label={messages.text("feed.pagination.pageLink", { page: messages.number(item.page) })}>{messages.number(item.page)}</button></li>)}
      <li><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={messages.text("feed.pagination.next")}>›</button></li>
    </PagerList>
  </nav>;
}

/** Rows that open nested panels are buttons laid out as compact grids. */
export const RowList = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  > li + li { border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
`;
export const RowButton = styled.button`
  display: grid;
  align-items: center;
  gap: 6px;
  inline-size: 100%;
  min-block-size: 2.125rem;
  padding: 4px 4px;
  color: ${({ theme }) => theme.color.text};
  background: none;
  border: 0;
  font: inherit;
  font-size: ${size("secondary")};
  text-align: start;
  cursor: pointer;
  ${focusRing}
  ${scrollClearance}
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  > * { min-inline-size: 0; }
  ${desktop} { font-size: ${size("body")}; }
`;

export const Pill = styled.span<{ $accent?: AccentName; $solid?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-self: start;
  max-inline-size: 100%;
  padding: 1px 7px;
  overflow: hidden;
  color: ${({ theme, $accent = "blue", $solid }) => $solid ? theme.color.onBrand : theme.color.accent[$accent].text};
  background: ${({ theme, $accent = "blue", $solid }) => $solid ? theme.color.accent[$accent].solid : theme.color.accent[$accent].soft};
  border-radius: 4px;
  font-size: ${size("caption")};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
  ${desktop} { font-size: ${size("secondary")}; }
`;

const factColumns = css`
  grid-template-columns: fit-content(40%) minmax(0, 1fr);
  gap: 4px 12px;
  > dt { font-size: inherit; }
  > dd { margin: 0; }
`;
/** Definition rows for facts with their own label; missing values say so explicitly. Label and value
 * sit side by side from 20rem, or 18rem below desktop (a full-width card on a 360px phone). */
export const Facts = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 12px;
  margin: 0;
  font-size: ${size("secondary")};
  > dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; }
  > dd { margin: 0 0 4px; min-inline-size: 0; overflow-wrap: anywhere; }
  ${media.belowDesktop} { @container details-card (min-width: 18rem) { ${factColumns} } }
  @container details-card (min-width: 20rem) { ${factColumns} }
  ${desktop} { font-size: ${size("body")}; }
`;

type PendingReveal = { restoration: ScrollRestoration; timer?: number; show?: (() => void) | undefined };
/** Focus and reveal an opened panel; on close, return focus to whatever opened it. */
export function useRevealOnOpen<T extends HTMLElement>(open: boolean, key: string | null, reveal: "card" | "self" = "self") {
  const target = useRef<T>(null), previous = useRef<string | null>(null), first = useRef(true);
  useEffect(() => {
    const current = open ? key : null;
    // A deep-link reveal still waiting for `load` when the panel closes or the page leaves.
    let pending: PendingReveal | null = null;
    if (current !== null && current !== previous.current && target.current) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.current.focus({ preventScroll: true });
      const element = reveal === "card" ? target.current.closest<HTMLElement>("[data-section]") ?? target.current : target.current;
      const initial = first.current;
      const scroll = () => element.scrollIntoView({ block: "start", behavior: reduce || initial ? "auto" : "smooth" });
      if (!initial) scroll();
      else {
        // A deep link wins over the browser restoring this URL's previous scroll position, once.
        const waiting: PendingReveal = { restoration: window.history.scrollRestoration };
        pending = waiting;
        window.history.scrollRestoration = "manual";
        const show = () => {
          waiting.show = undefined;
          waiting.timer = window.setTimeout(() => { scroll(); window.history.scrollRestoration = waiting.restoration; pending = null; }, 60);
        };
        if (document.readyState === "complete") show(); else { waiting.show = show; window.addEventListener("load", show, { once: true }); }
      }
    }
    previous.current = current; first.current = false;
    return () => {
      if (!pending) return;
      if (pending.show) window.removeEventListener("load", pending.show);
      window.clearTimeout(pending.timer);
      window.history.scrollRestoration = pending.restoration;
      // A re-run (Strict Mode, or the same panel reopening) schedules the reveal again.
      previous.current = null; first.current = true;
    };
  }, [key, open, reveal]);
  return target;
}

export function Hidden({ children }: { children: ReactNode }) {
  return <VisuallyHidden>{children}</VisuallyHidden>;
}
