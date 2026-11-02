"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { adminControl } from "../admin-form";
import { RecordBody } from "../record-workspace";
import { subscriberPresentation } from "../subscriber-presentation-styles";
import { AccountTop, Badges, TabBody } from "../subscriber-styles";

export const Gallery = styled.main`
  min-block-size: 100dvh; padding: var(--gh-spacing-6);
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  *, *::before, *::after { box-sizing: border-box; }
  a { color: ${({ theme }) => theme.color.link}; }
  > div { max-inline-size: var(--gh-size-360); margin-inline: auto; }
  @media (max-width: ${({ theme }) => theme.viewport[40]}) { padding: var(--gh-spacing-3_5); }
`;

export const Intro = styled.header`
  display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--gh-spacing-5); margin-block-end: var(--gh-spacing-5_5);
  > div { display: grid; gap: var(--gh-spacing-2); }
  small { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-heavy); letter-spacing: var(--gh-tracking-heading); text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(var(--gh-font-headline), 2.4vw, var(--gh-font-displayLarge)); letter-spacing: var(--gh-tracking-tightest); line-height: var(--gh-leading-control); }
  p { margin: 0; max-inline-size: var(--gh-size-248); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-emphasis); }
`;

export const Toolbar = styled.div`
  display: flex; align-items: end; flex-wrap: wrap; gap: var(--gh-spacing-2_5); padding: var(--gh-spacing-3);
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > label { display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-bold); }
  select { ${adminControl} min-block-size: var(--gh-size-9); max-inline-size: 100%; font-size: var(--gh-font-body); }
  > [data-spacer] { margin-inline-start: auto; }
  button, a { min-block-size: var(--gh-size-9); }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.link}; }
  @media (max-width: ${({ theme }) => theme.viewport[40]}) { > label { flex: 1 1 100%; } > [data-spacer] { margin-inline-start: 0; } }
`;

export const NumberStrip = styled.nav`
  display: flex; align-items: center; gap: var(--gh-spacing-1_5); overflow-x: auto; padding-block: var(--gh-spacing-3);
  button { flex: 1 0 var(--gh-size-10_5); min-block-size: var(--gh-size-9); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.mutedText}; font: inherit; font-size: var(--gh-font-body); font-weight: var(--gh-weight-heavy); cursor: pointer; }
  button[aria-current="true"] { color: ${({ theme }) => theme.color.onAction}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  button:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;

export const SampleHeading = styled.div`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-2_5); justify-content: space-between; align-items: end; margin-block: var(--gh-spacing-2) var(--gh-spacing-3);
  h2 { margin: 0 0 var(--gh-spacing-1); font-size: var(--gh-font-title); }
  p { margin: 0; font-size: var(--gh-font-body); color: ${({ theme }) => theme.color.mutedText}; }
  > span { font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.mutedText}; }
`;

export const Preview = styled.section`
  min-inline-size: 0; border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface};
  > header { display: flex; justify-content: space-between; align-items: center; gap: var(--gh-spacing-3); padding: var(--gh-spacing-3) var(--gh-spacing-4); background: ${({ theme }) => theme.header.background}; border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.header.border}; color: ${({ theme }) => theme.header.text}; }
  > header > span { font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-bold); }
  > header img { max-inline-size: 52vw; block-size: auto; }
`;

/** The live record components stay identical across studies; only their scoped presentation changes. */
export const PreviewCanvas = styled.div`
  min-inline-size: 0;
  [data-subscriber-review-workspace] { ${subscriberPresentation} }

  ${media.desktop} {
    block-size: var(--gh-size-180);
    > [data-subscriber-review-workspace] { block-size: 100%; }

    [data-subscriber-design="ledger"] [data-review-subscriber-row] { min-block-size: var(--gh-size-13_5); padding-block: var(--gh-spacing-1_5); }
    [data-subscriber-design="ledger"] [data-subscriber-summary] { border-inline: 0; }
    [data-subscriber-design="ledger"] [data-subscriber-summary] ${AccountTop} { padding-block: var(--gh-spacing-2); }
    [data-subscriber-design="ledger"] [data-subscriber-summary] ${AccountTop} h2 { font-size: var(--gh-font-reading); }
    [data-subscriber-design="ledger"] [data-subscriber-stats] > div + div { border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-subscriber-design="ledger"] [data-subscriber-actions] > button:not(:first-child) { border-color: transparent; background: transparent; }
    [data-subscriber-design="ledger"] [data-subscriber-tab] { border-inline: 0; }

    [data-subscriber-design="identity"] [data-subscriber-summary] ${AccountTop} { padding: var(--gh-spacing-3); background: ${({ theme }) => theme.color.brandSoft}; }
    [data-subscriber-design="identity"] [data-subscriber-summary] ${AccountTop} h2 { font-size: var(--gh-font-lead); }
    [data-subscriber-design="identity"] [data-subscriber-stats] { border-block-start: 0; }
    [data-subscriber-design="identity"] [data-subscriber-tabs] > button[aria-selected="true"] { color: ${({ theme }) => theme.color.onAction}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="identity"] [data-review-phone] { font-size: var(--gh-font-emphasis); }

    [data-subscriber-design="split"] [data-subscriber-summary] { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
    [data-subscriber-design="split"] [data-subscriber-summary] ${AccountTop} { flex-direction: column; align-items: start; justify-content: center; border: 0; }
    [data-subscriber-design="split"] [data-subscriber-stats] { grid-template-columns: repeat(2, minmax(0, 1fr)); border-block: 0; border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-subscriber-design="split"] [data-subscriber-actions] { grid-column: 1 / -1; border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-subscriber-design="split"] [data-subscriber-summary] > p { grid-column: 1 / -1; }

    [data-subscriber-design="ribbon"] [data-subscriber-summary] { border: 0; }
    [data-subscriber-design="ribbon"] [data-subscriber-stats] > div { display: flex; flex-wrap: wrap; gap: var(--gh-spacing-0_75) var(--gh-spacing-1_5); align-items: baseline; }
    [data-subscriber-design="ribbon"] [data-subscriber-stats] dd { font-size: var(--gh-font-body); }
    [data-subscriber-design="ribbon"] [data-subscriber-actions] { background: ${({ theme }) => theme.color.brandSoft}; }
    [data-subscriber-design="ribbon"] [data-subscriber-actions] > button:not(:first-child) { background: ${({ theme }) => theme.color.surface}; }
    [data-subscriber-design="ribbon"] [data-subscriber-tabs] > button { flex: 1 0 auto; }

    [data-subscriber-design="quiet"] [data-subscriber-summary] { max-inline-size: var(--gh-size-216); inline-size: 100%; margin-inline: auto; border-color: transparent; }
    [data-subscriber-design="quiet"] [data-subscriber-summary] ${AccountTop} { flex-direction: column; align-items: center; text-align: center; gap: var(--gh-spacing-1_25); }
    [data-subscriber-design="quiet"] [data-subscriber-stats] { border-block: 0; }
    [data-subscriber-design="quiet"] [data-subscriber-stats] > div { text-align: center; }
    [data-subscriber-design="quiet"] [data-subscriber-actions] { justify-content: center; }
    [data-subscriber-design="quiet"] [data-subscriber-actions] > button:not(:first-child) { border-color: transparent; }
    [data-subscriber-design="quiet"] [data-subscriber-tabs], [data-subscriber-design="quiet"] [data-subscriber-tab] { max-inline-size: var(--gh-size-216); inline-size: 100%; justify-self: center; }

    [data-subscriber-design="dense"] { grid-template-columns: clamp(var(--gh-size-80), 28vw, var(--gh-size-96)) minmax(0, 1fr); }
    [data-subscriber-design="dense"] [data-review-subscriber-row] { min-block-size: var(--gh-size-12); padding-block: var(--gh-spacing-1_25); }
    [data-subscriber-design="dense"] [data-subscriber-review-filters] { gap: var(--gh-spacing-1_5); }
    [data-subscriber-design="dense"] [data-subscriber-summary] ${AccountTop} { padding: var(--gh-spacing-1_75) var(--gh-spacing-2_5); }
    [data-subscriber-design="dense"] [data-subscriber-summary] ${AccountTop} h2 { font-size: var(--gh-font-section); }
    [data-subscriber-design="dense"] [data-subscriber-stats] > div { padding-block: var(--gh-spacing-1_25); }
    [data-subscriber-design="dense"] [data-subscriber-stats] dd { font-size: var(--gh-font-body); }
    [data-subscriber-design="dense"] [data-subscriber-actions] { gap: var(--gh-spacing-1); padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5); }
    [data-subscriber-design="dense"] [data-subscriber-actions] > button { min-block-size: var(--gh-size-7_5); padding: var(--gh-spacing-0_75) var(--gh-spacing-1_75); }
    [data-subscriber-design="dense"] [data-subscriber-tabs] > button { min-block-size: var(--gh-size-7_5); padding-block: var(--gh-spacing-1); }
    [data-subscriber-design="dense"] [data-subscriber-detail] ${RecordBody} { gap: var(--gh-spacing-1_5); padding: var(--gh-spacing-2_5); }

    [data-subscriber-design="accent"] [data-subscriber-summary] { border: 0; border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="accent"] [data-review-subscriber-row][aria-current="true"] { box-shadow: inset var(--gh-size-1) 0 ${({ theme }) => theme.color.link}; }
    [data-subscriber-design="accent"] [data-subscriber-tabs] { border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="accent"] [data-subscriber-tab] { border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.border}; }

    [data-subscriber-design="status"] [data-review-subscriber-row] { grid-template-columns: auto minmax(0, 1fr) var(--gh-size-7_5); }
    [data-subscriber-design="status"] [data-review-row-status] { grid-column: 1; grid-row: 1; justify-self: start; }
    [data-subscriber-design="status"] [data-review-network] { grid-column: 3; }
    [data-subscriber-design="status"] [data-review-row-meta] { grid-column: 1 / 3; }
    [data-subscriber-design="status"] [data-subscriber-summary] ${AccountTop} { flex-direction: row-reverse; }
    [data-subscriber-design="status"] [data-subscriber-summary] ${AccountTop} > div { text-align: end; }
    [data-subscriber-design="status"] [data-subscriber-summary] ${Badges} { align-self: start; padding: var(--gh-spacing-1); background: ${({ theme }) => theme.color.brandSoft}; }

    [data-subscriber-design="focus"] { grid-template-columns: clamp(var(--gh-size-76), 25vw, var(--gh-size-88)) minmax(0, 1fr); }
    [data-subscriber-design="focus"] [data-subscriber-summary] { border-inline: 0; border-block-end: 0; }
    [data-subscriber-design="focus"] [data-subscriber-detail] ${RecordBody} { gap: 0; padding: var(--gh-spacing-3); }
    [data-subscriber-design="focus"] [data-subscriber-tabs] { margin-block-start: var(--gh-spacing-2); }
    [data-subscriber-design="focus"] [data-subscriber-tab] { border-block-start: 0; }
    [data-subscriber-design="focus"] [data-subscriber-tab] ${TabBody} { padding: var(--gh-spacing-4_5); }
    [data-subscriber-design="focus"] [data-review-row-meta] { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }

  @container subscriber-detail (max-width: ${({ theme }) => theme.viewport[30]}) {
    [data-subscriber-design="split"] [data-subscriber-summary] { grid-template-columns: minmax(0, 1fr); }
    [data-subscriber-design="split"] [data-subscriber-stats] { grid-template-columns: repeat(4, minmax(0, 1fr)); border-inline-start: 0; border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  }

  ${media.belowDesktop} {
    padding: var(--gh-spacing-3_5);
    [data-subscriber-design="identity"] [data-subscriber-summary] ${AccountTop}, [data-subscriber-design="ribbon"] [data-subscriber-actions] { background: ${({ theme }) => theme.color.brandSoft}; }
    [data-subscriber-design="accent"] [data-subscriber-summary] { border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="quiet"] [data-subscriber-summary] ${AccountTop} { flex-direction: column; align-items: center; text-align: center; }
    [data-subscriber-design="dense"] [data-review-subscriber-row] { min-block-size: var(--gh-size-14_5); padding-block: var(--gh-spacing-1_75); }
    [data-subscriber-design="ledger"] [data-subscriber-summary] { border-inline: 0; }
  }
`;

export const PreviewNote = styled.p`
  margin: 0; padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal);
`;

export const Overview = styled.section`
  padding-block: var(--gh-spacing-7) var(--gh-spacing-4); scroll-margin-block-start: var(--gh-spacing-4);
  > h2 { margin: 0 0 var(--gh-spacing-1_5); font-size: var(--gh-font-title); }
  > p { margin: 0 0 var(--gh-spacing-4); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-body); }
  > div { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--gh-spacing-3); }
  @media (max-width: ${({ theme }) => theme.viewport[74.99]}) { > div { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: ${({ theme }) => theme.viewport[40]}) { > div { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const OverviewCard = styled.button`
  display: grid; align-content: start; gap: var(--gh-spacing-1_75); min-inline-size: 0; padding: var(--gh-spacing-3_5); text-align: start;
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; font: inherit; cursor: pointer;
  > span { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-heavy); }
  > strong { font-size: var(--gh-font-emphasis); }
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-body); line-height: var(--gh-leading-normal); }
  &[aria-current="true"] { border-color: ${({ theme }) => theme.color.link}; box-shadow: inset 0 var(--gh-size-0_75) ${({ theme }) => theme.color.link}; }
  &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
