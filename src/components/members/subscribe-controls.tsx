"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics/tracker";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button, ButtonLink, FileInput, PhoneInput, SegmentedChoice, TextInput } from "@/components/ui/controls";
import { Disclosure } from "@/components/ui/disclosure";
import { Inline, Stack } from "@/components/ui/layout";
import { memberNextPath } from "@/domain/member-navigation";
import { formatPhone, localUgandaPhone, networkForPrefix, normalizePhone, telHref, waHref, type MobileNetwork } from "@/domain/phone";
import { canOpenMoneyMenu, normalizeTransactionId, type PaymentView } from "@/domain/payment";
import { parsePaymentSms } from "@/domain/payment-sms";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { AccountCodeForm } from "./account-code-form";
import { MemberForm, MemberPanel, MemberSignOut } from "./member-controls";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";

const subscribeNothing = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

const Step = styled(MemberPanel).attrs({ as: "section" })`
  input:not([type="checkbox"]):not([type="radio"]), select, button, a { min-block-size: 48px; }
  label { overflow-wrap: anywhere; }
`;
const Assent = styled.label`
  display: flex; align-items: center; gap: 8px; min-block-size: 48px;
  input { inline-size: 20px; block-size: 20px; min-block-size: 20px; flex-shrink: 0; }
`;
const PlanChoices = styled.fieldset`
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  legend { padding: 0; margin-block-end: 8px; color: ${({ theme }) => theme.color.mutedText}; }
`;
const PlanCard = styled.label`
  display: flex; align-items: center; gap: 12px; min-block-size: 48px; padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; cursor: pointer;
  &:has(input:checked) { border-color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.surfaceMuted}; }
  input { min-block-size: 20px; inline-size: 20px; flex-shrink: 0; }
`;
const Preview = styled.img`max-inline-size: 100%; max-block-size: 16rem; object-fit: contain;`;
const Safety = styled(Disclosure)`
  max-inline-size: 36rem;
  > summary { min-block-size: 48px; }
`;
const ReceivingWallet = styled.div`
  display: flex; flex-direction: column; gap: 8px; min-inline-size: 0;
  padding-block: 12px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  > [data-payment-logo] { align-self: flex-end; }
  p { overflow-wrap: anywhere; }
`;
export function SubscribeStep({ number, title, children, id }: { number: number; title: string; children: ReactNode; id?: string }) {
  return <Step id={id}><Stack $gap="md"><h2>{number}. {title}</h2>{children}</Stack></Step>;
}
type HelpSettings = Pick<SubscriptionSettings, "contactPhone" | "whatsappPhone">;
export function PaymentHelp({ settings, text, locale = "en" }: { settings: HelpSettings; text?: string | undefined; locale?: string }) {
  const m = createMessages(locale);
  return <div><p>{m.text("subscribe.help")}</p><Inline>
    {settings.contactPhone && <ButtonLink href={telHref(settings.contactPhone)} size="large" variant="secondary" data-analytics-ignore>{m.text("subscribe.call")}</ButtonLink>}
    {settings.whatsappPhone && <ButtonLink href={waHref(settings.whatsappPhone, text)} size="large" variant="secondary" data-analytics-ignore>{m.text("subscribe.whatsapp")}</ButtonLink>}
  </Inline></div>;
}
export function SubscribeSignIn({ locale, returnTo }: { locale: string; returnTo: string | null }) {
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
  return <><MemberForm action="/api/account/sign-in" method="post" onSubmit={submit} data-analytics-ignore>
    <PhoneInput name="phone" label={m.text("account.phone")} required hint={m.text("account.phoneHint")} />
    <p>{m.text("account.phonePrivacy")} <Link href="/en/privacy">{m.text("navigation.privacy")}</Link>.</p>
    <input type="hidden" name="destination" value="subscribe" />{returnTo && <input type="hidden" name="return" value={returnTo} />}
    {error && <p role="alert">{error}</p>}<Button size="large" type="submit" disabled={busy}>{m.text(busy ? "account.working" : "account.continue")}</Button>
  </MemberForm><Link href={memberNextPath("account", returnTo)} prefetch={false}>{m.text("subscribe.haveCode")}</Link></>;
}
export function TrialRequest({ locale, phone, days }: { locale: string; phone: string; days: number }) {
  const router = useRouter(), m = createMessages(locale), [state, setState] = useState(""), [busy, setBusy] = useState(false);
  return <div><Button size="large" variant="secondary" disabled={busy || state === "saved"} onClick={async () => {
    setBusy(true);
    try { const response = await fetch("/api/account/trial", { method: "POST", credentials: "same-origin" }); setState(response.ok ? "saved" : "error"); if (response.ok) { trackEvent("trial_requested"); router.refresh(); } }
    catch { setState("error"); } finally { setBusy(false); }
  }}>{m.text("subscribe.trial", { days: String(days) })}</Button>
    {state && <p role="status">{m.text(state === "saved" ? "subscribe.trialRequested" : "account.unavailable", { phone: formatPhone(phone) })}</p>}</div>;
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

export function SubscribePayment({ locale, settings, plans, account, view, returnTo, userAgent, activeUntil }: {
  locale: string; settings: SubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string; unlocked: boolean } | null; view: PaymentView | null; returnTo: string | null; userAgent: string; activeUntil: string | null;
}) {
  const m = createMessages(locale), router = useRouter();
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
  if (!plan) return <p>{m.text("subscribe.noPlans")}</p>;
  return <>
    <SubscribeStep number={2} title={m.text("subscribe.choosePlan")} id="plans">
      {account && view?.trialEligible && <TrialRequest locale={locale} phone={account.phone} days={settings.trialDays} />}
      {account && view?.trialRequested && <p>{m.text("subscribe.trialRequested", { phone: formatPhone(account.phone) })}</p>}
      <PlanChoices><legend>{m.text("subscribe.allAccess")}</legend><Stack $gap="sm">{plans.map((item) => <PlanCard key={item.id}>
        <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} onChange={() => update({ planId: item.id, ...(!draft.amountEdited ? { amount: String(item.priceUgx) } : {}) })} />
        <span>{item.name} · {m.plural("paywall.days", item.durationDays)} · {money(item.priceUgx)}</span></PlanCard>)}</Stack></PlanChoices>
      {activeUntil && <p>{m.text("subscribe.renewal", { end: formatPeriodEnd(new Date(activeUntil)), days: String(plan.durationDays) })}</p>}
    </SubscribeStep>
    <SubscribeStep number={3} title={m.text("subscribe.pay")}>
      {networks.map((network) => { const number = settings[network === "mtn" ? "mtnNumber" : "airtelNumber"]!, name = settings[network === "mtn" ? "mtnName" : "airtelName"], shortcut = settings[network === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(plan.priceUgx));
        return <ReceivingWallet key={network}>
          <header><strong>{network === "mtn" ? "MTN MoMo" : "Airtel Money"}</strong>{network === "airtel" && <MobileMoneyLogo network={network} />}</header>
          <p>{formatPhone(number)}{name ? ` · ${name}` : ""}</p>
          <Button size="large" variant="secondary" data-analytics-ignore onClick={async () => { selectPayCard(network); try { await navigator.clipboard.writeText(settings.copyFormat === "local" ? localUgandaPhone(number) : number); setCopied(network); } catch { setError(m.text("account.copyFailed")); } }}>{m.text(copied === network ? "account.copied" : "subscribe.copyNumber")}</Button>
          {shortcut && <><p>{shortcut}</p>{canOpenMoneyMenu(userAgent) && <ButtonLink size="large" variant="secondary" data-analytics-ignore href={`tel:${shortcut.replaceAll("#", "%23")}`} onClick={() => selectPayCard(network)}>{m.text(network === "mtn" ? "subscribe.openMtn" : "subscribe.openAirtel")}</ButtonLink>}</>}
          {network === "mtn" && <MobileMoneyLogo network={network} />}
        </ReceivingWallet>; })}
      <p>{m.text("subscribe.sendExactly", { amount: money(plan.priceUgx) })}</p>
      {settings.paymentNote && <p>{settings.paymentNote}</p>}<PaymentHelp settings={settings} locale={locale} text={helpText} />
    </SubscribeStep>
    <SubscribeStep number={4} title={m.text("subscribe.tellUs")}>
      {!account ? <p>{m.text("subscribe.signInFirst")}</p> : <>
        <PaymentStatusPanel locale={locale} status={status ?? null} phone={account.phone} unlocked={account.unlocked} />
        {checking ? <><p>{m.text("subscribe.gotCode")}</p><AccountCodeForm locale={locale} signedIn inApp={/FBAN|FBAV|Instagram/iu.test(userAgent)} returnTo={returnTo} /></> : <>
          <div data-analytics-ignore><TextInput ref={smsInput} label={m.text("subscribe.sms")} value={sms} maxLength={12_000} onChange={(event) => parseSms(event.currentTarget.value)} data-analytics-ignore />
            {clipboard && <Button size="large" variant="secondary" data-analytics-ignore onClick={async () => { try { const text = await navigator.clipboard.readText(); parseSms(text); } catch { smsInput.current?.focus(); } }}>{m.text("subscribe.paste")}</Button>}</div>
          {foreign && <p role="alert">{foreign}</p>}
          <MemberForm onSubmit={submit} data-analytics-ignore>
            <p>{m.text("subscribe.summary", { amount: money(Number(draft.amount) || 0), network: draft.network.toUpperCase() || "—", phone: formatPhone(normalizePhone(draft.payerPhone) ?? draft.payerPhone) })} <Button size="large" variant="quiet" onClick={() => setChange(!change)} aria-expanded={change || !draft.network}>{m.text("subscribe.change")}</Button></p>
            {(change || !draft.network) && <>
              <PhoneInput label={m.text("subscribe.payer")} value={draft.payerPhone} required onValueChange={(value) => update({ payerPhone: value, ...(!smsRecipientNetwork && !draft.payCard && !draft.network && networkForPrefix(normalizePhone(value) ?? "") ? { network: networkForPrefix(normalizePhone(value) ?? "")! } : {}) })} />
              {networks.length > 1 && <SegmentedChoice label={m.text("subscribe.network")} name="network" value={draft.network} options={networks.map((value) => ({ value, label: value.toUpperCase() }))} onValueChange={(value) => { setChange(true); update({ network: value as MobileNetwork }); }} />}
              <TextInput label={m.text("subscribe.amount")} type="number" inputMode="numeric" min={100} max={10_000_000} step={1} value={draft.amount} required onChange={(event) => update({ amount: event.currentTarget.value, amountEdited: true })} />
            </>}
            <TextInput label={m.text("subscribe.transactionId")} value={draft.transactionId} required minLength={4} maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(event) => update({ transactionId: normalizeTransactionId(event.currentTarget.value) })} />
            <FileInput label={m.text("subscribe.screenshot")} accept="image/*" required={!image} hint={m.text("subscribe.imageHint")} onChange={async (event) => {
              const file = event.currentTarget.files?.[0]; if (!file) return;
              setBusy(true); setError(""); try { const prepared = await preparePaymentImage(file); setImage(prepared); setPreview(URL.createObjectURL(prepared)); } catch (failure) { setImage(null); setError(failure instanceof Error ? failure.message : m.text("subscribe.chooseImage")); } finally { setBusy(false); }
            }} />
            {image && <><Preview src={preview} alt={m.text("subscribe.preview")} /><p>{m.text("subscribe.imageSize", { size: String(Math.ceil(image.size / 1000)) })}</p></>}
            {view?.acceptedTerms ? <p>{m.text("subscribe.currentTerms")} <Link href="/en/terms">{m.text("account.terms")}</Link>.</p>
              : <Assent><input type="checkbox" required checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
            <p>{m.text("subscribe.privacy")} <Link href="/en/privacy">{m.text("navigation.privacy")}</Link>.</p>
            {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
            <Button size="large" type="submit" disabled={busy || !restored || !draft.network}>{m.text(busy ? "subscribe.sending" : "subscribe.send")}</Button>
          </MemberForm>
        </>}
        <noscript><p>{m.text("subscribe.noJavaScript")}</p><PaymentHelp settings={settings} locale={locale} /></noscript>
      </>}
      {error && <><p role="alert">{error}</p><PaymentHelp settings={settings} locale={locale} text={helpText} /></>}
    </SubscribeStep>
    <Safety><summary>{m.text("subscribe.safety")}</summary><Stack $gap="sm">
      <p>{m.text("subscribe.payOnly")}{[settings.mtnName, settings.airtelName].filter(Boolean).join(" · ")}</p>
      {settings.whatsappPhone && <p>{m.text("subscribe.codesWhatsapp", { phone: formatPhone(settings.whatsappPhone) })}</p>}
      {settings.contactPhone && <p>{m.text("subscribe.codesSms", { phone: formatPhone(settings.contactPhone) })}</p>}
      <p>{m.text("subscribe.noPin")}</p>{settings.reviewTime && <p>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</p>}<p>{m.text("subscribe.estimates")}</p>
    </Stack></Safety>
  </>;
}
export function SubscribeIdentity({ locale, phone }: { locale: string; phone: string }) {
  const m = createMessages(locale);
  return <><p>{m.text("account.signedInAs", { phone: formatPhone(phone) })}</p><MemberSignOut size="large">{m.text("account.signOut")}</MemberSignOut></>;
}
