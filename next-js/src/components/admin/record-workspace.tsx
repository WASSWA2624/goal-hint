"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { EmptyPanel, StickyActions, visuallyHidden } from "./desk-styles";

/** Shared geometry for record screens. Forms, selection and permissions stay with each screen. */
export const RecordWorkspace = styled.div.attrs<{ "data-record-workspace"?: string }>({ "data-record-workspace": "" })`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  ${media.desktop} {
    grid-template-columns: clamp(22rem, 30vw, 26rem) minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    min-block-size: 0;
    gap: 0;
    overflow: hidden;
  }
`;
export const RecordHead = styled.header`
  position: relative;
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
  min-inline-size: 0;
  h1 { font-size: 1.375rem; }
  ${media.desktop} {
    grid-column: 1 / -1; min-block-size: 48px; padding: 4px 12px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.surface};
    > h1 { ${visuallyHidden} }
    button, nav { border-radius: 2px; }
  }
`;
export const RecordFeedback = styled.div`
  min-inline-size: 0;
  > p { margin: 0; }
  > p + p { margin-block-start: 8px; }
  ${media.desktop} { grid-column: 1 / -1; grid-row: 2; padding: 8px 16px; border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
`;
export const RecordList = styled.section`
  position: relative; display: grid; min-inline-size: 0; gap: 12px;
  > h2[data-record-list-title] { ${visuallyHidden} }
  ${media.desktop} {
    grid-column: 1; grid-row: 3; grid-template-rows: auto minmax(0, 1fr) auto;
    min-block-size: 0; gap: 0; overflow: hidden;
    border-inline-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.surface};
  }
`;
export const RecordListTools = styled.div`
  display: grid; gap: 8px; min-inline-size: 0;
  ${media.desktop} {
    gap: 4px; padding: 6px 10px 4px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    input:not([type="checkbox"]):not([type="radio"]), select { min-block-size: 34px; font-size: 0.8125rem; }
    input, select, button { border-radius: 2px; }
  }
`;
export const RecordListScroll = styled.ol.attrs<{ "data-record-list-scroll"?: string }>({ "data-record-list-scroll": "" })`
  display: grid; align-content: start; gap: 8px; margin: 0; padding: 0;
  list-style: none; min-inline-size: 0;
  > li { display: grid; min-inline-size: 0; }
  ${media.desktop} {
    grid-row: 2; grid-template-columns: minmax(0, 1fr); min-block-size: 0; gap: 0;
    overflow: auto; overscroll-behavior: contain; scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.controlBorder} transparent;
  }
`;
export const RecordListFooter = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} {
    grid-row: 3; padding: 5px 10px; font-size: 0.6875rem;
    border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.surfaceMuted};
  }
`;
export const RecordDetails = styled.section`
  display: grid; min-inline-size: 0;
  ${media.desktop} { grid-column: 2; grid-row: 3; min-block-size: 0; overflow: hidden; }
`;
export const RecordCard = styled.article`
  display: grid; gap: 12px; min-inline-size: 0;
  ${media.desktop} {
    grid-template-rows: minmax(0, 1fr) auto; gap: 0; block-size: 100%; min-block-size: 0;
    overflow: hidden; border: 0; border-radius: 0; background: ${({ theme }) => theme.color.surfaceMuted};
    input, select, textarea, button, form, details, summary, img, section, [role="group"], [role="tabpanel"] { border-radius: 2px; }
    input:not([type="checkbox"]):not([type="radio"]), select { min-block-size: 38px; font-size: 0.8125rem; }
    textarea { font-size: 0.8125rem; }
  }
`;
export const RecordScroll = styled.div.attrs<{ "data-record-detail-scroll"?: string }>({ "data-record-detail-scroll": "" })`
  display: contents;
  ${media.desktop} {
    display: grid; align-content: start; min-inline-size: 0; min-block-size: 0;
    overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.controlBorder} transparent;
    scroll-padding-block: 16px;
  }
`;
export const RecordDetailHead = styled.header`
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-inline-size: 0;
  h2 { min-inline-size: 0; overflow-wrap: anywhere; font-size: 1.0625rem; }
  ${media.desktop} {
    min-block-size: 44px; padding: 6px 12px;
    border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.surface};
    a, button { min-block-size: 28px; }
  }
`;
export const RecordBody = styled.div`
  display: grid; align-content: start; gap: 12px; min-inline-size: 0;
  ${media.desktop} { padding: 12px; }
`;
export const RecordFooter = styled(StickyActions).attrs<{ "data-record-footer"?: string }>({ "data-record-footer": "" })`
  ${media.desktop} {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px;
    position: static; min-inline-size: 0; margin: 0; padding: 6px 12px;
    border: 0; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.surface};
    > * { flex: 0 1 auto; }
    > button, > a, [data-record-actions] button, [data-record-actions] a { min-inline-size: 0; min-block-size: 32px; padding: 4px 10px; border-radius: 2px; font-size: 0.8125rem; }
    [data-record-actions] input { min-block-size: 32px; padding-block: 4px; border-radius: 2px; font-size: 0.8125rem; }
    [data-record-actions] { display: flex; flex-wrap: wrap; gap: 8px; }
    [data-record-icon] { flex: none; inline-size: 32px; block-size: 32px; padding: 0; }
    [data-record-summary] { min-inline-size: 0; margin-inline-end: auto; overflow-wrap: anywhere; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  }
  @media (min-width: 64rem) and (max-width: 79.99rem) { [data-record-summary] { display: none; } }
`;
export const RecordItem = styled.button`
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px;
  min-inline-size: 0; inline-size: 100%; padding: 10px 14px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; border-radius: 2px;
  background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text};
  font: inherit; text-align: start; cursor: pointer;
  &[aria-current="true"], &[aria-selected="true"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: inset 3px 0 ${({ theme }) => theme.color.link}; }
  &:disabled { cursor: not-allowed; opacity: 0.6; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  ${media.hover} { &:hover:not(:disabled):not([aria-current="true"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { min-block-size: 54px; padding: 8px 10px; border: 0; border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; border-radius: 0; font-size: 0.8125rem; }
`;
export const RecordItemTitle = styled.span`min-inline-size: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere;`;
export const RecordItemMeta = styled.span`min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; overflow-wrap: anywhere;`;
export const RecordEmpty = styled(EmptyPanel)`${media.desktop} { padding: 28px 20px; }`;
export const RecordDesktop = styled.div`${media.belowDesktop} { display: none; }`;
export const RecordMobile = styled.div`${media.desktop} { display: none; }`;
