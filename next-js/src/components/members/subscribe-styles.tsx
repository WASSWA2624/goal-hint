"use client";

import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { media } from "@/styles/theme";

const focusRing = css`
  outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
  outline-offset: ${({ theme }) => theme.border.focusOffset};
`;
const smallText = css`
  font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5);
  color: ${({ theme }) => theme.color.mutedText};
`;
const icons = css`svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); flex-shrink: 0; }`;

export const SubscribeLayout = styled.div`
  display: flex; flex-direction: column; gap: var(--gh-spacing-3);
  inline-size: 100%; max-inline-size: var(--gh-size-200); min-inline-size: 0; margin-inline: auto;
`;
export const Note = styled.p`${smallText}`;
export const SubmitNote = styled(Note)<{ $warning?: boolean }>`${({ theme, $warning }) => $warning && `color: ${theme.color.outcome.incorrect.text};`}`;
export const PlanSwitch = styled(Button)`&& { min-block-size: var(--form-control-height); padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5); font-size: var(--gh-font-secondary); text-decoration: underline; text-underline-offset: var(--gh-size-0_75); }`;
export const Row = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2_5);
  min-block-size: var(--form-control-height); min-inline-size: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5);
  ${icons}
`;
export const RowButton = styled(Button)`
  justify-content: flex-start; gap: var(--gh-spacing-1_5); padding-inline: 0; font-size: var(--gh-font-secondary);
  ${icons}
`;
export const RowNote = styled.p`${smallText}`;
export const FieldWithAction = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--gh-spacing-1) var(--gh-spacing-2); align-items: end; min-inline-size: 0;
  > div:first-child { display: contents; }
  > div:first-child > label { grid-column: 1 / -1; }
  > div:first-child > :not(label) { grid-column: 1; }
  > div:first-child > [id$="-hint"], > div:first-child > [id$="-error"] { grid-column: 1 / -1; }
  > button { grid-column: 2; grid-row: 2; min-block-size: var(--form-control-height); }
  ${icons}
`;

/** Add credit: the title, with the member's credit opposite it. A section, so the #plans anchor clears the sticky header. */
export const TopUpHeader = styled.section`
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-3); min-inline-size: 0;
  h2 { margin: 0; font-size: var(--gh-font-page); line-height: var(--gh-size-7); font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: var(--gh-tracking-compact); }
  p { margin: 0; text-align: end; ${smallText} }
  p strong { display: block; font-size: var(--gh-font-section); line-height: var(--gh-size-5_5); font-weight: ${({ theme }) => theme.typography.weight.heavy};
    color: ${({ theme }) => theme.color.text}; font-variant-numeric: tabular-nums; }
  ${media.desktop} { h2 { font-size: var(--gh-font-displaySmall); line-height: var(--gh-size-8_5); } }
`;
/** Add credit's three numbered steps, joined by a thin rail. */
export const StepRail = styled.ol`display: grid; min-inline-size: 0; margin: 0; padding: 0; list-style: none;`;
export const RailStep = styled.li`
  position: relative; display: grid; grid-template-columns: var(--gh-size-6) minmax(0, 1fr); gap: 0 var(--gh-spacing-3); min-inline-size: 0; padding-block-end: var(--gh-spacing-5);
  &::before { content: ""; position: absolute; inset-inline-start: var(--gh-spacing-2_875); inset-block: var(--gh-spacing-7_5) var(--gh-spacing-1_5); inline-size: var(--gh-size-0_25);
    background: ${({ theme }) => theme.color.controlBorder}; opacity: var(--gh-opacity-55); }
  &:last-child { padding-block-end: 0; }
  &:last-child::before { display: none; }
  > h3 { margin: 0; font-size: var(--gh-font-reading); line-height: var(--gh-size-6); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > div { grid-column: 2; display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0; margin-block-start: var(--gh-spacing-1_5); }
  label { font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); }
  /* An amount of up to six digits needs no full-width field. */
  input[data-topup-amount] { max-inline-size: var(--gh-size-72); }
`;
export const RailNumber = styled.span`
  display: grid; place-items: center; inline-size: var(--gh-size-6); block-size: var(--gh-size-6); border-radius: ${({ theme }) => theme.radius.small};
  background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link};
  border: 0;
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-solid); font-weight: ${({ theme }) => theme.typography.weight.heavy};
`;

/** Keep payment confirmation below the recipient details at every screen size. */
export const Sheet = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-3_5); min-inline-size: 0;
`;
export const Step = styled.section`display: grid; align-content: start; gap: var(--gh-spacing-2); min-inline-size: 0;`;
export const StepHeading = styled.div`display: flex; align-items: baseline; gap: var(--gh-spacing-2); min-inline-size: 0;`;
export const StepTitle = styled.h2`font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); font-weight: ${({ theme }) => theme.typography.weight.heavy};`;
export const Plans = styled.fieldset<{ $columns: number }>`
  display: grid; grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr)); gap: var(--gh-spacing-2);
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
`;
export const Plan = styled.label`
  position: relative; display: grid; grid-template-columns: var(--gh-size-3_5) minmax(0, 1fr); gap: var(--gh-spacing-0_75) var(--gh-spacing-1_5); align-content: start;
  min-inline-size: 0; padding: var(--gh-spacing-2); cursor: pointer;
  border: 0; background: ${({ theme }) => theme.color.surface};
  border-radius: ${({ theme }) => theme.radius.surface};
  input { inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); margin: var(--gh-spacing-0_5) 0 0; accent-color: ${({ theme }) => theme.color.brand}; }
  &:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft};  box-shadow: none; }
  &:has(input:focus-visible) { ${focusRing} }
`;
export const PlanName = styled.span`font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere;`;
export const PlanPrice = styled.span`
  grid-column: 1 / -1; font-size: var(--gh-font-section); line-height: var(--gh-size-5); font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
  small { font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  span { white-space: nowrap; }
`;
export const WalletChoices = styled.fieldset`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2);
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
`;
export const WalletChoice = styled.label`
  position: relative; min-inline-size: 0; cursor: pointer;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  &:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; }
  input { position: absolute; inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); opacity: 0; }
  > span { display: flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_5); border-radius: inherit; font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); font-weight: ${({ theme }) => theme.typography.weight.bold}; background: ${({ theme }) => theme.color.surface}; }
  [data-payment-logo] { inline-size: var(--gh-size-10); block-size: var(--gh-size-6); }
  > span > svg { flex-shrink: 0; inline-size: var(--gh-size-3); block-size: var(--gh-size-3); visibility: hidden; }
  input:checked + span { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link}; box-shadow: none; }
  input:checked + span > svg { visibility: visible; }
  input:focus-visible + span { ${focusRing}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;
export const Wallet = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--gh-spacing-2); align-items: center; min-inline-size: 0; padding: var(--gh-spacing-2_5);
  background: ${({ theme }) => theme.color.surfaceMuted}; border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
`;
export const WalletNumber = styled.span`
  grid-column: 1; min-inline-size: 0; font-size: var(--gh-font-title); line-height: var(--gh-size-6); font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
  > span:last-child { display: inline-block; white-space: nowrap; }
`;
export const WalletMeta = styled.span`grid-column: 1; min-inline-size: 0; overflow-wrap: anywhere; ${smallText}`;
export const PaymentTransfer = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0;
  > ${WalletChoices} { flex: 1 1 var(--gh-size-76); }
  > ${Wallet} { flex: 2 1 var(--gh-size-60); align-content: center; }
  > ${Note} { align-self: center; }
`;
export const Action = styled(Button)`font-size: var(--gh-font-secondary); gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); ${icons}`;
export const ActionLink = styled(ButtonLink)`font-size: var(--gh-font-secondary); gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); ${icons}`;
export const CopyButton = styled(Action)`grid-column: 2; grid-row: 1 / 3; padding-inline: var(--gh-spacing-2);`;
export const MenuLink = styled(ActionLink)`justify-self: start; padding-inline: 0;`;
export const Locked = styled.p`display: flex; align-items: center; gap: var(--gh-spacing-2); padding: var(--gh-spacing-3); border-radius: ${({ theme }) => theme.radius.surface}; background: ${({ theme }) => theme.color.surfaceMuted}; ${smallText} ${icons}`;
export const StatusBox = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; padding: var(--gh-spacing-3); background: ${({ theme }) => theme.color.surfaceMuted}; font-size: var(--gh-font-body); line-height: var(--gh-size-5);
  border-radius: ${({ theme }) => theme.radius.surface};
  p { margin: 0; }
  ${RowButton} { justify-self: start; min-block-size: var(--form-control-height); }
`;
/** Doubled specificity: the account card styles its own headings. */
export const StatusTitle = styled.h3`
  && { display: flex; align-items: center; gap: var(--gh-spacing-1_5); margin: 0; font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  ${icons}
`;
export const PaymentReviewBox = styled(StatusBox)`
  border-block-start: 0; padding: var(--gh-spacing-4); gap: var(--gh-spacing-3);
  > header { display: grid; gap: var(--gh-spacing-1_5); }
  > header p { color: ${({ theme }) => theme.color.mutedText}; }
  > [data-payment-summary] { padding-block: var(--gh-spacing-2); border-block: 0; }
  > [data-payment-update], > [data-payment-resubmit] { inline-size: 100%;  }
`;
export const StatusFacts = styled.dl`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--gh-spacing-0_5) var(--gh-spacing-3); margin: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5);
  > div { display: contents; }
  dt { color: ${({ theme }) => theme.color.mutedText}; }
  dd { margin: 0; min-inline-size: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
/** $paired puts the first two fields (Paid from, Transaction ID) side by side on desktop. */
export const ReportForm = styled.form<{ $paired?: boolean }>`
  display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0;
  label { font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); }
  input:not([type="checkbox"], [type="radio"]) { min-block-size: var(--form-control-height); }
  > div { min-inline-size: 0; }
  ${({ $paired }) => $paired && css`${media.desktop} {
    grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--gh-spacing-4);
    > * { grid-column: 1 / -1; }
    > :nth-child(-n + 2) { grid-column: auto; }
  }`}
`;
export const FileField = styled.fieldset`
  display: grid; gap: var(--gh-spacing-1); min-inline-size: 0; margin: 0; padding: 0; border: 0;
  legend { padding: 0; margin-block-end: var(--gh-spacing-1_5); font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); }
`;
export const ConfirmDetails = styled.dl`
  display: grid; gap: var(--gh-spacing-1_5); margin: 0 0 var(--gh-spacing-2_5); min-inline-size: 0;
  > div { display: grid; grid-template-columns: minmax(var(--gh-size-26), auto) minmax(0, 1fr); gap: var(--gh-spacing-2); align-items: baseline; }
  dt { ${smallText} } dd { margin: 0; min-inline-size: 0; font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
`;
export const ConfirmPreview = styled.img`display: block; max-inline-size: var(--gh-size-28); max-block-size: var(--gh-size-36); border-radius: ${({ theme }) => theme.radius.surface}; object-fit: contain;`;
export const PasteButton = styled(Button)`&& { gap: var(--gh-spacing-1_5); padding-inline: var(--gh-spacing-2_5); font-size: var(--gh-font-body); } ${icons}`;
export const FileChoices = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2); min-inline-size: 0;`;
export const FileBox = styled.label`
  position: relative; display: flex; align-items: center; justify-content: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); padding: var(--gh-spacing-2); cursor: pointer;
  border: 0; background: ${({ theme }) => theme.color.surface}; font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5);
  border-radius: ${({ theme }) => theme.radius.control};
  > span { min-inline-size: 0; overflow-wrap: anywhere; }
  ${icons}
  input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: pointer; }
  &:has(input:focus-visible) { ${focusRing} }
`;
export const Preview = styled.img`max-inline-size: 100%; max-block-size: var(--gh-size-48); object-fit: contain; justify-self: start;`;
export const Assent = styled.label`
  display: flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5);
  input { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); min-block-size: var(--gh-size-4); margin: 0; flex-shrink: 0; accent-color: ${({ theme }) => theme.color.brand}; }
`;
// aria-disabled keeps a blocked Submit focusable so its reason is read, while looking and acting disabled.
export const Submit = styled(Button)`
  inline-size: 100%; min-block-size: var(--form-control-height); font-size: var(--gh-font-body); ${icons}
  &[aria-disabled="true"] { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface};
     cursor: not-allowed; }
`;
export const Disclosure = styled.details`
  min-inline-size: 0;
  > summary { display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); list-style: none; cursor: pointer; color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5); ${icons}
    &::-webkit-details-marker { display: none; }
    &:focus-visible { ${focusRing} }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  > div { display: grid; gap: var(--gh-spacing-2_5); padding-block: var(--gh-spacing-1) var(--gh-spacing-2_5); }
  ul { margin: 0; padding-inline-start: var(--gh-spacing-5); ${smallText} }
`;
export const PageFooter = styled.footer`
  background: ${({ theme }) => theme.color.section};
  display: flex; flex-wrap: wrap; align-items: start; gap: var(--gh-spacing-1) var(--gh-spacing-4); border-block-start: 0;
  > ${Disclosure}[open] { flex-basis: 100%; order: 1; }
`;
export const HelpTitle = styled.h2`font-size: var(--gh-font-body); line-height: var(--gh-size-5);`;
export const HelpActions = styled.div<{ $equal?: boolean }>`
  display: ${({ $equal }) => $equal ? "grid" : "flex"}; flex-wrap: wrap; gap: var(--gh-spacing-2);
  ${({ $equal }) => $equal && css`grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);`}
`;
