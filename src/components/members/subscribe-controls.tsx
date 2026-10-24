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
import { paymentEvidence, sameTransactionId, type PaymentEvidence } from "@/domain/payment-sms";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { validTopUp, walletRules } from "@/domain/wallet";
import { createMessages } from "@/i18n/messages";
import { AccountAuthForm } from "./account-auth-form";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";
import { readScreenshotText } from "./payment-ocr";
import { EvidenceFindings, ReadingProgress, evidenceRows, type PaymentTarget, type ReadingState } from "./payment-evidence";
import { CreditPurchase } from "./credit-controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { PaymentStatusCard, TrialStatusCard, useApprovalRefresh } from "./payment-status";

import {
  ActionLink, Assent, ConfirmDetails, ConfirmPreview, CopyButton, Disclosure, FileBox, FileChoices, FileField,
  HelpActions, HelpTitle, Locked, MenuLink, Note, PageFooter, PasteButton, PaymentTransfer, PlanSwitch, SubmitNote,
  Plan, PlanName, PlanPrice, Plans, Preview, ReportForm, Row, RowButton, RowNote, Sheet,
  Step, StepHeading, StepTitle, Submit, Wallet, WalletChoice, WalletChoices,
  WalletMeta, WalletNumber,
} from "./subscribe-styles";

export { SubscribeLayout } from "./subscribe-styles";

const subscribeNothing = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const clipboardReadable = () => typeof navigator.clipboard?.readText === "function";
const modalDialogs = () => typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
const noEvidence: PaymentEvidence = { transactionId: null, amount: null, network: null };
/** idCurrent turns false once a typed or pasted ID replaces the one this screenshot gave. */
type ShotFindings = Readonly<{ evidence: PaymentEvidence; replaced: string | null; unreadable: boolean; idCurrent: boolean }>;
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

/** startWithTopUp opens the form on Add credit (the account page's link); a signed-out visitor always sees plans. */
export function SubscribeFlow({ locale, settings, plans, account, view, returnTo, userAgent, trialPending, startWithTopUp = false }: {
  locale: string; settings: SubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string } | null; view: PaymentView | null; returnTo: string | null; userAgent: string; trialPending: boolean; startWithTopUp?: boolean;
}) {
  const m = createMessages(locale), router = useRouter(), ids = useId();
  const networks = useMemo(() => (["mtn", "airtel"] as const).filter((key) => !!settings[key === "mtn" ? "mtnNumber" : "airtelNumber"]), [settings]);
  const initial = useMemo<PaymentDraft>(() => ({ purpose: startWithTopUp && account ? "topup" : "plan", planId: plans[0]?.id ?? "", topUpAmount: "", payerPhone: account?.phone ?? "256",
    network: networks.find((network) => network === networkForPrefix(account?.phone ?? "")) ?? networks[0] ?? "", transactionId: "", accepted: false }), [account, networks, plans, startWithTopUp]);
  const restored = useSyncExternalStore(subscribeNothing, clientReady, serverReady);
  const persisted = useSyncExternalStore(subscribeNothing, () => account ? paymentDraftSnapshot(account.id) : null, () => null);
  const recovered = useMemo(() => account ? readPaymentDraft(account.id, persisted) : null, [account, persisted]);
  const [edited, setEdited] = useState<PaymentDraft | null>(null);
  const draft = useMemo(() => edited ?? (recovered && plans.some((item) => item.id === recovered.planId) ? { ...recovered,
    purpose: startWithTopUp && account || recovered.purpose === "topup" && recovered.topUpAmount ? "topup" as const : "plan" as const,
    accepted: false, network: networks.includes(recovered.network as MobileNetwork) ? recovered.network : initial.network } : initial), [edited, recovered, plans, networks, initial, startWithTopUp, account]);
  const setDraft = (change: (old: PaymentDraft) => PaymentDraft) => setEdited((old) => change(old ?? draft));
  const [image, setImage] = useState<Blob | null>(null), [preview, setPreview] = useState(""), [busy, setBusy] = useState(false), [percentage, setPercentage] = useState<number | null>(null);
  const [error, setError] = useState(""), [copied, setCopied] = useState<MobileNetwork | "">("");
  const [idNote, setIdNote] = useState(""), [messageFound, setMessageFound] = useState<PaymentEvidence | null>(null);
  const [shotState, setShotState] = useState<ReadingState | null>(null), [shotFound, setShotFound] = useState<ShotFindings | null>(null);
  // The pasted SMS's amount outlives edits to its ID; with the screenshot's, either one below the plan's price blocks submitting.
  const [messageAmount, setMessageAmount] = useState<number | null>(null);
  const canPaste = useSyncExternalStore(subscribeNothing, clipboardReadable, serverReady), canConfirm = useSyncExternalStore(subscribeNothing, modalDialogs, serverReady);
  const [confirming, setConfirming] = useState(false), [announcement, setAnnouncement] = useState("");
  // Each screenshot read has a number, so a slow read never fills the form after its image was replaced or removed.
  // idSource says where the current ID came from: a new screenshot replaces any ID, and clears one an earlier screenshot gave.
  const reading = useRef(0), stopReading = useRef<AbortController | null>(null), submitButton = useRef<HTMLButtonElement>(null);
  const currentId = useRef(draft.transactionId), currentTarget = useRef<PaymentTarget | null>(null), idSource = useRef<"typed" | "message" | "screenshot" | null>(null);
  useEffect(() => { currentId.current = draft.transactionId; }, [draft.transactionId]);
  // Until the refresh after an upload lands, the new report stands in for the server's previous latest report.
  const [sent, setSent] = useState<{ status: PaymentStatus; before: string | null } | null>(null);
  const latest = sent && (view?.status?.reference ?? null) === sent.before ? sent.status : view?.status ?? null;
  // The newest report and the other purpose's report it hides are sorted into the plan report, whose status may stand alone,
  // and the top-up, which only ever shows a card beside the form.
  // Until the refresh lands, the report just sent stands in for the newest, and the one it displaced may be the other purpose's.
  const displaced = sent && latest === sent.status && view?.status && waitingStatuses.includes(view.status.status) ? view.status : null;
  const other = [view?.otherStatus, displaced].find((report) => report && report.reference !== latest?.reference && report.purpose !== latest?.purpose) ?? null;
  const status = latest?.purpose === "topup" ? other : latest, topUpStatus = latest?.purpose === "topup" ? latest : other;
  const waiting = !!status && waitingStatuses.includes(status.status);
  const reportKey = `${account?.id ?? ""}:${status?.reference ?? ""}:${status?.status ?? ""}`;
  const reversed = status?.status === "reversed", rejected = status?.status === "rejected";
  // A top-up waiting for review (or refused) never hides plans or spending credit: its card sits beside the form, and a new
  // top-up replaces it. Only a plan report's status stands alone, unless the member came to add credit.
  const statusOnly = !(startWithTopUp && account) && (waiting || rejected || reversed);
  const [reportForm, setReportForm] = useState({ reportKey, open: false, replacing: statusOnly });
  // Only an explicit choice for this report opens a new form; a different decision resets it. A confirmation closes only when
  // the form was replacing the report that changed, not when an unrelated top-up is approved while the member checks a plan.
  if (reportForm.reportKey !== reportKey) { if (reportForm.replacing) setConfirming(false); setReportForm({ reportKey, open: false, replacing: statusOnly }); }
  const showForm = !statusOnly || reportForm.reportKey === reportKey && reportForm.open;
  const focusTarget = useRef<string | null>(null);
  const topUpWaiting = !!topUpStatus && waitingStatuses.includes(topUpStatus.status);
  useApprovalRefresh(!!account && (waiting || topUpWaiting || trialPending));
  useEffect(() => { if (restored && account && showForm) savePaymentDraft(account.id, draft); }, [account, draft, restored, showForm]);
  useEffect(() => {
    if (!focusTarget.current) return;
    const target = document.getElementById(focusTarget.current);
    focusTarget.current = null;
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center" });
  }, [showForm]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const plan = plans.find((candidate) => candidate.id === draft.planId) ?? plans[0];
  // A top-up pays the amount the member chose; until it is a valid amount there is nothing due and nothing to compare.
  const topUp = !!account && draft.purpose === "topup";
  const topUpUgx = topUp && /^\d{1,6}$/u.test(draft.topUpAmount) && validTopUp(Number(draft.topUpAmount)) ? Number(draft.topUpAmount) : null;
  const target: PaymentTarget | null = topUp ? topUpUgx === null ? null : { priceUgx: topUpUgx, durationDays: null } : plan ?? null;
  const due = target?.priceUgx ?? null;
  useEffect(() => { currentTarget.current = target; });
  const menu = canOpenMoneyMenu(userAgent);
  const payNetwork = networks.find((network) => network === draft.network) ?? networks[0];
  const shortcut = payNetwork && due !== null ? settings[payNetwork === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(due)) : undefined;
  const update = (values: Partial<PaymentDraft>) => setDraft((old) => ({ ...old, ...values }));
  const amountInvalid = m.text("credit.amountInvalid", { min: m.number(walletRules.topUpMinUgx), max: m.number(walletRules.topUpMaxUgx) });
  function toggleReportForm(focus = `${ids}-transaction`) {
    if (busy) return;
    // Only a plan report opens this form, so its update is a plan report too and replaces it.
    if (!showForm) update({ purpose: "plan" });
    setError(""); setConfirming(false); focusTarget.current = showForm ? `${ids}-form-toggle` : focus;
    setReportForm({ reportKey, open: !showForm, replacing: statusOnly });
  }
  // Help quotes the report that needs it: a waiting one first, then one refused or reversed.
  const helpReport = [status, topUpStatus].find((report) => report && waitingStatuses.includes(report.status))
    ?? [status, topUpStatus].find((report) => report?.status === "rejected" || report?.status === "reversed") ?? status ?? topUpStatus;
  const helpText = account && helpReport ? m.text("subscribe.helpPaid", { price: String(helpReport.priceUgx), plan: helpReport.planName, phone: formatPhone(account.phone), reference: helpReport.reference }) : undefined;
  const owners = { mtn: settings.mtnNumber, airtel: settings.airtelNumber };
  const networkName = (evidence: PaymentEvidence) => evidence.network && networks.includes(evidence.network) ? wallets[evidence.network].name : null;
  /** The network a message or screenshot names, as a form change; the member's chosen plan is never changed for them. */
  function networkChange(evidence: PaymentEvidence): Partial<PaymentDraft> {
    if (!evidence.network || !networks.includes(evidence.network)) return {};
    setCopied("");
    return { network: evidence.network };
  }
  /** Says what a paste or read found through the form's live region, judged against the plan chosen when it finished. */
  function say(evidence: PaymentEvidence, replaced: string | null = null, screenshot = false, showId = true) {
    announceText(evidenceRows(locale, evidence, currentTarget.current, networkName(evidence), replaced, showId, screenshot).map((row) => row.text).join(". "));
  }
  // Emptying first makes a repeated, identical text count as new, so it is read again.
  function announceText(text: string) {
    setAnnouncement(""); setTimeout(() => setAnnouncement(text), 60);
  }
  // A pasted payment SMS keeps only its transaction ID; text without an ID changes nothing and only says so.
  function pasteMessage(text: string) {
    const evidence = paymentEvidence(text, owners);
    if (evidence.transactionId) {
      update({ ...networkChange(evidence), transactionId: evidence.transactionId });
      idSource.current = "message"; setMessageAmount(evidence.amount); setMessageFound(evidence);
      setShotFound((found) => found && { ...found, idCurrent: found.evidence.transactionId === evidence.transactionId });
    } else setMessageFound(noEvidence);
    setIdNote(""); say(evidence.transactionId ? evidence : noEvidence);
  }
  async function readClipboard() {
    if (busy) return;
    try { pasteMessage(await navigator.clipboard.readText()); }
    catch { setMessageFound(null); setIdNote(m.text("subscribe.pasteBlocked")); }
  }
  // A new screenshot's ID replaces the current one; with no readable ID, an ID from an earlier screenshot is cleared. An ID
  // typed or pasted while the screenshot was being read wins, and the findings then say whether the screenshot agrees.
  async function readScreenshot(file: Blob) {
    const attempt = ++reading.current, current = () => attempt === reading.current, controller = new AbortController(), startedWith = currentId.current;
    stopReading.current?.abort(); stopReading.current = controller;
    setShotFound(null); setShotState({ stage: "preparing", progress: 0 }); setAnnouncement(m.text("subscribe.reading.reading"));
    const editedMeanwhile = () => currentId.current !== startedWith && idSource.current !== "screenshot";
    let text: string;
    try { text = await readScreenshotText(file, (progress) => { if (current()) setShotState(progress); }, controller.signal); }
    catch {
      if (!current()) return;
      if (idSource.current === "screenshot" && !editedMeanwhile()) { update({ transactionId: "" }); idSource.current = null; }
      setShotState(null); setShotFound({ evidence: noEvidence, replaced: null, unreadable: true, idCurrent: true });
      setAnnouncement(m.text("subscribe.screenshotUnreadable"));
      return;
    }
    if (!current()) return;
    // A short pause on the last step, so the member sees the text being searched rather than a jump.
    setShotState({ stage: "finding", progress: 100 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!current()) return;
    const evidence = paymentEvidence(text, owners, { bare: false }), id = evidence.transactionId, previous = currentId.current;
    const kept = editedMeanwhile(), clear = !kept && !id && idSource.current === "screenshot";
    if (!kept) update({ ...networkChange(evidence), ...(id ? { transactionId: id } : clear ? { transactionId: "" } : {}) });
    // Only a screenshot that changed the field owns its ID; one that agrees with a pasted or typed ID leaves it theirs.
    if (!kept && id && id !== previous) { idSource.current = "screenshot"; setIdNote(""); setMessageFound(null); setMessageAmount(null); }
    else if (clear) idSource.current = null;
    const replaced = !kept && id && previous && previous !== id ? previous : null;
    const idCurrent = !kept || previous === id;
    setShotState(null); setShotFound({ evidence, replaced, unreadable: false, idCurrent }); say(evidence, replaced, true, idCurrent);
  }
  function removeScreenshot() {
    reading.current++; stopReading.current?.abort(); stopReading.current = null;
    setImage(null); setPreview(""); setPercentage(null); setShotState(null); setShotFound(null);
  }
  async function chooseImage(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const prepared = await preparePaymentImage(file);
      setImage(prepared); setPreview(URL.createObjectURL(prepared));
      void readScreenshot(prepared);
    } catch (failure) {
      // A replacement that cannot be prepared leaves the earlier screenshot and its findings in place.
      setError(failure instanceof Error ? failure.message : m.text("subscribe.chooseImage"));
    } finally { setBusy(false); }
  }
  // What the screenshot showed, once read: its ID and amount gate submitting.
  const shot = shotFound && !shotFound.unreadable ? shotFound.evidence : null;
  /** The details as they would be sent, or the first problem with them. */
  function checkedDetails() {
    const payer = validMobilePhone(draft.payerPhone), transactionId = parseTransactionId(draft.transactionId);
    if (!plan || !account) return { problem: m.text("account.unavailable") };
    if (topUp && topUpUgx === null) return { problem: amountInvalid };
    if (!image) return { problem: m.text("subscribe.needScreenshot") };
    if (!transactionId) return { problem: m.text("subscribe.transactionRequired") };
    if (!payer) return { problem: m.text("phone.invalid") };
    return { plan, account, payer, transactionId, image, topUpUgx: topUp ? topUpUgx : null };
  }
  // Submitting checks the details, then shows them to confirm before anything is sent.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (blocker) { announceText(blocker.text); return; }
    if (busy) return;
    const details = checkedDetails();
    if ("problem" in details) { setError(details.problem ?? ""); return; }
    if (canConfirm) setConfirming(true); else void send();
  }
  async function send() {
    setConfirming(false);
    const details = checkedDetails();
    if (busy || blocker || "problem" in details) return;
    const { plan, account, payer, transactionId, image: screenshot, topUpUgx: credit } = details, body = new FormData();
    setBusy(true); setPercentage(0);
    // The server records the plan's price (or the top-up) as the claim; the screenshot's amount goes along only as the owner's hint.
    for (const [key, value] of Object.entries({ purpose: credit === null ? "plan" : "topup", planId: credit === null ? plan.id : "", topUpAmount: credit === null ? "" : String(credit),
      network: draft.network, payerPhone: payer, transactionId,
      screenshotAmount: shot?.amount ? String(shot.amount) : "", accepted: String(draft.accepted) })) body.append(key, value);
    body.append("image", screenshot, "payment.jpg");
    let failed = false;
    try {
      const result = await uploadPayment(body, setPercentage); clearPaymentDraft(account.id); trackEvent("payment_submitted");
      setSent({ before: view?.status?.reference ?? null, status: { reference: result.reference, status: "pending", rejectText: null, rejectReason: null,
        planName: credit === null ? plan.name : m.text("credit.topUp"), priceUgx: credit ?? plan.priceUgx, submittedAt: new Date().toISOString(), endsAt: null,
        purpose: credit === null ? "plan" : "topup" } });
      setEdited(null); setReportForm({ reportKey, open: false, replacing: statusOnly }); removeScreenshot(); setMessageFound(null); setMessageAmount(null); setIdNote(""); router.refresh();
    } catch (failure) { failed = true; setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally {
      setBusy(false);
      // The dialog closed while Submit was disabled, so focus went nowhere; after a failure it returns to Submit.
      if (failed) setTimeout(() => submitButton.current?.focus(), 0);
    }
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
    replace={statusOnly && (waiting || rejected) && plan && payNetwork ? { open: showForm, controls: `${ids}-form`, disabled: busy, toggle: () => toggleReportForm() } : undefined}
    newPayment={statusOnly && reversed && !showForm && plan && payNetwork ? { controls: `${ids}-form`, start: () => toggleReportForm(`${ids}-plan`) } : undefined} />;
  const topUpCard = account && topUpStatus && <PaymentStatusCard locale={locale} status={topUpStatus} settings={settings} phone={account.phone} heading={statusOnly && !showForm ? "h2" : "h3"} />;
  if (statusOnly && !showForm) return <>{accountPanel}<Step id="report">{paymentStatus}{topUpCard}</Step></>;
  if (!plan || !payNetwork) return <>{accountPanel}{paymentStatus}{topUpCard}<p>{m.text(plan ? "account.unavailable" : "subscribe.noPlans")}</p>{footer}</>;
  const wallet = wallets[payNetwork], number = settings[payNetwork === "mtn" ? "mtnNumber" : "airtelNumber"]!;
  // Submitting opens only when every required detail is present and valid; the first gap is said under the button.
  // The screenshot is required and must show a readable transaction ID and amount; the ID entered must be the one it shows.
  const claimedId = parseTransactionId(draft.transactionId), shotId = shot?.transactionId ?? null;
  const paidAmounts = [messageAmount, shot?.amount ?? null].filter((amount): amount is number => amount !== null);
  const shortAmount = paidAmounts.length && due !== null && Math.min(...paidAmounts) < due ? Math.min(...paidAmounts) : null;
  // A short amount that is exactly another plan's price offers that plan, or for a top-up offers adding what was paid;
  // the chosen plan or amount never changes by itself.
  const paidPlan = shortAmount === null || topUp ? undefined : plans.find((item) => item.priceUgx === shortAmount);
  const paidTopUp = topUp && validTopUp(shortAmount) ? shortAmount : null;
  const blocker: Readonly<{ text: string; warning: boolean; switchTo?: SubscriptionPlanView; useAmount?: number }> | null
    = topUp && topUpUgx === null ? { text: amountInvalid, warning: false }
    : !validMobilePhone(draft.payerPhone) ? { text: m.text("subscribe.needPayer"), warning: false }
    : !image ? { text: m.text("subscribe.needScreenshot"), warning: false }
    : shotState ? { text: m.text("subscribe.waitReading"), warning: false }
    : !shotFound?.unreadable && (!shotId || shot?.amount === null || shot?.amount === undefined) ? { text: m.text("subscribe.unclearScreenshot"), warning: true }
    : !claimedId ? { text: m.text(shotFound?.unreadable && !draft.transactionId ? "subscribe.enterTransaction" : "subscribe.transactionRequired"), warning: true }
    : shotId && !sameTransactionId(claimedId, shotId) ? { text: m.text("subscribe.idMismatch", { id: shotId }), warning: true }
    : shortAmount !== null && topUp ? { text: m.text("credit.amountShort", { amount: m.number(shortAmount), price: m.number(due ?? 0) }), warning: true,
      ...(paidTopUp === null ? {} : { useAmount: paidTopUp }) }
    : shortAmount !== null ? { text: m.text("subscribe.amountShort", { amount: m.number(shortAmount), price: m.number(plan.priceUgx),
      plan: m.plural("paywall.days", plan.durationDays) }), warning: true, ...(paidPlan ? { switchTo: paidPlan } : {}) }
    : !view?.acceptedTerms && !draft.accepted ? { text: m.text("subscribe.needAssent"), warning: false } : null;
  const name = settings[payNetwork === "mtn" ? "mtnName" : "airtelName"];
  return <>
    {accountPanel}
    {statusOnly && showForm && <RowButton type="button" variant="quiet" disabled={busy} onClick={() => toggleReportForm()} data-payment-back>
      <ChevronLeftIcon />{m.text("subscribe.backToPaymentStatus")}
    </RowButton>}
    <Sheet data-subscribe-layout="compact-stacked">
      {showForm && <>
      <Step id="plans" aria-labelledby={`${ids}-plan`}>
        <StepHeading><StepTitle id={`${ids}-plan`} tabIndex={-1}>{m.text(topUp ? "credit.addTitle" : "subscribe.pickPlan")}</StepTitle></StepHeading>
        {topUp ? <TextInput id={`${ids}-topup`} label={m.text("credit.amount")} inputMode="numeric" autoComplete="off" required disabled={busy} value={draft.topUpAmount}
            hint={m.text("credit.amountHint", { min: m.number(walletRules.topUpMinUgx), max: m.number(walletRules.topUpMaxUgx) })} data-topup-amount
            onChange={(event) => update({ topUpAmount: event.currentTarget.value.replace(/\D/gu, "").slice(0, 6) })} />
          : <Plans aria-labelledby={`${ids}-plan`} $columns={Math.min(plans.length, 3)}>{plans.map((item) => <Plan key={item.id}>
            <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} onChange={() => update({ planId: item.id })} />
            <PlanName>{m.plural("paywall.days", item.durationDays)}</PlanName><PlanPrice><small>UGX</small> <span>{m.number(item.priceUgx)}</span></PlanPrice>
          </Plan>)}</Plans>}
        {account && view?.credit && (topUp ? view.credit.balanceUgx !== 0 && <Note>{m.text("credit.balance", { amount: m.number(view.credit.balanceUgx) })}</Note>
          : <CreditPurchase locale={locale} credit={view.credit} plan={plan} acceptedTerms={!!view.acceptedTerms} accepted={draft.accepted} disabled={busy}
            onAccept={(accepted) => update({ accepted })} />)}
        {account && !waiting && <RowButton type="button" variant="quiet" disabled={busy} onClick={() => update({ purpose: topUp ? "plan" : "topup" })} data-credit-mode={topUp ? "topup" : "plan"}>
          {m.text(topUp ? "credit.planInstead" : "credit.addInstead")}</RowButton>}
      </Step>
      <Step aria-label={due === null ? m.text("credit.payTo") : m.text("subscribe.payAmount", { amount: m.number(due) })}>
        <PaymentTransfer>
          {networks.length > 1 ? <WalletChoices><VisuallyHidden as="legend">{m.text("subscribe.network")}</VisuallyHidden>{networks.map((network) => <WalletChoice key={network}>
            <input type="radio" name={`${ids}-wallet`} value={network} checked={payNetwork === network} onChange={() => { update({ network }); setCopied(""); }} />
            <span><MobileMoneyLogo network={network} /><span>{wallets[network].name}</span><CheckIcon /></span>
          </WalletChoice>)}</WalletChoices> : <Note>{wallet.name}</Note>}
          <Wallet>
            <WalletNumber><VisuallyHidden>{wallet.name} </VisuallyHidden><WalletMeta>{due === null ? m.text("credit.payTo") : m.text("subscribe.payTo", { amount: m.number(due) })}</WalletMeta> <span>{localUgandaPhone(number)}</span></WalletNumber>
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
          {!statusOnly && paymentStatus}{topUpCard}
          {showForm && <ReportForm id={`${ids}-form`} onSubmit={submit} data-analytics-ignore>
            <PhoneInput label={m.text("subscribe.payer")} value={draft.payerPhone} required hint={false} disabled={busy}
              onValueChange={(value) => update({ payerPhone: value })} />
            {/* No maxLength: a keyboard's clipboard suggestion inserts a whole SMS as typing, and the browser would cut it short. */}
            <TextInput id={`${ids}-transaction`} label={m.text("subscribe.transactionId")} placeholder={m.text("subscribe.transactionHint")} value={draft.transactionId}
              required disabled={busy} minLength={4} pattern="[A-Z0-9.\-]{4,40}" autoComplete="off" autoCapitalize="characters" spellCheck={false} data-transaction-input
              error={idNote || undefined}
              hint={messageFound && <EvidenceFindings locale={locale} evidence={messageFound} target={target} networkName={networkName(messageFound)} />}
              onPaste={(event) => { event.preventDefault(); pasteMessage(event.clipboardData.getData("text")); }}
              onChange={(event) => {
                const raw = event.currentTarget.value, typed = normalizeTransactionId(raw);
                if (raw.length > draft.transactionId.length + 1) { pasteMessage(raw); return; }
                setIdNote(""); setMessageFound(null); setMessageAmount(null); idSource.current = "typed";
                setShotFound((found) => found && { ...found, idCurrent: false });
                update({ transactionId: typed.replace(/[^A-Z0-9.-]/gu, "").slice(0, 40) });
              }}
              trailing={canPaste && <PasteButton type="button" variant="secondary" disabled={busy} onClick={readClipboard} data-analytics-ignore
                aria-label={m.text("subscribe.pasteTransaction")}><ClipboardIcon /><span aria-hidden="true">{m.text("subscribe.paste")}</span></PasteButton>} />
            <FileField>
              <legend>{m.text("subscribe.moreDetails")}</legend>
              <FileChoices><FileBox><ImageIcon /><span id={`${ids}-shot`}>{m.text(image ? "subscribe.changeScreenshot" : "subscribe.chooseScreenshot")}</span>
                <input type="file" accept="image/*" disabled={busy} aria-labelledby={`${ids}-shot`} aria-describedby={`${ids}-shot-hint`}
                  onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox>
              <FileBox><ImageIcon /><span id={`${ids}-camera`}>{m.text("subscribe.takePhoto")}</span>
                <input type="file" accept="image/*" capture="environment" disabled={busy} aria-labelledby={`${ids}-camera`} aria-describedby={`${ids}-shot-hint`}
                  onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox></FileChoices>
              <VisuallyHidden id={`${ids}-shot-hint`}>{m.text("subscribe.imageHint")}</VisuallyHidden>
              {shotState ? <ReadingProgress locale={locale} state={shotState} />
                : shotFound?.unreadable ? <Note data-screenshot-note>{m.text("subscribe.screenshotUnreadable")}</Note>
                  : shotFound && <div data-screenshot-note><EvidenceFindings locale={locale} evidence={shotFound.evidence} target={target} replaced={shotFound.replaced}
                    showId={shotFound.idCurrent} networkName={networkName(shotFound.evidence)} needAmount /></div>}
              {image && <><Preview src={preview} alt={m.text("subscribe.preview")} />
                <RowButton type="button" variant="quiet" disabled={busy} onClick={removeScreenshot}>{m.text("subscribe.removeScreenshot")}</RowButton></>}
            </FileField>
            {!view?.acceptedTerms && <Assent><input type="checkbox" required disabled={busy} checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
            <VisuallyHidden role="status">{announcement}</VisuallyHidden>
            <Submit ref={submitButton} type="submit" disabled={busy || !restored || !draft.network} aria-disabled={blocker ? true : undefined} aria-describedby={blocker ? `${ids}-blocker` : undefined}>
              {m.text(busy ? "subscribe.sending" : "subscribe.report")}<ChevronRightIcon /></Submit>
            {blocker && <SubmitNote id={`${ids}-blocker`} $warning={blocker.warning} data-submit-blocker>{blocker.text}
              {blocker.switchTo && <> <PlanSwitch type="button" variant="quiet" data-plan-switch
                onClick={() => { update({ planId: blocker.switchTo!.id }); setTimeout(() => submitButton.current?.focus(), 0); }}>
                {m.text("subscribe.switchPlan", { plan: m.plural("paywall.days", blocker.switchTo.durationDays) })}</PlanSwitch></>}
              {blocker.useAmount !== undefined && <> <PlanSwitch type="button" variant="quiet" data-topup-switch
                onClick={() => { update({ topUpAmount: String(blocker.useAmount) }); setTimeout(() => submitButton.current?.focus(), 0); }}>
                {m.text("credit.useAmount", { amount: m.number(blocker.useAmount) })}</PlanSwitch></>}</SubmitNote>}
            {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
          </ReportForm>}
          {canConfirm && showForm && <CriteriaDialog id={`${ids}-confirm`} title={m.text("subscribe.confirmTitle")} open={confirming} onCancel={() => setConfirming(false)} onApply={() => void send()}
            applyLabel={m.text("subscribe.confirmSend")} cancelLabel={m.text("subscribe.editDetails")} closeLabel={m.text("subscribe.editDetails")}>
            <ConfirmDetails data-payment-confirmation>
              <div><dt>{m.text("subscribe.planLabel")}</dt><dd>{topUp ? m.text("credit.topUp") : m.plural("paywall.days", plan.durationDays)} · UGX {m.number(due ?? plan.priceUgx)}</dd></div>
              <div><dt>{m.text("subscribe.confirmPaidTo")}</dt><dd>{wallet.name} {localUgandaPhone(number)}{name ? ` · ${name}` : ""}</dd></div>
              <div><dt>{m.text("subscribe.confirmPaidFrom")}</dt><dd>{formatPhone(validMobilePhone(draft.payerPhone) ?? draft.payerPhone)}</dd></div>
              <div><dt>{m.text("subscribe.transactionId")}</dt><dd>{claimedId}</dd></div>
              {shot?.amount && <div><dt>{m.text("subscribe.confirmAmount")}</dt><dd>UGX {m.number(shot.amount)}</dd></div>}
              {image && <div><dt>{m.text("subscribe.confirmScreenshot")}</dt><dd><ConfirmPreview src={preview} alt={m.text("subscribe.preview")} /></dd></div>}
            </ConfirmDetails>
            {/* Contact buttons wait for the "Waiting for approval" card after sending; here the member only checks the details. */}
            <Note>{m.text("subscribe.confirmReview")}{settings.reviewTime ? ` ${m.text("subscribe.reviewTime", { time: settings.reviewTime })}` : ""} {m.text("subscribe.confirmDelay")}</Note>
          </CriteriaDialog>}
          <noscript><p>{m.text("subscribe.noJavaScript")}</p></noscript>
        </>}
        {error && <p role="alert">{error}</p>}
      </Step>
    </Sheet>
    {footer}
  </>;
}
