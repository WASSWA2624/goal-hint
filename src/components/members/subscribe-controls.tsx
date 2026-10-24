"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics/tracker";
import { useRouter } from "next/navigation";
import { Button, PhoneInput, TextInput } from "@/components/ui/controls";
import { ChatIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardIcon, CopyIcon, DialpadIcon, GiftIcon, HelpIcon, ImageIcon, LockIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { formatPhone, localUgandaPhone, networkForPrefix, telHref, validMobilePhone, waHref, type MobileNetwork } from "@/domain/phone";
import { canOpenMoneyMenu, normalizeTransactionId, parseTransactionId, type PaymentStatus, type PaymentView } from "@/domain/payment";
import { transactionIdFromText } from "@/domain/payment-sms";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { AccountAuthForm } from "./account-auth-form";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";
import { PaymentStatusCard, TrialStatusCard, useApprovalRefresh } from "./payment-status";

import {
  ActionLink, Assent, CopyButton, Disclosure, FileBox, FileChoices, FileField,
  HelpActions, HelpTitle, Locked, MenuLink, Note, PageFooter, PasteButton, PaymentTransfer,
  Plan, PlanName, PlanPrice, Plans, Preview, ReportForm, Row, RowButton, RowNote, Sheet,
  Step, StepHeading, StepTitle, Submit, Wallet, WalletChoice, WalletChoices,
  WalletMeta, WalletNumber,
} from "./subscribe-styles";

export { SubscribeLayout } from "./subscribe-styles";

const subscribeNothing = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const clipboardReadable = () => typeof navigator.clipboard?.readText === "function";
const wallets = {
  mtn: { name: "MTN MoMo", short: "MTN", menu: "subscribe.openMtn" },
  airtel: { name: "Airtel Money", short: "Airtel", menu: "subscribe.openAirtel" },
} as const;
const waitingStatuses: readonly string[] = ["pending", "superseded"];
export function SubscribeIntro({ locale }: { locale: string }) {
  const m = createMessages(locale);
  return <VisuallyHidden as="h1">{m.text("subscribe.title")}</VisuallyHidden>;
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

export function SubscribeFlow({ locale, settings, plans, account, view, returnTo, userAgent, trialPending }: {
  locale: string; settings: SubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string } | null; view: PaymentView | null; returnTo: string | null; userAgent: string; trialPending: boolean;
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
    accepted: false, network: networks.includes(recovered.network as MobileNetwork) ? recovered.network : initial.network } : initial), [edited, recovered, plans, networks, initial]);
  const setDraft = (change: (old: PaymentDraft) => PaymentDraft) => setEdited((old) => change(old ?? draft));
  const [image, setImage] = useState<Blob | null>(null), [preview, setPreview] = useState(""), [busy, setBusy] = useState(false), [percentage, setPercentage] = useState<number | null>(null);
  const [error, setError] = useState(""), [copied, setCopied] = useState<MobileNetwork | "">(""), [pasteNote, setPasteNote] = useState("");
  const canPaste = useSyncExternalStore(subscribeNothing, clipboardReadable, serverReady);
  // Until the refresh after an upload lands, the new report stands in for the server's previous latest report.
  const [sent, setSent] = useState<{ status: PaymentStatus; before: string | null } | null>(null);
  const status = sent && (view?.status?.reference ?? null) === sent.before ? sent.status : view?.status ?? null;
  const waiting = !!status && waitingStatuses.includes(status.status);
  const reportKey = `${account?.id ?? ""}:${status?.reference ?? ""}:${status?.status ?? ""}`;
  const [reportForm, setReportForm] = useState({ reportKey, open: false });
  // Only an explicit choice for this report opens a new form; a different decision resets it.
  if (reportForm.reportKey !== reportKey) setReportForm({ reportKey, open: false });
  const reversed = status?.status === "reversed", rejected = status?.status === "rejected";
  const statusOnly = waiting || rejected || reversed;
  const showForm = !statusOnly || reportForm.reportKey === reportKey && reportForm.open;
  const focusTarget = useRef<string | null>(null);
  useApprovalRefresh(!!account && (waiting || trialPending));
  useEffect(() => { if (restored && account && showForm) savePaymentDraft(account.id, draft); }, [account, draft, restored, showForm]);
  useEffect(() => {
    if (!focusTarget.current) return;
    const target = document.getElementById(focusTarget.current);
    focusTarget.current = null;
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center" });
  }, [showForm]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const plan = plans.find((candidate) => candidate.id === draft.planId) ?? plans[0];
  const menu = canOpenMoneyMenu(userAgent);
  const payNetwork = networks.find((network) => network === draft.network) ?? networks[0];
  const shortcut = payNetwork && plan ? settings[payNetwork === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(plan.priceUgx)) : undefined;
  const update = (values: Partial<PaymentDraft>) => setDraft((old) => ({ ...old, ...values }));
  function toggleReportForm(focus = `${ids}-transaction`) {
    if (busy) return;
    setError(""); focusTarget.current = showForm ? `${ids}-form-toggle` : focus;
    setReportForm({ reportKey, open: !showForm });
  }
  const helpText = account && status ? m.text("subscribe.helpPaid", { price: String(status.priceUgx), plan: status.planName, phone: formatPhone(account.phone), reference: status.reference }) : undefined;
  // A pasted payment SMS keeps only its transaction ID; text without one leaves the field as it was.
  function pasteTransaction(text: string) {
    const id = transactionIdFromText(text);
    if (id) update({ transactionId: id });
    setPasteNote(id ? "" : m.text("subscribe.pasteNoId"));
  }
  async function readClipboard() {
    if (busy) return;
    try { pasteTransaction(await navigator.clipboard.readText()); }
    catch { setPasteNote(m.text("subscribe.pasteBlocked")); }
  }
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
    const body = new FormData(), payer = validMobilePhone(draft.payerPhone), transactionId = parseTransactionId(draft.transactionId);
    if (!transactionId) { setError(m.text("subscribe.transactionRequired")); return; }
    if (!payer) { setError(m.text("phone.invalid")); return; }
    setBusy(true); setPercentage(image ? 0 : null);
    // No amount: the server records the plan's price.
    for (const [key, value] of Object.entries({ planId: plan.id, network: draft.network, payerPhone: payer,
      transactionId, accepted: String(draft.accepted) })) body.append(key, value);
    if (image) body.append("image", image, "payment.jpg");
    try {
      const result = await uploadPayment(body, image ? setPercentage : () => {}); clearPaymentDraft(account.id); trackEvent("payment_submitted");
      setSent({ before: view?.status?.reference ?? null, status: { reference: result.reference, status: "pending", rejectText: null, rejectReason: null,
        planName: plan.name, priceUgx: plan.priceUgx, submittedAt: new Date().toISOString(), endsAt: null } });
      setEdited(null); setReportForm({ reportKey, open: false }); setImage(null); setPreview(""); setPercentage(null); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); } finally { setBusy(false); }
  }
  const help = <Disclosure>
    <summary><HelpIcon /><span>{m.text("navigation.help")}</span><ChevronDownIcon /></summary>
    <div>
      <PaymentHelp settings={settings} locale={locale} text={helpText} />
      {showForm && shortcut && !menu && <Note>{m.text("subscribe.dial")} <strong>{shortcut}</strong></Note>}
      <Disclosure><summary><ShieldIcon /><span>{m.text("subscribe.safety")}</span><ChevronDownIcon /></summary><ul>
        <li>{m.text("subscribe.payOnly")}{[settings.mtnName, settings.airtelName].filter(Boolean).join(" · ")}</li>
        <li>{m.text("subscribe.selfUnlock")}</li>
        <li>{m.text("subscribe.noPin")}</li>{settings.reviewTime && <li>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</li>}<li>{m.text("subscribe.estimates")}</li>
      </ul></Disclosure>
    </div>
  </Disclosure>;
  const accountPanel = account
    ? trialPending && <TrialStatusCard locale={locale} settings={settings} phone={account.phone} heading="h2" />
    : <SubscribeSignIn locale={locale} returnTo={returnTo} settings={settings} />;
  const footer = <PageFooter>
    {account && view?.trialEligible && <TrialRequest locale={locale} days={settings.trialDays} appearance="row" />}
    {help}
  </PageFooter>;
  const paymentStatus = account && <PaymentStatusCard locale={locale} status={status} settings={settings} phone={account.phone} heading={statusOnly && !showForm ? "h2" : "h3"}
    replace={(waiting || rejected) && plan && payNetwork ? { open: showForm, controls: `${ids}-form`, disabled: busy, toggle: () => toggleReportForm() } : undefined}
    newPayment={reversed && !showForm && plan && payNetwork ? { controls: `${ids}-form`, start: () => toggleReportForm(`${ids}-plan`) } : undefined} />;
  if (statusOnly && !showForm) return <>{accountPanel}<Step id="report">{paymentStatus}</Step></>;
  if (!plan || !payNetwork) return <>{accountPanel}{paymentStatus}<p>{m.text(plan ? "account.unavailable" : "subscribe.noPlans")}</p>{footer}</>;
  const wallet = wallets[payNetwork], number = settings[payNetwork === "mtn" ? "mtnNumber" : "airtelNumber"]!;
  const name = settings[payNetwork === "mtn" ? "mtnName" : "airtelName"];
  return <>
    {accountPanel}
    {statusOnly && showForm && <RowButton type="button" variant="quiet" disabled={busy} onClick={() => toggleReportForm()} data-payment-back>
      <ChevronLeftIcon />{m.text("subscribe.backToPaymentStatus")}
    </RowButton>}
    <Sheet data-subscribe-layout="compact-stacked">
      {showForm && <>
      <Step id="plans" aria-labelledby={`${ids}-plan`}>
        <StepHeading><StepTitle id={`${ids}-plan`} tabIndex={-1}>{m.text("subscribe.pickPlan")}</StepTitle></StepHeading>
        <Plans aria-labelledby={`${ids}-plan`} $columns={Math.min(plans.length, 3)}>{plans.map((item) => <Plan key={item.id}>
          <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} onChange={() => update({ planId: item.id })} />
          <PlanName>{m.plural("paywall.days", item.durationDays)}</PlanName><PlanPrice><small>UGX</small> <span>{m.number(item.priceUgx)}</span></PlanPrice>
        </Plan>)}</Plans>
      </Step>
      <Step aria-label={m.text("subscribe.payAmount", { amount: m.number(plan.priceUgx) })}>
        <PaymentTransfer>
          {networks.length > 1 ? <WalletChoices><VisuallyHidden as="legend">{m.text("subscribe.network")}</VisuallyHidden>{networks.map((network) => <WalletChoice key={network}>
            <input type="radio" name={`${ids}-wallet`} value={network} checked={payNetwork === network} onChange={() => { update({ network }); setCopied(""); }} />
            <span><MobileMoneyLogo network={network} /><span>{wallets[network].name}</span><CheckIcon /></span>
          </WalletChoice>)}</WalletChoices> : <Note>{wallet.name}</Note>}
          <Wallet>
            <WalletNumber><VisuallyHidden>{wallet.name} </VisuallyHidden><WalletMeta>{m.text("subscribe.payTo", { amount: m.number(plan.priceUgx) })}</WalletMeta> <span>{localUgandaPhone(number)}</span></WalletNumber>
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
          {!statusOnly && paymentStatus}
          {showForm && <ReportForm id={`${ids}-form`} onSubmit={submit} data-analytics-ignore>
            <TextInput id={`${ids}-transaction`} label={m.text("subscribe.transactionId")} placeholder={m.text("subscribe.transactionHint")} value={draft.transactionId} required disabled={busy}
              minLength={4} maxLength={40} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              error={pasteNote || undefined} onPaste={(event) => { event.preventDefault(); pasteTransaction(event.clipboardData.getData("text")); }}
              onChange={(event) => { setPasteNote(""); update({ transactionId: normalizeTransactionId(event.currentTarget.value) }); }}
              trailing={canPaste && <PasteButton type="button" variant="secondary" disabled={busy} onClick={readClipboard} data-analytics-ignore
                aria-label={m.text("subscribe.pasteTransaction")}><ClipboardIcon /><span aria-hidden="true">{m.text("subscribe.paste")}</span></PasteButton>} />
            <PhoneInput label={m.text("subscribe.payer")} value={draft.payerPhone} required hint={false} disabled={busy}
              onValueChange={(value) => update({ payerPhone: value })} />
            <FileField>
              <legend>{m.text("subscribe.moreDetails")}</legend>
              <FileChoices><FileBox><ImageIcon /><span id={`${ids}-shot`}>{m.text(image ? "subscribe.changeScreenshot" : "subscribe.chooseScreenshot")}</span>
                <input type="file" accept="image/*" disabled={busy} aria-labelledby={`${ids}-shot`} aria-describedby={`${ids}-shot-hint`}
                  onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox>
              <FileBox><ImageIcon /><span id={`${ids}-camera`}>{m.text("subscribe.takePhoto")}</span>
                <input type="file" accept="image/*" capture="environment" disabled={busy} aria-labelledby={`${ids}-camera`} aria-describedby={`${ids}-shot-hint`}
                  onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox></FileChoices>
              <VisuallyHidden id={`${ids}-shot-hint`}>{m.text("subscribe.imageHint")}</VisuallyHidden>
              {image && <><Preview src={preview} alt={m.text("subscribe.preview")} />
                <RowButton type="button" variant="quiet" disabled={busy} onClick={() => { setImage(null); setPreview(""); setPercentage(null); }}>{m.text("subscribe.removeScreenshot")}</RowButton></>}
            </FileField>
            {!view?.acceptedTerms && <Assent><input type="checkbox" required disabled={busy} checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
            <Submit type="submit" disabled={busy || !restored || !draft.network}>{m.text(busy ? "subscribe.sending" : "subscribe.report")}<ChevronRightIcon /></Submit>
            {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
          </ReportForm>}
          <noscript><p>{m.text("subscribe.noJavaScript")}</p></noscript>
        </>}
        {error && <p role="alert">{error}</p>}
      </Step>
    </Sheet>
    {footer}
  </>;
}
