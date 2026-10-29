"use client";

import styled, { css } from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { media } from "@/styles/theme";
import { Panel, Segmented, StatGrid, rowLayout } from "./desk-styles";
import { RecordDetails, RecordHead, RecordList, RecordWorkspace, RecordDetailHead } from "./record-workspace";

/** Out of sight but still read: the phone search label, and the h1 while a phone shows one account. */
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

/** Forms inside subscriber panels: 44px checkbox rows and disclosures, and nothing that widens the panel. */
export const formSurface = css`
  form, fieldset { min-inline-size: 0; }
  p { overflow-wrap: anywhere; }
  textarea { min-block-size: 64px; }
  label:has(> input[type="checkbox"]) {
    display: flex; align-items: flex-start; gap: 10px; min-block-size: 44px; padding-block: 10px;
    font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: normal; line-height: 1.45; cursor: pointer;
  }
  input[type="checkbox"] { inline-size: 18px; block-size: 18px; flex: none; margin: 1px 0 0; accent-color: ${({ theme }) => theme.color.link}; }
  details:not([class]) > summary {
    min-block-size: 44px; padding-block: 11px; color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold}; cursor: pointer;
  }
`;

/* Workspace: the directory on the start side, the account on the wide side; phones show one of them at a time. */
export const WorkspaceTitle = styled(RecordHead)``;
export const DirectoryRoot = styled(RecordList)``;
/**
 * `$quiet`: nothing to show on a phone (no account, no notice), so the column leaves no gap. The account's parts size to
 * this column, which is narrow at 1024px beside the sidebar and the directory.
 */
export const AccountColumn = styled(RecordDetails)<{ $quiet: boolean }>`
  container-type: inline-size;
  ${media.desktop} { grid-template-rows: minmax(0, 1fr); }
  ${({ $quiet }) => $quiet && css`${media.belowDesktop} { display: none; }`}
`;
export const Workspace = styled(RecordWorkspace)<{ $selected: boolean }>`
  ${media.belowDesktop} {
    ${({ $selected }) => $selected
      ? css`> ${DirectoryRoot} { display: none; } > ${WorkspaceTitle} { display: contents; > h1 { ${visuallyHidden} } > button { display: none; } }`
      : css`> ${AccountColumn} { order: 1; } > ${DirectoryRoot} { order: 2; }`}
  }
`;
export const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  margin-block: -6px -4px;
  padding-inline-end: 8px;
  color: ${({ theme }) => theme.color.link};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  > svg { flex: none; font-size: 1.125rem; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  ${media.desktop} { display: none; }
`;
export const EmptyAccount = styled(Panel)`
  display: grid;
  align-content: center;
  min-block-size: 20rem;
  border-style: dashed;
  h2 { color: ${({ theme }) => theme.color.text}; font-size: 0.9375rem; }
  ${media.belowDesktop} { display: none; }
`;
/** A drawer that sits in its own panel (Grant access / add subscriber, Delete or erase). */
export const DrawerPanel = styled(Panel)`
  ${formSurface}
`;

/* Account */
export const AccountTop = styled(RecordDetailHead)`
  display: flex;
  flex-direction: column;
  h2 { font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.25; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  ${media.belowDesktop} { gap: 8px; padding: 14px; align-items: stretch; h2 { font-size: 1.375rem; } }
  ${media.desktop} { flex-direction: row; justify-content: space-between; }
`;
export const Badges = styled.p`display: flex; flex-wrap: wrap; gap: 6px;`;
export const BlockedNote = styled.p`
  margin-block-start: 4px;
  color: ${({ theme }) => theme.color.outcome.pending.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  overflow-wrap: anywhere;
`;
export const AccountStats = styled(StatGrid)`
  border-block: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${media.desktop} { > div { padding-inline: 18px; } }
  @container (max-width: 34rem) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
/** Grant access first and full width on phones; equal buttons that wrap from desktop up. */
export const QuickActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 14px;
  > button { inline-size: 100%; min-inline-size: 0; padding-inline: 8px; line-height: 1.25; }
  > button:first-child { grid-column: 1 / -1; }
  > button > svg { flex: none; font-size: 1rem; }
  > button[aria-expanded="true"] { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 1px; }
  ${media.desktop} {
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    padding: 14px 18px 16px;
    > button { min-block-size: 40px; }
    > button:first-child { grid-column: auto; }
  }
`;
export const ActionHint = styled.p`
  margin-block-start: -6px;
  padding: 0 14px 14px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} { padding-inline: 18px; }
`;
/** The action panel's heading takes focus when it opens; it is not a control, so it shows no ring. */
export const ActionPanel = styled(Panel)`
  h2[tabindex="-1"]:focus { outline: none; }
`;
export const ActionBody = styled.div`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  padding: 14px;
  ${formSurface}
  ${media.desktop} { padding: 14px 16px 16px; }
`;
export const DetailTabs = styled(Segmented)`
  ${media.desktop} { justify-self: start; }
  @container (max-width: 30rem) { > button { padding-inline: 8px; } }
`;
export const TabBody = styled.div`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  padding: 14px;
  ${formSurface}
  ${media.desktop} { padding: 14px 16px 16px; }
`;
/** One record per row: details on the start side, its tools beside them from desktop up and below them on phones. */
export const RecordRow = styled.li`
  ${rowLayout}
  grid-template-columns: minmax(0, 1fr);
  gap: 8px 16px;
  padding-block: 10px;
  ${formSurface}
  @container (min-width: 36rem) { grid-template-columns: minmax(0, 1fr) auto; [role="group"] { justify-content: flex-end; } }
  /* The payment reference is the row's only control: 44px to tap on phones without making the row taller. */
  a { color: ${({ theme }) => theme.color.link}; text-decoration: none; }
  ${media.belowDesktop} { a { display: inline-flex; align-items: center; min-block-size: 44px; margin-block: -12px; } }
  ${media.hover} { a:hover { text-decoration: underline; } }
`;
export const SpreadRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  min-inline-size: 0;
`;
export const History = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  > li {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-block: 8px;
    border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  }
  > li > span:first-child { display: grid; gap: 2px; min-inline-size: 0; }
  strong, li > span:last-child { font-variant-numeric: tabular-nums; }
  li > span:last-child { white-space: nowrap; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
/** A drawer inside a panel body: no own padding, the chevron at the end. */
export const PlainDrawer = styled.details`
  min-inline-size: 0;
  > summary {
    display: flex; align-items: center; gap: 8px; min-block-size: 44px;
    color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; margin-inline-start: auto; font-size: 1rem; color: ${({ theme }) => theme.color.mutedText}; transition: transform 0.15s ease; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  > div { display: grid; gap: 12px; min-inline-size: 0; padding-block: 4px; }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
  ${media.desktop} { > summary { min-block-size: 36px; } }
`;
export const Mono = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-family: ui-monospace, Consolas, "Courier New", monospace;
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  overflow-wrap: anywhere;
`;
export const CompactForm = styled.form`display: grid; gap: 12px; min-inline-size: 0; > button { justify-self: start; }`;
export const NoteFooter = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
export const MutedText = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.body};
  line-height: 1.5;
`;
export const SensitiveOptions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding-block-start: 12px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > p { flex: 1 1 14rem; }
`;
