"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { adminControl } from "../admin-form";

export const Gallery = styled.main`
  min-block-size: 100dvh; padding: var(--gh-spacing-6); color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
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
  display: flex; align-items: end; flex-wrap: wrap; gap: var(--gh-spacing-2_5); padding: var(--gh-spacing-3); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > label { display: grid; gap: var(--gh-spacing-1_25); font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-bold); }
  select { ${adminControl} min-block-size: var(--gh-size-9); max-inline-size: 100%; font-size: var(--gh-font-body); }
  > [data-spacer] { margin-inline-start: auto; }
  button, a { min-block-size: var(--gh-size-9); }
  [data-view-switch] { display: flex; gap: 0; align-self: end; }
  [data-view-switch] button + button { margin-inline-start: calc(-1 * var(--gh-spacing-0_25)); }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.link}; z-index: var(--gh-layer-content); }
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
  > span { font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.mutedText}; white-space: nowrap; }
`;
export const Preview = styled.section`
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; min-inline-size: 0;
  > header { display: flex; justify-content: space-between; align-items: center; gap: var(--gh-spacing-3); padding: var(--gh-spacing-3) var(--gh-spacing-4); background: ${({ theme }) => theme.header.background}; border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.header.border}; color: ${({ theme }) => theme.header.text}; }
  > header > span { font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-bold); }
  > header img { max-inline-size: 52vw; block-size: auto; }
`;
export const PreviewCanvas = styled.div`
  min-inline-size: 0;
  ${media.desktop} {
    block-size: var(--gh-size-172_5);
    > [data-codes-workspace] { block-size: 100%; }

    [data-code-variant="ledger"] [data-code-form-stack] { gap: 0; padding: var(--gh-spacing-2) var(--gh-spacing-2_5); background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="ledger"] [data-grant-section] { padding: var(--gh-spacing-4_5) var(--gh-spacing-1_5); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="ledger"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="ledger"] [data-grant-payment] { border: 0; padding: var(--gh-spacing-3) var(--gh-spacing-1_5); }
    [data-code-variant="ledger"] [data-code-facts] > div { padding-block: var(--gh-spacing-3_5); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }

    [data-code-variant="framed"] [data-code-form-stack] { gap: var(--gh-spacing-3); }
    [data-code-variant="framed"] [data-grant-section] { border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding: var(--gh-spacing-5) var(--gh-spacing-4) var(--gh-spacing-4); background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="framed"] [data-grant-payment] { border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding: var(--gh-spacing-1_5) var(--gh-spacing-4); background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="framed"] [data-code-facts] { border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }

    [data-code-variant="guided"] [data-code-form-stack] { counter-reset: code-step; gap: var(--gh-spacing-4); }
    [data-code-variant="guided"] [data-grant-section] { position: relative; padding: var(--gh-spacing-3) var(--gh-spacing-3) var(--gh-spacing-3) var(--gh-spacing-13); border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="guided"] [data-grant-section]::before { counter-increment: code-step; content: "0" counter(code-step); position: absolute; inset: var(--gh-spacing-3_25) auto auto var(--gh-spacing-3); color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-heavy); }
    [data-code-variant="guided"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="guided"] [data-grant-payment] { margin-inline-start: var(--gh-spacing-13); }

    [data-code-variant="side-notes"] [data-code-form-stack] { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: start; gap: var(--gh-spacing-5); }
    [data-code-variant="side-notes"] [data-grant-section="account"] { grid-column: 1; grid-row: 1; grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="side-notes"] [data-grant-section="terms"] { grid-column: 1; grid-row: 2; }
    [data-code-variant="side-notes"] [data-grant-section="reason"] { grid-column: 2; grid-row: 1 / 3; padding: var(--gh-spacing-5) var(--gh-spacing-4); border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="side-notes"] [data-grant-section="reason"] textarea { min-block-size: var(--gh-size-44); }
    [data-code-variant="side-notes"] [data-grant-payment], [data-code-variant="side-notes"] [data-code-form-stack] > p { grid-column: 1 / -1; }
    [data-code-variant="side-notes"] [data-code-facts] { max-inline-size: var(--gh-size-180); padding: var(--gh-spacing-6); border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.controlBorder}; }

    [data-code-variant="compact"] { grid-template-columns: minmax(var(--gh-size-76), 27%) minmax(0, 1fr); }
    [data-code-variant="compact"] [data-code-form-stack] { gap: var(--gh-spacing-2_5); max-inline-size: var(--gh-size-216); }
    [data-code-variant="compact"] [data-grant-section] { gap: var(--gh-spacing-2_5); }
    [data-code-variant="compact"] [data-grant-section="reason"] textarea { min-block-size: var(--gh-size-16); }
    [data-code-variant="compact"] [data-code-row] { min-block-size: var(--gh-size-12); padding-block: var(--gh-spacing-1_5); }
    [data-code-variant="compact"] [data-grant-payment] { padding-block-start: 0; }

    [data-code-variant="spacious"] [data-code-form-stack] { gap: var(--gh-spacing-7); max-inline-size: var(--gh-size-208); margin-inline: auto; padding: var(--gh-spacing-6); }
    [data-code-variant="spacious"] [data-grant-section] { gap: var(--gh-spacing-5_5); }
    [data-code-variant="spacious"] [data-code-row] { min-block-size: var(--gh-size-18); padding: var(--gh-spacing-3) var(--gh-spacing-4); }
    [data-code-variant="spacious"] [data-code-facts] { padding: var(--gh-spacing-7); gap: var(--gh-spacing-6); }

    [data-code-variant="accent"] [data-code-form-stack] { border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; padding: var(--gh-spacing-5); background: ${({ theme }) => theme.color.surface}; gap: var(--gh-spacing-5_5); }
    [data-code-variant="accent"] [data-grant-section="account"] { padding-block-end: var(--gh-spacing-4_5); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="accent"] [data-grant-section="reason"] { padding: var(--gh-spacing-3_5); background: ${({ theme }) => theme.color.brandSoft}; }
    [data-code-variant="accent"] [data-code-facts] { border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; padding: var(--gh-spacing-6); }

    [data-code-variant="horizontal"] [data-code-form-stack] { gap: var(--gh-spacing-5_5); padding: var(--gh-spacing-3); }
    [data-code-variant="horizontal"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-5); }
    [data-code-variant="horizontal"] [data-grant-section="terms"] { padding: var(--gh-spacing-4); background: ${({ theme }) => theme.color.surface}; border-block: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="horizontal"] [data-code-facts] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-5_5); padding: var(--gh-spacing-6); }

    [data-code-variant="quiet"] [data-code-form-stack] { max-inline-size: var(--gh-size-152); margin: var(--gh-spacing-4_5) auto; padding: var(--gh-spacing-7); background: ${({ theme }) => theme.color.surface}; border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; gap: var(--gh-spacing-6); }
    [data-code-variant="quiet"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="quiet"] [data-grant-section="reason"] { padding-block-start: var(--gh-spacing-4); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="quiet"] [data-code-facts] { max-inline-size: var(--gh-size-152); margin: var(--gh-spacing-4_5) auto; padding: var(--gh-spacing-7); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  }
  ${media.belowDesktop} {
    padding: var(--gh-spacing-4);
    [data-code-variant="framed"] [data-grant-section], [data-code-variant="guided"] [data-grant-section] { padding: var(--gh-spacing-3_5); border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="accent"] [data-code-form-stack] { padding-inline-start: var(--gh-spacing-3); border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; }
    [data-code-variant="compact"] [data-code-form-stack] { gap: var(--gh-spacing-2_5); }
    [data-code-variant="spacious"] [data-code-form-stack] { gap: var(--gh-spacing-6); }
    [data-code-variant="quiet"] [data-code-form-stack] { padding: var(--gh-spacing-3); background: ${({ theme }) => theme.color.surface}; }
  }
  @media (min-width: ${({ theme }) => theme.viewport[64]}) and (max-width: ${({ theme }) => theme.viewport[74.99]}) {
    [data-code-variant="side-notes"] [data-code-form-stack] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="side-notes"] [data-grant-section="reason"] { grid-column: 1; grid-row: 3; }
    [data-code-variant="side-notes"] [data-grant-section="reason"] textarea { min-block-size: var(--gh-size-16); }
  }
`;
export const PreviewNote = styled.p`
  margin: 0; padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
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
  display: grid; align-content: start; gap: var(--gh-spacing-1_75); min-inline-size: 0; padding: var(--gh-spacing-3_5); text-align: start; border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; font: inherit; cursor: pointer;
  > span { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-heavy); }
  > strong { font-size: var(--gh-font-emphasis); }
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-body); line-height: var(--gh-leading-normal); }
  &[aria-current="true"] { border-color: ${({ theme }) => theme.color.link}; box-shadow: inset 0 var(--gh-size-0_75) ${({ theme }) => theme.color.link}; }
  &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
