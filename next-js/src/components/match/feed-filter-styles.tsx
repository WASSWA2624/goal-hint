"use client";

import styled from "styled-components";
import { contentGutter } from "@/components/ui/layout";
import { focusRing } from "@/components/ui/filter-chrome";
import { media } from "@/styles/theme";

/** Transparent search row, separated from the app header and performance by shared spacing. */
export const Panel = styled.form`
  min-inline-size: 0;
  padding: var(--gh-spacing-0_5) ${contentGutter};
  color: ${({ theme }) => theme.color.text};
  ${media.desktop} { padding-block: var(--gh-spacing-1); }
`;

export const DialogContent = styled.div`
  display: grid;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  [data-fields], [data-market-choices] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--gh-spacing-2_5); }
  && [data-status-sort-fields] [data-floating-control] > select {
    font-size: var(--gh-font-body); padding-inline-end: var(--gh-spacing-4); text-overflow: ellipsis;
  }
  [data-full] { grid-column: 1 / -1; }
  [data-date-time-fields] { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--gh-size-48)), 1fr)); gap: var(--gh-spacing-2_5); }
  [data-probability-fields] label, [data-odds-fields] label { font-size: var(--gh-font-secondary); }
  && [data-probability-fields] label { max-inline-size: calc(100% - var(--gh-size-3)); }
  label[data-choice] { display: flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-body); cursor: pointer; }
  input[type="checkbox"] { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: var(--gh-size-45); overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: var(--gh-spacing-1_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
`;

export const MarketsSection = styled.details`
  min-inline-size: 0; border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  > summary {
    display: flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height);
    list-style: none; cursor: pointer; font-size: var(--gh-font-body); font-weight: var(--gh-weight-medium);
    &::-webkit-details-marker { display: none; }
    > span:nth-child(2) { margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-body); }
    > svg { flex: none; color: ${({ theme }) => theme.color.link}; transition: transform var(--gh-duration-fast) var(--gh-easing); }
    &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; }
  }
  &[open] > summary > svg { transform: rotate(180deg); }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
`;
