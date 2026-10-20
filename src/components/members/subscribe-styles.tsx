"use client";

import styled, { css } from "styled-components";
import { Button, ButtonLink } from "@/components/ui/controls";
import { media } from "@/styles/theme";

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
  display: flex; flex-direction: column; gap: 16px;
  inline-size: 100%; max-inline-size: 50rem; min-inline-size: 0; margin-inline: auto;
`;
export const Intro = styled.div`
  display: grid; gap: 4px;
  h1 { font-size: 24px; line-height: 30px; letter-spacing: -0.02em; }
  ${media.tablet} { h1 { font-size: 28px; line-height: 34px; } }
`;
export const Lead = styled.p`${smallText}`;
export const Note = styled.p`${smallText}`;
export const Panel = styled.div`
  display: grid; gap: 8px; min-inline-size: 0; padding: 12px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
`;
export const Row = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
  min-block-size: 44px; min-inline-size: 0; font-size: 12px; line-height: 18px;
  ${icons}
`;
export const AccountRow = styled(Row)`
  column-gap: 6px; padding-block: 4px; border-block: 1px solid ${({ theme }) => theme.color.border};
  > a:last-child { margin-inline-start: auto; }
  form { display: flex; }
  button, a { font-size: 12px; padding-inline: 4px; }
`;
export const Identity = styled.p`
  min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText};
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; white-space: nowrap; }
`;
export const RowButton = styled(Button)`
  justify-content: flex-start; gap: 6px; padding-inline: 0; font-size: 12px;
  ${icons}
`;
export const RowLink = styled(ButtonLink)`
  justify-self: start; padding-inline: 0; font-size: 12px; gap: 6px;
  ${icons}
`;
export const RowNote = styled.p`${smallText}`;
export const SignInForm = styled.form`display: grid; gap: 8px; min-inline-size: 0;`;
export const FieldWithAction = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; align-items: end; min-inline-size: 0;
  > div:first-child { display: contents; }
  > div:first-child > label { grid-column: 1 / -1; }
  > div:first-child > :not(label) { grid-column: 1; }
  > div:first-child > [id$="-hint"], > div:first-child > [id$="-error"] { grid-column: 1 / -1; }
  > button { grid-column: 2; grid-row: 2; min-block-size: 44px; }
  ${icons}
`;
export const Optional = styled.span`font-weight: 400; color: ${({ theme }) => theme.color.mutedText};`;

/** Keep payment confirmation below the recipient details at every screen size. */
export const Sheet = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; min-inline-size: 0;
`;
export const Step = styled.section`display: grid; align-content: start; gap: 10px; min-inline-size: 0;`;
export const StepHeading = styled.div`display: flex; align-items: baseline; gap: 8px; min-inline-size: 0;`;
export const StepNumber = styled.span<{ $muted?: boolean }>`
  color: ${({ theme, $muted }) => $muted ? theme.color.mutedText : theme.color.link};
  font-size: 12px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
export const StepTitle = styled.h2`font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.heavy};`;
export const Unit = styled.span`${smallText} margin-inline-start: auto;`;
export const Plans = styled.fieldset<{ $columns: number }>`
  display: grid; grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr)); gap: 8px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
`;
export const Plan = styled.label`
  position: relative; display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 3px 6px; align-content: start;
  min-inline-size: 0; padding: 10px 8px; cursor: pointer;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface};
  input { inline-size: 14px; block-size: 14px; margin: 2px 0 0; accent-color: ${({ theme }) => theme.color.brand}; }
  &:has(input:checked) { background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.brand}; box-shadow: inset 0 -2px ${({ theme }) => theme.color.brand}; }
  &:has(input:focus-visible) { ${focusRing} }
`;
export const PlanName = styled.span`font-size: 12px; line-height: 18px; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere;`;
export const PlanPrice = styled.span`grid-column: 1 / -1; font-size: 18px; line-height: 24px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere;`;
export const PlanDays = styled.span`grid-column: 1 / -1; ${smallText}`;
export const WalletChoices = styled.fieldset`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
`;
export const WalletChoice = styled.label`
  position: relative; min-inline-size: 0; cursor: pointer;
  border: 1px solid ${({ theme }) => theme.color.controlBorder};
  &:has(input:checked) { border-color: ${({ theme }) => theme.color.brand}; }
  input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; }
  > span { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-block-size: 88px; padding: 8px; font-size: 12px; line-height: 18px; font-weight: ${({ theme }) => theme.typography.weight.bold}; background: ${({ theme }) => theme.color.surface}; }
  > span > svg { position: absolute; inset-block-start: 4px; inset-inline-end: 4px; inline-size: 14px; block-size: 14px; visibility: hidden; }
  input:checked + span { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link}; box-shadow: inset 0 -2px ${({ theme }) => theme.color.brand}; }
  input:checked + span > svg { visibility: visible; }
  input:focus-visible + span { ${focusRing}; outline-offset: -3px; }
`;
export const Wallet = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 8px; align-items: center; min-inline-size: 0; padding: 10px;
  background: ${({ theme }) => theme.color.surfaceMuted}; border: 1px solid ${({ theme }) => theme.color.border};
`;
export const WalletNumber = styled.span`
  grid-column: 1; min-inline-size: 0; font-size: 18px; line-height: 24px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
  > span:last-child { display: inline-block; white-space: nowrap; }
`;
export const WalletMeta = styled.span`grid-column: 1; min-inline-size: 0; overflow-wrap: anywhere; ${smallText}`;
export const PaymentTransfer = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; min-inline-size: 0;
  > ${WalletChoices} { flex: 1 1 8rem; }
  > ${Wallet} { flex: 2 1 15rem; align-content: center; }
  > ${Note} { align-self: center; }
`;
export const Action = styled(Button)`font-size: 12px; gap: 6px; min-block-size: 44px; ${icons}`;
export const ActionLink = styled(ButtonLink)`font-size: 12px; gap: 6px; min-block-size: 44px; ${icons}`;
export const CopyButton = styled(Action)`grid-column: 2; grid-row: 1 / 3; padding-inline: 8px;`;
export const MenuLink = styled(ActionLink)`justify-self: start; padding-inline: 0;`;
export const Locked = styled.p`display: flex; align-items: center; gap: 8px; padding: 12px; background: ${({ theme }) => theme.color.surfaceMuted}; ${smallText} ${icons}`;
export const StatusBox = styled.div`display: grid; gap: 6px; padding: 12px; background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 13px; line-height: 20px;`;
export const ReportForm = styled.form`
  display: grid; gap: 10px; min-inline-size: 0;
  label { font-size: 12px; line-height: 18px; }
  input:not([type="checkbox"], [type="radio"]) { min-block-size: 44px; }
  > div { min-inline-size: 0; }
`;
export const PaymentFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: end; min-inline-size: 0;
  > div { min-inline-size: 0; }
`;
export const FileField = styled.div`display: grid; gap: 4px; min-inline-size: 0;`;
export const FileBox = styled.label`
  position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-block-size: 44px; padding: 8px; cursor: pointer;
  border: 1px dashed ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; font-size: 12px; line-height: 18px;
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
export const Submit = styled(Button)`inline-size: 100%; min-block-size: 44px; font-size: 13px; ${icons}`;
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
export const HelpActions = styled.div`display: flex; flex-wrap: wrap; gap: 8px;`;
