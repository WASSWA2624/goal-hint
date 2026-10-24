"use client";

import styled, { css, keyframes } from "styled-components";
import { media } from "@/styles/theme";

export const Shell = styled.div`
  min-block-size: 100dvh;
  background: ${({ theme }) => theme.color.page};
`;
export const TopBar = styled.header`
  position: sticky;
  inset-block-start: 0;
  z-index: 10;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.gradient};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.border};
`;
export const TopBarContent = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  max-inline-size: ${({ theme }) => theme.layout.wideMaxWidth};
  margin-inline: auto;
  padding: 10px 16px;
`;
export const Brand = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  text-decoration: none;
  span { padding-inline-start: 10px; border-inline-start: 1px solid ${({ theme }) => theme.header.border}; font-weight: 600; }
  &:hover { color: inherit; }
`;
export const BrandImage = styled.img`
  display: block;
  block-size: 26px;
  inline-size: auto;
  aspect-ratio: 553 / 128;
`;
export const TopActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-inline-start: auto;
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  color: ${({ theme }) => theme.header.mutedText};
  form { display: contents; }
`;
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgb(83 213 198 / 0.6); }
  70% { box-shadow: 0 0 0 8px rgb(83 213 198 / 0); }
  100% { box-shadow: 0 0 0 0 rgb(83 213 198 / 0); }
`;
export const LivePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.controlFill};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
  &::before {
    content: "";
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: ${({ theme }) => theme.header.accent};
    animation: ${pulse} 2s infinite;
  }
  @media (prefers-reduced-motion: reduce) { &::before { animation: none; } }
`;
const headerControl = css`
  min-block-size: 32px;
  padding: 4px 12px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.controlFill};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  @media (hover: hover) { &:hover { color: ${({ theme }) => theme.header.text}; background: ${({ theme }) => theme.header.controlHover}; } }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
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
  scroll-margin-block-start: 4rem;
  gap: 16px;
  max-inline-size: ${({ theme }) => theme.layout.wideMaxWidth};
  margin-inline: auto;
  padding: 16px 16px 48px;
  ${media.desktop} { gap: 20px; padding: 24px 24px 64px; }
`;
export const PageTitle = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
  h1 { font-size: 1.25rem; }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  ${media.desktop} { h1 { font-size: 1.625rem; } }
`;
export const Notice = styled.p<{ $tone?: "warning" | "error" | "info" }>`
  padding: 10px 14px;
  border-inline-start: 4px solid;
  border-radius: ${({ theme }) => theme.border.radius};
  font-size: ${({ theme }) => theme.typography.scale.body};
  ${({ theme, $tone = "info" }) => {
    const tone = $tone === "error" ? theme.color.outcome.incorrect : $tone === "warning" ? theme.color.outcome.pending : theme.color.outcome.void;
    return css`color: ${tone.text}; background: ${tone.background}; border-color: ${tone.border};`;
  }}
  button { margin-inline-start: 8px; }
`;
export const FilterBar = styled.section`
  position: sticky;
  inset-block-start: 53px;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 12px;
  padding: 12px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  ${media.belowDesktop} { position: static; }
`;
export const Field = styled.label`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
  flex: 1 1 9rem;
  max-inline-size: 15rem;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  select, input {
    min-block-size: 36px;
    inline-size: 100%;
    padding: 4px 8px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    border-radius: ${({ theme }) => theme.border.radius};
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    font-size: ${({ theme }) => theme.typography.scale.body};
  }
  ${media.belowDesktop} { flex-basis: calc(50% - 6px); max-inline-size: none; }
`;
export const ToolButton = styled.button<{ $variant?: "primary" | "secondary" | "quiet" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 36px;
  padding: 4px 12px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  ${({ theme, $variant }) => $variant === "primary" && css`color: ${theme.color.onAction}; background: ${theme.gradient.action}; border-color: ${theme.gradient.action};`}
  ${({ $variant }) => $variant === "quiet" && css`border-color: transparent; background: transparent;`}
  &:disabled { cursor: not-allowed; opacity: 0.55; }
  @media (hover: hover) { &:hover:not(:disabled) { filter: brightness(0.96); } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
export const Chips = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  inline-size: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  &:empty { display: none; }
`;
export const Chip = styled.li`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-inline-size: 100%;
  padding: 2px 4px 2px 10px;
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.brand};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    border: 0;
    border-radius: ${({ theme }) => theme.border.radius};
    color: inherit;
    background: transparent;
    font-size: 1rem;
    cursor: pointer;
  }
  button:hover { background: rgb(0 0 0 / 0.08); }
`;
export const Cards = styled.section<{ $busy?: boolean }>`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: ${({ theme }) => theme.color.border};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  transition: opacity 120ms;
  opacity: ${({ $busy }) => ($busy ? 0.55 : 1)};
  ${media.tablet} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  ${media.desktop} { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  ${media.wide} { grid-template-columns: repeat(6, minmax(0, 1fr)); }
`;
export const Card = styled.div`
  display: grid;
  align-content: start;
  gap: 4px;
  min-inline-size: 0;
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.surface};
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: 600; }
  dd { margin: 0; }
  ${media.desktop} { padding: 16px 18px; }
`;
export const CardValue = styled.dd`
  font-size: 1.375rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.2;
  ${media.desktop} { font-size: 1.75rem; }
`;
export const Delta = styled.dd<{ $tone: "good" | "bad" | "neutral" }>`
  color: ${({ theme, $tone }) => $tone === "good" ? theme.color.outcome.correct.text : $tone === "bad" ? theme.color.outcome.incorrect.text : theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
`;
export const Panel = styled.section<{ $busy?: boolean }>`
  display: grid;
  align-content: start;
  gap: 12px;
  min-inline-size: 0;
  padding: 14px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  transition: opacity 120ms;
  opacity: ${({ $busy }) => ($busy ? 0.55 : 1)};
  ${media.desktop} { padding: 18px 20px; }
`;
export const PanelHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  h2 { font-size: ${({ theme }) => theme.typography.scale.section}; }
  ${media.desktop} { h2 { font-size: 1.125rem; } }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
export const Grid = styled.div<{ $columns?: number }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  min-inline-size: 0;
  ${media.tablet} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ${media.desktop} { gap: 20px; grid-template-columns: repeat(${({ $columns = 3 }) => $columns}, minmax(0, 1fr)); }
`;
/** Spans two columns from tablet width up; a single full-width cell on phones. */
export const WidePanel = styled(Panel)`
  ${media.tablet} { grid-column: 1 / -1; }
  ${media.desktop} { grid-column: span 2; }
`;
export const Tabs = styled.div`
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-block-end: 2px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  scrollbar-width: thin;
`;
export const Tab = styled.button<{ $selected: boolean }>`
  flex: none;
  min-block-size: 36px;
  padding: 6px 12px;
  border: 0;
  border-block-end: 3px solid ${({ theme, $selected }) => ($selected ? theme.color.brand : "transparent")};
  color: ${({ theme, $selected }) => ($selected ? theme.color.text : theme.color.mutedText)};
  background: transparent;
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme, $selected }) => ($selected ? theme.typography.weight.bold : theme.typography.weight.medium)};
  cursor: pointer;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
`;
export const Segmented = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;
export const SegmentButton = styled.button<{ $selected: boolean }>`
  min-block-size: 32px;
  padding: 4px 10px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme, $selected }) => ($selected ? theme.color.brand : theme.color.border)};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme, $selected }) => ($selected ? theme.color.brand : theme.color.mutedText)};
  background: ${({ theme, $selected }) => ($selected ? theme.color.brandSoft : "transparent")};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
const shimmer = keyframes`
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
`;
export const Skeleton = styled.div<{ $height?: number }>`
  block-size: ${({ $height = 120 }) => $height}px;
  background: linear-gradient(90deg, ${({ theme }) => theme.color.surfaceMuted} 25%, ${({ theme }) => theme.color.surface} 50%,
    ${({ theme }) => theme.color.surfaceMuted} 75%);
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s linear infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
export const Definitions = styled.dl`
  display: grid;
  gap: 10px;
  margin: 0;
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 32px; }
  div { display: grid; gap: 2px; }
  dt { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  dd { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.body}; }
`;
export const LiveList = styled.ol`
  min-inline-size: 0;
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  li { display: flex; justify-content: space-between; gap: 12px; min-inline-size: 0; font-size: ${({ theme }) => theme.typography.scale.body}; }
  li span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { font-variant-numeric: tabular-nums; }
`;
export const SettingsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 12px;
`;
export const Muted = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
export const SeriesTable = styled.table`
  inline-size: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-variant-numeric: tabular-nums;
  th, td { padding: 4px 8px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; text-align: end; white-space: nowrap; }
  th:first-child, td:first-child { text-align: start; }
`;
