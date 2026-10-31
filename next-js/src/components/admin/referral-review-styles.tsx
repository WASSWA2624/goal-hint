"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { FieldBlock } from "./admin-form";
import { RecordFooter, RecordItem } from "./record-workspace";

export const ReviewItem = styled(RecordItem)`grid-template-columns: minmax(0, 1fr);`;
export const ReviewFooter = styled(RecordFooter)`
  align-items: center; flex-wrap: wrap; margin-inline: 0;
  > button { min-block-size: 44px; flex: 1 1 8rem; }
  ${media.desktop} { > button { min-block-size: 32px; flex: 0 1 auto; } }
`;
export const ReviewTools = styled.div`
  display: flex; align-items: end; gap: 8px;
  > label { flex: 1; min-inline-size: 0; }
  > button { flex: none; }
`;

/** Referral decisions use the same compact list/detail geometry and controls as Payments/Subscribers. */
export const ReviewForm = styled.form`
  display: grid; gap: 12px; min-inline-size: 0;
  p { margin: 0; }
  input, select, textarea { min-inline-size: 0; }
  [data-review-actions] { display: flex; flex-wrap: wrap; justify-content: end; gap: 8px; }
`;
export const ReviewField = styled(FieldBlock)`
  font-size: .8125rem;
  input, select, textarea { font-size: .8125rem; }
`;
export const ReviewFacts = styled.dl`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin: 0;
  > div { min-inline-size: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; }
  dd { margin: 2px 0 0; font-weight: ${({ theme }) => theme.typography.weight.medium}; overflow-wrap: anywhere; }
  ${media.desktop} { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
export const ReviewHistory = styled.ol`
  display: grid; gap: 8px; list-style: none; margin: 0; padding: 0;
  > li { padding: 8px 0; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  p { margin: 3px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  time { color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; }
`;
