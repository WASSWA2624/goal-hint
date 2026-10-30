"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { adminControl } from "../admin-form";
import { RecordBody } from "../record-workspace";
import { subscriberPresentation } from "../subscriber-presentation-styles";
import { AccountTop, Badges, TabBody } from "../subscriber-styles";

export const Gallery = styled.main`
  min-block-size: 100dvh; padding: 24px;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  *, *::before, *::after { box-sizing: border-box; }
  a { color: ${({ theme }) => theme.color.link}; }
  > div { max-inline-size: 1440px; margin-inline: auto; }
  @media (max-width: 40rem) { padding: 14px; }
`;

export const Intro = styled.header`
  display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 20px; margin-block-end: 22px;
  > div { display: grid; gap: 8px; }
  small { color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(1.5rem, 2.4vw, 2.25rem); letter-spacing: -0.04em; line-height: 1.2; }
  p { margin: 0; max-inline-size: 62rem; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; }
`;

export const Toolbar = styled.div`
  display: flex; align-items: end; flex-wrap: wrap; gap: 10px; padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > label { display: grid; gap: 5px; min-inline-size: 0; font-size: 0.75rem; font-weight: 700; }
  select { ${adminControl} min-block-size: 36px; max-inline-size: 100%; font-size: 0.8125rem; }
  > [data-spacer] { margin-inline-start: auto; }
  button, a { min-block-size: 36px; }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.link}; }
  @media (max-width: 40rem) { > label { flex: 1 1 100%; } > [data-spacer] { margin-inline-start: 0; } }
`;

export const NumberStrip = styled.nav`
  display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-block: 12px;
  button { flex: 1 0 42px; min-block-size: 36px; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.mutedText}; font: inherit; font-size: 0.8125rem; font-weight: 800; cursor: pointer; }
  button[aria-current="true"] { color: ${({ theme }) => theme.color.onAction}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
  button:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;

export const SampleHeading = styled.div`
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: end; margin-block: 8px 12px;
  h2 { margin: 0 0 4px; font-size: 1.125rem; }
  p { margin: 0; font-size: 0.8125rem; color: ${({ theme }) => theme.color.mutedText}; }
  > span { font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; }
`;

export const Preview = styled.section`
  min-inline-size: 0; border: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface};
  > header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: ${({ theme }) => theme.header.background}; border-block-end: 1px solid ${({ theme }) => theme.header.border}; color: ${({ theme }) => theme.header.text}; }
  > header > span { font-size: 0.75rem; font-weight: 700; }
  > header img { max-inline-size: 52vw; block-size: auto; }
`;

/** The live record components stay identical across studies; only their scoped presentation changes. */
export const PreviewCanvas = styled.div`
  min-inline-size: 0;
  [data-subscriber-review-workspace] { ${subscriberPresentation} }

  ${media.desktop} {
    block-size: 720px;
    > [data-subscriber-review-workspace] { block-size: 100%; }

    [data-subscriber-design="ledger"] [data-review-subscriber-row] { min-block-size: 54px; padding-block: 6px; }
    [data-subscriber-design="ledger"] [data-subscriber-summary] { border-inline: 0; }
    [data-subscriber-design="ledger"] [data-subscriber-summary] ${AccountTop} { padding-block: 8px; }
    [data-subscriber-design="ledger"] [data-subscriber-summary] ${AccountTop} h2 { font-size: 0.9375rem; }
    [data-subscriber-design="ledger"] [data-subscriber-stats] > div + div { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-subscriber-design="ledger"] [data-subscriber-actions] > button:not(:first-child) { border-color: transparent; background: transparent; }
    [data-subscriber-design="ledger"] [data-subscriber-tab] { border-inline: 0; }

    [data-subscriber-design="identity"] [data-subscriber-summary] ${AccountTop} { padding: 12px; background: ${({ theme }) => theme.color.brandSoft}; }
    [data-subscriber-design="identity"] [data-subscriber-summary] ${AccountTop} h2 { font-size: 1.1875rem; }
    [data-subscriber-design="identity"] [data-subscriber-stats] { border-block-start: 0; }
    [data-subscriber-design="identity"] [data-subscriber-tabs] > button[aria-selected="true"] { color: ${({ theme }) => theme.color.onAction}; background: ${({ theme }) => theme.color.brand}; border-color: ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="identity"] [data-review-phone] { font-size: 0.875rem; }

    [data-subscriber-design="split"] [data-subscriber-summary] { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
    [data-subscriber-design="split"] [data-subscriber-summary] ${AccountTop} { flex-direction: column; align-items: start; justify-content: center; border: 0; }
    [data-subscriber-design="split"] [data-subscriber-stats] { grid-template-columns: repeat(2, minmax(0, 1fr)); border-block: 0; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-subscriber-design="split"] [data-subscriber-actions] { grid-column: 1 / -1; border-block-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-subscriber-design="split"] [data-subscriber-summary] > p { grid-column: 1 / -1; }

    [data-subscriber-design="ribbon"] [data-subscriber-summary] { border: 0; }
    [data-subscriber-design="ribbon"] [data-subscriber-stats] > div { display: flex; flex-wrap: wrap; gap: 3px 6px; align-items: baseline; }
    [data-subscriber-design="ribbon"] [data-subscriber-stats] dd { font-size: 0.8125rem; }
    [data-subscriber-design="ribbon"] [data-subscriber-actions] { background: ${({ theme }) => theme.color.brandSoft}; }
    [data-subscriber-design="ribbon"] [data-subscriber-actions] > button:not(:first-child) { background: ${({ theme }) => theme.color.surface}; }
    [data-subscriber-design="ribbon"] [data-subscriber-tabs] > button { flex: 1 0 auto; }

    [data-subscriber-design="quiet"] [data-subscriber-summary] { max-inline-size: 54rem; inline-size: 100%; margin-inline: auto; border-color: transparent; }
    [data-subscriber-design="quiet"] [data-subscriber-summary] ${AccountTop} { flex-direction: column; align-items: center; text-align: center; gap: 5px; }
    [data-subscriber-design="quiet"] [data-subscriber-stats] { border-block: 0; }
    [data-subscriber-design="quiet"] [data-subscriber-stats] > div { text-align: center; }
    [data-subscriber-design="quiet"] [data-subscriber-actions] { justify-content: center; }
    [data-subscriber-design="quiet"] [data-subscriber-actions] > button:not(:first-child) { border-color: transparent; }
    [data-subscriber-design="quiet"] [data-subscriber-tabs], [data-subscriber-design="quiet"] [data-subscriber-tab] { max-inline-size: 54rem; inline-size: 100%; justify-self: center; }

    [data-subscriber-design="dense"] { grid-template-columns: clamp(20rem, 28vw, 24rem) minmax(0, 1fr); }
    [data-subscriber-design="dense"] [data-review-subscriber-row] { min-block-size: 48px; padding-block: 5px; }
    [data-subscriber-design="dense"] [data-subscriber-review-filters] { gap: 6px; }
    [data-subscriber-design="dense"] [data-subscriber-summary] ${AccountTop} { padding: 7px 10px; }
    [data-subscriber-design="dense"] [data-subscriber-summary] ${AccountTop} h2 { font-size: 1rem; }
    [data-subscriber-design="dense"] [data-subscriber-stats] > div { padding-block: 5px; }
    [data-subscriber-design="dense"] [data-subscriber-stats] dd { font-size: 0.8125rem; }
    [data-subscriber-design="dense"] [data-subscriber-actions] { gap: 4px; padding: 6px 10px; }
    [data-subscriber-design="dense"] [data-subscriber-actions] > button { min-block-size: 30px; padding: 3px 7px; }
    [data-subscriber-design="dense"] [data-subscriber-tabs] > button { min-block-size: 30px; padding-block: 4px; }
    [data-subscriber-design="dense"] [data-subscriber-detail] ${RecordBody} { gap: 6px; padding: 10px; }

    [data-subscriber-design="accent"] [data-subscriber-summary] { border: 0; border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="accent"] [data-review-subscriber-row][aria-current="true"] { box-shadow: inset 4px 0 ${({ theme }) => theme.color.link}; }
    [data-subscriber-design="accent"] [data-subscriber-tabs] { border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="accent"] [data-subscriber-tab] { border-inline-start: 3px solid ${({ theme }) => theme.color.border}; }

    [data-subscriber-design="status"] [data-review-subscriber-row] { grid-template-columns: auto minmax(0, 1fr) 30px; }
    [data-subscriber-design="status"] [data-review-row-status] { grid-column: 1; grid-row: 1; justify-self: start; }
    [data-subscriber-design="status"] [data-review-network] { grid-column: 3; }
    [data-subscriber-design="status"] [data-review-row-meta] { grid-column: 1 / 3; }
    [data-subscriber-design="status"] [data-subscriber-summary] ${AccountTop} { flex-direction: row-reverse; }
    [data-subscriber-design="status"] [data-subscriber-summary] ${AccountTop} > div { text-align: end; }
    [data-subscriber-design="status"] [data-subscriber-summary] ${Badges} { align-self: start; padding: 4px; background: ${({ theme }) => theme.color.brandSoft}; }

    [data-subscriber-design="focus"] { grid-template-columns: clamp(19rem, 25vw, 22rem) minmax(0, 1fr); }
    [data-subscriber-design="focus"] [data-subscriber-summary] { border-inline: 0; border-block-end: 0; }
    [data-subscriber-design="focus"] [data-subscriber-detail] ${RecordBody} { gap: 0; padding: 12px; }
    [data-subscriber-design="focus"] [data-subscriber-tabs] { margin-block-start: 8px; }
    [data-subscriber-design="focus"] [data-subscriber-tab] { border-block-start: 0; }
    [data-subscriber-design="focus"] [data-subscriber-tab] ${TabBody} { padding: 18px; }
    [data-subscriber-design="focus"] [data-review-row-meta] { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }

  @container subscriber-detail (max-width: 30rem) {
    [data-subscriber-design="split"] [data-subscriber-summary] { grid-template-columns: minmax(0, 1fr); }
    [data-subscriber-design="split"] [data-subscriber-stats] { grid-template-columns: repeat(4, minmax(0, 1fr)); border-inline-start: 0; border-block-start: 1px solid ${({ theme }) => theme.color.border}; }
  }

  ${media.belowDesktop} {
    padding: 14px;
    [data-subscriber-design="identity"] [data-subscriber-summary] ${AccountTop}, [data-subscriber-design="ribbon"] [data-subscriber-actions] { background: ${({ theme }) => theme.color.brandSoft}; }
    [data-subscriber-design="accent"] [data-subscriber-summary] { border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; }
    [data-subscriber-design="quiet"] [data-subscriber-summary] ${AccountTop} { flex-direction: column; align-items: center; text-align: center; }
    [data-subscriber-design="dense"] [data-review-subscriber-row] { min-block-size: 58px; padding-block: 7px; }
    [data-subscriber-design="ledger"] [data-subscriber-summary] { border-inline: 0; }
  }
`;

export const PreviewNote = styled.p`
  margin: 0; padding: 10px 14px; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.5;
`;

export const Overview = styled.section`
  padding-block: 28px 16px; scroll-margin-block-start: 16px;
  > h2 { margin: 0 0 6px; font-size: 1.125rem; }
  > p { margin: 0 0 16px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem; }
  > div { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  @media (max-width: 74.99rem) { > div { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 40rem) { > div { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const OverviewCard = styled.button`
  display: grid; align-content: start; gap: 7px; min-inline-size: 0; padding: 14px; text-align: start;
  border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; font: inherit; cursor: pointer;
  > span { color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: 800; }
  > strong { font-size: 0.875rem; }
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: 400; line-height: 1.5; }
  &[aria-current="true"] { border-color: ${({ theme }) => theme.color.link}; box-shadow: inset 0 3px ${({ theme }) => theme.color.link}; }
  &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
