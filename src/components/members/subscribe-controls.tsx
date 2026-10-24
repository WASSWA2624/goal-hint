"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics/tracker";
import { useRouter } from "next/navigation";
import { Button, PhoneInput, TextInput } from "@/components/ui/controls";
import { ChatIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, DialpadIcon, GiftIcon, HelpIcon, ImageIcon, LockIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { formatPhone, localUgandaPhone, networkForPrefix, normalizePhone, telHref, waHref, type MobileNetwork } from "@/domain/phone";
import { canOpenMoneyMenu, normalizeTransactionId, parseTransactionId, type PaymentStatus, type PaymentView } from "@/domain/payment";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { AccountAuthForm } from "./account-auth-form";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";
import { PaymentStatusCard, TrialStatusCard, useApprovalRefresh } from "./payment-status";

import {
  AccountRow, ActionLink, Assent, CopyButton, Disclosure, FileBox, FileField,
  HelpActions, HelpTitle, Identity, Intro, Locked, MenuLink, Note, PageFooter, PaymentTransfer,
  Plan, PlanDays, PlanName, PlanPrice, Plans, Preview, ReportForm, Row, RowButton, RowNote, Sheet,
  Step, StepHeading, StepTitle, Submit, Unit, Wallet, WalletChoice, WalletChoices,
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
const waitingStatuses: readonly string[] = ["pending", "superseded"];
/** Open optional details before the browser focuses an invalid payer number. */
const revealInvalid = (event: FormEvent<HTMLFormElement>) => {
  const details = event.target instanceof Element ? event.target.closest("details") : null;
  if (details && !details.open) details.open = true;
};

export function SubscribeIntro({ locale }: { locale: string }) {
  const m = createMessages(locale);
  return <Intro><PageHeading>{m.text("subscribe.title")}</PageHeading></Intro>;
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
function SubscribeSignIn({ locale, returnTo, settings }: { locale: string; returnTo: string | null; settings: HelpSettings }) {
  return <AccountAuthForm locale={locale} view="login" returnTo={returnTo} contact={settings} />;
}
/** Reuse the trial action in the account page and the compact subscription footer. */
export function TrialRequest({ locale, days, appearance = "button" }: { locale: string; days: number; appearance?: "button" | "row" }) {
  const router = useRouter(), m = createMessages(locale), [state, setState] = useState(""), [busy, setBusy] = useState(false);
  async function request() {
    setBusy(true);
    try { const response = await fetch("/api/account/trial", { method: "POST", credentials: "same-origin" }); setState(response.ok ? "saved" : "error"); if (response.ok) { trackEvent("trial_requested"); router.refresh(); } }
    catch { setState("error"); } finally { setBusy(false); }
  }
  const status = state && <p role="status">{m.text(state === "saved" ? "subscribe.trialRequested" : "account.unavailable")}</p>;
  if (appearance === "row") return state === "saved" ? <RowNote role="status">{m.text("subscribe.trialRequested")}</RowNote> : <>
    <RowButton type="button" variant="quiet" disabled={busy} onClick={request}><GiftIcon />{m.text("subscribe.trialRequest", { days: String(days) })}</RowButton>
    {state === "error" && <RowNote role="status">{m.text("account.unavailable")}</RowNote>}
  </>;
  return <div><Button size="large" variant="secondary" disabled={busy || state === "saved"} onClick={request}>{m.text("subscribe.trial", { days: String(days) })}</Button>{status}</div>;
}

export function SubscribeFlow({ locale, settings, plans, account, view, returnTo, userAgent, activeUntil, trialPending }: {
  locale: string; settings: SubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string } | null; view: PaymentView | null; returnTo: string | null; userAgent: string;
  /** The end of the account's latest live period, or null. */
  activeUntil: string | null; trialPending: boolean;
}) {
  const m = createMessages(locale), router = useRouter(), ids = useId();
  const networks = useMemo(() => (["mtn", "airtel"] as const).filter((key) => !!settings[key === "mtn" ? "mtnNumber" : "airtelNumber"]), [settings]);
  const initial = useMemo<PaymentDraft>(() => ({ planId: plans[0]?.id ?? "", payerPhone: account?.phone ?? "256",
    network: networks.find((network) => network === networkForPrefix(account?.phone ?? "")) ?? networks[0] ?? "", transactionId: "", accepted: false }), [account, networks, plans]);
  const restored = useSyncExternalStore(subscribeNothing, clientReady, serverReady);
  const persisted = useSyncExternalStore(subscribeNothing, () => account ? paymentDraftSnapshot(account.id) : null, () => null);
  const recovered = useMemo(() => account ? readPaymentDraft(account.id, persisted) : null, [account, persisted]);
  const [edited, setEdited] = useState<PaymentDraft | null>(null);
  const draft = useMemo(() => edited ?? (recovered && plans.some((item) => item.id === recovered.planId) ? { ...recovered,
    network: networks.includes(recovered.network as MobileNetwork) ? recovered.network : initial.network } : initial), [edited, recovered, plans, networks, initial]);
  const setDraft = (change: (old: PaymentDraft) => PaymentDraft) => setEdited((old) => change(old ?? draft));
  const [changingAccount, setChangingAccount] = useState(false), [replacing, setReplacing] = useState(false);
  const [image, setImage] = useState<Blob | null>(null), [preview, setPreview] = useState(""), [busy, setBusy] = useState(false), [percentage, setPercentage] = useState<number | null>(null);
  const [error, setError] = useState(""), [copied, setCopied] = useState<MobileNetwork | "">("");
  // Until the refresh after an upload lands, the new report stands in for the server's previous latest report.
  const [sent, setSent] = useState<{ status: PaymentStatus; before: string | null } | null>(null);
  const status = sent && (view?.status?.reference ?? null) === sent.before ? sent.status : view?.status ?? null;
  const waiting = !!status && waitingStatuses.includes(status.status);
  useApprovalRefresh(!!account && (waiting || trialPending));
  useEffect(() => { if (restored && account && (!waiting || replacing)) savePaymentDraft(account.id, draft); }, [account, draft, restored, replacing, waiting]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const plan = plans.find((candidate) => candidate.id === draft.planId) ?? plans[0];
  const menu = canOpenMoneyMenu(userAgent);
  const payNetwork = networks.find((network) => network === draft.network) ?? networks[0];
  const shortcut = payNetwork && plan ? settings[payNetwork === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(plan.priceUgx)) : undefined;
  const update = (values: Partial<PaymentDraft>) => setDraft((old) => ({ ...old, ...values }));
  const helpText = account && status ? m.text("subscribe.helpPaid", { price: String(status.priceUgx), plan: status.planName, phone: formatPhone(account.phone), reference: status.reference }) : undefined;
  async function chooseImage(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const prepared = await preparePaymentImage(file);
      setImage(prepared); setPreview(URL.createObjectURL(prepared));
    } catch (failure) {
      setImage(null); setPreview("");
      setError(failure instanceof Error ? failure.message : m.text("subscribe.chooseImage"));
    } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (busy) return;
    if (!plan || !account) { setError(m.text("account.unavailable")); return; }
    const body = new FormData(), payer = normalizePhone(draft.payerPhone), transactionId = parseTransactionId(draft.transactionId);
    if (!transactionId) { setError(m.text("subscribe.transactionRequired")); return; }
    setBusy(true); setPercentage(image ? 0 : null);
    // No amount: the server records the plan's price. A missing payer is the account number.
    for (const [key, value] of Object.entries({ planId: plan.id, network: draft.network, ...(payer ? { payerPhone: payer } : {}),
      transactionId, accepted: String(draft.accepted) })) body.append(key, value);
    if (image) body.append("image", image, "payment.jpg");
    try {
      const result = await uploadPayment(body, image ? setPercentage : () => {}); clearPaymentDraft(account.id); trackEvent("payment_submitted");
      setSent({ before: view?.status?.reference ?? null, status: { reference: result.reference, status: "pending", rejectText: null, rejectReason: null,
        planName: plan.name, priceUgx: plan.priceUgx, submittedAt: new Date().toISOString(), endsAt: null } });
      setEdited(null); setReplacing(false); setImage(null); setPreview(""); setPercentage(null); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); } finally { setBusy(false); }
  }
  const help = <Disclosure>
    <summary><HelpIcon /><span>{m.text("navigation.help")}</span><ChevronDownIcon /></summary>
    <div>
      <PaymentHelp settings={settings} locale={locale} text={helpText} />
      {shortcut && !menu && <Note>{m.text("subscribe.dial")} <strong>{shortcut}</strong></Note>}
      <Disclosure><summary><ShieldIcon /><span>{m.text("subscribe.safety")}</span><ChevronDownIcon /></summary><ul>
        <li>{m.text("subscribe.payOnly")}{[settings.mtnName, settings.airtelName].filter(Boolean).join(" · ")}</li>
        <li>{m.text("subscribe.selfUnlock")}</li>
        <li>{m.text("subscribe.noPin")}</li>{settings.reviewTime && <li>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</li>}<li>{m.text("subscribe.estimates")}</li>
      </ul></Disclosure>
    </div>
  </Disclosure>;
  const accountPanel = account ? <>
    <AccountRow><Identity><VisuallyHidden>{m.text("account.title")} </VisuallyHidden><strong>{formatPhone(account.phone)}</strong></Identity>
      <Button variant="quiet" onClick={() => setChangingAccount(!changingAccount)} aria-expanded={changingAccount} aria-controls={`${ids}-account`}>{m.text("subscribe.change")}</Button>
    </AccountRow>
    {changingAccount && <div id={`${ids}-account`}><SubscribeSignIn locale={locale} returnTo={returnTo} settings={settings} /></div>}
    {trialPending && <TrialStatusCard locale={locale} settings={settings} phone={account.phone} heading="h2" />}
  </> : <SubscribeSignIn locale={locale} returnTo={returnTo} settings={settings} />;
  const footer = <PageFooter>
    {account && view?.trialEligible && <TrialRequest locale={locale} days={settings.trialDays} appearance="row" />}
    {help}
  </PageFooter>;
  if (!plan || !payNetwork) return <>{accountPanel}<p>{m.text(plan ? "account.unavailable" : "subscribe.noPlans")}</p>{footer}</>;
  const wallet = wallets[payNetwork], number = settings[payNetwork === "mtn" ? "mtnNumber" : "airtelNumber"]!;
  const name = settings[payNetwork === "mtn" ? "mtnName" : "airtelName"];
  return <>
    {accountPanel}
    <Sheet data-subscribe-layout="compact-stacked">
      {(!waiting || replacing) && <>
      <Step id="plans" aria-labelledby={`${ids}-plan`}>
        <StepHeading><StepTitle id={`${ids}-plan`}>{m.text("subscribe.pickPlan")}</StepTitle><Unit>UGX</Unit></StepHeading>
        <Plans aria-labelledby={`${ids}-plan`} $columns={Math.min(plans.length, 3)}>{plans.map((item) => <Plan key={item.id}>
          <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} onChange={() => update({ planId: item.id })} />
          <PlanName>{item.name}</PlanName><PlanPrice>{m.number(item.priceUgx)}</PlanPrice><PlanDays>{m.plural("paywall.days", item.durationDays)}</PlanDays>
        </Plan>)}</Plans>
        {activeUntil && <Note>{m.text("subscribe.renewal", { end: formatPeriodEnd(new Date(activeUntil)), days: String(plan.durationDays) })}</Note>}
      </Step>
      <Step aria-labelledby={`${ids}-pay`}>
        <StepTitle id={`${ids}-pay`}>{m.text("subscribe.payAmount", { amount: m.number(plan.priceUgx) })}</StepTitle>
        <PaymentTransfer>
          {networks.length > 1 ? <WalletChoices><VisuallyHidden as="legend">{m.text("subscribe.network")}</VisuallyHidden>{networks.map((network) => <WalletChoice key={network}>
            <input type="radio" name={`${ids}-wallet`} value={network} checked={payNetwork === network} onChange={() => { update({ network }); setCopied(""); }} />
            <span><MobileMoneyLogo network={network} /><span>{wallets[network].name}</span><CheckIcon /></span>
          </WalletChoice>)}</WalletChoices> : <Note>{wallet.name}</Note>}
          <Wallet>
            <WalletNumber><VisuallyHidden>{wallet.name} </VisuallyHidden><WalletMeta>{m.text("subscribe.payTo")}</WalletMeta> <span>{localUgandaPhone(number)}</span></WalletNumber>
            <WalletMeta>{m.text("subscribe.payeeNames")} {name}</WalletMeta>
            <CopyButton variant="secondary" data-analytics-ignore onClick={async () => {
              update({ network: payNetwork });
              try { await navigator.clipboard.writeText(localUgandaPhone(number)); setCopied(payNetwork); }
              catch { setError(m.text("account.copyFailed")); }
            }}>
              {copied === payNetwork ? <CheckIcon /> : <CopyIcon />}<span aria-hidden="true">{m.text(copied === payNetwork ? "account.copied" : "subscribe.copy")}</span>
              <VisuallyHidden>{copied === payNetwork ? m.text("account.copied") : m.text("subscribe.copyNetwork", { network: wallet.short })}</VisuallyHidden>
            </CopyButton>
          </Wallet>
        </PaymentTransfer>
        {shortcut && menu && <MenuLink variant="quiet" data-analytics-ignore href={`tel:${shortcut.replaceAll("#", "%23")}`} onClick={() => update({ network: payNetwork })}><DialpadIcon />{m.text(wallet.menu)}</MenuLink>}
        <noscript>{networks.filter((network) => network !== payNetwork).map((network) => <p key={network}>{wallets[network].name}: {localUgandaPhone(settings[network === "mtn" ? "mtnNumber" : "airtelNumber"]!)} · {settings[network === "mtn" ? "mtnName" : "airtelName"]}</p>)}</noscript>
        {settings.paymentNote && <Note>{settings.paymentNote}</Note>}
      </Step>
      </>}
      <Step id="report" aria-label={m.text("subscribe.confirmPayment")}>
        {!account ? <Locked><LockIcon /><span>{m.text("subscribe.signInFirst")}</span></Locked> : <>
          <PaymentStatusCard locale={locale} status={status} settings={settings} phone={account.phone} activeUntil={activeUntil} returnTo={returnTo}
            replace={waiting ? { open: replacing, controls: `${ids}-form`, toggle: () => setReplacing(!replacing) } : undefined} />
          {(!waiting || replacing) && <ReportForm id={`${ids}-form`} onSubmit={submit} onInvalidCapture={revealInvalid} data-analytics-ignore>
            {waiting && status && <Note>{m.text("subscribe.replaces", { reference: status.reference })}</Note>}
            <TextInput label={m.text("subscribe.transactionId")} placeholder={m.text("subscribe.transactionHint")} value={draft.transactionId} required disabled={busy}
              minLength={4} maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              onChange={(event) => update({ transactionId: normalizeTransactionId(event.currentTarget.value) })} />
            <Disclosure>
              <summary>{m.text("subscribe.moreDetails")}<ChevronDownIcon /></summary>
              <div>
                <FileField>
                  <FileBox><ImageIcon /><span id={`${ids}-shot`}>{m.text(image ? "subscribe.changeScreenshot" : "subscribe.chooseScreenshot")}</span>
                    <input type="file" accept="image/*" disabled={busy} aria-labelledby={`${ids}-shot`} aria-describedby={`${ids}-shot-hint`}
                      onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox>
                  <FileBox><ImageIcon /><span id={`${ids}-camera`}>{m.text("subscribe.takePhoto")}</span>
                    <input type="file" accept="image/*" capture="environment" disabled={busy} aria-labelledby={`${ids}-camera`} aria-describedby={`${ids}-shot-hint`}
                      onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox>
                  <VisuallyHidden id={`${ids}-shot-hint`}>{m.text("subscribe.imageHint")}</VisuallyHidden>
                </FileField>
                {image && <><Preview src={preview} alt={m.text("subscribe.preview")} />
                  <RowButton type="button" variant="quiet" disabled={busy} onClick={() => { setImage(null); setPreview(""); setPercentage(null); }}>{m.text("subscribe.removeScreenshot")}</RowButton></>}
                <PhoneInput label={m.text("subscribe.payer")} value={draft.payerPhone} hint={false} disabled={busy} onValueChange={(value) => update({ payerPhone: value })} />
                <Note>{m.text("subscribe.moreDetailsHint")}</Note>
              </div>
            </Disclosure>
            {!view?.acceptedTerms && <Assent><input type="checkbox" required disabled={busy} checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
            <Submit type="submit" disabled={busy || !restored || !draft.network}>{m.text(busy ? "subscribe.sending" : "subscribe.report")}<ChevronRightIcon /></Submit>
            {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
            <Note>{m.text("subscribe.afterApproval")}</Note>
          </ReportForm>}
          <noscript><p>{m.text("subscribe.noJavaScript")}</p></noscript>
        </>}
        {error && <p role="alert">{error}</p>}
      </Step>
    </Sheet>
    {footer}
  </>;
}
