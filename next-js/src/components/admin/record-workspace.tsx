"use client";

import { sectionSurface } from "@/components/ui/filled-surfaces";
import { controlRow } from "@/components/ui/control-layout";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { uiGeometry } from "@/styles/theme-tokens";
import { EmptyPanel, StickyActions, TextAction, visuallyHidden } from "./desk-styles";
import { useHorizontalResize, workspaceResizeRail } from "./workspace-resize";

const { min, detailMin } = uiGeometry.recordList;
const handleWidth = uiGeometry.sidebar.handle;

export function useRecordView({ initiallyOpen = false } = {}) {
  const [detailOpen, setDetailOpen] = useState(initiallyOpen);
  const origin = useRef<{ workspace: HTMLElement; trigger: HTMLElement; scrollTop: number } | null>(null);

  function openDetail(trigger?: HTMLElement | null) {
    const workspace = trigger?.closest<HTMLElement>("[data-record-workspace]");
    if (trigger && workspace) {
      const scroll = workspace.querySelector<HTMLElement>("[data-record-list-scroll]");
      origin.current = { workspace, trigger, scrollTop: scroll?.scrollTop ?? 0 };
    }
    if (detailOpen) return;
    setDetailOpen(true);
    requestAnimationFrame(() => {
      const back = workspace?.querySelector<HTMLButtonElement>("[data-record-back]");
      if (!back?.getClientRects().length) return;
      const focus = back.disabled ? back.closest<HTMLElement>("[data-record-details]") : back;
      focus?.focus({ preventScroll: true });
    });
  }

  function closeDetail(event?: MouseEvent<HTMLButtonElement>) {
    const workspace = event?.currentTarget.closest("[data-record-workspace]");
    setDetailOpen(false);
    requestAnimationFrame(() => {
      const from = origin.current;
      const list = (from?.workspace ?? workspace)?.querySelector<HTMLElement>("[data-record-list-scroll]");
      if (!list?.getClientRects().length) return;
      if (from) list.scrollTop = from.scrollTop;
      const target = from?.trigger.getClientRects().length && !from.trigger.matches(":disabled") ? from.trigger : list;
      target.focus({ preventScroll: true });
    });
  }

  return { detailOpen, openDetail, closeDetail };
}

function RecordLayout({ children, style, ...props }: ComponentPropsWithoutRef<"div">) {
  const root = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState<number>();
  const [bounds, setBounds] = useState({ width: min, max: min });
  const { handle, resizing } = useHorizontalResize({ ...bounds, min, onChange: width => setListWidth(width) });
  useEffect(() => {
    const workspace = root.current;
    const list = workspace?.querySelector<HTMLElement>(":scope > [data-record-list-pane]");
    if (!workspace || !list) return;
    const measure = () => {
      const width = Math.round(list.getBoundingClientRect().width);
      const max = Math.max(min, Math.floor(workspace.getBoundingClientRect().width) - detailMin - handleWidth);
      setBounds(previous => previous.width === width && previous.max === max ? previous : { width, max });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div {...props} ref={root} data-record-resizing={resizing || undefined}
    style={{ ...style, "--record-list-width": listWidth === undefined ? undefined : `${listWidth}px` } as CSSProperties}>
    {children}
    <RecordListResize data-record-list-resize role="separator" tabIndex={0} aria-label="Resize record list" {...handle} />
  </div>;
}

const RecordListResize = styled.div`
  display: none;
  ${media.desktop} {
    display: block; grid-column: 2; grid-row: 3; min-inline-size: 0;
    ${workspaceResizeRail}
    border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder};
  }
`;

/** Shared geometry for record screens. Forms, selection and permissions stay with each screen. */
export const RecordWorkspace = styled(RecordLayout).attrs<{
  "data-record-workspace"?: string; $compact?: boolean; $detailOpen?: boolean;
}>(({ $compact, $detailOpen }) => ({
  "data-record-workspace": "", "data-record-compact": $compact || undefined,
  "data-record-detail-open": $detailOpen || undefined,
}))`
  --record-list-default: clamp(var(--gh-size-88), 30vw, var(--gh-size-104));
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  > * { min-inline-size: 0; }
  &[data-record-compact] {
    --record-list-default: clamp(var(--gh-size-70), 24vw, var(--gh-size-82_5));
    [data-record-list-scroll] {
      gap: 0;
      > li + li { border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
      [data-record-row-text] { row-gap: 0; }
      [data-record-row-primary] { flex-wrap: nowrap; white-space: nowrap; }
      [data-record-row-primary] > *, [data-record-row-secondary] {
        min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
    }
  }
  ${media.belowDesktop} {
    &[data-record-compact] {
      block-size: max(var(--gh-size-72), calc(100dvh - var(--app-header-height)
        - var(--app-mobile-tab-height) - env(safe-area-inset-bottom) - var(--gh-spacing-1)));
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 0;
      > header { grid-row: 1; padding-block-end: var(--gh-spacing-2); }
      > [data-record-feedback] { grid-row: 2; padding-block-end: var(--gh-spacing-1); }
      > [data-record-list-pane] {
        grid-row: 3; grid-template-rows: auto minmax(0, 1fr) auto; min-block-size: 0; gap: 0;
      }
      > [data-record-details] { display: none; }
      [data-record-list-tools] { grid-row: 1; }
      [data-record-list-scroll] {
        grid-row: 2; min-block-size: 0; max-block-size: none; overflow-y: auto;
        overscroll-behavior-y: contain; scrollbar-width: thin;
      }
      [data-record-list-footer] { grid-row: 3; padding-block: var(--gh-spacing-1); }
      &[data-record-detail-open] {
        > header { display: contents; > :not(h1) { display: none; } }
        > [data-record-list-pane] { display: none; }
        > [data-record-details] {
          display: grid; grid-row: 3; grid-template-rows: auto minmax(0, 1fr); min-block-size: 0;
        }
        [data-record-card] { grid-template-rows: minmax(0, 1fr) auto; min-block-size: 0; gap: 0; }
        [data-record-detail-scroll] {
          display: grid; align-content: start; min-block-size: 0; overflow: auto;
          overscroll-behavior-y: contain; scrollbar-width: thin; scroll-padding-block: var(--gh-spacing-3);
        }
        [data-record-footer] { position: static; flex-wrap: wrap; padding-block: var(--gh-spacing-1); }
      }
    }
  }
  ${media.desktop} {
    grid-template-columns: clamp(${min}px, var(--record-list-width, var(--record-list-default)), calc(100% - ${detailMin + handleWidth}px))
      ${handleWidth}px minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    min-block-size: 0;
    gap: 0;
    overflow: hidden;
    &[data-record-resizing="true"], &[data-record-resizing="true"] * { cursor: col-resize !important; user-select: none; }
  }
`;
export const RecordHead = styled.header`
  ${sectionSurface}
  position: relative;
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2_5) var(--gh-spacing-4);
  min-inline-size: 0; padding-inline: ${({ theme }) => theme.layout.sectionPadding};
  > h1 { ${visuallyHidden} }
  ${media.desktop} {
    grid-column: 1 / -1; min-block-size: var(--gh-size-12); padding: var(--gh-spacing-1) ${({ theme }) => theme.layout.sectionPadding};
    border-block-end: 0;
    ${sectionSurface}
    button, nav { border-radius: ${({ theme }) => theme.radius.control}; }
  }
`;
export const RecordFeedback = styled.div.attrs<{ "data-record-feedback"?: string }>({ "data-record-feedback": "" })`
  min-inline-size: 0;
  > p { margin: 0; }
  > p + p { margin-block-start: var(--gh-spacing-2); }
  ${media.desktop} { grid-column: 1 / -1; grid-row: 2; padding: var(--gh-spacing-2) var(--gh-spacing-4); border-block-end: 0; }
`;
export const RecordList = styled.section.attrs<{ "data-record-list-pane"?: string }>({ "data-record-list-pane": "" })`
  position: relative; display: grid; min-inline-size: 0; gap: var(--gh-spacing-3);
  > h2[data-record-list-title] { ${visuallyHidden} }
  ${media.desktop} {
    grid-column: 1; grid-row: 3; grid-template-rows: auto minmax(0, 1fr) auto;
    min-block-size: 0; gap: 0; overflow: hidden;
    background: ${({ theme }) => theme.color.surface};
  }
`;
export const RecordListTools = styled.div.attrs<{ "data-record-list-tools"?: string }>({ "data-record-list-tools": "" })`
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
export const RecordListFooter = styled.div.attrs<{ "data-record-list-footer"?: string }>({ "data-record-list-footer": "" })`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2); min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
  ${media.desktop} {
    grid-row: 3; padding: var(--gh-spacing-1_25) ${({ theme }) => theme.layout.sectionPadding}; font-size: var(--gh-font-caption);
    border-block-start: 0;
    ${sectionSurface}
  }
`;
export const RecordDetails = styled.section.attrs<{ "data-record-details"?: string }>({ "data-record-details": "", tabIndex: -1 })`
  display: grid; min-inline-size: 0;
  ${media.desktop} { grid-column: 3; grid-row: 3; min-block-size: 0; overflow: hidden; }
`;
export const RecordCard = styled.article.attrs<{ "data-record-card"?: string }>({ "data-record-card": "" })`
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
  ${sectionSurface}
  padding-inline: ${({ theme }) => theme.layout.sectionPadding};
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2_5); min-inline-size: 0;
  h2 { min-inline-size: 0; overflow-wrap: anywhere; font-size: var(--gh-font-subheading); }
  ${media.desktop} {
    min-block-size: var(--gh-size-11); padding: var(--gh-spacing-1_5) ${({ theme }) => theme.layout.sectionPadding};
    border-block-end: 0;
    ${sectionSurface}
    a, button { min-block-size: var(--form-control-height); }
  }
`;
export const RecordBody = styled.div`
  display: grid; align-content: start; gap: var(--gh-spacing-3); min-inline-size: 0;
  ${media.desktop} { padding: var(--gh-spacing-3) ${({ theme }) => theme.layout.sectionPadding}; }
`;
export const RecordFooter = styled(StickyActions).attrs<{ "data-record-footer"?: string }>({ "data-record-footer": "" })`
  margin-inline: 0; padding-inline: ${({ theme }) => theme.layout.sectionPadding};
  ${media.desktop} {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--gh-spacing-2);
    position: static; min-inline-size: 0; margin: 0; padding: var(--gh-spacing-1_5) ${({ theme }) => theme.layout.sectionPadding};
    border: 0; border-block-start: 0;
    ${sectionSurface}
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
  [data-record-compact] && {
    min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1_5);
    border-radius: ${({ theme }) => theme.radius.none};
  }
  &:has(> [data-record-row-content]) { display: block; }
`;

const BackButton = styled(TextAction)`
  justify-self: start; padding-inline: 0 var(--gh-spacing-2); font-weight: var(--gh-weight-medium);
  ${media.desktop} { display: none; }
`;

export function RecordBack({ children, ...button }: ComponentPropsWithoutRef<"button">) {
  return <BackButton type="button" data-record-back {...button}><ChevronLeftIcon />{children}</BackButton>;
}
export const RecordItemTitle = styled.span`min-inline-size: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere;`;
export const RecordItemMeta = styled.span`min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); overflow-wrap: anywhere;`;
export const RecordDisclosureSummary = styled(RecordItem).attrs({ as: "summary" })`
  && { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; list-style: none; }
  &::-webkit-details-marker { display: none; }
  > svg { font-size: var(--gh-font-section); color: ${({ theme }) => theme.color.mutedText}; }
  details[open] > & > svg { transform: rotate(180deg); }
  ${media.desktop} {
    && { grid-template-columns: minmax(0, 1fr); }
    > svg { display: none; }
  }
`;

const RowContent = styled.span`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  &:has(> [data-record-row-icon]) { grid-template-columns: var(--gh-size-7_5) minmax(0, 1fr); }
  > [data-record-row-icon] {
    display: grid; place-items: center; min-block-size: var(--gh-size-6);
    color: ${({ theme }) => theme.color.link};
    > svg { font-size: var(--gh-font-section); }
    > * { max-inline-size: 100%; }
    [data-payment-logo] { max-inline-size: var(--gh-size-7_5); }
  }
  > [data-record-row-text] { display: grid; gap: var(--gh-spacing-0_5); min-inline-size: 0; }
  [data-record-row-primary] { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--gh-spacing-2); min-inline-size: 0; }
`;

/** Shared inner layout for buttons, links and native disclosure summaries. */
export function RecordRowContent({ icon, primary, secondary }: { icon?: ReactNode; primary: ReactNode; secondary?: ReactNode }) {
  return <RowContent data-record-row-content>
    {icon && <span data-record-row-icon>{icon}</span>}
    <span data-record-row-text>
      <span data-record-row-primary>{primary}</span>
      {secondary && <RecordItemMeta data-record-row-secondary>{secondary}</RecordItemMeta>}
    </span>
  </RowContent>;
}
export const RecordEmpty = styled(EmptyPanel)`${media.desktop} { padding: var(--gh-spacing-7) var(--gh-spacing-5); }`;
export const RecordDesktop = styled.div`${media.belowDesktop} { display: none; }`;
export const RecordMobile = styled.div`${media.desktop} { display: none; }`;
