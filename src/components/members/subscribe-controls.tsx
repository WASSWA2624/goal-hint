"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics/tracker";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import { Button, ButtonLink, PhoneInput, SegmentedChoice, TextInput } from "@/components/ui/controls";
import { ChatIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ClipboardIcon, CopyIcon, DialpadIcon, GiftIcon, ImageIcon, KeyIcon, LockIcon, PhoneIcon, ShieldIcon, SignOutIcon } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { memberNextPath } from "@/domain/member-navigation";
import { formatPhone, localUgandaPhone, networkForPrefix, normalizePhone, telHref, waHref, type MobileNetwork } from "@/domain/phone";
import { canOpenMoneyMenu, normalizeTransactionId, type PaymentView } from "@/domain/payment";
import { parsePaymentSms } from "@/domain/payment-sms";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { AccountCodeForm } from "./account-code-form";
import { MemberSignOut } from "./member-controls";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";

const subscribeNothing = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Phones below the tablet breakpoint let the step sheet run edge to edge. */
const phoneOnly = "@media (max-width: 47.99rem)";
/** Step widths on 360px and 320px phones: a wallet row needs about 20rem with a labelled Copy button. */
const narrowStep = "@container step (max-width: 20rem)";
const tightStep = "@container step (max-width: 17.5rem)";
const wallets = {
  mtn: { chip: "MTN", short: "MTN", name: "MTN MoMo", menu: "subscribe.openMtn" },
  airtel: { chip: "airtel", short: "Airtel", name: "Airtel Money", menu: "subscribe.openAirtel" },
} as const;

const focusRing = css`
  outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
  outline-offset: ${({ theme }) => theme.border.focusOffset};
`;
const muted = css`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 12px; line-height: 16px;
  ${media.desktop} { font-size: 13px; line-height: 18px; }
`;
const iconSize = css`
  svg { inline-size: 20px; block-size: 20px; flex-shrink: 0; }
`;

/** One centred column at every width: intro, account, three numbered steps, then help. */
export const SubscribeLayout = styled.div`
  display: flex; flex-direction: column; gap: 16px;
  inline-size: 100%; max-inline-size: 50rem; min-inline-size: 0; margin-inline: auto;
`;
const Intro = styled.div`
  display: flex; flex-direction: column; gap: 4px;
  h1 { font-size: 1.375rem; line-height: 28px; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: -0.01em; }
  ${media.desktop} {
    flex-flow: row wrap; align-items: baseline; column-gap: 16px;
    h1 { font-size: 1.875rem; line-height: 36px; }
  }
`;
const Lead = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 13px; line-height: 18px;
  ${media.desktop} { font-size: 15px; line-height: 22px; }
`;
const Note = styled.p`${muted}`;
const Panel = styled.div`
  display: grid; align-items: start; min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  > * + * { border-block-start: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`}; }
  ${media.desktop} {
    grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
    > * + * { border-block-start: 0; border-inline-start: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`}; }
  }
`;
const Row = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 8px;
  min-block-size: 44px; min-inline-size: 0; padding-inline: 12px;
  font-size: 13px; line-height: 18px;
  button { min-block-size: 44px; white-space: nowrap; }
  ${iconSize}
  ${media.desktop} { min-block-size: 56px; padding-inline: 16px; font-size: 14px; line-height: 20px; }
`;
const Identity = styled.p`
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; white-space: nowrap; }
`;
const rowAction = css`
  display: flex; align-items: center; gap: 8px; box-sizing: border-box;
  inline-size: 100%; min-block-size: 44px; padding-inline: 12px;
  border: 0; background: transparent; color: ${({ theme }) => theme.color.text};
  font: inherit; font-size: 13px; font-weight: ${({ theme }) => theme.typography.weight.medium}; line-height: 18px;
  text-align: start; text-decoration: none; cursor: pointer;
  > span { flex: 1; min-inline-size: 0; }
  strong { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  svg { inline-size: 20px; block-size: 20px; flex-shrink: 0; color: ${({ theme }) => theme.color.link}; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; } }
  &:focus-visible { ${focusRing}; outline-offset: -3px; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  ${media.desktop} { min-block-size: 56px; padding-inline: 16px; font-size: 14px; line-height: 20px; }
`;
const RowButton = styled.button`${rowAction}`;
const RowLink = styled(Link)`${rowAction}`;
const RowNote = styled.p`
  padding: 12px; font-size: 13px; line-height: 18px;
  ${media.desktop} { padding: 16px; font-size: 14px; line-height: 20px; }
`;
const SignInForm = styled.form`
  display: flex; flex-direction: column; gap: 8px; min-inline-size: 0; padding: 12px;
  ${media.desktop} { padding: 16px; }
`;
/** The field's label spans the row, its input shares a row with the action, and hints run below both. */
const FieldWithAction = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; row-gap: 4px; align-items: end; min-inline-size: 0;
  > div:first-child { display: contents; }
  > div:first-child > label { grid-column: 1 / -1; }
  > div:first-child > :not(label) { grid-column: 1; }
  > div:first-child > [id$="-hint"], > div:first-child > [id$="-error"] { grid-column: 1 / -1; }
  > button { grid-column: 2; grid-row: 2; min-block-size: 44px; }
  input { min-block-size: 44px; }
  ${iconSize}
`;
const Optional = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-weight: ${({ theme }) => theme.typography.weight.body};
`;
const Sheet = styled.div`
  min-inline-size: 0; padding-inline: 16px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  ${phoneOnly} { margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter}); border-inline: 0; }
  ${media.desktop} { padding-inline: 24px; }
`;
const Step = styled.section`
  display: grid; grid-template-columns: 24px minmax(0, 1fr); column-gap: 8px; align-items: baseline;
  padding-block: 16px;
  & + & { border-block-start: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`}; }
  ${media.desktop} { grid-template-columns: 32px minmax(0, 1fr); column-gap: 16px; }
`;
const StepNumber = styled.span<{ $muted?: boolean }>`
  color: ${({ theme, $muted }) => $muted ? theme.color.mutedText : theme.color.brand};
  font-size: 2rem; line-height: 22px; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
  ${media.desktop} { font-size: 2.5rem; line-height: 28px; }
`;
const StepBody = styled.div`
  display: flex; flex-direction: column; gap: 12px; min-inline-size: 0;
  container: step / inline-size;
`;
const StepHeading = styled.div`
  display: flex; flex-direction: column; gap: 2px;
  ${media.desktop} { flex-flow: row wrap; align-items: baseline; column-gap: 12px; }
`;
const StepTitle = styled.h2`
  font-size: 1rem; line-height: 22px; font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${media.desktop} { font-size: 1.25rem; line-height: 28px; }
`;
const Amount = styled.span`
  font-size: 1.625rem; line-height: 28px; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: -0.01em; font-variant-numeric: tabular-nums; white-space: nowrap;
  ${media.desktop} { font-size: 1.875rem; line-height: 20px; }
`;
const AmountTail = styled.span`
  ${phoneOnly} { display: block; }
`;
const Plans = styled.fieldset<{ $columns: number }>`
  display: grid; grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr)); gap: 8px;
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  ${media.desktop} { gap: 12px; }
  ${tightStep} { grid-template-columns: minmax(0, 1fr); }
`;
const Plan = styled.label`
  position: relative; display: grid; grid-template-columns: 20px minmax(0, 1fr); column-gap: 8px; row-gap: 2px;
  grid-template-areas: "radio name" "price price" "days days"; align-items: center;
  min-inline-size: 0; padding: 8px; cursor: pointer;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.controlBorder}`};
  input { grid-area: radio; inline-size: 20px; block-size: 20px; margin: 0; accent-color: ${({ theme }) => theme.color.brand}; }
  &:has(input:checked) { border-color: ${({ theme }) => theme.color.brand}; box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
  &:has(input:focus-visible) { ${focusRing} }
  input:focus-visible { outline: none; }
  ${media.desktop} {
    grid-template-columns: 20px minmax(0, 1fr) auto; grid-template-areas: "radio name days" ". price price";
    padding: 8px 12px;
  }
  ${narrowStep} { column-gap: 6px; padding: 6px; }
  ${tightStep} { grid-template-columns: 20px minmax(0, 1fr) auto auto; grid-template-areas: "radio name days price"; column-gap: 12px; padding: 8px 12px; }
`;
const PlanName = styled.span`
  grid-area: name; min-inline-size: 0; overflow-wrap: anywhere;
  font-size: 13px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${media.desktop} { font-size: 15px; line-height: 22px; }
  ${narrowStep} { font-size: 12px; }
  ${tightStep} { font-size: 13px; }
`;
const PlanPrice = styled.span`
  grid-area: price; font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums; white-space: nowrap;
  ${media.desktop} { font-size: 18px; line-height: 24px; }
  ${narrowStep} { font-size: 13px; }
`;
const PlanDays = styled.span`grid-area: days; ${muted}`;
const Wallets = styled.ul`
  margin: 0; padding: 0; list-style: none;
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  /* Desktop rows share one set of columns, so every Copy button lines up. */
  ${media.desktop} { display: grid; grid-template-columns: max-content max-content auto minmax(0, 1fr); column-gap: 12px; }
`;
const Wallet = styled.li`
  display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; column-gap: 12px; align-items: center;
  grid-template-areas: "chip number copy" "chip meta copy" ". menu menu";
  padding: 12px;
  &[data-menu] { padding-block-end: 0; }
  & + & { border-block-start: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`}; }
  ${iconSize}
  ${media.desktop} {
    grid-column: 1 / -1; grid-template-columns: subgrid;
    grid-template-areas: "chip number copy menu" "chip meta copy menu";
    padding: 8px 8px 8px 12px;
    &[data-menu] { padding-block-end: 8px; }
  }
  ${tightStep} { grid-template-columns: 32px minmax(0, 1fr) auto; column-gap: 8px; }
`;
/** Network colour chips stay the same in both themes; each keeps 4.5:1 or better. */
const Chip = styled.span<{ $network: MobileNetwork }>`
  grid-area: chip; display: flex; align-items: center; justify-content: center;
  inline-size: 40px; block-size: 40px;
  background: ${({ $network }) => $network === "mtn" ? "#FFCC00" : "#E4002B"};
  color: ${({ $network }) => $network === "mtn" ? "#071747" : "#FFFFFF"};
  font-size: 12px; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  ${tightStep} { inline-size: 32px; block-size: 32px; font-size: 10px; }
`;
const WalletNumber = styled.span`
  grid-area: number; align-self: end; font-size: 18px; line-height: 24px; font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums; white-space: nowrap;
  ${media.desktop} { font-size: 20px; line-height: 26px; }
  ${tightStep} { font-size: 16px; }
`;
const WalletMeta = styled.span`
  grid-area: meta; align-self: start; min-inline-size: 0; ${muted}
  > span { white-space: nowrap; }
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; }
`;
const action = css`
  gap: 8px; min-block-size: 44px; font-size: 13px;
  ${iconSize}
  ${media.desktop} { font-size: 14px; line-height: 20px; }
`;
const Action = styled(Button)`${action}`;
const ActionLink = styled(ButtonLink)`${action}`;
const CopyButton = styled(Action)`
  grid-area: copy; padding-inline: 10px;
  ${media.desktop} { margin-inline-start: 12px; padding-inline: 14px; }
  ${narrowStep} { inline-size: 44px; padding-inline: 0; > span[data-label] { display: none; } }
`;
const MenuLink = styled(ActionLink)`
  grid-area: menu; justify-self: start; padding-inline: 0;
  ${media.desktop} { justify-self: end; justify-content: flex-start; min-inline-size: 13.5rem; }
`;
const Locked = styled.p`
  display: flex; align-items: center; gap: 12px; padding: 12px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: 13px; line-height: 18px;
  ${iconSize}
  svg { color: ${({ theme }) => theme.color.mutedText}; }
  ${media.desktop} { font-size: 14px; line-height: 20px; }
`;
const StatusBox = styled.div`
  display: flex; flex-direction: column; gap: 4px; padding: 12px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  font-size: 13px; line-height: 18px;
  ${media.desktop} { font-size: 14px; line-height: 20px; }
`;
const ReportForm = styled.form`
  display: grid; gap: 16px; min-inline-size: 0;
  ${media.tablet} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; align-items: start; }
  > [data-wide] { grid-column: 1 / -1; }
  input:not([type="checkbox"], [type="radio"]) { min-block-size: 44px; }
`;
const Summary = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px; align-self: stretch;
  padding-inline-start: 12px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  p { flex: 1; min-inline-size: 0; padding-block: 8px; font-size: 13px; line-height: 18px; font-variant-numeric: tabular-nums; }
  strong { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  button { flex-shrink: 0; min-block-size: 44px; white-space: nowrap; }
  ${media.desktop} { padding-inline-start: 16px; p { font-size: 14px; line-height: 20px; } }
`;
const ChangeFields = styled.div`
  display: grid; gap: 12px; min-inline-size: 0;
  ${media.tablet} { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); align-items: start; }
`;
const FileField = styled.div`
  display: flex; flex-direction: column; gap: 4px; min-inline-size: 0;
`;
const FileLabel = styled.span`
  font-size: 13px; line-height: 18px; font-weight: ${({ theme }) => theme.typography.weight.medium};
  ${media.desktop} { font-size: inherit; line-height: inherit; }
`;
const FileBox = styled.label`
  position: relative; display: flex; align-items: center; gap: 8px; box-sizing: border-box;
  min-block-size: 44px; padding-inline: 12px; cursor: pointer;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} dashed ${theme.color.controlBorder}`};
  color: ${({ theme }) => theme.color.link};
  font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.bold};
  ${iconSize}
  input { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; opacity: 0; cursor: pointer; }
  &:has(input:focus-visible) { ${focusRing} }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; } }
`;
const Preview = styled.img`max-inline-size: 100%; max-block-size: 12rem; object-fit: contain; align-self: flex-start;`;
const Assent = styled.label`
  display: flex; align-items: center; gap: 12px; min-block-size: 44px;
  font-size: 13px; line-height: 18px;
  input { inline-size: 20px; block-size: 20px; min-block-size: 20px; margin: 0; flex-shrink: 0; accent-color: ${({ theme }) => theme.color.brand}; }
  ${media.desktop} { min-block-size: 48px; font-size: 14px; line-height: 20px; }
`;
const Submit = styled(Button)`
  inline-size: 100%; font-size: 1rem;
  ${media.desktop} { font-size: 1rem; }
`;
const Safety = styled.details`
  > summary {
    display: flex; align-items: center; gap: 8px; min-block-size: 44px; padding-inline: 12px;
    font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > span { flex: 1; }
    &:focus-visible { ${focusRing}; outline-offset: -3px; }
  }
  ${iconSize}
  > summary > svg:first-child { color: ${({ theme }) => theme.color.brand}; }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  ul { margin: 0; padding: 0 12px 12px 32px; font-size: 13px; line-height: 20px; }
  ${media.desktop} {
    > summary { min-block-size: 56px; padding-inline: 16px; }
    ul { padding: 0 16px 16px 36px; font-size: 14px; }
  }
`;
const HelpTitle = styled.h2`
  flex: 1; white-space: nowrap; font-size: 14px; line-height: 20px; font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const HelpActions = styled.div`
  display: flex; gap: 8px; padding-block: 6px;
`;

/** Fills a message's {placeholders} with emphasized values, keeping the translated word order. */
function emphasize(template: string, values: Readonly<Record<string, string>>): ReactNode[] {
  return template.split(/(\{\w+\})/u).map((part, index) => {
    const name = /^\{(\w+)\}$/u.exec(part)?.[1];
    return name && values[name] !== undefined ? <strong key={index}>{values[name]}</strong> : part;
  });
}

export function SubscribeIntro({ locale }: { locale: string }) {
  const m = createMessages(locale);
  return <Intro><PageHeading>{m.text("subscribe.title")}</PageHeading><Lead>{m.text("subscribe.lead")}</Lead></Intro>;
}
type HelpSettings = Pick<SubscriptionSettings, "contactPhone" | "whatsappPhone">;
function PaymentHelp({ settings, text, locale }: { settings: HelpSettings; text?: string | undefined; locale: string }) {
  const m = createMessages(locale);
  if (!settings.contactPhone && !settings.whatsappPhone) return null;
  return <Row><HelpTitle>{m.text("subscribe.help")}</HelpTitle><HelpActions>
    {settings.contactPhone && <ActionLink href={telHref(settings.contactPhone)} variant="secondary" data-analytics-ignore><PhoneIcon />{m.text("subscribe.call")}</ActionLink>}
    {settings.whatsappPhone && <ActionLink href={waHref(settings.whatsappPhone, text)} variant="secondary" data-analytics-ignore><ChatIcon />{m.text("subscribe.whatsapp")}</ActionLink>}
  </HelpActions></Row>;
}
function SubscribeSignIn({ locale, returnTo }: { locale: string; returnTo: string | null }) {
  const router = useRouter(), m = createMessages(locale), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/sign-in", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)) });
      const result = await response.json() as { message?: string };
      if (!response.ok) setError(result.message ?? m.text("account.unavailable"));
      else router.refresh();
    } catch { setError(m.text("account.unavailable")); } finally { setBusy(false); }
  }
  return <Panel>
    <SignInForm action="/api/account/sign-in" method="post" onSubmit={submit} data-analytics-ignore>
      <FieldWithAction>
        <PhoneInput name="phone" label={m.text("account.phone")} required hint={m.text("account.phoneHint")} />
        <Button type="submit" disabled={busy}>{m.text(busy ? "account.working" : "account.continue")}</Button>
      </FieldWithAction>
      <Note>{m.text("subscribe.numberPrivacy")} <Link href="/en/privacy">{m.text("navigation.privacy")}</Link>.</Note>
      <input type="hidden" name="destination" value="subscribe" />{returnTo && <input type="hidden" name="return" value={returnTo} />}
      {error && <p role="alert">{error}</p>}
    </SignInForm>
    <RowLink href={memberNextPath("account", returnTo)} prefetch={false}><KeyIcon /><span>{m.text("subscribe.haveCodeLead")} <strong>{m.text("subscribe.haveCodeAction")}</strong></span><ChevronRightIcon /></RowLink>
  </Panel>;
}
/** The account page shows a plain button; the Get access page shows a row inside its account panel. */
export function TrialRequest({ locale, phone, days, appearance = "button" }: { locale: string; phone: string; days: number; appearance?: "button" | "row" }) {
  const router = useRouter(), m = createMessages(locale), [state, setState] = useState(""), [busy, setBusy] = useState(false);
  async function request() {
    setBusy(true);
    try { const response = await fetch("/api/account/trial", { method: "POST", credentials: "same-origin" }); setState(response.ok ? "saved" : "error"); if (response.ok) { trackEvent("trial_requested"); router.refresh(); } }
    catch { setState("error"); } finally { setBusy(false); }
  }
  const status = state && <p role="status">{m.text(state === "saved" ? "subscribe.trialRequested" : "account.unavailable", { phone: formatPhone(phone) })}</p>;
  if (appearance === "row") return state === "saved" ? <RowNote role="status">{m.text("subscribe.trialRequested", { phone: formatPhone(phone) })}</RowNote> : <>
    <RowButton type="button" disabled={busy} onClick={request}><GiftIcon /><span>{m.text("subscribe.trialLead")} <strong>{m.text("subscribe.trialAction", { days: String(days) })}</strong></span><ChevronRightIcon /></RowButton>
    {state === "error" && <RowNote role="status">{m.text("account.unavailable")}</RowNote>}
  </>;
  return <div><Button size="large" variant="secondary" disabled={busy || state === "saved"} onClick={request}>{m.text("subscribe.trial", { days: String(days) })}</Button>{status}</div>;
}
export function PaymentStatusPanel({ locale, status, phone, unlocked }: { locale: string; status: PaymentView["status"]; phone: string; unlocked: boolean }) {
  const m = createMessages(locale);
  if (!status) return null;
  return <div role="status"><p>{status.reference}</p>
    {status.status === "approved" ? <><p>{status.endsAt && m.text("account.accessUntil", { end: formatPeriodEnd(new Date(status.endsAt)) })}</p>
      {!unlocked && <p>{m.text("subscribe.codeSent", { phone: formatPhone(phone) })}</p>}</>
      : status.status === "rejected" || status.status === "reversed" ? <p>{m.text("subscribe.rejected", { reason: status.rejectText ?? status.status })}</p>
        : <p>{m.text("subscribe.checking", { phone: formatPhone(phone) })}</p>}</div>;
}

export function SubscribeFlow({ locale, settings, plans, account, view, returnTo, userAgent, activeUntil }: {
  locale: string; settings: SubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string; unlocked: boolean } | null; view: PaymentView | null; returnTo: string | null; userAgent: string; activeUntil: string | null;
}) {
  const m = createMessages(locale), router = useRouter(), ids = useId();
  const networks = useMemo(() => (["mtn", "airtel"] as const).filter((key) => !!settings[key === "mtn" ? "mtnNumber" : "airtelNumber"]), [settings]);
  const initial = useMemo<PaymentDraft>(() => ({ planId: plans[0]?.id ?? "", payerPhone: account?.phone ?? "256",
    network: networks.length === 1 ? networks[0]! : networkForPrefix(account?.phone ?? "") ?? "", transactionId: "", amount: String(plans[0]?.priceUgx ?? ""), amountEdited: false, payCard: "", accepted: false }), [account, networks, plans]);
  const restored = useSyncExternalStore(subscribeNothing, clientReady, serverReady);
  const persisted = useSyncExternalStore(subscribeNothing, () => account ? paymentDraftSnapshot(account.id) : null, () => null);
  const recovered = useMemo(() => account ? readPaymentDraft(account.id, persisted) : null, [account, persisted]);
  const [edited, setEdited] = useState<PaymentDraft | null>(null);
  const draft = useMemo(() => {
    const base = edited ?? (recovered && plans.some((item) => item.id === recovered.planId) ? { ...recovered,
      network: networks.includes(recovered.network as MobileNetwork) ? recovered.network : initial.network } : initial);
    const selected = plans.find((item) => item.id === base.planId);
    return base.amountEdited || !selected ? base : { ...base, amount: String(selected.priceUgx) };
  }, [edited, recovered, plans, networks, initial]);
  const setDraft = (change: (old: PaymentDraft) => PaymentDraft) => setEdited((old) => change(old ?? draft));
  const [change, setChange] = useState(false), [sms, setSms] = useState("");
  const [foreign, setForeign] = useState(""), [smsRecipientNetwork, setSmsRecipientNetwork] = useState<MobileNetwork | null>(null), smsInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<Blob | null>(null), [preview, setPreview] = useState(""), [busy, setBusy] = useState(false), [percentage, setPercentage] = useState<number | null>(null);
  const [error, setError] = useState(""), [copied, setCopied] = useState<MobileNetwork | "">(""), [sent, setSent] = useState<string | null>(null);
  useEffect(() => { if (restored && account && (!sent || view?.status && ["rejected", "reversed"].includes(view.status.status))) savePaymentDraft(account.id, draft); }, [account, draft, restored, sent, view]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const clipboard = restored && typeof navigator.clipboard?.readText === "function";
  const plan = plans.find((candidate) => candidate.id === draft.planId) ?? plans[0];
  const update = (values: Partial<PaymentDraft>) => setDraft((old) => ({ ...old, ...values }));
  const money = (value: number) => m.number(value, { style: "currency", currency: "UGX", maximumFractionDigits: 0 });
  const status = view?.status;
  const checking = sent && !status || status && ["pending", "superseded", "approved"].includes(status.status);
  useEffect(() => {
    if (!status || !["pending", "superseded"].includes(status.status)) return;
    const timer = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(timer);
  }, [router, status]);
  const helpText = account && status ? m.text("subscribe.helpPaid", { price: String(status.priceUgx), plan: status.planName, phone: formatPhone(account.phone), reference: status.reference }) : undefined;
  function parseSms(text: string) {
    setSms(text);
    const parsed = parsePaymentSms(text, { mtn: settings.mtnNumber, airtel: settings.airtelNumber });
    const matchedNetwork = networks.find((network) => settings[network === "mtn" ? "mtnNumber" : "airtelNumber"] === parsed.counterparty) ?? null;
    setSmsRecipientNetwork(matchedNetwork);
    update({ ...(parsed.amount === undefined ? {} : { amount: String(parsed.amount), amountEdited: true }),
      ...(parsed.transactionId ? { transactionId: parsed.transactionId } : {}), ...(matchedNetwork ? { network: matchedNetwork } : {}) });
    setForeign(parsed.foreignRecipient ? m.text("subscribe.foreign", { phone: formatPhone(parsed.foreignRecipient) }) : "");
  }
  function selectPayCard(network: MobileNetwork) { update({ payCard: network, network: smsRecipientNetwork ?? network }); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!image || !plan || !account) { setError(m.text("subscribe.chooseImage")); return; }
    setBusy(true); setPercentage(0);
    const body = new FormData();
    for (const [key, value] of Object.entries({ planId: plan.id, payerPhone: draft.payerPhone, network: draft.network,
      transactionId: draft.transactionId, amount: draft.amount, accepted: String(draft.accepted) })) body.append(key, value);
    body.append("image", image, "payment.jpg");
    try { const result = await uploadPayment(body, setPercentage); clearPaymentDraft(account.id); trackEvent("payment_submitted"); setSent(result.reference); setImage(null); setPreview(""); setSms(""); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); } finally { setBusy(false); }
  }
  const help = <Panel>
    <PaymentHelp settings={settings} locale={locale} text={helpText} />
    <Safety><summary><ShieldIcon /><span>{m.text("subscribe.safety")}</span><ChevronDownIcon /></summary><ul>
      <li>{m.text("subscribe.payOnly")}{[settings.mtnName, settings.airtelName].filter(Boolean).join(" · ")}</li>
      {settings.whatsappPhone && <li>{m.text("subscribe.codesWhatsapp", { phone: formatPhone(settings.whatsappPhone) })}</li>}
      {settings.contactPhone && <li>{m.text("subscribe.codesSms", { phone: formatPhone(settings.contactPhone) })}</li>}
      <li>{m.text("subscribe.noPin")}</li>{settings.reviewTime && <li>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</li>}<li>{m.text("subscribe.estimates")}</li>
    </ul></Safety>
  </Panel>;
  const accountPanel = account ? <Panel>
    <Row><Identity>{m.text("subscribe.signedIn")} <strong>{formatPhone(account.phone)}</strong></Identity>
      <MemberSignOut variant="quiet"><SignOutIcon />{m.text("account.signOut")}</MemberSignOut></Row>
    {view?.trialEligible ? <TrialRequest locale={locale} phone={account.phone} days={settings.trialDays} appearance="row" />
      : view?.trialRequested && <RowNote>{m.text("subscribe.trialRequested", { phone: formatPhone(account.phone) })}</RowNote>}
  </Panel> : <SubscribeSignIn locale={locale} returnTo={returnTo} />;
  if (!plan) return <>{accountPanel}<p>{m.text("subscribe.noPlans")}</p>{help}</>;
  const menu = canOpenMoneyMenu(userAgent);
  return <>
    {accountPanel}
    <Sheet>
      <Step id="plans" aria-labelledby={`${ids}-plan`}>
        <StepNumber aria-hidden="true">1</StepNumber>
        <StepBody>
          <StepHeading><StepTitle id={`${ids}-plan`}>{m.text("subscribe.pickPlan")}</StepTitle><Note>{m.text("subscribe.allAccess")}</Note></StepHeading>
          <Plans aria-labelledby={`${ids}-plan`} $columns={Math.min(plans.length, 3)}>{plans.map((item) => <Plan key={item.id}>
            <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} onChange={() => update({ planId: item.id, ...(!draft.amountEdited ? { amount: String(item.priceUgx) } : {}) })} />
            <PlanName>{item.name}</PlanName><PlanPrice>{money(item.priceUgx)}</PlanPrice><PlanDays>{m.plural("paywall.days", item.durationDays)}</PlanDays>
          </Plan>)}</Plans>
          {activeUntil && <Note>{m.text("subscribe.renewal", { end: formatPeriodEnd(new Date(activeUntil)), days: String(plan.durationDays) })}</Note>}
        </StepBody>
      </Step>
      <Step aria-labelledby={`${ids}-pay`}>
        <StepNumber aria-hidden="true">2</StepNumber>
        <StepBody>
          <StepTitle id={`${ids}-pay`}>{m.text("subscribe.sendExactlyLead")} <Amount>{money(plan.priceUgx)}</Amount>{" "}
            <AmountTail>{m.text(networks.length === 1 ? "subscribe.toNumber" : "subscribe.toNumbers")}</AmountTail></StepTitle>
          <Wallets>{networks.map((network) => {
            const number = settings[network === "mtn" ? "mtnNumber" : "airtelNumber"]!, name = settings[network === "mtn" ? "mtnName" : "airtelName"];
            const shortcut = settings[network === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(plan.priceUgx)), wallet = wallets[network];
            return <Wallet key={network} data-menu={shortcut && menu ? "" : undefined}>
              <Chip $network={network} aria-hidden="true">{wallet.chip}</Chip>
              <WalletNumber><VisuallyHidden>{wallet.name} </VisuallyHidden>{formatPhone(number)}</WalletNumber>
              <WalletMeta>{[name, shortcut && <span key="dial">{m.text("subscribe.dial")} <strong>{shortcut}</strong></span>].filter(Boolean).flatMap((part, index) => index ? [" · ", part] : [part])}</WalletMeta>
              <CopyButton variant="secondary" data-analytics-ignore onClick={async () => { selectPayCard(network); try { await navigator.clipboard.writeText(settings.copyFormat === "local" ? localUgandaPhone(number) : number); setCopied(network); } catch { setError(m.text("account.copyFailed")); } }}>
                {copied === network ? <CheckIcon /> : <CopyIcon />}<span data-label aria-hidden="true">{m.text(copied === network ? "account.copied" : "subscribe.copy")}</span>
                <VisuallyHidden>{copied === network ? m.text("account.copied") : m.text("subscribe.copyNetwork", { network: wallet.short })}</VisuallyHidden>
              </CopyButton>
              {shortcut && menu && <MenuLink variant="quiet" data-analytics-ignore href={`tel:${shortcut.replaceAll("#", "%23")}`} onClick={() => selectPayCard(network)}><DialpadIcon />{m.text(wallet.menu)}</MenuLink>}
            </Wallet>;
          })}</Wallets>
          {settings.paymentNote && <Note>{settings.paymentNote}</Note>}
        </StepBody>
      </Step>
      <Step aria-labelledby={`${ids}-report`}>
        <StepNumber aria-hidden="true" $muted={!account}>3</StepNumber>
        <StepBody>
          <StepTitle id={`${ids}-report`}>{m.text(checking ? "subscribe.yourCode" : "subscribe.report")}</StepTitle>
          {!account ? <Locked><LockIcon /><span>{m.text("subscribe.signInFirst")}</span></Locked> : <>
            {status && <StatusBox><PaymentStatusPanel locale={locale} status={status} phone={account.phone} unlocked={account.unlocked} /></StatusBox>}
            {checking ? <><p>{m.text("subscribe.gotCode")}</p><AccountCodeForm locale={locale} signedIn inApp={/FBAN|FBAV|Instagram/iu.test(userAgent)} returnTo={returnTo} /></> : <ReportForm onSubmit={submit} data-analytics-ignore>
              <FieldWithAction data-analytics-ignore>
                <TextInput ref={smsInput} label={<>{m.text("subscribe.sms")} <Optional>{m.text("subscribe.optional")}</Optional></>} placeholder={m.text("subscribe.smsPlaceholder")}
                  value={sms} maxLength={12_000} onChange={(event) => parseSms(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} data-analytics-ignore />
                {clipboard && <Action variant="secondary" data-analytics-ignore onClick={async () => { try { const text = await navigator.clipboard.readText(); parseSms(text); } catch { smsInput.current?.focus(); } }}><ClipboardIcon />{m.text("subscribe.paste")}</Action>}
              </FieldWithAction>
              {foreign && <p role="alert" data-wide>{foreign}</p>}
              <Summary><p>{emphasize(m.text("subscribe.summary"), { amount: money(Number(draft.amount) || 0), network: draft.network.toUpperCase() || "—", phone: formatPhone(normalizePhone(draft.payerPhone) ?? draft.payerPhone) })}</p>
                <Button variant="quiet" onClick={() => setChange(!change)} aria-expanded={change || !draft.network}>{m.text("subscribe.change")}</Button></Summary>
              {(change || !draft.network) && <ChangeFields data-wide>
                <PhoneInput label={m.text("subscribe.payer")} value={draft.payerPhone} required onValueChange={(value) => update({ payerPhone: value, ...(!smsRecipientNetwork && !draft.payCard && !draft.network && networkForPrefix(normalizePhone(value) ?? "") ? { network: networkForPrefix(normalizePhone(value) ?? "")! } : {}) })} />
                {networks.length > 1 && <SegmentedChoice label={m.text("subscribe.network")} name="network" value={draft.network} options={networks.map((value) => ({ value, label: value.toUpperCase() }))} onValueChange={(value) => { setChange(true); update({ network: value as MobileNetwork }); }} />}
                <TextInput label={m.text("subscribe.amount")} type="number" inputMode="numeric" min={100} max={10_000_000} step={1} value={draft.amount} required onChange={(event) => update({ amount: event.currentTarget.value, amountEdited: true })} />
              </ChangeFields>}
              <TextInput label={m.text("subscribe.transactionId")} value={draft.transactionId} required minLength={4} maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(event) => update({ transactionId: normalizeTransactionId(event.currentTarget.value) })} />
              <FileField>
                <FileLabel id={`${ids}-shot`}>{m.text("subscribe.screenshot")}</FileLabel>
                <FileBox><ImageIcon /><span>{image ? m.text("subscribe.imageSize", { size: String(Math.ceil(image.size / 1000)) }) : m.text("subscribe.chooseScreenshot")}</span>
                  <input type="file" accept="image/*" required={!image} aria-labelledby={`${ids}-shot`} aria-describedby={`${ids}-shot-hint`} onChange={async (event) => {
                    const file = event.currentTarget.files?.[0]; if (!file) return;
                    setBusy(true); setError(""); try { const prepared = await preparePaymentImage(file); setImage(prepared); setPreview(URL.createObjectURL(prepared)); } catch (failure) { setImage(null); setError(failure instanceof Error ? failure.message : m.text("subscribe.chooseImage")); } finally { setBusy(false); }
                  }} /></FileBox>
                <Note id={`${ids}-shot-hint`}>{m.text("subscribe.imageHint")}</Note>
                {image && <Preview src={preview} alt={m.text("subscribe.preview")} />}
              </FileField>
              {view?.acceptedTerms ? <Note>{m.text("subscribe.currentTerms")} <Link href="/en/terms">{m.text("account.terms")}</Link>.</Note>
                : <Assent><input type="checkbox" required checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
              <Submit size="large" type="submit" disabled={busy || !restored || !draft.network}>{m.text(busy ? "subscribe.sending" : "subscribe.send")}</Submit>
              {percentage !== null && <div role="status" data-wide><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
              <Note data-wide>{m.text("subscribe.privacy")} <Link href="/en/privacy">{m.text("navigation.privacy")}</Link>.</Note>
            </ReportForm>}
            <noscript><p>{m.text("subscribe.noJavaScript")}</p></noscript>
          </>}
          {error && <p role="alert">{error}</p>}
        </StepBody>
      </Step>
    </Sheet>
    {help}
  </>;
}
