"use client";

import styled from "styled-components";
import { contentGutter } from "@/components/ui/layout";
import { focusRing } from "@/components/ui/filter-chrome";

/** Transparent search row, separated from the app header and performance by shared spacing. */
export const Panel = styled.form`
  min-inline-size: 0;
  padding: var(--gh-spacing-3) ${contentGutter};
  color: ${({ theme }) => theme.color.text};
`;

export const DialogContent = styled.div`
  display: grid;
  gap: var(--gh-spacing-4);
  min-inline-size: 0;
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  legend { margin-block-end: var(--gh-spacing-2); padding: 0; font-size: var(--gh-font-body); font-weight: var(--gh-weight-medium); }
  [data-fields] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5); }
  [data-full] { grid-column: 1 / -1; }
  [data-subsection] { margin-block-start: var(--gh-spacing-3); }
  label[data-choice] { display: flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-body); cursor: pointer; }
  input[type="checkbox"] { flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: var(--gh-size-45); overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: var(--gh-spacing-1_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
`;

export const FilterError = styled.p.attrs({ role: "alert", tabIndex: -1 })`
  margin: 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: var(--gh-font-body);
  line-height: var(--gh-leading-compact);
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
`;
