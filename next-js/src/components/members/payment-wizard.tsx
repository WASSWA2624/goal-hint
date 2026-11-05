"use client";

import { useId, type CSSProperties, type ReactNode, type Ref } from "react";
import styled from "styled-components";
import { Button, FieldMessage, focusTreatment } from "@/components/ui/controls";
import { CheckIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createMessages } from "@/i18n/messages";
import { Assent, ConfirmPreview, CopyButton, FileBox, FileChoices, FileField, Note, Plan, PlanName, PlanPrice, Plans, PaymentTransfer, Preview, RowButton, Wallet, WalletChoice, WalletChoices, WalletMeta, WalletNumber } from "./subscribe-styles";

export type PaymentStep = 0 | 1 | 2 | 3;

const Card = styled.section`
  display: grid;
  gap: var(--gh-spacing-3);
  inline-size: 100%;
  max-inline-size: var(--gh-size-160);
  min-inline-size: 0;
  margin-inline: auto;
  scroll-margin-block-start: var(--gh-size-24);
  padding: var(--gh-spacing-4);
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};

  > h2 {
    margin: 0;
    scroll-margin-block-start: var(--gh-size-24);
    font-size: var(--gh-font-headline);
    line-height: var(--gh-leading-heading);
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: var(--gh-tracking-tight);
  }
  > h2:focus { outline: none; }
  > form { min-inline-size: 0; }
  > form label, > form legend { font-size: var(--gh-font-reading); line-height: var(--gh-size-5_25); }
  > form input:not([type="checkbox"], [type="radio"], [type="file"]), > form select {
    font-size: var(--gh-font-section);
    line-height: var(--gh-size-5_5);
  }
  [data-phone-country-trigger] { font-size: var(--gh-font-emphasis); min-block-size: var(--form-control-height); }
  ${FileField} { gap: var(--gh-spacing-1_5); }
  ${FileField} legend { margin-block-end: var(--gh-spacing-1); }
  ${FileChoices} { gap: var(--gh-spacing-2); }
  ${FileBox} { min-block-size: var(--form-control-height); padding: var(--gh-spacing-2); font-size: var(--gh-font-reading); line-height: var(--gh-size-5_25); }
  ${Preview}, ${ConfirmPreview} { max-block-size: var(--gh-size-24); }
  [data-payment-review] ${ConfirmPreview} { max-block-size: var(--gh-size-18); }
  ${Note} { font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
  ${FieldMessage}, [data-evidence-findings] li { font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
  ${RowButton} { min-block-size: var(--form-control-height); font-size: var(--gh-font-emphasis); }
  ${Assent} { align-items: flex-start; padding-block: var(--gh-spacing-1); font-size: var(--gh-font-reading); line-height: var(--gh-size-5_25); }
  ${Assent} input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); min-block-size: var(--gh-size-4_5); margin-block-start: var(--gh-spacing-0_25); }
  @media (max-width: ${({ theme }) => theme.viewport[25]}) { padding: var(--gh-spacing-3_5) var(--gh-spacing-3); }
  &[data-package-screen="true"], &[data-pay-screen="true"] {
    max-inline-size: var(--gh-size-200);
    border-radius: ${({ theme }) => theme.radius.none};
    > h2 { font-size: var(--gh-font-feature); }
  }
  &[data-details-screen="true"] { border-radius: ${({ theme }) => theme.radius.none}; }
`;

const Progress = styled.nav`
  min-inline-size: 0;
  ol {
    display: grid;
    grid-template-columns: repeat(var(--payment-steps, 4), minmax(0, 1fr));
    gap: var(--gh-spacing-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-1_5);
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-body);
    line-height: var(--gh-size-4_5);
  }
  li > span:first-child {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--gh-size-5_75);
    block-size: var(--gh-size-5_75);
    border: 0;
    font-size: var(--gh-font-secondary);
    line-height: var(--gh-leading-solid);
  }
  li > span:last-child { overflow-wrap: anywhere; }
  li svg { inline-size: var(--gh-size-3_25); block-size: var(--gh-size-3_25); }
  &[data-inline-labels="true"] {
    ol { align-items: center; grid-template-columns: repeat(var(--payment-steps, 4), max-content); justify-content: space-between; }
    li { flex-direction: row; align-items: center; min-block-size: var(--gh-size-6); }
    li > span:first-child { box-sizing: border-box; inline-size: var(--gh-size-6); block-size: var(--gh-size-6); }
    li > span:last-child { display: block; line-height: var(--gh-size-6); white-space: nowrap; }
    li svg { display: block; }
    li:first-child { justify-content: flex-start; }
    li:not(:first-child):not(:last-child) { justify-content: center; }
    li:last-child { justify-content: flex-end; }
  }
  li[data-complete="true"] { color: ${({ theme }) => theme.color.link}; }
  li[data-complete="true"] > span:first-child {
    background: ${({ theme }) => theme.color.brandSoft};

  }
  li[aria-current="step"] {
    color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  li[aria-current="step"] > span:first-child {
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};

  }
  @media (max-width: ${({ theme }) => theme.viewport[30]}) {
    ol { gap: var(--gh-spacing-1); }
    li { flex-direction: column; align-items: center; gap: var(--gh-spacing-1); font-size: var(--gh-font-secondary); }
    &[data-inline-labels="true"] li { flex-direction: row; align-items: center; }
  }
  &[data-connected-progress="true"] {
    padding-block-end: var(--gh-spacing-3);
    border-block-end: var(--gh-size-0_25) solid ${({ theme }) => theme.color.border};
    ol { grid-template-columns: repeat(3, minmax(0, 1fr)) var(--gh-size-7); gap: 0; }
    li {
      position: relative; display: grid;
      grid-template-columns: var(--gh-size-7) minmax(0, 1fr);
      align-items: center; gap: var(--gh-spacing-1_5) 0;
    }
    li > span:first-child {
      grid-column: 1; grid-row: 1;
      box-sizing: border-box;
      inline-size: var(--gh-size-7); block-size: var(--gh-size-7);
      border: var(--gh-size-0_25) solid ${({ theme }) => theme.color.controlBorder};
      border-radius: ${({ theme }) => theme.radius.small};
      font-size: var(--gh-font-emphasis);
    }
    li[aria-current="step"] > span:first-child { border-color: ${({ theme }) => theme.color.brand}; }
    li > span:last-child { grid-column: 1; grid-row: 2; justify-self: center; white-space: nowrap; }
    li:first-child > span:last-child { justify-self: start; }
    li:last-child > span:last-child { justify-self: end; }
    li:not(:last-child)::after {
      content: ""; position: absolute;
      inset-block-start: var(--gh-size-3_5);
      inset-inline-start: calc(var(--gh-size-7) + var(--gh-spacing-2));
      inline-size: calc(100% - var(--gh-size-7) - var(--gh-spacing-4));
      border-block-start: var(--gh-size-0_25) solid ${({ theme }) => theme.color.controlBorder};
    }
    @media (min-width: ${({ theme }) => theme.viewport[64]}) {
      ol { grid-template-columns: repeat(3, minmax(0, 1fr)) max-content; gap: var(--gh-spacing-3); }
      li { display: flex; flex-direction: row; gap: var(--gh-spacing-1_5); }
      li:not(:last-child)::after {
        position: static; flex: 1; inline-size: auto; margin-inline-start: var(--gh-spacing-1);
      }
    }
  }
`;

/** Present one stage at a time; the caller owns navigation, validation and data. */
export function PaymentWizard({ locale, step, title, children, headingRef, totalSteps = 4, hideTitle = false, inlineLabels = totalSteps === 3, labels: stepLabels, variant = "default" }: {
  locale: string;
  step: PaymentStep;
  title: string;
  children: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  totalSteps?: 3 | 4;
  hideTitle?: boolean;
  inlineLabels?: boolean;
  labels?: readonly [string, string, string, string];
  variant?: "default" | "package" | "pay" | "details";
}) {
  const m = createMessages(locale), titleId = useId();
  const connectedProgress = totalSteps === 4;
  const labels = ["subscribe.wizard.package", "subscribe.wizard.pay", "subscribe.wizard.proof", "subscribe.wizard.review"] as const;
  return <Card data-subscribe-layout="stepwise" data-payment-step={step + 1} data-package-screen={variant === "package"} data-pay-screen={variant === "pay"} data-details-screen={variant === "details"} aria-labelledby={titleId} style={{ "--payment-steps": totalSteps } as CSSProperties}>
    <Progress aria-label={m.text("subscribe.wizard.progress")} data-payment-progress data-inline-labels={connectedProgress ? false : inlineLabels} data-connected-progress={connectedProgress}>
      <ol>{labels.slice(0, totalSteps).map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} data-complete={index < step}>
        <span aria-hidden="true">{index < step ? <CheckIcon /> : index + 1}</span>
        <span>{stepLabels?.[index] ?? (totalSteps === 3 && index === 2 ? "Confirm" : m.text(label))}</span>
      </li>)}</ol>
    </Progress>
    {hideTitle ? <VisuallyHidden as="h2" id={titleId} ref={headingRef} tabIndex={-1}>{title}</VisuallyHidden>
      : <h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>}
    {children}
  </Card>;
}

export const WizardActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  margin-block-start: var(--gh-spacing-1);
  padding-block-start: var(--gh-spacing-2_5);
  border-block-start: 0;
  > button {
    inline-size: 100%;
    min-block-size: var(--form-control-height);
    padding: var(--gh-spacing-2) var(--gh-spacing-3);
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: var(--gh-font-section);
    line-height: var(--gh-size-5_5);
  }
  > button:not(:last-child):not(:disabled) {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.brandSoft};

  }
  > button:only-child { grid-column: 1 / -1; }
  svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); flex: none; }
`;

export const WizardPlans = styled(Plans)`
  && { grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-2); }
  > ${Plan} {
    grid-template-columns: var(--gh-size-4_5) minmax(0, 1fr) auto;
    align-items: center;
    align-content: center;
    gap: var(--gh-spacing-2);
    min-block-size: var(--gh-size-14_5);
    padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
    border-radius: ${({ theme }) => theme.radius.surface};
  }
  > ${Plan} input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); margin: 0; }
  ${PlanName} { font-size: var(--gh-font-section); line-height: var(--gh-size-5_5); }
  ${PlanPrice} { grid-column: 3; font-size: var(--gh-font-title); line-height: var(--gh-size-6); white-space: nowrap; }
  ${PlanPrice} small { font-size: var(--gh-font-emphasis); }
  @media (max-width: ${({ theme }) => theme.viewport[25]}) {
    > ${Plan} { padding-inline: var(--gh-spacing-2_5); }
  }
`;

export const WizardReview = styled.dl`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  margin: 0;
  > div {
    display: grid;
    grid-template-columns: minmax(var(--gh-size-24), 0.8fr) minmax(0, 1.2fr);
    align-items: center;
    gap: var(--gh-spacing-2);
    min-inline-size: 0;
    padding-block: var(--gh-spacing-0_5);
    border-block-end: 0;
  }
  > div:last-child { border-block-end: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gh-spacing-1) var(--gh-spacing-2);
    min-inline-size: 0;
    margin: 0;
    font-size: var(--gh-font-reading);
    line-height: var(--gh-size-5_5);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  dd > button { margin-inline-start: auto; }
  dd > img { display: block; inline-size: auto; max-inline-size: 100%; max-block-size: var(--gh-size-24); object-fit: contain; }
  dd > a { display: inline-flex; max-inline-size: 100%; cursor: zoom-in; ${focusTreatment} }
  dd > a img { display: block; inline-size: auto; max-inline-size: 100%; max-block-size: var(--gh-size-18); object-fit: contain; }
  @media (max-width: ${({ theme }) => theme.viewport[25]}) {
    > div { grid-template-columns: minmax(var(--gh-size-18), 0.7fr) minmax(0, 1.3fr); gap: var(--gh-spacing-2); }
  }
`;

export const WizardConfirm = styled.label`
  display: flex;
  align-items: flex-start;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  min-block-size: var(--form-control-height);
  padding-block: var(--gh-spacing-1);
  font-size: var(--gh-font-reading);
  line-height: var(--gh-size-5_25);
  cursor: pointer;
  input { flex: none; inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); margin: var(--gh-spacing-0_25) 0 0; accent-color: ${({ theme }) => theme.color.brand}; }
`;

export const WizardNotice = styled.p`
  margin: 0;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-emphasis);
  line-height: var(--gh-size-5);
  overflow-wrap: anywhere;
`;

export const WizardFooter = styled.div`
  inline-size: 100%;
  max-inline-size: var(--gh-size-160);
  min-inline-size: 0;
  margin-inline: auto;
  button, a, summary, p, li { font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
`;

export const WizardReceipt = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-1) var(--gh-spacing-2);
  min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: var(--gh-font-reading);
  line-height: var(--gh-size-5_5);
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1); min-inline-size: 0; }
  > strong { font-size: var(--gh-font-page); line-height: var(--gh-size-7); white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

export const WizardEdit = styled(Button)`
  && { min-block-size: var(--form-control-height); min-inline-size: var(--gh-size-11); padding: var(--gh-spacing-1) var(--gh-spacing-1_5); border-radius: ${({ theme }) => theme.radius.control}; font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
`;

export const WizardScreenshot = styled.div`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  > a {
    display: inline-flex;
    flex: none;
    max-inline-size: var(--gh-size-24);
    cursor: zoom-in;
    ${focusTreatment}
  }
  > a img { display: block; inline-size: auto; max-inline-size: var(--gh-size-24); max-block-size: var(--gh-size-18); object-fit: contain; }
  > button { min-block-size: var(--form-control-height); font-size: var(--gh-font-emphasis); }
`;

export const WizardPayee = styled.div`
  display: grid;
  gap: var(--gh-spacing-0_5);
  min-inline-size: 0;
  > strong { font-size: var(--gh-font-reading); line-height: var(--gh-size-5_25); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span { font-size: var(--gh-font-section); line-height: var(--gh-size-5_5); font-variant-numeric: tabular-nums; }
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
`;

export const WizardMethod = styled.div`
  display: grid;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  > ${PaymentTransfer} { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-2_5); }
  ${WalletChoices} { grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-2); }
  ${WalletChoice}, ${Wallet} { border-radius: ${({ theme }) => theme.radius.control}; }
  ${WalletChoice} > span { justify-content: flex-start; gap: var(--gh-spacing-2_5); min-block-size: var(--form-control-height); padding: var(--gh-spacing-2) var(--gh-spacing-2_5); font-size: var(--gh-font-section); line-height: var(--gh-size-5_5); }
  ${WalletChoice} > span > svg:last-child { margin-inline-start: auto; }
  ${Wallet} { inline-size: 100%; gap: var(--gh-spacing-1_5) var(--gh-spacing-2_5); padding: var(--gh-spacing-3); }
  ${WalletMeta} { font-size: var(--gh-font-emphasis); line-height: var(--gh-size-5); }
  ${WalletNumber} { font-size: var(--gh-font-headline); line-height: var(--gh-size-7_5); }
  ${WalletNumber} > ${WalletMeta} { display: block; margin-block-end: var(--gh-spacing-1); }
  ${CopyButton} { min-block-size: var(--form-control-height); font-size: var(--gh-font-reading); }
  @media (max-width: ${({ theme }) => theme.viewport[30]}) {
    ${Wallet} { grid-template-columns: minmax(0, 1fr); }
    ${CopyButton} { grid-column: 1; grid-row: auto; inline-size: 100%; }
  }
`;
