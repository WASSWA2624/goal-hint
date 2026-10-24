"use client";

import styled from "styled-components";
import { Panel } from "@/components/analytics/dashboard/dashboard-styles";
import { ActionButton, Badge, FormStack } from "./admin-form";

/** Retain the admin controls' 44px targets while reducing surrounding space. */
export const DetailLayout = styled.div`display: grid; gap: 12px; min-inline-size: 0;`;
export const DetailPanel = styled(Panel)`
  display: grid; gap: 12px; margin: 0; padding: 16px; min-inline-size: 0;
  h2, h3, p { margin: 0; }
  h2 { font-size: 1rem; } h3 { font-size: 0.875rem; }
  p { overflow-wrap: anywhere; }
  button { font-size: 0.8125rem; gap: 6px; }
  form, fieldset { min-inline-size: 0; }
  textarea { min-block-size: 64px; }
  summary { cursor: pointer; min-block-size: 44px; padding-block: 10px; font-size: 0.8125rem; }
  input[type="checkbox"] { inline-size: 18px; block-size: 18px; flex: none; vertical-align: middle; margin-inline-end: 6px; accent-color: ${({ theme }) => theme.color.link}; }
  ${FormStack} { gap: 12px; }
  @media(max-width: 480px) { padding: 12px; gap: 12px; }
`;
export const SectionHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; min-inline-size: 0;
  > div { min-inline-size: 0; display: grid; gap: 4px; }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem; line-height: 1.5; }
  > button { flex: none; }
`;
export const DetailHeading = styled.div`
  display: flex; align-items: start; justify-content: space-between; gap: 12px;
  h2 { font-size: clamp(1.125rem, 2vw, 1.375rem); line-height: 1.35; overflow-wrap: anywhere; }
  p { margin-block-start: 4px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  > div { min-inline-size: 0; }
`;
export const StatusRow = styled.div`display: flex; flex-wrap: wrap; gap: 6px; margin-block-start: 8px;`;
export const Status = styled(Badge)`font-size: 0.75rem;`;
export const Stats = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border-block: 1px solid ${({ theme }) => theme.color.border};
  > div { padding: 10px 8px; min-inline-size: 0; display: grid; grid-template-rows: auto 1fr; gap: 3px; }
  > div + div { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
  dt { grid-row: 2; font-size: 0.6875rem; color: ${({ theme }) => theme.color.mutedText}; line-height: 1.35; }
  dd { grid-row: 1; margin: 0; font-size: 1.125rem; font-weight: 700; font-variant-numeric: tabular-nums; }
`;
export const QuickActions = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
  button { inline-size: 100%; justify-content: flex-start; padding-inline: 10px; text-align: start; line-height: 1.3; min-block-size: 44px; }
  svg { inline-size: 17px; block-size: 17px; flex: none; }
  button[aria-expanded="true"] { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  @media(max-width: 560px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
export const Tabs = styled.div`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface}; min-inline-size: 0;
  button { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 3px 5px; border: 0; border-block-end: 3px solid transparent;
    min-inline-size: 0; min-block-size: 48px; padding: 6px 3px; border-radius: 0; color: ${({ theme }) => theme.color.mutedText}; background: transparent; font-size: 0.75rem; cursor: pointer; }
  button[aria-selected="true"] { color: ${({ theme }) => theme.color.link}; border-block-end-color: ${({ theme }) => theme.color.link}; font-weight: 700; }
  button:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  span { font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
`;
export const Records = styled.ul`
  display: grid; list-style: none; margin: 0; padding: 0; min-inline-size: 0;
  > li { padding-block: 12px; display: grid; gap: 8px; min-inline-size: 0; }
  > li:first-child { padding-block-start: 0; } > li:last-child { padding-block-end: 0; }
  > li + li { border-block-start: 1px solid ${({ theme }) => theme.color.border}; }
  p { font-size: 0.8125rem; } small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
`;
export const RecordHeader = styled.div`display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; min-inline-size: 0; strong { overflow-wrap: anywhere; }`;
export const CompactForm = styled.form`display: grid; gap: 12px; min-inline-size: 0; > button { justify-self: start; }`;
export const NoteFooter = styled.div`display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText};`;
export const MutedText = styled.p`font-size: 0.8125rem; line-height: 1.5; color: ${({ theme }) => theme.color.mutedText};`;
export const SensitiveOptions = styled.div`
  display: grid; gap: 10px; border-block-start: 1px solid ${({ theme }) => theme.color.border}; padding-block-start: 12px;
  > button { justify-self: start; }
`;
export const ActionClose = styled(ActionButton)`font-weight: 400;`;
