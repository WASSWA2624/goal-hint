"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { Panel, Segmented, StatGrid, rowLayout } from "./desk-styles";
import { RecordDetails, RecordList, RecordWorkspace, RecordDetailHead } from "./record-workspace";
import { RecordToolbar } from "./record-toolbar";

/** Out of sight but still read: the phone search label, and the h1 while a phone shows one account. */
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

/** Forms inside subscriber panels: 44px checkbox rows and disclosures, and nothing that widens the panel. */
export const formSurface = css`
  form, fieldset { min-inline-size: 0; }
  p { overflow-wrap: anywhere; }
  textarea { min-block-size: var(--gh-size-16); }
  label:has(> input[type="checkbox"]) {
    display: flex; align-items: flex-start; gap: var(--gh-spacing-2_5); min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-2_5);
    font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: var(--gh-weight-body); line-height: var(--gh-leading-reading); cursor: pointer;
  }
  input[type="checkbox"] { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); flex: none; margin: var(--gh-spacing-0_25) 0 0; accent-color: ${({ theme }) => theme.color.link}; }
  details:not([class]) > summary {
    min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-2_75); color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold}; cursor: pointer;
  }
`;

/* Workspace: the directory on the start side, the account on the wide side; phones show one of them at a time. */
export const WorkspaceTitle = styled(RecordToolbar)``;
export const DirectoryRoot = styled(RecordList)``;
export const AccountColumn = styled(RecordDetails)`
  container-type: inline-size;
  ${media.desktop} { grid-template-rows: minmax(0, 1fr); }
`;
export const Workspace = styled(RecordWorkspace)``;
export const EmptyAccount = styled(Panel)`
  display: grid;
  align-content: center;
  min-block-size: var(--gh-size-80);

  h2 { color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-reading); }
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
  h2 { font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-heading); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  ${media.belowDesktop} { gap: var(--gh-spacing-2); padding: var(--gh-spacing-3_5); align-items: stretch; h2 { font-size: var(--gh-font-page); } }
  ${media.desktop} { flex-direction: row; justify-content: space-between; }
`;
export const Badges = styled.p`display: flex; flex-wrap: wrap; gap: var(--gh-spacing-1_5);`;
export const BlockedNote = styled.p`
  margin-block-start: var(--gh-spacing-1);
  color: ${({ theme }) => theme.color.outcome.pending.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  overflow-wrap: anywhere;
`;
export const AccountStats = styled(StatGrid)`
  border-block: 0;
  ${media.desktop} { > div { padding-inline: var(--gh-spacing-4_5); } }
  @container (max-width: ${({ theme }) => theme.viewport[34]}) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
/** Grant access first and full width on phones; equal buttons that wrap from desktop up. */
export const QuickActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-2);
  padding: var(--gh-spacing-3_5);
  > button { inline-size: 100%; min-inline-size: 0; padding-inline: var(--gh-spacing-2); line-height: var(--gh-leading-heading); }
  > button:first-child { grid-column: 1 / -1; }
  > button > svg { flex: none; font-size: var(--gh-font-section); }
  > button[aria-expanded="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.desktop} {
    grid-template-columns: repeat(auto-fill, minmax(var(--gh-size-44), 1fr));
    padding: var(--gh-spacing-3_5) var(--gh-spacing-4_5) var(--gh-spacing-4);
    > button { min-block-size: var(--form-control-height); }
    > button:first-child { grid-column: auto; }
  }
`;
/** The action panel's heading takes focus when it opens; it is not a control, so it shows no ring. */
export const ActionPanel = styled(Panel)`
  h2[tabindex="-1"]:focus { outline: none; }
`;
export const ActionBody = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding: var(--gh-spacing-3_5);
  ${formSurface}
  ${media.desktop} { padding: var(--gh-spacing-3_5) var(--gh-spacing-4) var(--gh-spacing-4); }
`;
export const DetailTabs = styled(Segmented)`
  ${media.desktop} { justify-self: start; }
  @container (max-width: ${({ theme }) => theme.viewport[30]}) { > button { padding-inline: var(--gh-spacing-2); } }
`;
export const TabBody = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  padding: var(--gh-spacing-3_5);
  ${formSurface}
  ${media.desktop} { padding: var(--gh-spacing-3_5) var(--gh-spacing-4) var(--gh-spacing-4); }
`;
/** One record per row: details on the start side, its tools beside them from desktop up and below them on phones. */
export const RecordRow = styled.li`
  ${rowLayout}
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-2) var(--gh-spacing-4);
  padding-block: var(--gh-spacing-2_5);
  ${formSurface}
  @container (min-width: ${({ theme }) => theme.viewport[36]}) { grid-template-columns: minmax(0, 1fr) auto; [role="group"] { justify-content: flex-end; } }
  /* The payment reference is the row's only control: 44px to tap on phones without making the row taller. */
  a { color: ${({ theme }) => theme.color.link}; text-decoration: none; }
  ${media.belowDesktop} { a { display: inline-flex; align-items: center; min-block-size: var(--gh-size-11); margin-block: calc(-1 * var(--gh-spacing-3)); } }
  ${media.hover} { a:hover { text-decoration: underline; } }
`;
export const SpreadRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-1) var(--gh-spacing-3);
  min-inline-size: 0;
`;
export const History = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  > li {
    display: flex; align-items: baseline; justify-content: space-between; gap: var(--gh-spacing-3); padding-block: var(--gh-spacing-2);
    border-block-start: 0;
  }
  > li > span:first-child { display: grid; gap: var(--gh-spacing-0_5); min-inline-size: 0; }
  strong, li > span:last-child { font-variant-numeric: tabular-nums; }
  li > span:last-child { white-space: nowrap; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
/** A drawer inside a panel body: no own padding, the chevron at the end. */
export const PlainDrawer = styled.details`
  min-inline-size: 0;
  > summary {
    display: flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height);
    color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; margin-inline-start: auto; font-size: var(--gh-font-section); color: ${({ theme }) => theme.color.mutedText}; transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  > div { display: grid; gap: var(--gh-spacing-3); min-inline-size: 0; padding-block: var(--gh-spacing-1); }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
  ${media.desktop} { > summary { min-block-size: var(--form-control-height); } }
`;
export const Mono = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-family: ${({ theme }) => theme.typography.monoFamily};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  overflow-wrap: anywhere;
`;
export const CompactForm = styled.form`display: grid; gap: var(--gh-spacing-3); min-inline-size: 0; > button { justify-self: start; }`;
export const NoteFooter = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-2);
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
`;
export const MutedText = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.body};
  line-height: var(--gh-leading-normal);
`;
export const SensitiveOptions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-2) var(--gh-spacing-3);
  padding-block-start: var(--gh-spacing-3);
  border-block-start: 0;
  > p { flex: 1 1 var(--gh-size-56); }
`;
