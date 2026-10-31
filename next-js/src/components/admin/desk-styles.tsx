"use client";

import { useId, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { desktopSectionFrame } from "@/components/ui/layout";

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
  inline-size: 1px;
  block-size: 1px;
  min-inline-size: 0;
  min-block-size: 0;
  margin: -1px;
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
  gap: 10px 20px;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  min-inline-size: 0;
  h1 { font-size: 1.375rem; line-height: 1.25; }
  ${media.desktop} { padding-inline: 16px; h1 { font-size: 1.625rem; } }
`;
/** The h1 and its one-line description. */
export const DeskTitle = styled.div`
  display: grid;
  gap: 2px;
  min-inline-size: 0;
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
/** Pushes the rest of the title row to the end on wide screens; wraps under the title on phones. */
export const DeskHeadEnd = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
`;

/**
 * Main column plus a side panel (forms, filters, the save bar) from desktop up; one column on phones. The side track yields
 * to the main column at 1024px, where the section sidebar already takes width.
 */
export const DeskGrid = styled.div<{ $asideFirst?: boolean }>`
  display: grid;
  gap: 16px;
  align-items: start;
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  ${({ $asideFirst }) => $asideFirst && css`
    ${media.belowDesktop} { > :last-child { order: -1; } }
  `}
  ${media.desktop} { grid-template-columns: minmax(0, 1fr) min(22rem, max(18rem, 36%)); gap: 20px; }
`;
/** A stack of panels inside one column. */
export const DeskColumn = styled.div`
  display: grid;
  gap: 12px;
  align-content: start;
  min-inline-size: 0;
  ${media.desktop} { gap: 16px; }
`;

export const Panel = styled.section`
  min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.surface};
  ${desktopSectionFrame}
`;
/** Panel padding for content that is not a list or a drawer. */
export const PanelBody = styled.div`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  padding: 14px;
  ${media.desktop} { padding: 14px 16px; }
`;
/** Panel heading row: an h2 (15px) on the start side, a link or a quiet count on the end side. */
export const PanelHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  min-block-size: 48px;
  padding: 8px 14px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  h2, h3 { font-size: 0.9375rem; line-height: 1.35; }
  ${media.desktop} { padding-inline: 16px; }
`;
/** Small uppercase zone name above a desk zone: PROOF, EXPECTED PAYMENT, DECISION. */
export const ZoneLabel = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;
/** One quiet line of facts under a heading (reference · time · status). */
export const MetaLine = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;

/** Label on the start side, value on the end side, one fact per row with hairline dividers. */
export const FactList = styled.dl`
  display: grid;
  margin: 0;
  min-inline-size: 0;
  > div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 12px;
    min-block-size: 40px;
    padding-block: 9px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  }
  > div:last-child { border-block-end: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body}; }
  dd { margin: 0; min-inline-size: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; text-align: end; overflow-wrap: break-word; }
`;

/** Metric tiles separated by hairlines; two per row on phones, `$columns` from desktop up. */
export const StatGrid = styled.dl<{ $columns?: 2 | 3 | 4 }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.border.width};
  margin: 0;
  background: ${({ theme }) => theme.color.border};
  > div { display: grid; gap: 2px; align-content: start; min-inline-size: 0; padding: 10px 14px; background: ${({ theme }) => theme.color.surface}; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  dd { margin: 0; font-size: 1.125rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  ${media.desktop} { grid-template-columns: repeat(${({ $columns = 2 }) => $columns}, minmax(0, 1fr)); dd { font-size: 1.25rem; } }
`;

const segmentSelected = css`
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  box-shadow: inset 0 -2px ${({ theme }) => theme.color.brand};
`;
/**
 * Joined segments for status tabs and section switches. Children are links (aria-current), tab buttons (aria-selected)
 * or toggle buttons (aria-pressed); on phones the row scrolls sideways inside itself instead of widening the page.
 */
export const Segmented = styled.div`
  display: flex;
  max-inline-size: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  &::-webkit-scrollbar { display: none; }
  > a, > button {
    flex: 1 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: ${({ theme }) => theme.control.minHeight};
    padding: 0 12px;
    border: 0;
    border-inline-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.none};
    color: ${({ theme }) => theme.color.mutedText};
    background: transparent;
    font: inherit;
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    > svg { flex: none; font-size: 1rem; }
  }
  > :last-child { border-inline-end: 0; }
  > [aria-current="page"], > [aria-selected="true"], > [aria-pressed="true"] { ${segmentSelected} }
  > a:focus-visible, > button:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  ${media.hover} { > a:hover, > button:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { > a, > button { flex: 0 0 auto; min-block-size: 40px; } }
`;

/**
 * A quiet drawer: a full-width summary row with a turning chevron. Put the chevron icon last in the summary; give the
 * body a `div`. `$tone="danger"` colours the summary for destructive actions. `$plain` drops the drawer's own padding and
 * divider for one that sits inside an already padded panel body or form.
 */
export const Drawer = styled.details<{ $tone?: "danger"; $plain?: boolean }>`
  min-inline-size: 0;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  &:last-child { border-block-end: 0; }
  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: ${({ theme }) => theme.control.minHeight};
    padding: 6px 14px;
    color: ${({ theme, $tone }) => $tone === "danger" ? theme.color.outcome.incorrect.text : theme.color.link};
    font-size: ${({ theme }) => theme.typography.scale.emphasis};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; font-size: 1rem; }
    > svg:last-child { margin-inline-start: auto; transition: transform 0.15s ease; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  > div { display: grid; gap: 12px; min-inline-size: 0; padding: 2px 14px 14px; }
  @media (prefers-reduced-motion: reduce) { > summary > svg:last-child { transition: none; } }
  ${media.desktop} { > summary { padding-inline: 16px; } > div { padding-inline: 16px; } }
  ${({ $plain }) => $plain && css`
    &&, &&:last-child { border-block-end: 0; }
    && > summary { padding-inline: 0; }
    && > div { padding: 4px 0 0; }
    ${media.desktop} { && > summary { min-block-size: 36px; } }
  `}
`;
/** A muted note inside a drawer summary ("all 5 clear"). */
export const DrawerNote = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: normal;
`;

/** Rows inside a panel, each two lines with an optional end column; links and buttons fill the row. */
export const RowList = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  min-inline-size: 0;
  > li { min-inline-size: 0; border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  > li:last-child { border-block-end: 0; }
`;
export const rowLayout = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px 12px;
  min-block-size: 56px;
  padding: 8px 14px;
  ${media.desktop} { padding-inline: 16px; }
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
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
`;
/** First line of a row: bold title, then inline badges. */
export const RowTitle = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
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
  gap: 2px;
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
  gap: 10px 16px;
  min-inline-size: 0;
  padding: 10px 12px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > :first-child { flex: 1 1 14rem; max-inline-size: 28rem; }
`;

/** Centred placeholder for an empty side of the desk ("Select an account"). */
export const EmptyPanel = styled.div`
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 40px 20px;
  color: ${({ theme }) => theme.color.mutedText};
  text-align: center;
  > svg { font-size: 1.5rem; color: ${({ theme }) => theme.color.text}; }
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
  z-index: 4;
  display: flex;
  gap: 8px;
  margin-inline: -16px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: ${({ theme }) => theme.color.page};
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > * { flex: 1 1 0; }
  ${media.desktop} { position: static; margin: 0; padding: 0; background: none; border: 0; }
`;

/** Quiet text action (Edit, Revoke, Dismiss): 44px tall on phones, link coloured, red with `$tone="danger"`. */
export const TextAction = styled.button<{ $tone?: "danger" }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  padding: 0 4px;
  border: 0;
  color: ${({ theme, $tone }) => $tone === "danger" ? theme.color.outcome.incorrect.text : theme.color.link};
  background: none;
  font: inherit;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: 1rem; }
  &:disabled { cursor: not-allowed; opacity: 0.55; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.hover} { &:hover:not(:disabled) { text-decoration: underline; } }
  ${media.desktop} { min-block-size: 36px; }
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
    min-block-size: 48px;
    padding: 8px 16px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    font-size: 0.9375rem;
    line-height: 1.35;
  }
`;
const ResponsiveToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  inline-size: 100%;
  min-block-size: 48px;
  padding: 0 14px;
  border: 0;
  color: ${({ theme }) => theme.color.link};
  background: none;
  font: inherit;
  font-size: ${({ theme }) => theme.typography.scale.emphasis};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-align: start;
  cursor: pointer;
  > svg { flex: none; font-size: 1rem; }
  > svg:last-child { margin-inline-start: auto; transition: transform 0.15s ease; }
  &[aria-expanded="true"] > svg:last-child { transform: rotate(180deg); }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  @media (prefers-reduced-motion: reduce) { > svg:last-child { transition: none; } }
  ${media.desktop} { display: none; }
`;
const ResponsiveBody = styled.div`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  padding: 14px;
  ${media.belowDesktop} {
    border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    &[data-open="false"] { display: none; }
  }
  ${media.desktop} { padding: 14px 16px 16px; }
`;
