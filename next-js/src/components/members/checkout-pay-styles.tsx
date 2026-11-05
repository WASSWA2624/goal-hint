"use client";

import styled, { css } from "styled-components";
import { Button } from "@/components/ui/controls";
import { controlHeight, controlRow } from "@/components/ui/control-layout";
import { media } from "@/styles/theme";

const iconSize = css`
  svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); flex: none; }
`;
const groupHeading = css`
  margin: 0; padding: 0; color: ${({ theme }) => theme.color.text};
  font-size: var(--gh-font-reading); line-height: var(--gh-leading-heading);
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
`;
const choiceSurface = css`
  ${controlHeight}
  min-inline-size: 0;
  padding: var(--gh-spacing-3);
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  cursor: pointer;
  input {
    inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); min-block-size: 0;
    flex: none; margin: 0; accent-color: ${({ theme }) => theme.color.link}; cursor: inherit;
  }
  &:has(input:checked) {
    background: ${({ theme }) => theme.color.brandSoft};
    border-color: ${({ theme }) => theme.color.link};
    box-shadow: inset 0 0 0 ${({ theme }) => theme.border.thin} ${({ theme }) => theme.color.link};
  }
  &:has(input:focus-visible) {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
  &:has(input:disabled) { opacity: var(--gh-opacity-55); cursor: not-allowed; }
  ${media.hover} { &:has(input:not(:disabled)):hover { border-color: ${({ theme }) => theme.color.link}; } }
`;

export const PayLayout = styled.div`
  display: grid; gap: var(--gh-spacing-5); min-inline-size: 0;
  p { margin: 0; }
`;
export const EarnedDaysRedemption = styled.div`
  display: grid; gap: var(--gh-spacing-4); min-inline-size: 0;
  > p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-reading); line-height: var(--gh-leading-reading); }
`;
export const PayHelper = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-reading); line-height: var(--gh-leading-reading);
`;
export const PayNote = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading);
  overflow-wrap: anywhere;
`;
export const PayEyebrow = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-reading);
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  letter-spacing: var(--gh-tracking-label); text-transform: uppercase;
`;
export const PayPackage = styled.div`
  display: grid; grid-template-columns: minmax(0, max-content) auto minmax(max-content, 1fr) auto; align-items: center;
  gap: 0 var(--gh-spacing-1); min-inline-size: 0; min-block-size: var(--pay-choice-min-height); padding: var(--gh-spacing-2);
  border-inline-start: var(--gh-size-0_75) solid ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.section};
  > strong, > span { min-inline-size: 0; white-space: nowrap; line-height: var(--gh-leading-reading); }
  > strong { font-size: var(--gh-font-body); }
  [data-pay-package-part="name"] { overflow: hidden; text-overflow: ellipsis; }
  [data-pay-package-part="duration"] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  [data-pay-package-part="amount"] { justify-self: end; font-variant-numeric: tabular-nums; }
  && > button { min-inline-size: var(--gh-size-10); padding-inline: 0; font-size: var(--gh-font-secondary); }
  ${media.desktop} {
    column-gap: var(--gh-spacing-2); padding-inline: var(--gh-spacing-4);
    > strong, [data-pay-package-part="duration"], && > button { font-size: var(--gh-font-emphasis); }
  }
`;
export const PayTextAction = styled(Button)`
  && { background: transparent; padding-inline: var(--gh-spacing-2); font-size: var(--gh-font-emphasis); }
  ${iconSize}
`;
export const PayColumns = styled.div`
  --pay-choice-min-height: calc(var(--form-control-height) + var(--gh-spacing-4));
  display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "package" "methods" "transfer";
  gap: var(--gh-spacing-5); min-inline-size: 0; align-items: start;
  ${media.desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: "methods package" "transfer transfer";
    column-gap: var(--gh-spacing-6);
  }
`;
export const PayPackageGroup = styled.section`
  grid-area: package; display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0;
`;
export const PayGroupHeading = styled.h3`
  ${groupHeading}
`;
export const PayTransferSlot = styled.div`
  grid-area: transfer; min-inline-size: 0;
`;
export const PayMethods = styled.section`
  grid-area: methods; display: grid; gap: var(--gh-spacing-4); min-inline-size: 0;
  > div { min-inline-size: 0; }
`;
export const PayProviders = styled.fieldset`
  min-inline-size: 0; border: 0; margin: 0; padding: 0;
  legend { ${groupHeading} margin-block-end: var(--gh-spacing-2_5); }
  > p { margin-block-start: var(--gh-spacing-2); }
`;
export const PayProviderGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5);
`;
export const PayProvider = styled.label`
  ${choiceSurface}
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--gh-spacing-2); align-items: center;
  min-block-size: var(--pay-choice-min-height); padding: var(--gh-spacing-2) var(--gh-spacing-2_5);
  > input { grid-column: 3; grid-row: 1; }
  > span { grid-column: 1; grid-row: 1; }
  > strong { grid-column: 2; grid-row: 1; min-inline-size: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  > small { grid-column: 1 / -1; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading); color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; }
`;
export const PayProviderMark = styled.span`
  display: flex; align-items: center; min-inline-size: 0;
  [data-payment-logo] { inline-size: var(--gh-size-7_5); block-size: var(--gh-size-6); }
`;
export const PayWallet = styled.label`
  ${choiceSurface}
  ${iconSize}
  display: flex; align-items: center; gap: var(--gh-spacing-3);
  > svg { color: ${({ theme }) => theme.color.link}; }
  > span { display: grid; gap: var(--gh-spacing-0_5); flex: 1; min-inline-size: 0; }
  strong { font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-reading); }
  small { font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.mutedText}; line-height: var(--gh-leading-reading); }
  + p { margin-block-start: var(--gh-spacing-2); }
`;
export const PayRewards = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-2);
  padding-block-start: var(--gh-spacing-2); border-block-start: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  > p { flex: 1; }
  > button { padding-inline: 0; font-size: var(--gh-font-secondary); }
`;
export const PayFooter = styled.div`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--gh-spacing-3); min-inline-size: 0;
  padding-block-start: var(--gh-spacing-4); border-block-start: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  ${controlRow}
  ${iconSize}
  > div { display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; text-align: center; }
  > div > button { inline-size: 100%; }
  > div > p { font-size: var(--gh-font-caption); }
  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr) auto;
    > button { justify-self: start; }
    > div { text-align: end; }
    > div > button { min-inline-size: var(--gh-size-52); }
  }
`;
export const PayTransfer = styled.section`
  display: grid; gap: var(--gh-spacing-4); min-inline-size: 0; padding: var(--gh-spacing-4);
  background: ${({ theme }) => theme.color.section};
  border-block-start: var(--gh-size-0_75) solid ${({ theme }) => theme.color.link};
  border-radius: ${({ theme }) => theme.radius.none};
  ${iconSize}
  ${media.desktop} { padding: var(--gh-spacing-5); }
`;
export const PayTransferHeading = styled(PayNote)`
  display: flex; align-items: center; gap: var(--gh-spacing-2);
`;
export const PayAmount = styled.p`
  && { margin-block-start: var(--gh-spacing-1); }
  font-size: var(--gh-font-displaySmall); line-height: var(--gh-leading-heading);
  font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
  letter-spacing: var(--gh-tracking-tight); overflow-wrap: anywhere;
  + p { margin-block-start: var(--gh-spacing-2); }
`;
export const PayTransferOverview = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center; gap: var(--gh-spacing-2) var(--gh-spacing-2); min-inline-size: 0;
  > :nth-child(2), > :nth-child(4) { text-align: end; justify-self: end; }
  > :nth-child(-n + 2) { align-self: start; }
  && [data-pay-amount], && [data-pay-recipient] {
    margin: 0; white-space: nowrap; font-size: var(--gh-font-section); line-height: var(--gh-leading-heading);
    font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
    letter-spacing: var(--gh-tracking-tight);
  }
  @media (min-width: ${({ theme }) => theme.viewport[25]}) {
    && [data-pay-amount], && [data-pay-recipient] { font-size: var(--gh-font-heading); }
  }
  ${media.desktop} {
    && [data-pay-amount], && [data-pay-recipient] { font-size: var(--gh-font-displaySmall); }
  }
`;
export const PayRecipient = styled.div`
  display: grid; gap: var(--gh-spacing-1); min-inline-size: 0;
  padding-block-start: var(--gh-spacing-3); border-block-start: ${({ theme }) => theme.border.thin} solid ${({ theme }) => theme.color.border};
  > strong { font-size: var(--gh-font-secondary); overflow-wrap: anywhere; }
`;
export const PayRecipientActions = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3); min-inline-size: 0;
  > strong { flex: 1; min-inline-size: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  > button { flex: none; font-size: var(--gh-font-secondary); }
`;
