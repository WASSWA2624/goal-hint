"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import type { DesktopSlipDesign } from "./designs";

/** One brand type hierarchy for all recipes and future reuse in the Slip Builder. */
export const desktopSlipTypography = css`
  &&&& [data-production-desktop-slip] [data-slip-disclosure]:not([open]) > [data-slip-summary] {
    min-block-size: 44px;
    [data-summary-identity] > span:first-child { font-size: .9375rem; font-weight: 700; }
    [data-summary-odds] strong, [data-summary-average] strong { font-size: .9375rem; font-weight: 700; }
    [data-fact-label], [data-summary-count] { font-size: .8125rem; font-weight: 500; }
    [data-slip-publication-date], [data-rank] { font-size: .75rem; font-weight: 500; line-height: 1.35; }
    [data-slip-status] { font-size: .8125rem; font-weight: 600; }
  }
  &&&& [data-production-desktop-slip]:has([data-slip-disclosure]:not([open])) {
    [data-share-slip] { font-size: .8125rem; font-weight: 600;
      @media (pointer: coarse) { min-block-size: 44px; } }
    [data-slip-header-action] { inset-block-start: 0; block-size: 44px; display: flex; align-items: center; }
  }
  &&& [data-best-slips-filters] {
    button { font-weight: 500; }
    [data-slip-toggle-row] { gap: 10px 14px; }
    [data-slip-toggle-row] > :has(> [data-slip-result]) { gap: 6px; padding: 3px; }
    [data-slip-result] { min-block-size: 36px; padding: 6px 10px; gap: 6px; font-size: .8125rem; }
    [data-slip-result-count] { font-size: .8125rem; font-weight: 700; }
    [data-slip-result-percent] { font-size: .75rem; font-weight: 500; }
    [data-select-trigger], [data-slip-custom-range] { font-size: .8125rem; font-weight: 600; }
    [data-slip-toggle-row] > button { font-size: .8125rem; }
    @media (pointer: coarse) { [data-slip-result] { min-block-size: 44px; } }
    @media (max-width: 79.99rem) {
      [data-slip-toggle-row] { flex-wrap: wrap; }
      [data-slip-toggle-row] > :has(> [data-slip-result]) { flex: 1 0 100%; box-sizing: border-box; }
      [data-slip-dates] { margin-inline-start: 0; padding-inline-start: 0; border-inline-start: 0; }
    }
  }
  &&& [data-best-slips-applied] { font-size: .75rem; font-weight: 500; }
  &&& [data-best-slips-access] {
    padding: 16px 18px; border-inline-start: 3px solid var(--review-interface-accent);
    background: linear-gradient(100deg, var(--review-interface-fill), ${({ theme }) => theme.color.surface} 85%);
    > div { gap: 10px; }
    h2 { font-size: 1.25rem; line-height: 1.3; font-weight: 700; }
    p { max-inline-size: 80ch; font-size: .875rem; line-height: 1.55; }
    a { min-block-size: 40px; padding: 8px 16px; font-size: .875rem; font-weight: 600; }
    a + a { display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--review-interface-accent); border-radius: ${({ theme }) => theme.radius.control};
      background: ${({ theme }) => theme.color.surface}; color: var(--review-interface-accent); text-decoration: none; }
    @media (pointer: coarse) { a { min-block-size: 44px; } }
  }
`;

/** Only closed desktop summaries are skinned. Match rows and open slips keep their original CSS. */
export const desktopSlipHeaderSkin = css`
  &&&& [data-production-desktop-slip] [data-slip-disclosure]:not([open]) > [data-slip-summary] {
    color: var(--review-ink);
    background: var(--review-header);
    box-shadow: var(--review-mark);
    [data-fact-label], [data-summary-count], [data-slip-publication-date] { color: var(--review-muted); }
    [data-summary-odds] strong, [data-summary-average] strong, [data-rank] { color: var(--review-accent); }
    [data-summary-identity] > span:first-child { color: var(--review-ink); }
    [data-slip-publication-date] { border-color: var(--review-line); }
    [data-summary-fact]::before, [data-summary-count]::before,
    [data-summary-status]::before, [data-summary-action-space]::before { background: var(--review-line); }
    [data-toggle-chevron] { color: var(--review-muted); }
    &:focus-visible { outline-color: var(--review-accent); }
    @media (hover: hover) { &:hover { background: var(--review-hover); } }
  }
  &&&& [data-production-desktop-slip]:has([data-slip-disclosure]:not([open])) {
    [data-compact-slip] { border-color: var(--review-card-line); }
    [data-share-slip] {
      color: var(--review-accent); background: var(--review-header);
      &:focus-visible { outline-color: var(--review-accent); }
    }
  }
`;

export const ReviewSurface = styled.div<{ $design: DesktopSlipDesign; $enabled: boolean }>`
  ${({ theme, $design: design, $enabled }) => {
    if (!$enabled) return "";
    const accent = theme.color.accent[design.accent];
    const darkHeader = design.surface === "navy" || design.surface === "midnight";
    const ink = darkHeader ? "#F2F7FC" : theme.color.text;
    const muted = darkHeader ? "#BCD0DF" : theme.color.mutedText;
    const header = design.surface === "navy" ? "#112B43" : design.surface === "midnight" ? "#10363B"
      : design.surface === "warm" ? theme.mode === "light" ? "#FFFBF3" : "#231F1A"
        : design.treatment === "wash" ? accent.soft : theme.color.surface;
    const color = darkHeader ? design.surface === "navy" ? "#8DD5FF" : "#83E4DC"
      : design.treatment === "mono" ? theme.color.text : accent.text;
    const line = darkHeader ? "#4D687D" : theme.color.border;
    return css`
      ${media.desktop} {
        --review-ink: ${ink}; --review-muted: ${muted}; --review-header: ${header};
        --review-accent: ${color}; --review-line: ${line};
        --review-interface-accent: ${accent.text}; --review-interface-fill: ${accent.soft};
        --review-card-line: ${design.treatment === "outline" ? accent.text : theme.color.border};
        --review-hover: color-mix(in srgb, ${header} 94%, ${color});
        --review-mark: ${design.id === "blue-signal" ? "none" : design.treatment === "rail" ? `inset 3px 0 ${color}`
          : design.treatment === "rule" ? `inset 0 -2px ${color}` : "none"};

        /* Other historical recipes keep their own marks; Blue Signal uses the live outer rail. */
        ${design.id !== "blue-signal" && css`[data-production-desktop-slip]::before { display: none; }`}

        ${desktopSlipHeaderSkin}
        ${desktopSlipTypography}
        ${design.treatment === "stripe" && css`
          [data-slip-list] > div:nth-child(even) { --review-header: ${accent.soft}; }
        `}
        ${design.treatment === "outline" && css`
          &&&& [data-slip-disclosure]:not([open]) [data-summary-identity] > span:first-child {
            color: ${accent.text}; background: ${accent.soft};
          }
        `}
        &&& [data-slip-result="all"][aria-pressed="true"] {
          color: ${darkHeader ? theme.color.accent[design.accent].text : color}; background: ${accent.soft};
          border-color: ${accent.text};
          &:focus-visible { outline-color: ${accent.text}; }
        }
        &&& [data-select-trigger], &&& [data-slip-custom-range] { border-color: ${accent.text}; }
        &&& [data-best-slips-summary] { color: ${theme.color.text}; font-weight: ${theme.typography.weight.medium}; }
        &&& [data-best-slips-pagination] [aria-current="page"] { background: ${accent.text}; color: ${accent.soft}; }
      }
    `;
  }}
`;

export const ReviewToolbar = styled.aside`
  display: none;
  ${media.desktop} {
    display: grid; gap: 10px; padding: 14px max(24px, calc((100vw - 1460px) / 2));
    color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
    border-block-end: 1px solid ${({ theme }) => theme.color.border};
    font-size: .8125rem;
    h1, p { margin: 0; }
    h1 { font-size: 1rem; font-weight: 600; }
    p { color: ${({ theme }) => theme.color.mutedText}; }
    [data-review-heading], [data-review-controls] { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
    [data-review-heading] { justify-content: space-between; }
    && [data-review-controls] > div { display: flex; flex-direction: row; align-items: center; gap: 8px; }
    [data-review-controls] > div > label { flex: none; white-space: nowrap; }
    [data-review-controls] > div > select { inline-size: auto; }
    label { display: flex; gap: 8px; align-items: center; }
    select, button {
      min-block-size: 32px; padding: 4px 9px; border: 1px solid ${({ theme }) => theme.color.controlBorder};
      font: inherit;
      color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; cursor: pointer;
      &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
      &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: default; }
    }
    input { accent-color: ${({ theme }) => theme.color.brand}; }
    @media (pointer: coarse) { select, button { min-block-size: 44px; } }
    [data-review-description] { flex: 1; min-inline-size: 200px; }
  }
`;
