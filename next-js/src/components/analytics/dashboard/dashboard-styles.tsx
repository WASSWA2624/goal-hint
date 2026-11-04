"use client";

import { controlRow } from "@/components/ui/control-layout";

import { FloatingField } from "@/components/ui/floating-field";

import { filledTableRows } from "@/components/ui/filled-surfaces";
import styled, { css, keyframes } from "styled-components";
import { media } from "@/styles/theme";
import { mobileFilterPanel } from "@/components/ui/filter-chrome";
import { desktopSectionFrame } from "@/components/ui/layout";

const analyticsInset = css`padding-inline: ${({ theme }) => theme.layout.sectionPadding};`;

export const Shell = styled.div`
  min-block-size: 100dvh;
  background: ${({ theme }) => theme.color.page};
`;
export const TopBar = styled.header`
  position: sticky;
  inset-block-start: 0;
  z-index: var(--gh-layer-sticky);
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.gradient};
  border-block-end: 0;
`;
export const TopBarContent = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2) var(--gh-spacing-4);
  max-inline-size: ${({ theme }) => theme.layout.wideMaxWidth};
  margin-inline: auto;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-4);
`;
export const Brand = styled.a`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  color: inherit;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  text-decoration: none;
  span { padding-inline-start: var(--gh-spacing-2_5); border-inline-start: 0; font-weight: var(--gh-weight-semibold); }
  &:hover { color: inherit; }
`;
export const BrandImage = styled.img`
  display: block;
  block-size: var(--gh-size-6_5);
  inline-size: auto;
  aspect-ratio: 553 / 128;
`;
export const TopActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2) var(--gh-spacing-3);
  margin-inline-start: auto;
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  color: ${({ theme }) => theme.header.mutedText};
  form { display: contents; }
`;
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: var(--gh-opacity-40); }
`;
export const LivePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-2);
  padding: var(--gh-spacing-1) var(--gh-spacing-2_5);
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.controlFill};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
  &::before {
    content: "";
    inline-size: var(--gh-size-2);
    block-size: var(--gh-size-2);
    border-radius: ${({ theme }) => theme.radius.circle};
    background: ${({ theme }) => theme.header.accent};
    animation: ${pulse} var(--gh-duration-pulse) infinite;
  }
  @media (prefers-reduced-motion: reduce) { &::before { animation: none; } }
`;
const headerControl = css`
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) var(--gh-spacing-3);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.controlFill};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  @media (hover: hover) { &:hover { color: ${({ theme }) => theme.header.text}; background: ${({ theme }) => theme.header.controlHover}; } }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.header.accent}; outline-offset: var(--gh-size-0_5); }
`;
export const HeaderButton = styled.button`${headerControl}`;
/** A header link that looks like HeaderButton, e.g. between the analytics and owner dashboards. */
export const HeaderLink = styled.a`
  ${headerControl}
  display: inline-flex;
  align-items: center;
  text-decoration: none;
`;
export const Main = styled.main`
  display: grid;
  scroll-margin-block-start: var(--gh-size-16);
  gap: var(--gh-spacing-4);
  max-inline-size: ${({ theme }) => theme.layout.wideMaxWidth};
  margin-inline: auto;
  padding: var(--gh-spacing-4) var(--gh-spacing-4) var(--gh-spacing-12);
  ${media.desktop} { gap: var(--gh-spacing-5); padding: var(--gh-spacing-6) var(--gh-spacing-6) var(--gh-spacing-16); }
`;
export const PageTitle = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--gh-spacing-2);
  ${analyticsInset}
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  p:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p:last-of-type { white-space: nowrap; font-variant-numeric: tabular-nums; }
`;
export const ReportUpdated = styled.p`
  ${analyticsInset}
  padding-block: var(--gh-spacing-1);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  text-align: end;
`;
export const Notice = styled.p<{ $tone?: "warning" | "error" | "info" }>`
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5);
  border-inline-start: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  ${desktopSectionFrame}
  font-size: ${({ theme }) => theme.typography.scale.body};
  ${({ theme, $tone = "info" }) => {
    const tone = $tone === "error" ? theme.color.outcome.incorrect : $tone === "warning" ? theme.color.outcome.pending : theme.color.outcome.void;
    return css`color: ${tone.text}; background: ${tone.background}; `;
  }}
  button { margin-inline-start: var(--gh-spacing-2); }
`;
export const FilterBar = styled.section`
  ${mobileFilterPanel}
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--gh-spacing-2_5) var(--gh-spacing-3);
  padding: var(--gh-spacing-3);
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  ${desktopSectionFrame}
  ${media.belowDesktop} { position: static; }

  ${controlRow}
`;
export const Field = styled(FloatingField)`
  flex: 1 1 var(--gh-size-32); max-inline-size: var(--gh-size-64);
  ${media.belowDesktop} { flex-basis: calc(50% - var(--gh-size-1_5)); max-inline-size: none; }
`;
export const ToolButton = styled.button<{ $variant?: "primary" | "secondary" | "quiet" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--gh-spacing-1_5);
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) var(--gh-spacing-3);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  ${({ theme, $variant }) => $variant === "primary" && css`color: ${theme.color.onAction}; background: ${theme.gradient.action}; `}
  ${({ theme, $variant }) => $variant === "quiet" && css`background: ${theme.color.surfaceMuted};`}
  &:disabled { cursor: not-allowed; opacity: var(--gh-opacity-55); }
  @media (hover: hover) { &:hover:not(:disabled) { filter: brightness(${({ theme }) => theme.interaction.toolHoverBrightness}); } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
export const Chips = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gh-spacing-1_5);
  inline-size: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  &:empty { display: none; }
`;
export const Chip = styled.li`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1);
  max-inline-size: 100%;
  padding: var(--gh-spacing-0_5) var(--gh-spacing-1) var(--gh-spacing-0_5) var(--gh-spacing-2_5);
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme }) => theme.color.brand};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    display: grid;
    place-items: center;
    inline-size: var(--gh-size-6_5);
    block-size: var(--gh-size-6_5);
    border: 0;
    border-radius: ${({ theme }) => theme.radius.small};
    color: inherit;
    background: transparent;
    font-size: var(--gh-font-section);
    cursor: pointer;
  }
  button:hover { background: ${({ theme }) => theme.color.rowHover}; }
`;
export const Cards = styled.section<{ $busy?: boolean }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-1_5);
  background: ${({ theme }) => theme.color.page};
  border: 0;
  transition: opacity ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  opacity: ${({ theme, $busy }) => ($busy ? theme.opacity[55] : 1)};
  ${media.tablet} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  ${media.desktop} { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  ${media.wide} { grid-template-columns: repeat(6, minmax(0, 1fr)); }
`;
export const Card = styled.div`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  padding-block: var(--gh-spacing-3);
  ${analyticsInset}
  background: ${({ theme }) => theme.color.surface};
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: var(--gh-weight-semibold); }
  dd { margin: 0; }
  ${media.desktop} { padding-block: var(--gh-spacing-4); }
`;
export const CardValue = styled.dd`
  font-size: var(--gh-font-page);
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: var(--gh-leading-control);
  ${media.desktop} { font-size: var(--gh-font-displaySmall); }
`;
export const Delta = styled.dd<{ $tone: "good" | "bad" | "neutral" }>`
  color: ${({ theme, $tone }) => $tone === "good" ? theme.color.outcome.correct.text : $tone === "bad" ? theme.color.outcome.incorrect.text : theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
`;
export const Panel = styled.section<{ $busy?: boolean }>`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding-block: var(--gh-spacing-3_5);
  ${analyticsInset}
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  ${desktopSectionFrame}
  transition: opacity ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  opacity: ${({ theme, $busy }) => ($busy ? theme.opacity[55] : 1)};
  ${media.desktop} { padding-block: var(--gh-spacing-4_5); }
`;
export const PanelHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-2) var(--gh-spacing-3);
  h2 { font-size: ${({ theme }) => theme.typography.scale.section}; }
  ${media.desktop} { h2 { font-size: var(--gh-font-title); } }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
export const Grid = styled.div<{ $columns?: number }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-4);
  min-inline-size: 0;
  ${media.tablet} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ${media.desktop} { gap: var(--gh-spacing-5); grid-template-columns: repeat(${({ $columns = 3 }) => $columns}, minmax(0, 1fr)); }
`;
/** Spans two columns from tablet width up; a single full-width cell on phones. */
export const WidePanel = styled(Panel)`
  ${media.tablet} { grid-column: 1 / -1; }
  ${media.desktop} { grid-column: span 2; }
`;
export const Tabs = styled.div`
  display: flex;
  gap: var(--gh-spacing-1);
  overflow-x: auto;
  padding-block-end: var(--gh-spacing-0_5);
  border-block-end: 0;
  scrollbar-width: thin;
`;
export const Tab = styled.button<{ $selected: boolean }>`
  flex: none;
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1_5) var(--gh-spacing-3);
  border: 0;
  border-block-end: 0;
  color: ${({ theme, $selected }) => ($selected ? theme.color.text : theme.color.mutedText)};
  background: ${({ theme, $selected }) => $selected ? theme.color.brandSoft : theme.color.surfaceMuted};
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme, $selected }) => ($selected ? theme.typography.weight.bold : theme.typography.weight.medium)};
  cursor: pointer;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;
export const Segmented = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--gh-spacing-1);
`;
export const SegmentButton = styled.button<{ $selected: boolean }>`
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1) var(--gh-spacing-2_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme, $selected }) => ($selected ? theme.color.brand : theme.color.mutedText)};
  background: ${({ theme, $selected }) => ($selected ? theme.color.brandSoft : theme.color.surfaceMuted)};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
export const Definitions = styled.dl`
  display: grid;
  gap: var(--gh-spacing-2_5);
  margin: 0;
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-3) var(--gh-spacing-8); }
  div { display: grid; gap: var(--gh-spacing-0_5); }
  dt { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  dd { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body}; }
`;
export const LiveList = styled.ol`
  min-inline-size: 0;
  display: grid;
  gap: var(--gh-spacing-1_5);
  margin: 0;
  padding: 0;
  list-style: none;
  li { display: flex; justify-content: space-between; gap: var(--gh-spacing-3); min-inline-size: 0; font-size: ${({ theme }) => theme.typography.scale.body}; }
  li span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-variant-numeric: tabular-nums; }
`;
export const SettingsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--gh-spacing-2_5) var(--gh-spacing-3);

  ${controlRow}
`;
export const Muted = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
export const SeriesTable = styled.table`
  ${filledTableRows}
  inline-size: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-variant-numeric: tabular-nums;
  th, td { padding: var(--gh-spacing-1) var(--gh-spacing-2); border-block-end: 0; text-align: end; white-space: nowrap; }
  th:first-child, td:first-child { text-align: start; }
`;
