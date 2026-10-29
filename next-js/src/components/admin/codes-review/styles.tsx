"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { adminControl } from "../admin-form";

export const Gallery = styled.main`
  min-block-size: 100dvh; padding: 24px; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  *, *::before, *::after { box-sizing: border-box; }
  a { color: ${({ theme }) => theme.color.link}; }
  button, input, select, textarea, fieldset, details { border-radius: 0; }
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
  display: flex; align-items: end; flex-wrap: wrap; gap: 10px; padding: 12px; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
  > label { display: grid; gap: 5px; font-size: 0.75rem; font-weight: 700; }
  select { ${adminControl} min-block-size: 36px; max-inline-size: 100%; font-size: 0.8125rem; }
  > [data-spacer] { margin-inline-start: auto; }
  button, a { min-block-size: 36px; }
  [data-view-switch] { display: flex; gap: 0; align-self: end; }
  [data-view-switch] button + button { margin-inline-start: -1px; }
  button[aria-pressed="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.link}; z-index: 1; }
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
  > span { font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; white-space: nowrap; }
`;
export const Preview = styled.section`
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; min-inline-size: 0;
  > header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: ${({ theme }) => theme.header.background}; border-block-end: 1px solid ${({ theme }) => theme.header.border}; color: ${({ theme }) => theme.header.text}; }
  > header > span { font-size: 0.75rem; font-weight: 700; }
  > header img { max-inline-size: 52vw; block-size: auto; }
`;
export const PreviewCanvas = styled.div`
  min-inline-size: 0;
  ${media.desktop} {
    block-size: 690px;
    > [data-codes-workspace] { block-size: 100%; }

    [data-code-variant="ledger"] [data-code-form-stack] { gap: 0; padding: 8px 10px; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="ledger"] [data-grant-section] { padding: 18px 6px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="ledger"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="ledger"] [data-grant-payment] { border: 0; padding: 12px 6px; }
    [data-code-variant="ledger"] [data-code-facts] > div { padding-block: 14px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }

    [data-code-variant="framed"] [data-code-form-stack] { gap: 12px; }
    [data-code-variant="framed"] [data-grant-section] { border: 1px solid ${({ theme }) => theme.color.border}; padding: 20px 16px 16px; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="framed"] [data-grant-payment] { border: 1px solid ${({ theme }) => theme.color.border}; padding: 6px 16px; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="framed"] [data-code-facts] { border: 1px solid ${({ theme }) => theme.color.border}; }

    [data-code-variant="guided"] [data-code-form-stack] { counter-reset: code-step; gap: 16px; }
    [data-code-variant="guided"] [data-grant-section] { position: relative; padding: 12px 12px 12px 52px; border-inline-start: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="guided"] [data-grant-section]::before { counter-increment: code-step; content: "0" counter(code-step); position: absolute; inset: 13px auto auto 12px; color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: 800; }
    [data-code-variant="guided"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="guided"] [data-grant-payment] { margin-inline-start: 52px; }

    [data-code-variant="side-notes"] [data-code-form-stack] { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: start; gap: 20px; }
    [data-code-variant="side-notes"] [data-grant-section="account"] { grid-column: 1; grid-row: 1; grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="side-notes"] [data-grant-section="terms"] { grid-column: 1; grid-row: 2; }
    [data-code-variant="side-notes"] [data-grant-section="reason"] { grid-column: 2; grid-row: 1 / 3; padding: 20px 16px; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; }
    [data-code-variant="side-notes"] [data-grant-section="reason"] textarea { min-block-size: 11rem; }
    [data-code-variant="side-notes"] [data-grant-payment], [data-code-variant="side-notes"] [data-code-form-stack] > p { grid-column: 1 / -1; }
    [data-code-variant="side-notes"] [data-code-facts] { max-inline-size: 45rem; padding: 24px; border-inline-start: 3px solid ${({ theme }) => theme.color.controlBorder}; }

    [data-code-variant="compact"] { grid-template-columns: minmax(19rem, 27%) minmax(0, 1fr); }
    [data-code-variant="compact"] [data-code-form-stack] { gap: 10px; max-inline-size: 54rem; }
    [data-code-variant="compact"] [data-grant-section] { gap: 10px; }
    [data-code-variant="compact"] [data-grant-section="reason"] textarea { min-block-size: 64px; }
    [data-code-variant="compact"] [data-code-row] { min-block-size: 48px; padding-block: 6px; }
    [data-code-variant="compact"] [data-grant-payment] { padding-block-start: 0; }

    [data-code-variant="spacious"] [data-code-form-stack] { gap: 28px; max-inline-size: 52rem; margin-inline: auto; padding: 24px; }
    [data-code-variant="spacious"] [data-grant-section] { gap: 22px; }
    [data-code-variant="spacious"] [data-code-row] { min-block-size: 72px; padding: 12px 16px; }
    [data-code-variant="spacious"] [data-code-facts] { padding: 28px; gap: 24px; }

    [data-code-variant="accent"] [data-code-form-stack] { border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; padding: 20px; background: ${({ theme }) => theme.color.surface}; gap: 22px; }
    [data-code-variant="accent"] [data-grant-section="account"] { padding-block-end: 18px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="accent"] [data-grant-section="reason"] { padding: 14px; background: ${({ theme }) => theme.color.brandSoft}; }
    [data-code-variant="accent"] [data-code-facts] { border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; padding: 24px; }

    [data-code-variant="horizontal"] [data-code-form-stack] { gap: 22px; padding: 12px; }
    [data-code-variant="horizontal"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    [data-code-variant="horizontal"] [data-grant-section="terms"] { padding: 16px; background: ${({ theme }) => theme.color.surface}; border-block: 1px solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="horizontal"] [data-code-facts] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; padding: 24px; }

    [data-code-variant="quiet"] [data-code-form-stack] { max-inline-size: 38rem; margin: 18px auto; padding: 28px; background: ${({ theme }) => theme.color.surface}; border: 1px solid ${({ theme }) => theme.color.border}; gap: 24px; }
    [data-code-variant="quiet"] [data-grant-section="account"] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="quiet"] [data-grant-section="reason"] { padding-block-start: 16px; border-block-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="quiet"] [data-code-facts] { max-inline-size: 38rem; margin: 18px auto; padding: 28px; border: 1px solid ${({ theme }) => theme.color.border}; }
  }
  ${media.belowDesktop} {
    padding: 16px;
    [data-code-variant="framed"] [data-grant-section], [data-code-variant="guided"] [data-grant-section] { padding: 14px; border: 1px solid ${({ theme }) => theme.color.border}; }
    [data-code-variant="accent"] [data-code-form-stack] { padding-inline-start: 12px; border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; }
    [data-code-variant="compact"] [data-code-form-stack] { gap: 10px; }
    [data-code-variant="spacious"] [data-code-form-stack] { gap: 24px; }
    [data-code-variant="quiet"] [data-code-form-stack] { padding: 12px; background: ${({ theme }) => theme.color.surface}; }
  }
  @media (min-width: 64rem) and (max-width: 74.99rem) {
    [data-code-variant="side-notes"] [data-code-form-stack] { grid-template-columns: minmax(0, 1fr); }
    [data-code-variant="side-notes"] [data-grant-section="reason"] { grid-column: 1; grid-row: 3; }
    [data-code-variant="side-notes"] [data-grant-section="reason"] textarea { min-block-size: 64px; }
  }
`;
export const PreviewNote = styled.p`
  margin: 0; padding: 10px 14px; border-block-start: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem;
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
  display: grid; align-content: start; gap: 7px; min-inline-size: 0; padding: 14px; text-align: start; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; font: inherit; cursor: pointer;
  > span { color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: 800; }
  > strong { font-size: 0.875rem; }
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: 400; line-height: 1.5; }
  &[aria-current="true"] { border-color: ${({ theme }) => theme.color.link}; box-shadow: inset 0 3px ${({ theme }) => theme.color.link}; }
  &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
