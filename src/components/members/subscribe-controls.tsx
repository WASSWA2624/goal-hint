"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics/tracker";
import { useRouter } from "next/navigation";
import { Button, PhoneInput, TextInput } from "@/components/ui/controls";
import { ChatIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ClipboardIcon, CopyIcon, DialpadIcon, GiftIcon, HelpIcon, ImageIcon, KeyIcon, LockIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { memberNextPath } from "@/domain/member-navigation";
import { formatPhone, localUgandaPhone, networkForPrefix, telHref, waHref, type MobileNetwork } from "@/domain/phone";
import { canOpenMoneyMenu, normalizeTransactionId, type PaymentView } from "@/domain/payment";
import { parsePaymentSms } from "@/domain/payment-sms";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { AccountCodeForm } from "./account-code-form";
import { PasswordInput } from "./account-security";
import { refreshMemberSession } from "./member-session";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";

import {
  AccountRow, Action, ActionLink, Assent, CopyButton, Disclosure, FieldWithAction, FileBox, FileField,
  HelpActions, HelpTitle, Identity, Intro, Lead, Locked, MenuLink, Note, Optional, PageFooter, Panel, PaymentFields, PaymentTransfer,
  Plan, PlanDays, PlanName, PlanPrice, Plans, Preview, ReportForm, Row, RowButton, RowLink, RowNote, Sheet, SignInForm, StatusBox,
  Step, StepHeading, StepNumber, StepTitle, Submit, Unit, Wallet, WalletChoice, WalletChoices,
  WalletMeta, WalletNumber,
} from "./subscribe-styles";

export { SubscribeLayout } from "./subscribe-styles";

const subscribeNothing = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const wallets = {
  mtn: { name: "MTN MoMo", short: "MTN", menu: "subscribe.openMtn" },
  airtel: { name: "Airtel Money", short: "Airtel", menu: "subscribe.openAirtel" },
} as const;

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
function SubscribeSignIn({ locale, returnTo, showCode = true }: { locale: string; returnTo: string | null; showCode?: boolean }) {
  const router = useRouter(), m = createMessages(locale), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/login", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)) });
      const result = await response.json() as { message?: string };
      if (!response.ok) setError(result.message ?? m.text("account.unavailable"));
      else { await refreshMemberSession(); router.refresh(); }
    } catch { setError(m.text("account.unavailable")); } finally { setBusy(false); }
  }
  return <Panel>
    <SignInForm action="/api/account/login" method="post" onSubmit={submit} data-analytics-ignore>
        <PhoneInput name="phone" label={m.text("account.phone")} required hint={m.text("account.phoneHint")} />
        <PasswordInput label={m.text("account.password")} value={password} onChange={setPassword} current />
        <Button type="submit" disabled={busy}>{m.text(busy ? "account.working" : "account.login")}</Button>
        <RowLink variant="quiet" href={`${memberNextPath("account", returnTo)}${returnTo ? "&" : "?"}view=register`} prefetch={false}>{m.text("account.register")}</RowLink>
      <Note>{m.text("subscribe.numberPrivacy")} <Link href="/en/privacy">{m.text("navigation.privacy")}</Link>.</Note>
      <input type="hidden" name="destination" value="subscribe" />{returnTo && <input type="hidden" name="return" value={returnTo} />}
      {error && <p role="alert">{error}</p>}
    </SignInForm>
    {showCode && <RowLink variant="quiet" href={memberNextPath("account", returnTo)} prefetch={false}><KeyIcon />{m.text("subscribe.haveCodeLead")}</RowLink>}
  </Panel>;
}
/** Reuse the trial action in the account page and the compact subscription footer. */
export function TrialRequest({ locale, phone, days, appearance = "button" }: { locale: string; phone: string; days: number; appearance?: "button" | "row" }) {
  const router = useRouter(), m = createMessages(locale), [state, setState] = useState(""), [busy, setBusy] = useState(false);
  async function request() {
    setBusy(true);
    try { const response = await fetch("/api/account/trial", { method: "POST", credentials: "same-origin" }); setState(response.ok ? "saved" : "error"); if (response.ok) { trackEvent("trial_requested"); router.refresh(); } }
    catch { setState("error"); } finally { setBusy(false); }
  }
  const status = state && <p role="status">{m.text(state === "saved" ? "subscribe.trialRequested" : "account.unavailable", { phone: formatPhone(phone) })}</p>;
  if (appearance === "row") return state === "saved" ? <RowNote role="status">{m.text("subscribe.trialRequested", { phone: formatPhone(phone) })}</RowNote> : <>
    <RowButton type="button" variant="quiet" disabled={busy} onClick={request}><GiftIcon />{m.text("subscribe.trialRequest", { days: String(days) })}</RowButton>
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
    network: networks.find((network) => network === networkForPrefix(account?.phone ?? "")) ?? networks[0] ?? "", transactionId: "", amount: String(plans[0]?.priceUgx ?? ""), amountEdited: false, payCard: "", accepted: false }), [account, networks, plans]);
  const restored = useSyncExternalStore(subscribeNothing, clientReady, serverReady);
  const persisted = useSyncExternalStore(subscribeNothing, () => account ? paymentDraftSnapshot(account.id) : null, () => null);
  const recovered = useMemo(() => account ? readPaymentDraft(account.id, persisted) : null, [account, persisted]);
  const [edited, setEdited] = useState<PaymentDraft | null>(null);
  const draft = useMemo(() => {
    const base = edited ?? (recovered && plans.some((item) => item.id === recovered.planId) ? { ...recovered,
      network: networks.includes(recovered.network as MobileNetwork) ? recovered.network : initial.network } : initial);
    const selected = plans.find((item) => item.id === base.planId);
    return selected ? { ...base, amount: String(selected.priceUgx), amountEdited: false } : base;
  }, [edited, recovered, plans, networks, initial]);
  const setDraft = (change: (old: PaymentDraft) => PaymentDraft) => setEdited((old) => change(old ?? draft));
  const [sms, setSms] = useState("");
  const [changingAccount, setChangingAccount] = useState(false);
  const [foreign, setForeign] = useState(""), smsInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<Blob | null>(null), [preview, setPreview] = useState(""), [busy, setBusy] = useState(false), [percentage, setPercentage] = useState<number | null>(null);
  const [error, setError] = useState(""), [copied, setCopied] = useState<MobileNetwork | "">(""), [sent, setSent] = useState<string | null>(null);
  useEffect(() => { if (restored && account && (!sent || view?.status && ["rejected", "reversed"].includes(view.status.status))) savePaymentDraft(account.id, draft); }, [account, draft, restored, sent, view]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const clipboard = restored && typeof navigator.clipboard?.readText === "function";
  const plan = plans.find((candidate) => candidate.id === draft.planId) ?? plans[0];
  const update = (values: Partial<PaymentDraft>) => setDraft((old) => ({ ...old, ...values }));
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
    update({ ...(parsed.transactionId ? { transactionId: parsed.transactionId } : {}), ...(matchedNetwork ? { network: matchedNetwork, payCard: matchedNetwork } : {}) });
    setForeign(parsed.foreignRecipient ? m.text("subscribe.foreign", { phone: formatPhone(parsed.foreignRecipient) }) : "");
  }
  function selectPayCard(network: MobileNetwork) { update({ payCard: network, network }); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!image || !plan || !account) { setError(m.text("subscribe.chooseImage")); return; }
    setBusy(true); setPercentage(0);
    const body = new FormData();
    for (const [key, value] of Object.entries({ planId: plan.id, payerPhone: draft.payerPhone, network: draft.network,
      transactionId: draft.transactionId, amount: String(plan.priceUgx), accepted: String(draft.accepted) })) body.append(key, value);
    body.append("image", image, "payment.jpg");
    try { const result = await uploadPayment(body, setPercentage); clearPaymentDraft(account.id); trackEvent("payment_submitted"); setSent(result.reference); setImage(null); setPreview(""); setSms(""); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); } finally { setBusy(false); }
  }
  const help = <Disclosure>
    <summary><HelpIcon /><span>{m.text("navigation.help")}</span><ChevronDownIcon /></summary>
    <div>
      <PaymentHelp settings={settings} locale={locale} text={helpText} />
      <Disclosure><summary><ShieldIcon /><span>{m.text("subscribe.safety")}</span><ChevronDownIcon /></summary><ul>
        <li>{m.text("subscribe.payOnly")}{[settings.mtnName, settings.airtelName].filter(Boolean).join(" · ")}</li>
        {settings.whatsappPhone && <li>{m.text("subscribe.codesWhatsapp", { phone: formatPhone(settings.whatsappPhone) })}</li>}
        {settings.contactPhone && <li>{m.text("subscribe.codesSms", { phone: formatPhone(settings.contactPhone) })}</li>}
        <li>{m.text("subscribe.noPin")}</li>{settings.reviewTime && <li>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</li>}<li>{m.text("subscribe.estimates")}</li>
      </ul></Disclosure>
    </div>
  </Disclosure>;
  const accountPanel = account ? <>
    <AccountRow><Identity><VisuallyHidden>{m.text("account.title")} </VisuallyHidden><strong>{formatPhone(account.phone)}</strong></Identity>
      <Button variant="quiet" onClick={() => setChangingAccount(!changingAccount)} aria-expanded={changingAccount} aria-controls={`${ids}-account`}>{m.text("subscribe.change")}</Button>
      <RowLink variant="quiet" href={memberNextPath("account", returnTo)} prefetch={false}>{m.text("subscribe.haveCodeLead")}</RowLink>
    </AccountRow>
    {changingAccount && <div id={`${ids}-account`}><SubscribeSignIn locale={locale} returnTo={returnTo} showCode={false} /></div>}
  </> : <SubscribeSignIn locale={locale} returnTo={returnTo} />;
  const footer = <PageFooter>
    {account && view?.trialEligible && <TrialRequest locale={locale} phone={account.phone} days={settings.trialDays} appearance="row" />}
    {help}
    {account && view?.trialRequested && <RowNote role="status">{m.text("subscribe.trialRequested", { phone: formatPhone(account.phone) })}</RowNote>}
  </PageFooter>;
  if (!plan || !networks.length) return <>{accountPanel}<p>{m.text(plan ? "account.unavailable" : "subscribe.noPlans")}</p>{footer}</>;
  const menu = canOpenMoneyMenu(userAgent);
  const payNetwork = networks.find((network) => network === draft.network) ?? networks[0]!;
  const wallet = wallets[payNetwork], number = settings[payNetwork === "mtn" ? "mtnNumber" : "airtelNumber"]!;
  const name = settings[payNetwork === "mtn" ? "mtnName" : "airtelName"];
  const shortcut = settings[payNetwork === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(plan.priceUgx));
  return <>
    {accountPanel}
    <Sheet data-subscribe-layout="compact-stacked">
      <Step id="plans" aria-labelledby={`${ids}-plan`}>
        <StepHeading><StepNumber aria-hidden="true">1</StepNumber><StepTitle id={`${ids}-plan`}>{m.text("subscribe.pickPlan")}</StepTitle><Unit>UGX</Unit></StepHeading>
        <Plans aria-labelledby={`${ids}-plan`} $columns={Math.min(plans.length, 3)}>{plans.map((item) => <Plan key={item.id}>
          <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} onChange={() => update({ planId: item.id })} />
          <PlanName>{item.name}</PlanName><PlanPrice>{m.number(item.priceUgx)}</PlanPrice><PlanDays>{m.plural("paywall.days", item.durationDays)}</PlanDays>
        </Plan>)}</Plans>
        {activeUntil && <Note>{m.text("subscribe.renewal", { end: formatPeriodEnd(new Date(activeUntil)), days: String(plan.durationDays) })}</Note>}
      </Step>
      <Step aria-labelledby={`${ids}-pay`}>
        <StepHeading><StepNumber aria-hidden="true">2</StepNumber><StepTitle id={`${ids}-pay`}>{m.text("subscribe.sendPayment")}</StepTitle></StepHeading>
        <PaymentTransfer>
          {networks.length > 1 ? <WalletChoices><VisuallyHidden as="legend">{m.text("subscribe.network")}</VisuallyHidden>{networks.map((network) => <WalletChoice key={network}>
            <input type="radio" name={`${ids}-wallet`} value={network} checked={payNetwork === network} onChange={() => { selectPayCard(network); setCopied(""); }} />
            <span><MobileMoneyLogo network={network} /><span>{wallets[network].name}</span><CheckIcon /></span>
          </WalletChoice>)}</WalletChoices> : <Note>{wallet.name}</Note>}
          <Wallet>
            <WalletNumber><VisuallyHidden>{wallet.name} </VisuallyHidden><WalletMeta>{m.text("subscribe.payTo")}</WalletMeta> <span>{localUgandaPhone(number)}</span></WalletNumber>
            <WalletMeta>{m.text("subscribe.payeeNames")} {name}</WalletMeta>
            <CopyButton variant="secondary" data-analytics-ignore onClick={async () => {
              selectPayCard(payNetwork);
              try { await navigator.clipboard.writeText(localUgandaPhone(number)); setCopied(payNetwork); }
              catch { setError(m.text("account.copyFailed")); }
            }}>
              {copied === payNetwork ? <CheckIcon /> : <CopyIcon />}<span aria-hidden="true">{m.text(copied === payNetwork ? "account.copied" : "subscribe.copy")}</span>
              <VisuallyHidden>{copied === payNetwork ? m.text("account.copied") : m.text("subscribe.copyNetwork", { network: wallet.short })}</VisuallyHidden>
            </CopyButton>
          </Wallet>
        </PaymentTransfer>
        <Note>{m.text("subscribe.transferHint")}</Note>
        {shortcut && (menu ? <MenuLink variant="quiet" data-analytics-ignore href={`tel:${shortcut.replaceAll("#", "%23")}`} onClick={() => selectPayCard(payNetwork)}><DialpadIcon />{m.text(wallet.menu)}</MenuLink>
          : <Note>{m.text("subscribe.dial")} <strong>{shortcut}</strong></Note>)}
        <noscript>{networks.filter((network) => network !== payNetwork).map((network) => <p key={network}>{wallets[network].name}: {localUgandaPhone(settings[network === "mtn" ? "mtnNumber" : "airtelNumber"]!)} · {settings[network === "mtn" ? "mtnName" : "airtelName"]}</p>)}</noscript>
        {settings.paymentNote && <Note>{settings.paymentNote}</Note>}
      </Step>
      <Step aria-labelledby={`${ids}-report`}>
        <StepHeading><StepNumber aria-hidden="true" $muted={!account}>3</StepNumber><StepTitle id={`${ids}-report`}>{m.text(checking ? "subscribe.yourCode" : "subscribe.report")}</StepTitle></StepHeading>
        {!account ? <Locked><LockIcon /><span>{m.text("subscribe.signInFirst")}</span></Locked> : <>
          {status ? <StatusBox><PaymentStatusPanel locale={locale} status={status} phone={account.phone} unlocked={account.unlocked} /></StatusBox>
            : sent && <StatusBox role="status"><p>{sent}</p><p>{m.text("subscribe.checking", { phone: formatPhone(account.phone) })}</p></StatusBox>}
          {checking ? <AccountCodeForm locale={locale} signedIn inApp={/FBAN|FBAV|Instagram/iu.test(userAgent)} returnTo={returnTo} /> : <ReportForm onSubmit={submit} data-analytics-ignore>
            <PaymentFields>
              <PhoneInput label={m.text("subscribe.payer")} value={draft.payerPhone} hint={false} required onValueChange={(value) => update({ payerPhone: value })} />
              <TextInput label={m.text("subscribe.transactionId")} placeholder={m.text("subscribe.transactionHint")} value={draft.transactionId} required minLength={4} maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(event) => update({ transactionId: normalizeTransactionId(event.currentTarget.value) })} />
            </PaymentFields>
            <FileField>
              <FileBox><ImageIcon /><span id={`${ids}-shot`}>{image ? m.text("subscribe.imageSize", { size: String(Math.ceil(image.size / 1000)) }) : m.text("subscribe.chooseScreenshot")}</span>
                <input type="file" accept="image/*" required={!image} aria-labelledby={`${ids}-shot`} aria-describedby={`${ids}-shot-hint`} onChange={async (event) => {
                  const file = event.currentTarget.files?.[0]; if (!file) return;
                  setBusy(true); setError(""); try { const prepared = await preparePaymentImage(file); setImage(prepared); setPreview(URL.createObjectURL(prepared)); }
                  catch (failure) { setImage(null); setError(failure instanceof Error ? failure.message : m.text("subscribe.chooseImage")); } finally { setBusy(false); }
                }} /></FileBox>
              <VisuallyHidden id={`${ids}-shot-hint`}>{m.text("subscribe.imageHint")}</VisuallyHidden>
            </FileField>
            {image && <Preview src={preview} alt={m.text("subscribe.preview")} />}
            {foreign && <p role="alert">{foreign}</p>}
            <Disclosure>
              <summary><ClipboardIcon /><span>{m.text("subscribe.sms")} <Optional>{m.text("subscribe.optional")}</Optional></span><ChevronDownIcon /></summary>
              <div><FieldWithAction data-analytics-ignore>
                <TextInput ref={smsInput} label={<VisuallyHidden>{m.text("subscribe.sms")}</VisuallyHidden>} placeholder={m.text("subscribe.smsPlaceholder")}
                  value={sms} maxLength={12_000} onChange={(event) => parseSms(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} data-analytics-ignore />
                {clipboard && <Action variant="secondary" data-analytics-ignore onClick={async () => { try { parseSms(await navigator.clipboard.readText()); } catch { smsInput.current?.focus(); } }}><ClipboardIcon />{m.text("subscribe.paste")}</Action>}
              </FieldWithAction><Note>{m.text("subscribe.smsPrivacy")}</Note></div>
            </Disclosure>
            {view?.acceptedTerms ? <Note>{m.text("subscribe.currentTerms")} <Link href="/en/terms">{m.text("account.terms")}</Link>.</Note>
              : <Assent><input type="checkbox" required checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
            <Submit type="submit" disabled={busy || !restored || !draft.network}>{m.text(busy ? "subscribe.sending" : "subscribe.send")}<ChevronRightIcon /></Submit>
            {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
            <Note>{m.text("subscribe.delivery")}</Note>
          </ReportForm>}
          <noscript><p>{m.text("subscribe.noJavaScript")}</p></noscript>
        </>}
        {error && <p role="alert">{error}</p>}
      </Step>
    </Sheet>
    {footer}
  </>;
}
