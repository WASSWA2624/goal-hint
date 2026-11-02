"use client";

import { useId, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { desktopContentPadding, desktopSectionFrame } from "@/components/ui/layout";

/**
 * The admin "review desk": themed panels on the page colour, a main column with an optional side panel on desktop, and
 * quiet drawers for everything that is not the next decision. Every owner screen builds from these parts; screen-specific
 * pieces stay in that screen's own styles file. Owner copy is English only.
 */
/** Codes, references and one-time passwords. */
export const monoFont = 'ui-monospace, Consolas, "Courier New", monospace';

/** Hides text visually but keeps it for screen readers; for styled rules (components can use ui/visually-hidden). */
export const visuallyHidden = css`
  position: absolute;
  inline-size: var(--gh-size-0_25);
  block-size: var(--gh-size-0_25);
  min-inline-size: 0;
  min-block-size: 0;
  margin: calc(-1 * var(--gh-spacing-0_25));
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

/** Title row: the page h1, then anything that belongs beside it (status tabs, the main action). */
export const DeskHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2_5) var(--gh-spacing-5);
  min-block-size: ${({ theme }) => theme.control.minHeight};
  min-inline-size: 0;
  h1 { font-size: var(--gh-font-page); line-height: var(--gh-leading-heading); }
  ${media.desktop} { h1 { font-size: var(--gh-font-feature); } }
  ${desktopContentPadding()}
`;
/** The h1 and its one-line description. */
export const DeskTitle = styled.div`
  display: grid;
  gap: var(--gh-spacing-0_5);
  min-inline-size: 0;
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
/** Pushes the rest of the title row to the end on wide screens; wraps under the title on phones. */
export const DeskHeadEnd = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2);
  margin-inline-start: auto;
`;

/**
 * Main column plus a side panel (forms, filters, the save bar) from desktop up; one column on phones. The side track yields
 * to the main column at 1024px, where the section sidebar already takes width.
 */
export const DeskGrid = styled.div<{ $asideFirst?: boolean }>`
  display: grid;
  gap: var(--gh-spacing-4);
  align-items: start;
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  ${({ $asideFirst }) => $asideFirst && css`
    ${media.belowDesktop} { > :last-child { order: -1; } }
  `}
  ${media.desktop} { grid-template-columns: minmax(0, 1fr) min(var(--gh-size-88), max(var(--gh-size-72), 36%)); gap: var(--gh-spacing-5); }
`;
/** A stack of panels inside one column. */
export const DeskColumn = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  align-content: start;
  min-inline-size: 0;
  ${media.desktop} { gap: var(--gh-spacing-4); }
`;

export const Panel = styled.section`
  min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  ${desktopSectionFrame}
`;
/** Panel padding for content that is not a list or a drawer. */
export const PanelBody = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding: var(--gh-spacing-3_5);
  ${media.desktop} { padding: var(--gh-spacing-3_5) var(--gh-spacing-4); }
  ${desktopContentPadding(true)}
`;
/** Panel heading row: an h2 (15px) on the start side, a link or a quiet count on the end side. */
export const PanelHead = styled.div`
  background: ${({ theme }) => theme.color.surfaceMuted};
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-1) var(--gh-spacing-3);
  min-block-size: var(--gh-size-12);
  padding: var(--gh-spacing-2) var(--gh-spacing-3_5);
  border-block-end: 0;
  h2, h3 { font-size: var(--gh-font-reading); line-height: var(--gh-leading-caption); }
  ${desktopContentPadding(true)}
`;
/** Small uppercase zone name above a desk zone: PROOF, EXPECTED PAYMENT, DECISION. */
export const ZoneLabel = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: var(--gh-tracking-uppercase);
  text-transform: uppercase;
`;
/** One quiet line of facts under a heading (reference · time · status). */
export const MetaLine = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-0_5) var(--gh-spacing-2);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;

/** Label and value pairs use alternating fills for clear row tracking. */
export const FactList = styled.dl`
  display: grid;
  margin: 0;
  min-inline-size: 0;
  > div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--gh-spacing-0_5) var(--gh-spacing-3);
    min-block-size: var(--gh-size-10);
    padding-block: var(--gh-spacing-2_25);
    border-block-end: 0;
  }
  > div:nth-child(even) { background: ${({ theme }) => theme.color.surfaceMuted}; }
  > div:last-child { border-block-end: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body}; }
  dd { margin: 0; min-inline-size: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; text-align: end; overflow-wrap: break-word; }
`;

/** Metric tiles separated by spacing; two per row on phones, `$columns` from desktop up. */
export const StatGrid = styled.dl<{ $columns?: 2 | 3 | 4 }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-1_5);
  margin: 0;
  background: ${({ theme }) => theme.color.page};
  > div { display: grid; gap: var(--gh-spacing-0_5); align-content: start; min-inline-size: 0; padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5); background: ${({ theme }) => theme.color.surface}; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  dd { margin: 0; font-size: var(--gh-font-title); font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  ${media.desktop} { grid-template-columns: repeat(${({ $columns = 2 }) => $columns}, minmax(0, 1fr)); dd { font-size: var(--gh-font-heading); } }
`;

const segmentSelected = css`
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  box-shadow: none;
`;
/**
 * Joined segments for status tabs and section switches. Children are links (aria-current), tab buttons (aria-selected)
 * or toggle buttons (aria-pressed); on phones the row scrolls sideways inside itself instead of widening the page.
 */
export const Segmented = styled.div`
  display: flex;
  gap: var(--gh-spacing-1);
  max-inline-size: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  &::-webkit-scrollbar { display: none; }
  > a, > button {
    flex: 1 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--gh-spacing-1_5);
    min-block-size: var(--form-control-height);
    padding: 0 var(--gh-spacing-3);
    border: 0;
    border-inline-end: 0;
    border-radius: ${({ theme }) => theme.radius.none};
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surfaceMuted};
    font: inherit;
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    > svg { flex: none; font-size: var(--gh-font-section); }
  }
  > :last-child { border-inline-end: 0; }
  > [aria-current="page"], > [aria-selected="true"], > [aria-pressed="true"] { ${segmentSelected} }
  > a:focus-visible, > button:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
  ${media.hover} { > a:hover, > button:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { > a, > button { flex: 0 0 auto; min-block-size: var(--form-control-height); } }
`;

/**
 * A quiet drawer: a full-width summary row with a turning chevron. Put the chevron icon last in the summary; give the
 * body a `div`. `$tone="danger"` colours the summary for destructive actions. `$plain` drops the drawer's own padding and
 * divider for one that sits inside an already padded panel body or form.
 */
export const Drawer = styled.details<{ $tone?: "danger"; $plain?: boolean }>`
  min-inline-size: 0;
  border-block-end: 0;
  &:last-child { border-block-end: 0; }
  > summary {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-2);
    min-block-size: var(--form-control-height);
    padding: var(--gh-spacing-1_5) var(--gh-spacing-3_5);
    color: ${({ theme, $tone }) => $tone === "danger" ? theme.color.outcome.incorrect.text : theme.color.link};
    font-size: ${({ theme }) => theme.typography.scale.emphasis};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; font-size: var(--gh-font-section); }
    > svg:last-child { margin-inline-start: auto; transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  > div { display: grid; gap: var(--gh-spacing-3); min-inline-size: 0; padding: var(--gh-spacing-0_5) var(--gh-spacing-3_5) var(--gh-spacing-3_5); }
  @media (prefers-reduced-motion: reduce) { > summary > svg:last-child { transition: none; } }
  ${media.desktop} { > summary { padding-inline: var(--gh-spacing-4); } > div { padding-inline: var(--gh-spacing-4); } }
  ${({ $plain }) => $plain && css`
    &&, &&:last-child { border-block-end: 0; }
    && > summary { padding-inline: 0; }
    && > div { padding: var(--gh-spacing-1) 0 0; }
    ${media.desktop} { && > summary { min-block-size: var(--form-control-height); } }
  `}
`;
/** A muted note inside a drawer summary ("all 5 clear"). */
export const DrawerNote = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: var(--gh-weight-body);
`;

/** Rows inside a panel, each two lines with an optional end column; links and buttons fill the row. */
export const RowList = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  min-inline-size: 0;
  > li { min-inline-size: 0; border-block-end: 0; }
  > li:last-child { border-block-end: 0; }
`;
export const rowLayout = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--gh-spacing-0_5) var(--gh-spacing-3);
  min-block-size: var(--gh-size-14);
  padding: var(--gh-spacing-2) var(--gh-spacing-3_5);
  ${media.desktop} { padding-inline: var(--gh-spacing-4); }
`;
/** A whole-row link or button: selected rows use the brand tint, never a side stripe. */
export const rowAction = css`
  ${rowLayout}
  inline-size: 100%;
  border: 0;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  font: inherit;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
  &[aria-current="true"], &[aria-current="page"], &[aria-selected="true"] { background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;
/** First line of a row: bold title, then inline badges. */
export const RowTitle = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1) var(--gh-spacing-2);
  min-inline-size: 0;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
`;
/** Second line of a row. */
export const RowMeta = styled.span`
  display: block;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  overflow-wrap: anywhere;
`;
/** End column of a row: a right-aligned amount or time. */
export const RowEnd = styled.span`
  display: grid;
  justify-items: end;
  gap: var(--gh-spacing-0_5);
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
  text-align: end;
  white-space: nowrap;
`;

/** Search, summary and refresh above a list. */
export const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2_5) var(--gh-spacing-4);
  min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  border-block-end: 0;
  > :first-child { flex: 1 1 var(--gh-size-56); max-inline-size: var(--gh-size-112); }
`;

/** Centred placeholder for an empty side of the desk ("Select an account"). */
export const EmptyPanel = styled.div`
  display: grid;
  justify-items: center;
  gap: var(--gh-spacing-1_5);
  padding: var(--gh-spacing-10) var(--gh-spacing-5);
  color: ${({ theme }) => theme.color.mutedText};
  text-align: center;
  > svg { font-size: var(--gh-font-headline); color: ${({ theme }) => theme.color.text}; }
  strong { color: ${({ theme }) => theme.color.text}; }
  p { font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;

/**
 * Decision buttons that stay in reach on phones: the bar sticks to the bottom of the screen until its section ends.
 * From desktop up it is an ordinary row in its panel.
 */
export const StickyActions = styled.div`
  position: sticky;
  inset-block-end: 0;
  z-index: var(--gh-layer-selected);
  display: flex;
  gap: var(--gh-spacing-2);
  margin-inline: calc(-1 * var(--gh-spacing-4));
  padding: var(--gh-spacing-2_5) var(--gh-spacing-4) calc(var(--gh-spacing-2_5) + env(safe-area-inset-bottom));
  background: ${({ theme }) => theme.color.page};
  border-block-start: 0;
  > * { flex: 1 1 0; }
  ${media.desktop} { position: static; margin: 0; padding: 0; background: none; border: 0; }
`;

/** Quiet text action (Edit, Revoke, Dismiss): 44px tall on phones, link coloured, red with `$tone="danger"`. */
export const TextAction = styled.button<{ $tone?: "danger" }>`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  min-block-size: var(--form-control-height);
  padding: 0 var(--gh-spacing-1);
  border: 0;
  color: ${({ theme, $tone }) => $tone === "danger" ? theme.color.outcome.incorrect.text : theme.color.link};
  background: none;
  font: inherit;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  &:disabled { cursor: not-allowed; opacity: var(--gh-opacity-55); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  ${media.hover} { &:hover:not(:disabled) { text-decoration: underline; } }
`;

/**
 * A side-panel form or filter set: a collapsed drawer on phones, an open panel with a heading from desktop up. CSS picks the
 * form, so the server-rendered page is right at every width and nothing typed is lost when the window crosses 1024px.
 */
export function ResponsiveDrawer({ title, icon, children, defaultOpen = false, className }: {
  title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId(), titleId = useId();
  return <ResponsivePanel aria-labelledby={titleId} {...(className ? { className } : {})}>
    <ResponsiveTitle id={titleId}>{title}</ResponsiveTitle>
    <ResponsiveToggle type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
      {icon}<span>{title}</span><ChevronDownIcon />
    </ResponsiveToggle>
    <ResponsiveBody id={bodyId} data-open={open}>{children}</ResponsiveBody>
  </ResponsivePanel>;
}
const ResponsivePanel = styled(Panel)``;
const ResponsiveTitle = styled.h2`
  display: none;
  ${media.desktop} {
    display: flex;
    align-items: center;
    min-block-size: var(--gh-size-12);
    padding: var(--gh-spacing-2) var(--gh-spacing-4);
    border-block-end: 0;
    font-size: var(--gh-font-reading);
    line-height: var(--gh-leading-caption);
  }
`;
const ResponsiveToggle = styled.button`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-2);
  inline-size: 100%;
  min-block-size: var(--form-control-height);
  padding: 0 var(--gh-spacing-3_5);
  border: 0;
  color: ${({ theme }) => theme.color.link};
  background: none;
  font: inherit;
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-align: start;
  cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  > svg:last-child { margin-inline-start: auto; transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
  &[aria-expanded="true"] > svg:last-child { transform: rotate(180deg); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
  @media (prefers-reduced-motion: reduce) { > svg:last-child { transition: none; } }
  ${media.desktop} { display: none; }
`;
const ResponsiveBody = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding: var(--gh-spacing-3_5);
  ${media.belowDesktop} {
    border-block-start: 0;
    &[data-open="false"] { display: none; }
  }
  ${media.desktop} { padding: var(--gh-spacing-3_5) var(--gh-spacing-4) var(--gh-spacing-4); }
`;
