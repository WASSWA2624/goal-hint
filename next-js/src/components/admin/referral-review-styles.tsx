"use client";

import { controlRow } from "@/components/ui/control-layout";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { FieldBlock } from "./admin-form";
import { RecordFooter, RecordItem } from "./record-workspace";

export const ReviewItem = styled(RecordItem)`grid-template-columns: minmax(0, 1fr);`;
export const ReviewFooter = styled(RecordFooter)`
  align-items: center; flex-wrap: wrap; margin-inline: 0;
  > button { min-block-size: var(--form-control-height); flex: 1 1 var(--gh-size-32); }
  ${media.desktop} { > button { min-block-size: var(--form-control-height); flex: 0 1 auto; } }
`;
export const ReviewTools = styled.div`
  display: flex; align-items: end; gap: var(--gh-spacing-2);
  > [data-floating-field] { flex: 1; min-inline-size: 0; }
  > button { flex: none; }

  ${controlRow}
`;

/** Referral decisions use the same compact list/detail geometry and controls as Payments/Subscribers. */
export const ReviewForm = styled.form`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  p { margin: 0; }
  input, select, textarea { min-inline-size: 0; }
  [data-review-actions] { display: flex; flex-wrap: wrap; justify-content: end; gap: var(--gh-spacing-2); }
`;
export const ReviewField = styled(FieldBlock)`
  font-size: var(--gh-font-body);
  input, select, textarea { font-size: var(--gh-font-body); }
`;
export const ReviewFacts = styled.dl`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5) var(--gh-spacing-4); margin: 0;
  > div { min-inline-size: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  dd { margin: var(--gh-spacing-0_5) 0 0; font-weight: ${({ theme }) => theme.typography.weight.medium}; overflow-wrap: anywhere; }
  ${media.desktop} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
export const ReviewHistory = styled.ol`
  display: grid; gap: var(--gh-spacing-2); list-style: none; margin: 0; padding: 0;
  > li { padding: var(--gh-spacing-2) 0; border-block-start: 0; }
  p { margin: var(--gh-spacing-0_75) 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  time { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
`;
