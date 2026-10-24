"use client";

import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";

const focusRing = css`
  outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
  outline-offset: ${({ theme }) => theme.border.focusOffset};
`;
const smallText = css`
  font-size: 12px; line-height: 18px;
  color: ${({ theme }) => theme.color.mutedText};
`;
const icons = css`svg { inline-size: 16px; block-size: 16px; flex-shrink: 0; }`;

export const SubscribeLayout = styled.div`
  display: flex; flex-direction: column; gap: 12px;
  inline-size: 100%; max-inline-size: 50rem; min-inline-size: 0; margin-inline: auto;
`;
export const Note = styled.p`${smallText}`;
export const SubmitNote = styled(Note)<{ $warning?: boolean }>`${({ theme, $warning }) => $warning && `color: ${theme.color.outcome.incorrect.text};`}`;
export const PlanSwitch = styled(Button)`&& { min-block-size: 32px; padding: 2px 6px; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }`;
export const Row = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
  min-block-size: 44px; min-inline-size: 0; font-size: 12px; line-height: 18px;
  ${icons}
`;
export const RowButton = styled(Button)`
  justify-content: flex-start; gap: 6px; padding-inline: 0; font-size: 12px;
  ${icons}
`;
export const RowNote = styled.p`${smallText}`;
export const FieldWithAction = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; align-items: end; min-inline-size: 0;
  > div:first-child { display: contents; }
  > div:first-child > label { grid-column: 1 / -1; }
  > div:first-child > :not(label) { grid-column: 1; }
  > div:first-child > [id$="-hint"], > div:first-child > [id$="-error"] { grid-column: 1 / -1; }
  > button { grid-column: 2; grid-row: 2; min-block-size: 44px; }
  ${icons}
`;

/** Keep payment confirmation below the recipient details at every screen size. */
export const Sheet = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; min-inline-size: 0;
`;
export const Step = styled.section`display: grid; align-content: start; gap: 8px; min-inline-size: 0;`;
export const StepHeading = styled.div`display: flex; align-items: baseline; gap: 8px; min-inline-size: 0;`;
export const StepTitle = styled.h2`font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.heavy};`;
export const Plans = styled.fieldset<{ $columns: number }>`
  display: grid; grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr)); gap: 8px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
`;
export const Plan = styled.label`
  position: relative; display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 3px 6px; align-content: start;
  min-inline-size: 0; padding: 8px; cursor: pointer;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface};
  border-radius: ${({ theme }) => theme.border.radius};
  input { inline-size: 14px; block-size: 14px; margin: 2px 0 0; accent-color: ${({ theme }) => theme.color.brand}; }
  &:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; box-shadow: inset 0 -2px ${({ theme }) => theme.color.brand}; }
  &:has(input:focus-visible) { ${focusRing} }
`;
export const PlanName = styled.span`font-size: 12px; line-height: 18px; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere;`;
export const PlanPrice = styled.span`
  grid-column: 1 / -1; font-size: 16px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
  small { font-size: 11px; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  span { white-space: nowrap; }
`;
export const WalletChoices = styled.fieldset`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
`;
export const WalletChoice = styled.label`
  position: relative; min-inline-size: 0; cursor: pointer;
  border: 1px solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  &:has(input:checked) { border-color: ${({ theme }) => theme.color.brand}; }
  input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; }
  > span { display: flex; align-items: center; justify-content: center; gap: 6px; min-block-size: 44px; padding: 6px; border-radius: inherit; font-size: 12px; line-height: 18px; font-weight: ${({ theme }) => theme.typography.weight.bold}; background: ${({ theme }) => theme.color.surface}; }
  [data-payment-logo] { inline-size: 40px; block-size: 24px; }
  > span > svg { flex-shrink: 0; inline-size: 12px; block-size: 12px; visibility: hidden; }
  input:checked + span { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link}; box-shadow: inset 0 -2px ${({ theme }) => theme.color.brand}; }
  input:checked + span > svg { visibility: visible; }
  input:focus-visible + span { ${focusRing}; outline-offset: -3px; }
`;
export const Wallet = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 8px; align-items: center; min-inline-size: 0; padding: 10px;
  background: ${({ theme }) => theme.color.surfaceMuted}; border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
`;
export const WalletNumber = styled.span`
  grid-column: 1; min-inline-size: 0; font-size: 18px; line-height: 24px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
  > span:last-child { display: inline-block; white-space: nowrap; }
`;
export const WalletMeta = styled.span`grid-column: 1; min-inline-size: 0; overflow-wrap: anywhere; ${smallText}`;
export const PaymentTransfer = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-inline-size: 0;
  > ${WalletChoices} { flex: 1 1 19rem; }
  > ${Wallet} { flex: 2 1 15rem; align-content: center; }
  > ${Note} { align-self: center; }
`;
export const Action = styled(Button)`font-size: 12px; gap: 6px; min-block-size: 44px; ${icons}`;
export const ActionLink = styled(ButtonLink)`font-size: 12px; gap: 6px; min-block-size: 44px; ${icons}`;
export const CopyButton = styled(Action)`grid-column: 2; grid-row: 1 / 3; padding-inline: 8px;`;
export const MenuLink = styled(ActionLink)`justify-self: start; padding-inline: 0;`;
export const Locked = styled.p`display: flex; align-items: center; gap: 8px; padding: 12px; border-radius: ${({ theme }) => theme.border.radius}; background: ${({ theme }) => theme.color.surfaceMuted}; ${smallText} ${icons}`;
export const StatusBox = styled.div`
  display: grid; gap: 8px; min-inline-size: 0; padding: 12px; background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 13px; line-height: 20px;
  border-radius: ${({ theme }) => theme.border.radius};
  p { margin: 0; }
  ${RowButton} { justify-self: start; min-block-size: 44px; }
`;
/** Doubled specificity: the account card styles its own headings. */
export const StatusTitle = styled.h3`
  && { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  ${icons}
`;
export const PaymentReviewBox = styled(StatusBox)`
  border-block-start: 3px solid ${({ theme }) => theme.color.brand}; padding: 16px; gap: 12px;
  > header { display: grid; gap: 6px; }
  > header p { color: ${({ theme }) => theme.color.mutedText}; }
  > [data-payment-summary] { padding-block: 8px; border-block: 1px solid ${({ theme }) => theme.color.border}; }
  > [data-payment-update], > [data-payment-resubmit] { inline-size: 100%; border-block-start-color: ${({ theme }) => theme.color.border}; }
`;
export const StatusFacts = styled.dl`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 12px; line-height: 18px;
  > div { display: contents; }
  dt { color: ${({ theme }) => theme.color.mutedText}; }
  dd { margin: 0; min-inline-size: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
export const ReportForm = styled.form`
  display: grid; gap: 10px; min-inline-size: 0;
  label { font-size: 12px; line-height: 18px; }
  input:not([type="checkbox"], [type="radio"]) { min-block-size: 44px; }
  > div { min-inline-size: 0; }
`;
export const FileField = styled.fieldset`
  display: grid; gap: 4px; min-inline-size: 0; margin: 0; padding: 0; border: 0;
  legend { padding: 0; margin-block-end: 6px; font-size: 12px; line-height: 18px; }
`;
export const ConfirmDetails = styled.dl`
  display: grid; gap: 6px; margin: 0 0 10px; min-inline-size: 0;
  > div { display: grid; grid-template-columns: minmax(6.5rem, auto) minmax(0, 1fr); gap: 8px; align-items: baseline; }
  dt { ${smallText} } dd { margin: 0; min-inline-size: 0; font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
`;
export const ConfirmPreview = styled.img`display: block; max-inline-size: 7rem; max-block-size: 9rem; border-radius: ${({ theme }) => theme.border.radius}; object-fit: contain;`;
export const PasteButton = styled(Button)`&& { gap: 6px; padding-inline: 10px; font-size: 13px; } ${icons}`;
export const FileChoices = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-inline-size: 0;`;
export const FileBox = styled.label`
  position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-block-size: 44px; padding: 8px; cursor: pointer;
  border: 1px dashed ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; font-size: 12px; line-height: 18px;
  border-radius: ${({ theme }) => theme.border.radius};
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
  ${icons}
  input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: pointer; }
  &:has(input:focus-visible) { ${focusRing} }
`;
export const Preview = styled.img`max-inline-size: 100%; max-block-size: 12rem; object-fit: contain; justify-self: start;`;
export const Assent = styled.label`
  display: flex; align-items: center; gap: 8px; min-block-size: 44px; font-size: 12px; line-height: 18px;
  input { inline-size: 16px; block-size: 16px; min-block-size: 16px; margin: 0; flex-shrink: 0; accent-color: ${({ theme }) => theme.color.brand}; }
`;
// aria-disabled keeps a blocked Submit focusable so its reason is read, while looking and acting disabled.
export const Submit = styled(Button)`
  inline-size: 100%; min-block-size: 44px; font-size: 13px; ${icons}
  &[aria-disabled="true"] { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface};
    border-color: ${({ theme }) => theme.color.border}; cursor: not-allowed; }
`;
export const Disclosure = styled.details`
  min-inline-size: 0;
  > summary { display: flex; align-items: center; gap: 6px; min-block-size: 44px; list-style: none; cursor: pointer; color: ${({ theme }) => theme.color.link}; font-size: 12px; line-height: 18px; ${icons}
    &::-webkit-details-marker { display: none; }
    &:focus-visible { ${focusRing} }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  > div { display: grid; gap: 10px; padding-block: 4px 10px; }
  ul { margin: 0; padding-inline-start: 20px; ${smallText} }
`;
export const PageFooter = styled.footer`
  display: flex; flex-wrap: wrap; align-items: start; gap: 4px 16px; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  > ${Disclosure}[open] { flex-basis: 100%; order: 1; }
`;
export const HelpTitle = styled.h2`font-size: 13px; line-height: 20px;`;
export const HelpActions = styled.div<{ $equal?: boolean }>`
  display: ${({ $equal }) => $equal ? "grid" : "flex"}; flex-wrap: wrap; gap: 8px;
  ${({ $equal }) => $equal && css`grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);`}
`;
