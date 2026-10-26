"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics/tracker";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChatIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardIcon, CopyIcon, DialpadIcon, HelpIcon, ImageIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { formatPhone, localUgandaPhone, networkForPrefix, telHref, waHref, type MobileNetwork } from "@/domain/phone";
import { validMobilePhone } from "@/domain/phone-mobile";
import { canOpenMoneyMenu, normalizeTransactionId, parseTransactionId, type PaymentStatus, type PaymentView } from "@/domain/payment";
import { paymentEvidence, sameTransactionId, type PaymentEvidence } from "@/domain/payment-sms";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { validTopUp, walletRules } from "@/domain/wallet";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { AccountAuthForm } from "./account-auth-form";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { clearPaymentDraft, readPaymentDraft, savePaymentDraft, paymentDraftSnapshot, type PaymentDraft } from "./payment-draft";
import { preparePaymentImage, uploadPayment } from "./payment-image";
import { readScreenshotText } from "./payment-ocr";
import { EvidenceFindings, ReadingProgress, evidenceRows, type PaymentTarget, type ReadingState } from "./payment-evidence";
import { CreditPurchase } from "./credit-controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { PaymentStatusCard, useApprovalRefresh } from "./payment-status";
import { PaymentWizard, WizardActions, WizardConfirm, WizardEdit, WizardFooter, WizardMethod, WizardNotice, WizardPayee, WizardPlans, WizardReceipt, WizardReview, WizardScreenshot, type PaymentStep } from "./payment-wizard";

import {
  ActionLink, Assent, ConfirmDetails, ConfirmPreview, CopyButton, Disclosure, FileBox, FileChoices, FileField,
  HelpActions, HelpTitle, MenuLink, Note, PageFooter, PasteButton, PaymentTransfer, PlanSwitch, SubmitNote,
  Plan, PlanName, PlanPrice, Preview, RailNumber, RailStep, ReportForm, Row, RowButton,
  Step, StepRail, Submit, TopUpHeader, Wallet, WalletChoice, WalletChoices,
  WalletMeta, WalletNumber,
} from "./subscribe-styles";
import { setPaymentPurpose } from "./payment-purpose";

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
/** startWithTopUp opens the form on Add credit (the account page's link); a signed-out visitor always sees plans. */
export function SubscribeFlow({ locale, settings, plans, account, view, returnTo, userAgent, startWithTopUp = false }: {
  locale: string; settings: SubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string } | null; view: PaymentView | null; returnTo: string | null; userAgent: string; startWithTopUp?: boolean;
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
    // Only the Add credit link opens a top-up: that screen has no way back to plans, so a saved top-up draft never takes over
    // the plan page (its amount is still there for the next top-up).
    purpose: startWithTopUp && account ? "topup" as const : "plan" as const,
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
  const [step, setStep] = useState<PaymentStep>(0), [confirmationKey, setConfirmationKey] = useState<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null), focusStep = useRef(false), sending = useRef(false);
  const creditRequestKey = useRef<string | null>(null);
  const [methodVisited, setMethodVisited] = useState(false);
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
  if (reportForm.reportKey !== reportKey) {
    if (reportForm.replacing) { setConfirming(false); setConfirmationKey(null); setStep(0); }
    setReportForm({ reportKey, open: false, replacing: statusOnly });
  }
  const showForm = !statusOnly || reportForm.reportKey === reportKey && reportForm.open;
  const focusTarget = useRef<string | null>(null);
  const topUpWaiting = !!topUpStatus && waitingStatuses.includes(topUpStatus.status);
  useApprovalRefresh(!!account && (waiting || topUpWaiting));
  useEffect(() => { if (restored && account && showForm) savePaymentDraft(account.id, draft); }, [account, draft, restored, showForm]);
  useEffect(() => {
    if (!focusTarget.current) return;
    const target = document.getElementById(focusTarget.current);
    focusTarget.current = null;
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center" });
  }, [showForm]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { reading.current++; stopReading.current?.abort(); }, []);
  useEffect(() => {
    if (!focusStep.current || !showForm) return;
    focusStep.current = false;
    stepHeading.current?.focus({ preventScroll: true });
    stepHeading.current?.closest("section")?.scrollIntoView({ block: "start" });
  }, [step, showForm]);
  const plan = plans.find((candidate) => candidate.id === draft.planId) ?? plans[0];
  // A top-up pays the amount the member chose; until it is a valid amount there is nothing due and nothing to compare.
  const topUp = !!account && draft.purpose === "topup";
  const topUpUgx = topUp && /^\d{1,6}$/u.test(draft.topUpAmount) && validTopUp(Number(draft.topUpAmount)) ? Number(draft.topUpAmount) : null;
  const target: PaymentTarget | null = topUp ? topUpUgx === null ? null : { priceUgx: topUpUgx, durationDays: null } : plan ?? null;
  const due = target?.priceUgx ?? null;
  useEffect(() => { currentTarget.current = target; });
  // The shared expiry bar words itself for what is being paid; leaving the page clears it.
  useEffect(() => { setPaymentPurpose(topUp && showForm ? "topup" : "plan"); }, [topUp, showForm]);
  useEffect(() => () => setPaymentPurpose(null), []);
  const menu = canOpenMoneyMenu(userAgent);
  const payNetwork = networks.find((network) => network === draft.network) ?? networks[0];
  const paymentIdentity = JSON.stringify([draft.planId, due, plan?.durationDays, payNetwork,
    settings.mtnNumber, settings.airtelNumber, draft.payerPhone, draft.transactionId, preview]);
  const paymentConfirmed = confirmationKey === paymentIdentity;
  const shortcut = payNetwork && due !== null ? settings[payNetwork === "mtn" ? "mtnMenuShortcut" : "airtelMenuShortcut"]?.replaceAll("{amount}", String(due)) : undefined;
  const update = (values: Partial<PaymentDraft>) => {
    if (Object.keys(values).some((key) => key !== "accepted")) setConfirmationKey(null);
    setDraft((old) => ({ ...old, ...values }));
  };
  function goToStep(next: PaymentStep) {
    if (busy) return;
    if (next === 1) setMethodVisited(true);
    setError(""); setPercentage(null); setConfirmationKey(null); focusStep.current = true; setStep(next);
  }
  /** A new manual recipient or package needs its own proof; OCR inference keeps the image it just read. */
  function changePayment(values: Partial<PaymentDraft>) {
    if (busy) return;
    const changed = values.planId !== undefined && values.planId !== draft.planId || values.network !== undefined && values.network !== draft.network;
    if (changed && !topUp) {
      const hadProof = image || draft.transactionId || shotState || messageFound;
      removeScreenshot(); setMessageFound(null); setMessageAmount(null); setIdNote(""); idSource.current = null; currentId.current = "";
      update({ ...values, transactionId: "" });
      setError(""); if (hadProof) announceText(m.text("subscribe.wizard.proofReset"));
    } else update(values);
    setCopied("");
  }
  const amountInvalid = m.text("credit.amountInvalid", { min: m.number(walletRules.topUpMinUgx), max: m.number(walletRules.topUpMaxUgx) });
  function toggleReportForm(focus = `${ids}-transaction`) {
    if (busy) return;
    // Only a plan report opens this form, so its update is a plan report too and replaces it.
    if (!showForm) update({ purpose: "plan" });
    setError(""); setConfirming(false); setStep(0); setConfirmationKey(null);
    focusTarget.current = showForm ? `${ids}-form-toggle` : topUp ? focus : null;
    focusStep.current = !showForm;
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
    setBusy(true); setError(""); setPercentage(null);
    try {
      const prepared = await preparePaymentImage(file);
      setImage(prepared); setPreview(URL.createObjectURL(prepared));
      void readScreenshot(prepared);
    } catch (failure) {
      // A replacement that cannot be prepared leaves the earlier screenshot and its findings in place.
      setError(failure instanceof Error ? failure.message : m.text("subscribe.chooseImage"));
    } finally { setBusy(false); }
  }
  // Optional screenshot findings help the member check their entered details.
  const shot = shotFound && !shotFound.unreadable ? shotFound.evidence : null;
  /** The details as they would be sent, or the first problem with them. */
  function checkedDetails() {
    const payer = validMobilePhone(draft.payerPhone), transactionId = parseTransactionId(draft.transactionId);
    if (!plan || !account) return { problem: m.text("account.unavailable") };
    if (topUp && topUpUgx === null) return { problem: amountInvalid };
    if (!transactionId) return { problem: m.text("subscribe.transactionRequired") };
    if (!payer) return { problem: m.text("phone.invalid") };
    return { plan, account, payer, transactionId, image, topUpUgx: topUp ? topUpUgx : null };
  }
  // Plan payments always pass through the inline review, including browsers without modal dialogs.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!topUp) {
      if (busy) return;
      if (step === 2) {
        if (evidenceBlocker) { setError(evidenceBlocker.text); announceText(evidenceBlocker.text); return; }
        goToStep(3); return;
      }
      if (step !== 3) return;
      if (blocker || !paymentConfirmed) { setError(blocker?.text ?? m.text("subscribe.wizard.confirmRequired")); return; }
      void send(); return;
    }
    if (blocker) { announceText(blocker.text); return; }
    if (busy) return;
    const details = checkedDetails();
    if ("problem" in details) { setError(details.problem ?? ""); return; }
    if (canConfirm) setConfirming(true); else void send();
  }
  async function send() {
    setConfirming(false);
    const details = checkedDetails();
    if (busy || sending.current || blocker || "problem" in details || !topUp && (step !== 3 || !paymentConfirmed || !showForm)) return;
    sending.current = true;
    const { plan, account, payer, transactionId, image: screenshot, topUpUgx: credit } = details, body = new FormData();
    setBusy(true); setPercentage(0);
    // The server records the plan's price (or the top-up) as the claim; the screenshot's amount goes along only as the owner's hint.
    for (const [key, value] of Object.entries({ purpose: credit === null ? "plan" : "topup", planId: credit === null ? plan.id : "", topUpAmount: credit === null ? "" : String(credit),
      network: draft.network, payerPhone: payer, transactionId,
      // A top-up's consent sentence sits above Submit payment, so sending one accepts the terms it showed.
      screenshotAmount: shot?.amount ? String(shot.amount) : "", accepted: String(draft.accepted || credit !== null && !view?.acceptedTerms) })) body.append(key, value);
    if (screenshot) body.append("image", screenshot, "payment.jpg");
    let failed = false;
    try {
      const result = await uploadPayment(body, setPercentage); clearPaymentDraft(account.id); trackEvent("payment_submitted");
      setSent({ before: view?.status?.reference ?? null, status: { reference: result.reference, status: "pending", rejectText: null, rejectReason: null,
        planName: credit === null ? plan.name : m.text("credit.topUp"), priceUgx: credit ?? plan.priceUgx, submittedAt: new Date().toISOString(), endsAt: null,
        purpose: credit === null ? "plan" : "topup" } });
      setEdited(null); setReportForm({ reportKey, open: false, replacing: statusOnly }); removeScreenshot(); setMessageFound(null); setMessageAmount(null); setIdNote(""); router.refresh();
    } catch (failure) { failed = true; setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally {
      sending.current = false; setBusy(false);
      // The dialog closed while Submit was disabled, so focus went nowhere; after a failure it returns to Submit.
      if (failed) setTimeout(() => submitButton.current?.focus(), 0);
    }
  }
  const safety = <Disclosure><summary><ShieldIcon /><span>{m.text("subscribe.safety")}</span><ChevronDownIcon /></summary><ul>
    <li>{m.text("subscribe.payOnly")}{[settings.mtnName, settings.airtelName].filter(Boolean).join(" · ")}</li>
    <li>{m.text("subscribe.selfUnlock")}</li>
    <li>{m.text("subscribe.noPin")}</li>{settings.reviewTime && <li>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</li>}<li>{m.text("subscribe.estimates")}</li>
  </ul></Disclosure>;
  const help = <Disclosure>
    <summary><HelpIcon /><span>{m.text("navigation.help")}</span><ChevronDownIcon /></summary>
    <div>
      <PaymentHelp settings={settings} locale={locale} text={helpText} />
      {showForm && shortcut && !menu && <Note>{m.text("subscribe.dial")} <strong>{shortcut}</strong></Note>}
      {safety}
    </div>
  </Disclosure>;
  const accountPanel = !account && <SubscribeSignIn locale={locale} returnTo={returnTo} settings={settings} />;
  // Adding credit shows help and the safety tips at once, without the Help toggle or the money-menu code.
  const footer = <PageFooter>
    {topUp ? <><PaymentHelp settings={settings} locale={locale} text={helpText} />{safety}</> : help}
  </PageFooter>;
  const paymentStatus = account && <PaymentStatusCard locale={locale} status={status} settings={settings} phone={account.phone} heading={statusOnly && !showForm ? "h2" : "h3"}
    replace={statusOnly && (waiting || rejected) && plan && payNetwork ? { open: showForm, controls: `${ids}-form`, disabled: busy, toggle: () => toggleReportForm() } : undefined}
    newPayment={statusOnly && reversed && !showForm && plan && payNetwork ? { controls: `${ids}-form`, start: () => toggleReportForm(`${ids}-plan`) } : undefined} />;
  const topUpCard = account && topUpStatus && <PaymentStatusCard locale={locale} status={topUpStatus} settings={settings} phone={account.phone} heading={statusOnly && !showForm ? "h2" : "h3"} />;
  if (statusOnly && !showForm) return <>{accountPanel}<Step id="report">{paymentStatus}{topUpCard}</Step></>;
  if (!plan || !payNetwork) return <>{accountPanel}{paymentStatus}{topUpCard}<p>{m.text(plan ? "account.unavailable" : "subscribe.noPlans")}</p>{footer}</>;
  const wallet = wallets[payNetwork], number = settings[payNetwork === "mtn" ? "mtnNumber" : "airtelNumber"]!;
  // Submitting opens only when every required detail is present and valid; the first gap is said under the button.
  // When attached, the screenshot's readable ID must agree with the entered transaction ID.
  const claimedId = parseTransactionId(draft.transactionId), shotId = shot?.transactionId ?? null;
  const paidAmounts = [messageAmount, shot?.amount ?? null].filter((amount): amount is number => amount !== null);
  const shortAmount = paidAmounts.length && due !== null && Math.min(...paidAmounts) < due ? Math.min(...paidAmounts) : null;
  // A short amount that is exactly another plan's price offers that plan, or for a top-up offers adding what was paid;
  // the chosen plan or amount never changes by itself.
  const paidPlan = shortAmount === null || topUp ? undefined : plans.find((item) => item.priceUgx === shortAmount);
  const paidTopUp = topUp && validTopUp(shortAmount) ? shortAmount : null;
  const evidenceBlocker: Readonly<{ text: string; warning: boolean; switchTo?: SubscriptionPlanView; useAmount?: number }> | null
    = topUp && topUpUgx === null ? { text: amountInvalid, warning: false }
    : !validMobilePhone(draft.payerPhone) ? { text: m.text("subscribe.needPayer"), warning: false }
    : shotState ? { text: m.text("subscribe.waitReading"), warning: false }
    : image && !shotFound?.unreadable && (!shotId || shot?.amount === null || shot?.amount === undefined) ? { text: m.text("subscribe.unclearScreenshot"), warning: true }
    : !claimedId ? { text: m.text(shotFound?.unreadable && !draft.transactionId ? "subscribe.enterTransaction" : "subscribe.transactionRequired"), warning: true }
    : shotId && !sameTransactionId(claimedId, shotId) ? { text: m.text("subscribe.idMismatch", { id: shotId }), warning: true }
    : shortAmount !== null && topUp ? { text: m.text("credit.amountShort", { amount: m.number(shortAmount), price: m.number(due ?? 0) }), warning: true,
      ...(paidTopUp === null ? {} : { useAmount: paidTopUp }) }
    : shortAmount !== null ? { text: m.text("subscribe.amountShort", { amount: m.number(shortAmount), price: m.number(plan.priceUgx),
      plan: m.plural("paywall.days", plan.durationDays) }), warning: true, ...(paidPlan ? { switchTo: paidPlan } : {}) }
    : null;
  const blocker: typeof evidenceBlocker = evidenceBlocker ?? (!topUp && !view?.acceptedTerms && !draft.accepted ? { text: m.text("subscribe.needAssent"), warning: false } : null);
  const formBlocker = topUp ? blocker : evidenceBlocker;
  const name = settings[payNetwork === "mtn" ? "mtnName" : "airtelName"];
  const backToStatus = statusOnly && showForm && <RowButton type="button" variant="quiet" disabled={busy} onClick={() => toggleReportForm()} data-payment-back>
    <ChevronLeftIcon />{m.text("subscribe.backToPaymentStatus")}
  </RowButton>;
  const transfer = <PaymentTransfer>
    {networks.length > 1 ? <WalletChoices><VisuallyHidden as="legend">{m.text("subscribe.network")}</VisuallyHidden>{networks.map((network) => <WalletChoice key={network}>
      <input type="radio" name={`${ids}-wallet`} value={network} checked={payNetwork === network} disabled={busy} onChange={() => changePayment({ network })} />
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
  </PaymentTransfer>;
  const otherWallets = <noscript>{networks.filter((network) => network !== payNetwork).map((network) => <p key={network}>{wallets[network].name}: {localUgandaPhone(settings[network === "mtn" ? "mtnNumber" : "airtelNumber"]!)} · {settings[network === "mtn" ? "mtnName" : "airtelName"]}</p>)}</noscript>;
  const paymentForm = showForm && <ReportForm id={`${ids}-form`} onSubmit={submit} data-analytics-ignore $paired={topUp}>
    <PhoneInput label={m.text(topUp ? "subscribe.payer" : "subscribe.wizard.payer")} value={draft.payerPhone} required hint={false} disabled={busy}
      onValueChange={(value) => update({ payerPhone: value })} />
    {/* No maxLength: a keyboard's clipboard suggestion inserts a whole SMS as typing, and the browser would cut it short. */}
    <TextInput id={`${ids}-transaction`} label={m.text("subscribe.transactionId")} placeholder={m.text(topUp ? "subscribe.transactionHint" : "subscribe.wizard.transactionHint")} value={draft.transactionId}
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
      <FileChoices><FileBox><ImageIcon /><span id={`${ids}-shot`}>{m.text(topUp ? image ? "subscribe.changeScreenshot" : "subscribe.chooseScreenshot" : image ? "subscribe.wizard.replace" : "subscribe.wizard.upload")}</span>
        <input type="file" accept="image/*" disabled={busy} aria-labelledby={`${ids}-shot`} aria-describedby={`${ids}-shot-hint`}
          onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox>
      <FileBox><ImageIcon /><span id={`${ids}-camera`}>{m.text("subscribe.takePhoto")}</span>
        <input type="file" accept="image/*" capture="environment" disabled={busy} aria-labelledby={`${ids}-camera`} aria-describedby={`${ids}-shot-hint`}
          onChange={(event) => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></FileBox></FileChoices>
      <VisuallyHidden id={`${ids}-shot-hint`}>{m.text("subscribe.imageHint")}</VisuallyHidden>
      {shotState ? <ReadingProgress locale={locale} state={shotState} compact={!topUp} />
        : shotFound?.unreadable ? <Note data-screenshot-note>{m.text("subscribe.screenshotUnreadable")}</Note>
          : shotFound && <div data-screenshot-note><EvidenceFindings locale={locale} evidence={shotFound.evidence} target={target} replaced={shotFound.replaced}
            showId={shotFound.idCurrent} networkName={networkName(shotFound.evidence)} needAmount /></div>}
      {image && (topUp ? <><Preview src={preview} alt={m.text("subscribe.preview")} />
        <RowButton type="button" variant="quiet" disabled={busy} onClick={removeScreenshot}>{m.text("subscribe.removeScreenshot")}</RowButton></>
        : <WizardScreenshot><a href={preview} target="_blank" rel="noopener" aria-label={m.text("subscribe.wizard.viewScreenshot")}><Preview src={preview} alt={m.text("subscribe.preview")} /></a>
          <Button type="button" variant="secondary" disabled={busy} onClick={removeScreenshot}>{m.text("subscribe.wizard.remove")}</Button></WizardScreenshot>)}
    </FileField>
    {/* Plan terms belong to review; a top-up keeps its existing submit-time consent. */}
    {topUp && !view?.acceptedTerms && <Note data-payment-consent>{m.text("subscribe.consent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</Note>}
    {topUp && <VisuallyHidden role="status">{announcement}</VisuallyHidden>}
    {topUp ? <Submit ref={submitButton} type="submit" disabled={busy || !restored || !draft.network} aria-disabled={formBlocker ? true : undefined} aria-describedby={formBlocker ? `${ids}-blocker` : undefined}>
      {m.text(busy ? "subscribe.sending" : "subscribe.report")}<ChevronRightIcon /></Submit>
      : <WizardActions><Button type="button" variant="secondary" disabled={busy} onClick={() => goToStep(1)}><ChevronLeftIcon />{m.text("subscribe.wizard.back")}</Button>
        <Submit ref={submitButton} type="submit" disabled={busy || !restored} aria-disabled={formBlocker ? true : undefined} aria-describedby={formBlocker ? `${ids}-blocker` : undefined}>
          {m.text("subscribe.wizard.review")}<ChevronRightIcon /></Submit></WizardActions>}
    {formBlocker && <SubmitNote id={`${ids}-blocker`} $warning={formBlocker.warning} data-submit-blocker>{formBlocker.text}
      {formBlocker.switchTo && <> <PlanSwitch type="button" variant="quiet" data-plan-switch
        onClick={() => { update({ planId: formBlocker.switchTo!.id }); setTimeout(() => submitButton.current?.focus(), 0); }}>
        {m.text("subscribe.switchPlan", { plan: m.plural("paywall.days", formBlocker.switchTo.durationDays) })}</PlanSwitch></>}
      {formBlocker.useAmount !== undefined && <> <PlanSwitch type="button" variant="quiet" data-topup-switch
        onClick={() => { update({ topUpAmount: String(formBlocker.useAmount) }); setTimeout(() => submitButton.current?.focus(), 0); }}>
        {m.text("credit.useAmount", { amount: m.number(formBlocker.useAmount) })}</PlanSwitch></>}</SubmitNote>}
    {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
  </ReportForm>;
  const confirmation = topUp && canConfirm && showForm && <CriteriaDialog id={`${ids}-confirm`} title={m.text("subscribe.confirmTitle")} open={confirming} onCancel={() => setConfirming(false)} onApply={() => void send()}
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
  </CriteriaDialog>;
  const noScript = <noscript><p>{m.text("subscribe.noJavaScript")}</p></noscript>;
  // Adding credit: the title with the member's credit, then three numbered steps. Choosing a plan from here means going back
  // to the plan page, and the money-menu link and payment note stay with plan payments.
  if (topUp) return <>
    {accountPanel}
    {backToStatus}
    <TopUpHeader id="plans" aria-labelledby={`${ids}-plan`}>
      <h2 id={`${ids}-plan`} tabIndex={-1}>{m.text("credit.addTitle")}</h2>
      {view?.credit && <p data-credit-balance>{m.text("credit.yourCredit")} <strong>UGX {m.number(view.credit.balanceUgx)}</strong></p>}
    </TopUpHeader>
    {!statusOnly && paymentStatus}{topUpCard}
    <StepRail data-subscribe-layout="plain-steps">
      <RailStep><RailNumber aria-hidden="true">1</RailNumber><h3>{m.text("credit.stepAmount")}</h3><div>
        <TextInput id={`${ids}-topup`} label={m.text("credit.amount")} inputMode="numeric" autoComplete="off" required disabled={busy} value={draft.topUpAmount}
          hint={m.text("credit.amountHint", { min: m.number(walletRules.topUpMinUgx), max: m.number(walletRules.topUpMaxUgx) })} data-topup-amount
          onChange={(event) => update({ topUpAmount: event.currentTarget.value.replace(/\D/gu, "").slice(0, 6) })} />
      </div></RailStep>
      <RailStep><RailNumber aria-hidden="true">2</RailNumber><h3>{m.text("credit.stepSend")}</h3><div>{transfer}{otherWallets}</div></RailStep>
      <RailStep id="report"><RailNumber aria-hidden="true">3</RailNumber><h3>{m.text("credit.stepConfirm")}</h3><div>
        {paymentForm}{confirmation}{noScript}
        {error && <p role="alert">{error}</p>}
      </div></RailStep>
    </StepRail>
    {footer}
  </>;
  if (!account) return <>{accountPanel}{noScript}</>;
  const edit = (next: PaymentStep, field: string) => <WizardEdit type="button" variant="quiet" disabled={busy} onClick={() => goToStep(next)}
    aria-label={m.text("subscribe.wizard.editField", { field })}>{m.text("subscribe.wizard.edit")}</WizardEdit>;
  const titles = ["subscribe.wizard.choosePackage", "subscribe.wizard.chooseMethod", "subscribe.wizard.addProof", "subscribe.wizard.check"] as const;
  return <>
    {accountPanel}
    {backToStatus}
    {!statusOnly && paymentStatus}{topUpCard}
    <PaymentWizard locale={locale} step={step} title={m.text(titles[step])} headingRef={stepHeading}>
      <VisuallyHidden role="status">{announcement}</VisuallyHidden>
      {step === 0 && <>
        <WizardPlans aria-label={m.text("subscribe.wizard.choosePackage")} $columns={1} id="plans">{plans.map((item) => <Plan key={item.id}>
          <input type="radio" name="plan" value={item.id} checked={draft.planId === item.id} disabled={busy} onChange={() => changePayment({ planId: item.id })} />
          <PlanName>{m.plural("paywall.days", item.durationDays)}</PlanName><PlanPrice><small>UGX</small> <span>{m.number(item.priceUgx)}</span></PlanPrice>
        </Plan>)}</WizardPlans>
        <WizardActions><Button type="button" disabled={busy || !restored} onClick={() => goToStep(1)}>{m.text("subscribe.wizard.continue")}<ChevronRightIcon /></Button></WizardActions>
        {noScript}
      </>}
      {step === 1 && <>
        <WizardMethod>{transfer}
          {shortcut && menu && <MenuLink variant="quiet" data-analytics-ignore href={`tel:${shortcut.replaceAll("#", "%23")}`} onClick={() => update({ network: payNetwork })}><DialpadIcon />{m.text(wallet.menu)}</MenuLink>}
          {settings.paymentNote && <Note>{settings.paymentNote}</Note>}
        </WizardMethod>
        {!waiting && <MenuLink variant="quiet" href={`/${resolveLocale(locale)}/subscribe?${new URLSearchParams({ add: "credit", ...(returnTo ? { return: returnTo } : {}) })}#plans`}
          prefetch={false} data-credit-mode="plan">{m.text("credit.addInstead")}</MenuLink>}
      </>}
      {methodVisited && view?.credit && <div key="account-credit" hidden={step !== 1}><CreditPurchase locale={locale} credit={view.credit} plan={plan} acceptedTerms={!!view.acceptedTerms} accepted={draft.accepted} disabled={busy}
          retryKey={{ get: () => creditRequestKey.current ??= crypto.randomUUID(), clear: () => { creditRequestKey.current = null; } }}
          onAccept={(accepted) => update({ accepted })} /></div>}
      {step === 1 && <WizardActions><Button type="button" variant="secondary" disabled={busy} onClick={() => goToStep(0)}><ChevronLeftIcon />{m.text("subscribe.wizard.back")}</Button>
          <Button type="button" disabled={busy || !restored} onClick={() => goToStep(2)}>{m.text("subscribe.wizard.paid")}<ChevronRightIcon /></Button></WizardActions>}
      {step === 2 && paymentForm}
      {step === 3 && <ReportForm id={`${ids}-review`} onSubmit={submit} data-analytics-ignore data-payment-review>
        <WizardReceipt><div><span>{m.plural("paywall.days", plan.durationDays)}</span>{edit(0, m.text("subscribe.planLabel"))}</div><strong>UGX {m.number(plan.priceUgx)}</strong></WizardReceipt>
        <WizardReview data-payment-confirmation>
          <div><dt>{m.text("subscribe.confirmPaidTo")}</dt><dd><WizardPayee><strong>{wallet.name}</strong><span>{localUgandaPhone(number)}</span>{name && <small>{name}</small>}</WizardPayee>{edit(1, m.text("subscribe.network"))}</dd></div>
          <div><dt>{m.text("subscribe.confirmPaidFrom")}</dt><dd>{formatPhone(validMobilePhone(draft.payerPhone) ?? draft.payerPhone)}{edit(2, m.text("subscribe.confirmPaidFrom"))}</dd></div>
          <div><dt>{m.text("subscribe.transactionId")}</dt><dd>{claimedId}{edit(2, m.text("subscribe.transactionId"))}</dd></div>
          {image && <div><dt>{m.text("subscribe.confirmScreenshot")}</dt><dd><a href={preview} target="_blank" rel="noopener" aria-label={m.text("subscribe.wizard.viewScreenshot")}><ConfirmPreview src={preview} alt={m.text("subscribe.preview")} /></a>{edit(2, m.text("subscribe.confirmScreenshot"))}</dd></div>}
        </WizardReview>
        <WizardConfirm><input type="checkbox" required checked={paymentConfirmed} disabled={busy} onChange={(event) => setConfirmationKey(event.currentTarget.checked ? paymentIdentity : null)} data-payment-confirm />
          <span>{m.text("subscribe.wizard.confirm")}</span></WizardConfirm>
        {!view?.acceptedTerms && <Assent><input type="checkbox" required disabled={busy} checked={draft.accepted} onChange={(event) => update({ accepted: event.currentTarget.checked })} /><span>{m.text("subscribe.assent")}{" "}<Link href="/en/terms">{m.text("account.terms")}</Link>.</span></Assent>}
        <WizardNotice>{m.text("subscribe.wizard.approval")}</WizardNotice>
        <WizardActions><Button type="button" variant="secondary" disabled={busy} onClick={() => goToStep(2)}><ChevronLeftIcon />{m.text("subscribe.wizard.back")}</Button>
          <Submit ref={submitButton} type="submit" disabled={busy || !restored} aria-disabled={blocker || !paymentConfirmed ? true : undefined}>
            {m.text(busy ? "subscribe.sending" : "subscribe.wizard.submit")}<ChevronRightIcon /></Submit></WizardActions>
        {percentage !== null && <div role="status"><progress max={100} value={percentage} aria-label={m.text("subscribe.uploadProgress")} /><span> {percentage}%</span></div>}
      </ReportForm>}
      {error && <p role="alert">{error}</p>}
    </PaymentWizard>
    {step > 0 && <WizardFooter>{footer}</WizardFooter>}
  </>;
}
