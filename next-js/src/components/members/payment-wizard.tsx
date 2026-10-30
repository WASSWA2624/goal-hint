"use client";

import { useId, type ReactNode, type Ref } from "react";
import styled from "styled-components";
import { Button, FieldMessage, focusTreatment } from "@/components/ui/controls";
import { CheckIcon } from "@/components/ui/icons";
import { createMessages } from "@/i18n/messages";
import { Assent, ConfirmPreview, CopyButton, FileBox, FileChoices, FileField, Note, Plan, PlanName, PlanPrice, Plans, PaymentTransfer, Preview, RowButton, Wallet, WalletChoice, WalletChoices, WalletMeta, WalletNumber } from "./subscribe-styles";

export type PaymentStep = 0 | 1 | 2 | 3;

const Card = styled.section`
  display: grid;
  gap: 12px;
  inline-size: 100%;
  max-inline-size: 40rem;
  min-inline-size: 0;
  margin-inline: auto;
  scroll-margin-block-start: 6rem;
  padding: 16px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.surface};

  > h2 {
    margin: 0;
    scroll-margin-block-start: 6rem;
    font-size: 24px;
    line-height: 1.25;
    font-weight: ${({ theme }) => theme.typography.weight.heavy};
    letter-spacing: -0.02em;
  }
  > h2:focus { outline: none; }
  > form { min-inline-size: 0; }
  > form label, > form legend { font-size: 15px; line-height: 21px; }
  > form input:not([type="checkbox"], [type="radio"], [type="file"]), > form select {
    font-size: 16px;
    line-height: 22px;
  }
  [data-phone-country-trigger] { font-size: 14px; min-block-size: 44px; }
  ${FileField} { gap: 6px; }
  ${FileField} legend { margin-block-end: 4px; }
  ${FileChoices} { gap: 8px; }
  ${FileBox} { min-block-size: 44px; padding: 8px; font-size: 15px; line-height: 21px; }
  ${Preview}, ${ConfirmPreview} { max-block-size: 96px; }
  [data-payment-review] ${ConfirmPreview} { max-block-size: 72px; }
  ${Note} { font-size: 14px; line-height: 20px; }
  ${FieldMessage}, [data-evidence-findings] li, [data-reading-progress] li { font-size: 14px; line-height: 20px; }
  ${RowButton} { min-block-size: 44px; font-size: 14px; }
  ${Assent} { align-items: flex-start; padding-block: 4px; font-size: 15px; line-height: 21px; }
  ${Assent} input { inline-size: 18px; block-size: 18px; min-block-size: 18px; margin-block-start: 1px; }
  @media (max-width: 400px) { padding: 14px 12px; }
`;

const Progress = styled.nav`
  min-inline-size: 0;
  ol {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 13px;
    line-height: 18px;
  }
  li > span:first-child {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 23px;
    block-size: 23px;
    border: 1px solid ${({ theme }) => theme.color.border};
    font-size: 12px;
    line-height: 1;
  }
  li > span:last-child { overflow-wrap: anywhere; }
  li svg { inline-size: 13px; block-size: 13px; }
  li[data-complete="true"] { color: ${({ theme }) => theme.color.link}; }
  li[data-complete="true"] > span:first-child {
    background: ${({ theme }) => theme.color.brandSoft};
    border-color: ${({ theme }) => theme.color.brand};
  }
  li[aria-current="step"] {
    color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  li[aria-current="step"] > span:first-child {
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
    border-color: ${({ theme }) => theme.color.brand};
  }
  @media (max-width: 480px) {
    ol { gap: 4px; }
    li { flex-direction: column; align-items: center; gap: 4px; font-size: 12px; }
  }
`;

/** Present one stage at a time; the caller owns navigation, validation and data. */
export function PaymentWizard({ locale, step, title, children, headingRef }: {
  locale: string;
  step: PaymentStep;
  title: string;
  children: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const m = createMessages(locale), titleId = useId();
  const labels = ["subscribe.wizard.package", "subscribe.wizard.pay", "subscribe.wizard.proof", "subscribe.wizard.review"] as const;
  return <Card data-subscribe-layout="stepwise" data-payment-step={step + 1} aria-labelledby={titleId}>
    <Progress aria-label={m.text("subscribe.wizard.progress")} data-payment-progress>
      <ol>{labels.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} data-complete={index < step}>
        <span aria-hidden="true">{index < step ? <CheckIcon /> : index + 1}</span>
        <span>{m.text(label)}</span>
      </li>)}</ol>
    </Progress>
    <h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>
    {children}
  </Card>;
}

export const WizardActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  margin-block-start: 4px;
  padding-block-start: 10px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border};
  > button {
    inline-size: 100%;
    min-block-size: 46px;
    padding: 8px 12px;
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: 16px;
    line-height: 22px;
  }
  > button:not(:last-child):not(:disabled) {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border-color: ${({ theme }) => theme.color.controlBorder};
  }
  > button:only-child { grid-column: 1 / -1; }
  svg { inline-size: 18px; block-size: 18px; flex: none; }
`;

export const WizardPlans = styled(Plans)`
  && { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  > ${Plan} {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    align-content: center;
    gap: 8px;
    min-block-size: 58px;
    padding: 10px 12px;
    border-radius: ${({ theme }) => theme.radius.surface};
  }
  > ${Plan} input { inline-size: 18px; block-size: 18px; margin: 0; }
  ${PlanName} { font-size: 16px; line-height: 22px; }
  ${PlanPrice} { grid-column: 3; font-size: 18px; line-height: 24px; white-space: nowrap; }
  ${PlanPrice} small { font-size: 14px; }
  @media (max-width: 400px) {
    > ${Plan} { padding-inline: 10px; }
  }
`;

export const WizardReview = styled.dl`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  margin: 0;
  > div {
    display: grid;
    grid-template-columns: minmax(6rem, 0.8fr) minmax(0, 1.2fr);
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
    padding-block: 2px;
    border-block-end: 1px solid ${({ theme }) => theme.color.border};
  }
  > div:last-child { border-block-end: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: 14px; line-height: 20px; }
  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-inline-size: 0;
    margin: 0;
    font-size: 15px;
    line-height: 22px;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  dd > button { margin-inline-start: auto; }
  dd > img { display: block; inline-size: auto; max-inline-size: 100%; max-block-size: 96px; object-fit: contain; }
  dd > a { display: inline-flex; max-inline-size: 100%; cursor: zoom-in; ${focusTreatment} }
  dd > a img { display: block; inline-size: auto; max-inline-size: 100%; max-block-size: 72px; object-fit: contain; }
  @media (max-width: 400px) {
    > div { grid-template-columns: minmax(4.5rem, 0.7fr) minmax(0, 1.3fr); gap: 8px; }
  }
`;

export const WizardConfirm = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: 44px;
  padding-block: 4px;
  font-size: 15px;
  line-height: 21px;
  cursor: pointer;
  input { flex: none; inline-size: 18px; block-size: 18px; margin: 1px 0 0; accent-color: ${({ theme }) => theme.color.brand}; }
`;

export const WizardNotice = styled.p`
  margin: 0;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 14px;
  line-height: 20px;
  overflow-wrap: anywhere;
`;

export const WizardFooter = styled.div`
  inline-size: 100%;
  max-inline-size: 40rem;
  min-inline-size: 0;
  margin-inline: auto;
  button, a, summary, p, li { font-size: 14px; line-height: 20px; }
`;

export const WizardReceipt = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  min-inline-size: 0;
  padding: 10px 12px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: 15px;
  line-height: 22px;
  > div { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-inline-size: 0; }
  > strong { font-size: 22px; line-height: 28px; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

export const WizardEdit = styled(Button)`
  && { min-block-size: 44px; min-inline-size: 44px; padding: 4px 6px; border-radius: ${({ theme }) => theme.radius.control}; font-size: 14px; line-height: 20px; }
`;

export const WizardScreenshot = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
  > a {
    display: inline-flex;
    flex: none;
    max-inline-size: 96px;
    cursor: zoom-in;
    ${focusTreatment}
  }
  > a img { display: block; inline-size: auto; max-inline-size: 96px; max-block-size: 72px; object-fit: contain; }
  > button { min-block-size: 44px; font-size: 14px; }
`;

export const WizardPayee = styled.div`
  display: grid;
  gap: 2px;
  min-inline-size: 0;
  > strong { font-size: 15px; line-height: 21px; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span { font-size: 16px; line-height: 22px; font-variant-numeric: tabular-nums; }
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 14px; line-height: 20px; }
`;

export const WizardMethod = styled.div`
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  > ${PaymentTransfer} { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  ${WalletChoices} { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  ${WalletChoice}, ${Wallet} { border-radius: ${({ theme }) => theme.radius.control}; }
  ${WalletChoice} > span { justify-content: flex-start; gap: 10px; min-block-size: 54px; padding: 8px 10px; font-size: 16px; line-height: 22px; }
  ${WalletChoice} > span > svg:last-child { margin-inline-start: auto; }
  ${Wallet} { inline-size: 100%; gap: 6px 10px; padding: 12px; }
  ${WalletMeta} { font-size: 14px; line-height: 20px; }
  ${WalletNumber} { font-size: 24px; line-height: 30px; }
  ${WalletNumber} > ${WalletMeta} { display: block; margin-block-end: 4px; }
  ${CopyButton} { min-block-size: 44px; font-size: 15px; }
  @media (max-width: 480px) {
    ${Wallet} { grid-template-columns: minmax(0, 1fr); }
    ${CopyButton} { grid-column: 1; grid-row: auto; inline-size: 100%; }
  }
`;
