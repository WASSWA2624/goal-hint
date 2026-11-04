"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { FieldBlock } from "./admin-form";
import { RecordFooter } from "./record-workspace";

export const ReviewFooter = styled(RecordFooter)`
  ${media.belowDesktop} { > button { flex: 1 0 auto; } }
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
