"use client";

import { controlRow } from "@/components/ui/control-layout";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { EmptyPanel, StickyActions, visuallyHidden } from "./desk-styles";

/** Shared geometry for record screens. Forms, selection and permissions stay with each screen. */
export const RecordWorkspace = styled.div.attrs<{ "data-record-workspace"?: string }>({ "data-record-workspace": "" })`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  ${media.desktop} {
    grid-template-columns: clamp(var(--gh-size-88), 30vw, var(--gh-size-104)) minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    min-block-size: 0;
    gap: 0;
    overflow: hidden;
  }
`;
export const RecordHead = styled.header`
  position: relative;
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2_5) var(--gh-spacing-4);
  min-inline-size: 0;
  h1 { font-size: var(--gh-font-page); }
  ${media.desktop} {
    grid-column: 1 / -1; min-block-size: var(--gh-size-12); padding: var(--gh-spacing-1) var(--gh-spacing-3);
    border-block-end: 0;
    background: ${({ theme }) => theme.color.surface};
    > h1 { ${visuallyHidden} }
    button, nav { border-radius: ${({ theme }) => theme.radius.control}; }
  }
`;
export const RecordFeedback = styled.div`
  min-inline-size: 0;
  > p { margin: 0; }
  > p + p { margin-block-start: var(--gh-spacing-2); }
  ${media.desktop} { grid-column: 1 / -1; grid-row: 2; padding: var(--gh-spacing-2) var(--gh-spacing-4); border-block-end: 0; }
`;
export const RecordList = styled.section`
  position: relative; display: grid; min-inline-size: 0; gap: var(--gh-spacing-3);
  > h2[data-record-list-title] { ${visuallyHidden} }
  ${media.desktop} {
    grid-column: 1; grid-row: 3; grid-template-rows: auto minmax(0, 1fr) auto;
    min-block-size: 0; gap: 0; overflow: hidden;
    border-inline-end: 0;
    background: ${({ theme }) => theme.color.surface};
  }
`;
export const RecordListTools = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0;
  ${media.desktop} {
    gap: var(--gh-spacing-1); padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5) var(--gh-spacing-1);
    border-block-end: 0;
    input:not([type="checkbox"]):not([type="radio"]), select { min-block-size: var(--form-control-height); font-size: var(--gh-font-body); }
    input, select, button { border-radius: ${({ theme }) => theme.radius.control}; }
  }

  ${controlRow}
`;
export const RecordListScroll = styled.ol.attrs<{ "data-record-list-scroll"?: string }>({ "data-record-list-scroll": "" })`
  display: grid; align-content: start; gap: var(--gh-spacing-2); margin: 0; padding: 0;
  list-style: none; min-inline-size: 0;
  > li { display: grid; min-inline-size: 0; }
  ${media.desktop} {
    grid-row: 2; grid-template-columns: minmax(0, 1fr); min-block-size: 0; gap: 0;
    overflow: auto; overscroll-behavior: contain; scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.controlBorder} transparent;
  }
`;
export const RecordListFooter = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2); min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} {
    grid-row: 3; padding: var(--gh-spacing-1_25) var(--gh-spacing-2_5); font-size: var(--gh-font-caption);
    border-block-start: 0;
    background: ${({ theme }) => theme.color.surfaceMuted};
  }
`;
export const RecordDetails = styled.section`
  display: grid; min-inline-size: 0;
  ${media.desktop} { grid-column: 2; grid-row: 3; min-block-size: 0; overflow: hidden; }
`;
export const RecordCard = styled.article`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  ${media.desktop} {
    grid-template-rows: minmax(0, 1fr) auto; gap: 0; block-size: 100%; min-block-size: 0;
    overflow: hidden; border: 0; background: ${({ theme }) => theme.color.surfaceMuted};
    input:not([type="checkbox"]):not([type="radio"]), select { min-block-size: var(--form-control-height); font-size: var(--gh-font-body); }
    textarea { font-size: var(--gh-font-body); }
  }
`;
export const RecordScroll = styled.div.attrs<{ "data-record-detail-scroll"?: string }>({ "data-record-detail-scroll": "" })`
  display: contents;
  ${media.desktop} {
    display: grid; align-content: start; min-inline-size: 0; min-block-size: 0;
    overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.controlBorder} transparent;
    scroll-padding-block: var(--gh-spacing-4);
  }
`;
export const RecordDetailHead = styled.header`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2_5); min-inline-size: 0;
  h2 { min-inline-size: 0; overflow-wrap: anywhere; font-size: var(--gh-font-subheading); }
  ${media.desktop} {
    min-block-size: var(--gh-size-11); padding: var(--gh-spacing-1_5) var(--gh-spacing-3);
    border-block-end: 0;
    background: ${({ theme }) => theme.color.surface};
    a, button { min-block-size: var(--form-control-height); }
  }
`;
export const RecordBody = styled.div`
  display: grid; align-content: start; gap: var(--gh-spacing-3); min-inline-size: 0;
  ${media.desktop} { padding: var(--gh-spacing-3); }
`;
export const RecordFooter = styled(StickyActions).attrs<{ "data-record-footer"?: string }>({ "data-record-footer": "" })`
  ${media.desktop} {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--gh-spacing-2);
    position: static; min-inline-size: 0; margin: 0; padding: var(--gh-spacing-1_5) var(--gh-spacing-3);
    border: 0; border-block-start: 0;
    background: ${({ theme }) => theme.color.surface};
    > * { flex: 0 1 auto; }
    > button, > a, [data-record-actions] button, [data-record-actions] a { min-inline-size: 0; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2_5); border-radius: ${({ theme }) => theme.radius.control}; font-size: var(--gh-font-body); }
    [data-record-actions] input { min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1); border-radius: ${({ theme }) => theme.radius.control}; font-size: var(--gh-font-body); }
    [data-record-actions] { display: flex; flex-wrap: wrap; gap: var(--gh-spacing-2); }
    [data-record-icon] { flex: none; inline-size: var(--gh-size-8); block-size: var(--gh-size-8); padding: 0; }
    [data-record-summary] { min-inline-size: 0; margin-inline-end: auto; overflow-wrap: anywhere; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  }
  @media (min-width: ${({ theme }) => theme.viewport[64]}) and (max-width: ${({ theme }) => theme.viewport[79.99]}) { [data-record-summary] { display: none; } }
`;
export const RecordItem = styled.button`
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--gh-spacing-0_75) var(--gh-spacing-2);
  min-inline-size: 0; inline-size: 100%; padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5);
  border: 0; border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text};
  font: inherit; text-align: start; cursor: pointer;
  &[aria-current="true"], &[aria-selected="true"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: none; }
  &:disabled { cursor: not-allowed; opacity: var(--gh-opacity-60); }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  ${media.hover} { &:hover:not(:disabled):not([aria-current="true"]) { background: ${({ theme }) => theme.color.rowHover}; } }
  ${media.desktop} { min-block-size: var(--gh-size-13_5); padding: var(--gh-spacing-2) var(--gh-spacing-2_5); border: 0; border-block-end: 0; border-radius: ${({ theme }) => theme.radius.none}; font-size: var(--gh-font-body); }
`;
export const RecordItemTitle = styled.span`min-inline-size: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere;`;
export const RecordItemMeta = styled.span`min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); overflow-wrap: anywhere;`;
export const RecordEmpty = styled(EmptyPanel)`${media.desktop} { padding: var(--gh-spacing-7) var(--gh-spacing-5); }`;
export const RecordDesktop = styled.div`${media.belowDesktop} { display: none; }`;
export const RecordMobile = styled.div`${media.desktop} { display: none; }`;
