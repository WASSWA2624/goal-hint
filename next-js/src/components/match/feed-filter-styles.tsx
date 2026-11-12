"use client";

import styled from "styled-components";
import { contentGutter } from "@/components/ui/layout";
import { focusRing } from "@/components/ui/filter-chrome";
import { FilterDialogContent } from "@/components/ui/advanced-filter-dialog";
import { media } from "@/styles/theme";

/** Transparent search row, separated from the app header and performance by shared spacing. */
export const Panel = styled.form`
  min-inline-size: 0;
  padding: var(--gh-spacing-0_5) ${contentGutter};
  color: ${({ theme }) => theme.color.text};
  ${media.desktop} { padding-block: var(--gh-spacing-1); }
`;

export const DialogContent = styled(FilterDialogContent)`
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  && [data-status-sort-fields] [data-floating-control] > select {
    font-size: var(--gh-font-body); padding-inline-end: var(--gh-spacing-4); text-overflow: ellipsis;
  }
  && [data-status-sort-fields] [data-select-trigger] { font-size: var(--gh-font-body); }
  [data-probability-fields] label, [data-odds-fields] label { font-size: var(--gh-font-secondary); }
  && [data-probability-fields] label { max-inline-size: calc(100% - var(--gh-size-3)); }
  input[type="checkbox"] { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: var(--gh-size-45); overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: var(--gh-spacing-1_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
`;
