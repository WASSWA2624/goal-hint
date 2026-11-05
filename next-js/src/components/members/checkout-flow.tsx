"use client";

import { AppLoading } from "@/components/navigation/navigation-progress";
import { backToWorkflowStep, workflowPage, workflowStep, writeWorkflowStep } from "@/components/navigation/workflow-history";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Button, InputControl } from "@/components/ui/controls";
import { FloatingField } from "@/components/ui/floating-field";
import { AmountInput } from "@/components/ui/amount-input";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { randomId } from "@/components/ui/random-id";
import { CardIcon, CheckIcon, ClipboardIcon, CloseIcon, CopyIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { checkoutLabels, checkoutMethodAvailable, checkoutOpenStatuses, duplicateReceiptMessage, fundingAmounts, type CheckoutEvidenceCheck, type CheckoutQuote, type CheckoutRequest, type CheckoutSelection, type CheckoutView } from "@/domain/checkout";
import type { ScreenshotMetadata } from "@/domain/payment-screenshot";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { PublicSubscriptionSettings } from "@/domain/public-subscription-settings";
import { manualPaymentProvider } from "@/domain/subscription-settings";
import { paymentEvidence } from "@/domain/payment-sms";
import { checkoutDetailsIssue, checkoutEvidenceWarnings, inspectPaymentMessage, type PaymentEvidenceWarning as EvidenceWarning } from "@/domain/checkout-evidence";
import { paymentEvidenceDate } from "@/domain/payment-evidence-date";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { validMobilePhone } from "@/domain/phone-mobile";
import { normalizeTransactionId } from "@/domain/payment";
import { localUgandaPhone } from "@/domain/phone";
import { formatNationalPhone, splitPhoneValue } from "@/domain/phone-countries";
import { refreshMemberSession } from "./member-session";
import { PaymentWizard, WizardActions, WizardNotice, WizardReview } from "./payment-wizard";
import { PackageSelection } from "./package-selection";
import { CheckoutActions, CheckoutChoices, CheckoutDialog, CheckoutFundingFields, CheckoutFundingInput, CheckoutMessage, CheckoutPanel, CheckoutPayee, CheckoutPaySummary, CheckoutProviderMark, CheckoutSupport, FundingBreakdown } from "./checkout-parts";
import { PaymentScreenshot, screenshotDigest } from "./payment-screenshot";
import { PaymentImagePreview } from "./payment-image-preview";
import { PaymentEvidenceWarning } from "./payment-evidence-warning";
import { sendCheckout as send } from "./checkout-client";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { capCheckoutFunding, chooseCheckoutMethod, chooseCheckoutPackage, loadCheckoutDraft, restoredCheckoutStep, saveCheckoutDraft, type CheckoutDraft } from "./checkout-draft";
import { CheckoutReferralChoice } from "./checkout-referral-choice";
import { clearProtectedDrafts } from "./draft-storage";

const emptyView: CheckoutView = { availableWalletUgx: 0, availableReferralDays: 0, lastMethod: null, requests: [] };
const methodNames = { mtn: "MTN Mobile Money", airtel: "Airtel Money", wallet: "Wallet balance", referral: "Referral days" };
type DisplayedQuote = { selectionKey: string; quote: CheckoutQuote };
const localDate = (date = new Date()) => new Date(+date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
function formatReviewPhone(value: string) {
  const parts = splitPhoneValue(value);
  return `+${parts.callingCode} ${formatNationalPhone(parts)}`.trim();
}

export function CheckoutFlow({ locale, settings, plans, account, initialView, topUp = false, noticeBeforeCheckout }: {
  locale: string; settings: PublicSubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string; draftScope?: string }; initialView: CheckoutView; topUp?: boolean;
  noticeBeforeCheckout?: ReactNode;
}) {
  const router = useRouter(), [view, setView] = useState(initialView ?? emptyView);
  const initial = (): CheckoutDraft => ({ requestKey: "", step: 0, purpose: topUp ? "topup" : "plan", planId: plans[0]?.id ?? "",
    method: "", usePackage: true, useWallet: false, useReferral: false, walletUgx: "0", referralDays: "0", topUpUgx: "", transactionId: "", amountUgx: "", payerPhone: account.phone,
    paidAt: localDate(), text: "", extracted: {}, originalText: "", accepted: false, attachingId: null });
  const [draft, setDraft] = useState(initial), [image, setImage] = useState<Blob | null>(null), [loaded, setLoaded] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [finishedQuote, setFinishedQuote] = useState<string>();
  const [reading, setReading] = useState("");
  const [notice, setNotice] = useState<{ title: string; message: string; confirm?: () => void; confirmLabel?: string; cancelLabel?: string } | null>(null);
  const [readingActive, setReadingActive] = useState(false);
  const [warningDialog, setWarningDialog] = useState<{ warnings: EvidenceWarning[]; key: string; continue?: () => void } | null>(null);
  const [warningsAccepted, setWarningsAccepted] = useState(""), autoWarningKey = useRef("");
  const [showNew, setShowNew] = useState(false), submitting = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const [quoteEpoch, setQuoteEpoch] = useState(0), lastQuoteKey = useRef<string | null>(null);
  const payQuote = useRef<DisplayedQuote | null>(null);
  const evidenceId = useId(), messageInput = useRef<HTMLTextAreaElement>(null);
  const scope = account.draftScope ?? account.id, kind = topUp ? "topup" : "plan";
  const page = useRef("");
  const selectedPlanPrice = plans.find(plan => plan.id === draft.planId)?.priceUgx ?? 0;
  const walletMaximum = Math.min(view.availableWalletUgx, selectedPlanPrice);
  const networkAvailable = (method: string) => checkoutMethodAvailable(method, view, settings);
  // Old referral-only drafts must select a package when returning to the simplified first step.
  const packageSelection = (value: CheckoutDraft) => value.step === 0 && !topUp && !value.attachingId
    ? chooseCheckoutPackage(value, true, view, plans) : value;
  function validStep(target: CheckoutDraft["step"], value: CheckoutDraft, screenshot: Blob | null) {
    const attaching = !!value.attachingId && view.requests.some(r => r.id === value.attachingId &&
      (checkoutOpenStatuses as readonly string[]).includes(r.status));
    if (value.attachingId && !attaching) return 0;
    return restoredCheckoutStep(target, {
      validPackage: attaching || value.purpose !== "plan" || plans.some(plan => plan.id === value.planId),
      methodAvailable: attaching || !!value.method && networkAvailable(value.method),
      external: attaching || value.method === "mtn" || value.method === "airtel",
      evidencePresent: !!screenshot || !!value.text.trim(),
    });
  }
  const restore = useEffectEvent(() => {
    page.current = workflowPage(window.location.href);
    const start = { ...initial(), requestKey: randomId() };
    const stored = loadCheckoutDraft(scope, kind, start);
    let restored = start;
    if (stored) {
      const previous = capCheckoutFunding({ ...stored.draft, accepted: false }, view, plans);
      const target = workflowStep(window.history.state, previous.requestKey, page.current) ?? previous.step;
      const step = validStep(target, previous, stored.image);
      if (step === 0 && (previous.attachingId || !plans.some(plan => plan.id === previous.planId) && previous.purpose === "plan")) {
        setImage(null);
      } else {
        restored = { ...previous, step, ...(previous.method && !networkAvailable(previous.method) && !previous.attachingId ? { method: "" as const } : {}) };
        setImage(stored.image);
      }
    } else {
      const method = view.lastMethod;
      if (method && Object.hasOwn(methodNames, method) && networkAvailable(method) && (!topUp || method === "mtn" || method === "airtel")) {
        restored = chooseCheckoutMethod(start, method as CheckoutSelection["method"], true, view, plans);
      }
    }
    writeWorkflowStep(restored.requestKey, restored.step, "replace");
    setDraft(packageSelection(restored));
    setLoaded(true);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => restore());
    return () => { cancelAnimationFrame(frame); page.current = ""; };
  }, [scope, kind]);
  useEffect(() => { if (loaded) saveCheckoutDraft(scope, kind, { draft, image }); }, [scope, kind, loaded, draft, image]);
  const restoreEntry = useEffectEvent((event: PopStateEvent) => {
    if (!loaded || page.current !== workflowPage(window.location.href)) return;
    const entryStep = workflowStep(event.state, draft.requestKey, page.current);
    const target = entryStep ?? 0;
    const step = validStep(target, draft, image);
    if (step === 0 && draft.attachingId) { setShowNew(false); resetCheckout(); }
    else {
      if (target !== step || entryStep === null) writeWorkflowStep(draft.requestKey, step, "replace");
      setDraft(current => packageSelection({ ...current, step, accepted: false }));
    }
    setWarningDialog(null); setNotice(null); setError("");
  });
  useEffect(() => {
    const onPop = (event: PopStateEvent) => restoreEntry(event);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  async function refresh() {
    const response = await fetch("/api/account/checkout", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Status could not refresh. Your request is kept.");
    const next: CheckoutView = await response.json(); setView(next); setDraft(current => capCheckoutFunding(current, next, plans));
    if (next.requests.some(r => r.status === "approved")) { void refreshMemberSession(); router.refresh(); }
    return next;
  }
  useEffect(() => {
    let alive = true;
    const update = () => { if (document.visibilityState === "visible") void fetch("/api/account/checkout", { cache: "no-store" }).then(async r => {
      if (!alive) return;
      if (r.status === 401 || r.status === 403) { clearProtectedDrafts(); void refreshMemberSession(); router.refresh(); return; }
      if (!r.ok) return; const next: CheckoutView = await r.json();
      if (alive) { setView(next); setDraft(current => capCheckoutFunding(current, next, plans)); void refreshMemberSession(); }
    }).catch(() => {}); };
    const timer = setInterval(update, 20_000); window.addEventListener("focus", update); window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("online", update); document.removeEventListener("visibilitychange", update); };
  }, [plans, router]);
  const update = (values: Partial<CheckoutDraft>) => { setDraft(d => capCheckoutFunding(packageSelection({ ...d, ...values, accepted: values.accepted ?? false }), view, plans)); setError(""); };
  function goTo(step: CheckoutDraft["step"], mode: "push" | "replace" = "push") {
    if (page.current !== workflowPage(window.location.href)) return;
    writeWorkflowStep(draft.requestKey, step, mode);
    update({ step });
  }
  function goBack(step: CheckoutDraft["step"]) {
    if (!backToWorkflowStep(draft.requestKey, step)) goTo(step, "replace");
  }
  function resetCheckout() {
    const start = { ...initial(), requestKey: randomId() };
    if (page.current === workflowPage(window.location.href)) writeWorkflowStep(start.requestKey, 0, "replace");
    setDraft(start); setImage(null); setQuote(null);
  }
  const chooseMethod = (method: CheckoutSelection["method"], selected: boolean) => {
    setDraft(current => chooseCheckoutMethod(current, method, selected, view, plans)); setError("");
  };
  const selection = (): CheckoutSelection => ({ purpose: draft.purpose, planId: draft.purpose === "plan" ? draft.planId : null,
    method: draft.method as CheckoutSelection["method"], walletUgx: Number(draft.walletUgx), referralDays: Number(draft.referralDays), topUpUgx: Number(draft.topUpUgx) });
  const selectionKey = JSON.stringify(selection());
  const reviewQuoteKey = loaded && draft.step >= 2 && !draft.attachingId ? `${quoteEpoch}:${draft.step}:${selectionKey}` : null;
  useEffect(() => {
    const retry = () => setQuoteEpoch(epoch => epoch + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    if (!reviewQuoteKey) return;
    let alive = true;
    void send<CheckoutQuote>({ action: "quote", selection: JSON.parse(selectionKey) }).then(value => { if (alive) {
      if (lastQuoteKey.current && lastQuoteKey.current !== value.quoteKey) {
        setDraft(d => ({ ...d, accepted: false })); setError("Funding changed. Check the updated summary and confirm again.");
      }
      lastQuoteKey.current = value.quoteKey; setQuote(value);
    } })
      .catch(e => { if (alive) { setQuote(null); setError(e.message); } })
      .finally(() => { if (alive) setFinishedQuote(reviewQuoteKey); });
    return () => { alive = false; };
  }, [reviewQuoteKey, selectionKey]);
  useEffect(() => { if (loaded) heading.current?.focus({ preventScroll: true }); }, [loaded, draft.step]);
  async function next() {
    setError("");
    if (draft.step === 0) {
      if (!topUp && !plans.some(plan => plan.id === draft.planId)) {
        setError("Choose an available package to continue."); return;
      }
      goTo(1); return;
    }
    if (!draft.method) { setError(draft.useWallet ? `Choose MTN or Airtel to pay the remaining ${formatUgx(selectedPlanPrice - Number(draft.walletUgx))}.` : "Choose a payment method."); return; }
    if (draft.purpose === "referral" && Number(draft.referralDays) < 1) { setError("Choose at least one available referral day."); return; }
    setBusy(true);
    try {
      const value = await send<CheckoutQuote>({ action: "quote", selection: selection() });
      if (workflowStep(window.history.state, draft.requestKey, page.current) !== 1) return;
      const shown = payQuote.current?.selectionKey === selectionKey ? payQuote.current.quote : null;
      if (value.recipient && (!shown || shown.recipient !== value.recipient || shown.recipientName !== value.recipientName
        || shown.amountToSend !== value.amountToSend || shown.priceUgx !== value.priceUgx || shown.durationDays !== value.durationDays)) {
        setQuoteEpoch(epoch => epoch + 1);
        setError(shown ? "Transfer details changed. Review the updated details. If you already paid, contact support before sending money again."
          : "Review the confirmed transfer details before continuing.");
        return;
      }
      lastQuoteKey.current = value.quoteKey; setQuote(value); goTo(value.amountToSend > 0 ? 2 : 3);
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const attaching = view.requests.find(r => r.id === draft.attachingId);
  const external = !!attaching || ["mtn", "airtel"].includes(draft.method);
  const receiptProvider = (attaching?.method ?? draft.method) === "airtel" ? "airtel" : "mtn";
  const screenshotReady = !!image && draft.screenshot?.version === 1;
  const numbers = useMemo(() => ({ mtn: settings.mtnNumber, airtel: settings.airtelNumber,
    ...(quote?.method === receiptProvider && quote.recipient ? { [receiptProvider]: quote.recipient } : {}) }),
  [settings.mtnNumber, settings.airtelNumber, quote?.method, quote?.recipient, receiptProvider]);
  const screenshotText = image && typeof draft.extracted.screenshotText === "string" ? draft.extracted.screenshotText : "";
  const hasImage = !!image;
  const warnings = useMemo(() => external ? checkoutEvidenceWarnings({ text: draft.text, screenshotText, hasImage,
    transactionId: draft.transactionId, amountUgx: draft.amountUgx }, receiptProvider, numbers) : [],
  [external, draft.text, screenshotText, hasImage, draft.transactionId, draft.amountUgx, receiptProvider, numbers]);
  const warningKey = JSON.stringify([draft.requestKey, receiptProvider, numbers, draft.text, screenshotText, draft.screenshot?.imageSha256, draft.transactionId, draft.amountUgx]);
  const sourceKey = JSON.stringify([draft.requestKey, receiptProvider, numbers, draft.originalText, screenshotText, hasImage]);
  useEffect(() => {
    if (!loaded || draft.step !== 2 || !external || busy || readingActive || error || notice || warningDialog || draft.text !== draft.originalText) return;
    // Missing branding alone needs one confirmation at Next, rather than interrupting evidence entry.
    if (!warnings.some(warning => !warning.id.endsWith(".unknown-provider")) || warningsAccepted === warningKey) { autoWarningKey.current = sourceKey; return; }
    if (autoWarningKey.current === sourceKey) return;
    const timer = setTimeout(() => { autoWarningKey.current = sourceKey; setWarningDialog({ warnings, key: warningKey }); }, 0);
    return () => clearTimeout(timer);
  }, [loaded, draft.step, external, busy, readingActive, error, notice, warningDialog, draft.text, draft.originalText, warnings, warningsAccepted, warningKey, sourceKey]);
  const effectiveQuote = attaching ? { ...attaching, purpose: attaching.purpose as CheckoutQuote["purpose"] } : quote;
  function acknowledgeWarnings(action: () => void, acceptedKey = warningsAccepted) {
    if (!warnings.length || acceptedKey === warningKey) return false;
    autoWarningKey.current = sourceKey;
    setWarningDialog({ warnings, key: warningKey, continue: action });
    return true;
  }
  function detailsIssue() {
    return external ? checkoutDetailsIssue({ ...draft, screenshotText, hasImage, screenshotReady }) : null;
  }
  function review(event: FormEvent) {
    event.preventDefault();
    if (busy || readingActive) return;
    const issue = detailsIssue();
    if (issue) { setError(issue); return; }
    if (acknowledgeWarnings(() => goTo(3))) return;
    goTo(3);
  }
  async function submit(event?: FormEvent, adjustmentAccepted = false, reuseAccepted = false, acceptedWarningKey = warningsAccepted) {
    event?.preventDefault(); if (submitting.current || readingActive) return;
    if (draft.step !== 3) return;
    if (!draft.accepted) { setError("Check the details and confirm the purchase terms."); return; }
    const issue = detailsIssue();
    if (issue) { goTo(2, "replace"); setError(issue); return; }
    if (acknowledgeWarnings(() => { void submit(undefined, adjustmentAccepted, reuseAccepted, warningKey); }, acceptedWarningKey)) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      if (external) {
        const imageSha256 = image ? await screenshotDigest(image) : null;
        if (image && imageSha256 !== draft.screenshot?.imageSha256) throw new Error("This screenshot has changed. Recheck it before submitting.");
        const check = await send<CheckoutEvidenceCheck>({ action: "check-evidence", evidence: { provider: receiptProvider, transactionId: draft.transactionId,
          submissionId: attaching?.id ?? null, imageSha256 } });
        if (check.reuse === "own") throw new Error(`This transaction is already linked to your request ${check.reference ?? ""}. Use the existing request; it cannot be credited twice.`);
        if (!reuseAccepted && (check.reuse === "reported" || check.imageRepeated)) {
          setNotice({ title: "Payment already reported", message: "This payment or screenshot has already been reported and cannot be credited twice. Review the details, or submit an ownership claim if this is your payment. The admin will check it before any allocation.",
            cancelLabel: "Review details", confirmLabel: "Submit for review", confirm: () => { void submit(undefined, adjustmentAccepted, true, acceptedWarningKey); } }); return;
        }
      }
      if (external && effectiveQuote && !adjustmentAccepted) {
        const difference = Number(draft.amountUgx) + (attaching?.verifiedUgx ?? 0) - effectiveQuote.amountToSend;
        if (difference !== 0) {
          setNotice({ title: difference > 0 ? "Extra payment" : "Remaining payment", cancelLabel: "Review amount",
            confirm: () => { void submit(undefined, true, reuseAccepted, acceptedWarningKey); },
            message: difference > 0 ? `If confirmed, ${formatUgx(difference)} extra will be added to your wallet.`
              : `If confirmed, ${formatUgx(-difference)} will remain. Your request stays open until the full payment is verified.` }); return;
        }
      }
      const evidenceDate = paymentEvidenceDate(draft.text) ?? paymentEvidenceDate(screenshotText);
      const proof = external ? { transactionId: draft.transactionId, amountUgx: Number(draft.amountUgx), payerPhone: draft.payerPhone,
        warningsAccepted: !warnings.length || acceptedWarningKey === warningKey, paidAt: evidenceDate ?? new Date().toISOString(), original: { text: draft.text.trim(),
          extracted: { ...draft.extracted, paymentDateSource: evidenceDate ? "evidence" : "submission" } } } : undefined;
      const q = attaching ? null : await send<CheckoutQuote>({ action: "quote", selection: selection() });
      if (q && (!quote || q.quoteKey !== quote.quoteKey)) { setQuote(q); update({ accepted: false }); throw new Error("Funding changed. Check the updated summary and confirm again."); }
      const saved = await send<CheckoutRequest>(attaching ? { action: "attach", id: attaching.id, proof }
        : { action: "confirm", selection: selection(), requestKey: draft.requestKey, quoteKey: q!.quoteKey, confirmed: true, ...(proof ? { proof } : {}) }, external ? image : null);
      setView(current => ({ ...current, requests: [saved, ...current.requests.filter(request => request.id !== saved.id)] }));
      setShowNew(false); resetCheckout();
      await refresh();
      if (saved.receipts.some(r => r.disputed)) setError(duplicateReceiptMessage);
    } catch (e) { setError((e as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  function extract(text: string, fromScreenshot = false, screenshot?: ScreenshotMetadata) {
    const evidence = paymentEvidence(text, { mtn: settings.mtnNumber, airtel: settings.airtelNumber });
    const sender = /\b(?:from|sender)\s*[:=]?\s*(\+?\d[\d -]{7,18})/iu.exec(text)?.[1];
    const foundDate = paymentEvidenceDate(text), paidAt = foundDate ? localDate(new Date(foundDate)) : null;
    const extracted = { transactionId: evidence.transactionId, amountUgx: evidence.amount, payerPhone: sender ? validMobilePhone(sender) : null, paidAt };
    update({ ...(fromScreenshot ? {} : { text, originalText: text }), ...(screenshot ? { screenshot } : {}),
      extracted: { ...draft.extracted, ...extracted, ...(fromScreenshot ? { screenshotText: text } : {}) }, ...(evidence.transactionId ? { transactionId: evidence.transactionId } : {}),
      ...(evidence.amount !== null ? { amountUgx: String(evidence.amount) } : {}), ...(extracted.payerPhone ? { payerPhone: extracted.payerPhone } : {}), ...(paidAt ? { paidAt } : {}) });
    setReading(evidence.transactionId || evidence.amount ? "Details extracted. Check and correct every field below." : "");
    if (!evidence.transactionId && !evidence.amount) setError("We couldn’t find transaction details in this message. Paste the complete payment message, or check and enter its transaction details below.");
  }
  function pasteTransactionMessage(text: string) {
    const checked = inspectPaymentMessage(text);
    if (!checked.ok) { setError(checked.message); return; }
    extract(text);
  }
  async function pasteMessage() {
    let text: string;
    try { text = await navigator.clipboard.readText(); }
    catch { messageInput.current?.focus(); setError("Your browser couldn’t read the clipboard. Paste directly into the transaction message field, or add a screenshot."); return; }
    pasteTransactionMessage(text);
  }
  function clearMessage() {
    update({ text: "", originalText: "" }); setReading("");
    requestAnimationFrame(() => messageInput.current?.focus());
  }
  const active = view.requests.filter(r => (checkoutOpenStatuses as readonly string[]).includes(r.status));
  const visibleRequests = view.requests.slice(0, 5);
  const showForm = loaded && (showNew || active.length === 0 || !!attaching);
  const packageStep = !topUp && draft.step === 0;
  const summary = effectiveQuote && <FundingBreakdown quote={effectiveQuote} {...(external && draft.amountUgx !== "" ? { reportedUgx: Number(draft.amountUgx) + (attaching?.verifiedUgx ?? 0) } : {})} />;
  function startReceipt(request: CheckoutRequest) {
    setQuote(null); setShowNew(true); setImage(null);
    const requestKey = randomId();
    writeWorkflowStep(requestKey, 2, "push");
    setDraft({ ...initial(), requestKey, step: 2, purpose: request.purpose as CheckoutDraft["purpose"], planId: request.planId ?? "",
      method: request.method as CheckoutDraft["method"], attachingId: request.id });
  }
  return <>
    {loaded && (!showForm || !packageStep) && noticeBeforeCheckout}
    <AppLoading active={!loaded || busy || readingActive || !!reviewQuoteKey && finishedQuote !== reviewQuoteKey} />
    {warningDialog && <PaymentEvidenceWarning warnings={warningDialog.warnings} onCancel={() => setWarningDialog(null)}
      {...(!attaching ? { onChangeMethod: () => { setWarningDialog(null); goBack(1); } } : {})}
      onContinue={() => { const action = warningDialog.continue; setWarningsAccepted(warningDialog.key); setWarningDialog(null); action?.(); }} />}
    {visibleRequests.map(request => <CheckoutPanel key={request.id} data-checkout-status={request.status}>
      <header role="status"><h2>{checkoutLabels[request.status] ?? request.status}</h2><p>Request ID: <strong>{request.reference}</strong></p></header>
      {request.status === "approved" ? <p>{request.purpose === "topup" ? "Wallet credited." : `Access until ${request.endsAt ? formatPeriodEnd(new Date(request.endsAt)) : "—"} (EAT).`}</p>
        : <><p>{request.planName} · {formatUgx(request.priceUgx)}</p>
          {request.verifiedUgx > 0 && <p>Verified: {formatUgx(request.verifiedUgx)} · Remaining: {formatUgx(request.remainingUgx)}</p>}
          {request.status === "pending" && <p>Your subscription activates after the admin verifies enough incoming funds.</p>}</>}
      {request.status !== "approved" && request.reportedUgx > 0 && request.verifiedUgx === 0 && <p>Amount paid: {formatUgx(request.reportedUgx)}.
        {request.reportedUgx < request.amountToSend ? ` If confirmed, ${formatUgx(request.amountToSend - request.reportedUgx)} remains.`
          : request.reportedUgx > request.amountToSend ? ` If confirmed, ${formatUgx(request.reportedUgx - request.amountToSend)} extra will be added to your wallet.` : " Awaiting verification."}</p>}
      {request.reason && <p>{request.reason}</p>}
      {request.receipts.some(r => r.disputed) && <p>{duplicateReceiptMessage}</p>}
      {request.receipts.length > 0 && <ul>{request.receipts.map(receipt => <li key={receipt.id}>{receipt.transactionId} · amount paid {formatUgx(receipt.amountUgx)} · {receipt.withdrawn ? "evidence withdrawn" : receipt.disputed ? "disputed" : receipt.verified ? "verified" : "awaiting verification"}
        {!receipt.withdrawn && !receipt.verified && (checkoutOpenStatuses as readonly string[]).includes(request.status) && <Button variant="quiet" disabled={busy} onClick={async () => {
          setBusy(true); try { await send({ action: "withdraw", id: request.id, claimId: receipt.id }); await refresh(); }
          catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>Withdraw incorrect evidence</Button>}</li>)}</ul>}
      <CheckoutActions>
        {([...(checkoutOpenStatuses as readonly string[]), "rejected", "cancelled", "superseded"]).includes(request.status) && <>
          {request.reservationUntil && request.status !== "disputed" && <Button variant="secondary" disabled={busy} onClick={() => startReceipt(request)}>Add payment / correction</Button>}
          {!request.reservationUntil && <Button disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            const walletUgx = Math.min(request.walletUgx, view.availableWalletUgx), referralDays = Math.min(request.referralDays, view.availableReferralDays);
            try { await send({ action: "reconfirm", id: request.id, walletUgx, referralDays, amountToSend: request.priceUgx - walletUgx, confirmed: true }); await refresh(); }
            catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>{["rejected", "cancelled", "superseded"].includes(request.status) ? "Resubmit" : "Confirm"} {formatUgx(Math.min(request.walletUgx, view.availableWalletUgx))} wallet + {Math.min(request.referralDays, view.availableReferralDays)} referral days; cash {formatUgx(request.priceUgx - Math.min(request.walletUgx, view.availableWalletUgx))}</Button>}
          {(checkoutOpenStatuses as readonly string[]).includes(request.status) && <Button variant="quiet" disabled={busy} onClick={async () => { setBusy(true); try { await send({ action: "cancel", id: request.id }); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Cancel request</Button>}
        </>}
        {["rejected", "cancelled", "approved"].includes(request.status) && <Button variant="secondary" onClick={() => { setShowNew(true); resetCheckout(); }}>Start another purchase</Button>}
      </CheckoutActions>
      <CheckoutSupport settings={settings} reference={request.reference} />
    </CheckoutPanel>)}
    {(error || notice) && <CheckoutDialog id={`${evidenceId}-notice`} title={error ? "Check payment details" : notice!.title} open
      closeLabel="Close message" onCancel={() => { setError(""); setNotice(null); }}
      footer={<>{!error && notice?.confirm ? <>
        <CriteriaDialogButton variant="secondary" onClick={() => setNotice(null)}>{notice.cancelLabel ?? "Review details"}</CriteriaDialogButton>
        <CriteriaDialogButton onClick={() => { const action = notice.confirm!; setNotice(null); action(); }}>{notice.confirmLabel ?? "Submit"}</CriteriaDialogButton>
      </> : <CriteriaDialogButton onClick={() => { setError(""); setNotice(null); }}>OK</CriteriaDialogButton>}</>}>
      <p>{error || notice?.message}</p>
    </CheckoutDialog>}
    {!loaded && <p role="status">Restoring checkout…</p>}
    {showForm && <PaymentWizard locale={locale} step={draft.step} totalSteps={4} inlineLabels labels={["Package", "Pay", "Details", "Review"]}
      variant={packageStep ? "package" : "default"} hideTitle={!packageStep}
      title={["Choose your package", "Choose Payment Methods", "Payment details", "Review payment"][draft.step]!} headingRef={heading}>
      {draft.step === 0 && <>
        {topUp ? <><AmountInput label="Wallet top-up (UGX)" value={draft.topUpUgx} onValueChange={topUpUgx => update({ topUpUgx })} />
          <WizardActions><Button disabled={busy} onClick={next}>Next</Button></WizardActions></>
          : <PackageSelection plans={plans} selectedPlanId={draft.planId} disabled={busy} onSelect={planId => update({ planId })} onContinue={() => void next()} />}
      </>}
      {draft.step === 1 && <>
        <CheckoutChoices><VisuallyHidden as="legend">Payment method</VisuallyHidden>{(["mtn", "airtel", "wallet"] as const).filter(method => topUp ? method !== "wallet" : draft.purpose === "plan").map(method => {
          const unavailable = method === "wallet" ? null : manualPaymentProvider(settings, method).reason;
          return <label key={method}>
          <input type={method === "wallet" ? "checkbox" : "radio"} name={method === "wallet" ? "checkout-wallet" : "checkout-method"}
            checked={method === "wallet" ? draft.useWallet : draft.method === method} disabled={busy || !networkAvailable(method)}
            onChange={event => chooseMethod(method, event.target.checked)} />
          {method === "mtn" || method === "airtel" ? <CheckoutProviderMark><MobileMoneyLogo network={method} /></CheckoutProviderMark> : <CardIcon />}
          <span data-method-text>{methodNames[method]}{method === "wallet" && <small>{formatUgx(view.availableWalletUgx)}</small>}
            {unavailable && <small>{unavailable}</small>}</span>
        </label>; })}
          {!topUp && <CheckoutReferralChoice locale={locale} availableDays={view.availableReferralDays} checked={draft.useReferral} disabled={busy} onChange={selected => chooseMethod("referral", selected)} />}
        </CheckoutChoices>
        {!topUp && (draft.method || draft.useWallet || draft.useReferral) && <CheckoutFundingFields>
          {draft.purpose === "plan" && <CheckoutFundingInput label="Wallet to use (UGX)" maxLabel="Use max wallet amount" disabled={busy}
            maximum={walletMaximum} value={draft.walletUgx} onValueChange={walletUgx => update({ walletUgx, useWallet: true })} />}
          {view.availableReferralDays > 0 && <CheckoutFundingInput label={`Referral days${draft.method === "referral" ? " to redeem" : " to add"}`} maxLabel="Use max referral days" disabled={busy}
            maximum={Math.min(365, view.availableReferralDays)} value={draft.referralDays} onValueChange={referralDays => update({ referralDays, useReferral: true })} />}
        </CheckoutFundingFields>}
        <PaymentDestination selection={selection()} settings={settings} plans={plans} quoteEpoch={quoteEpoch} displayed={payQuote} onError={setError} />
        <WizardActions><Button variant="secondary" onClick={() => goBack(0)}>Back</Button><Button disabled={busy} onClick={next}>Next</Button></WizardActions>
      </>}
      {draft.step === 2 && <form onSubmit={review} noValidate style={{ display: "grid", gap: "var(--gh-spacing-3)" }}>
        {external && <>
          <WizardNotice id={`${evidenceId}-requirement`}>Message or screenshot required.</WizardNotice>
          <FloatingField label={`Transaction message${screenshotReady ? " (optional)" : ""}`}
            action={<>{draft.text.length > 0 && <Button variant="quiet" aria-label="Clear transaction message" disabled={busy || readingActive} onClick={clearMessage}><CloseIcon />Clear</Button>}
              <Button variant="quiet" disabled={busy || readingActive} onClick={() => void pasteMessage()}><ClipboardIcon />Paste</Button></>}>
            <CheckoutMessage ref={messageInput} id={`${evidenceId}-message`} rows={3} maxLength={12000} disabled={readingActive} required={!screenshotReady}
              aria-describedby={`${evidenceId}-requirement`} placeholder="Enter or paste the payment message"
              value={draft.text} onChange={e => update({ text: e.target.value })}
              onPaste={event => { event.preventDefault(); if (!busy && !readingActive) pasteTransactionMessage(event.clipboardData.getData("text/plain")); }}
              onBlur={event => {
                if (event.relatedTarget instanceof Node && event.currentTarget.parentElement?.querySelector("[data-field-action]")?.contains(event.relatedTarget)) return;
                if (draft.text && draft.text !== draft.originalText) extract(draft.text);
              }} />
          </FloatingField>
          <PaymentScreenshot image={image} metadata={draft.screenshot ?? null} provider={receiptProvider} optional={!!draft.text.trim()}
            submissionId={attaching?.id ?? null} disabled={busy} requirementId={`${evidenceId}-requirement`} onBusyChange={setReadingActive}
            onPasteMessage={() => messageInput.current?.focus()} onAccept={(screenshot, metadata, text) => { setImage(screenshot); extract(text, true, metadata); }}
            onRemove={() => { setImage(null); setReading(""); update({ screenshot: null,
              extracted: Object.fromEntries(Object.entries(draft.extracted).filter(([name]) => !name.startsWith("screenshot"))) }); }} />
          {reading && <VisuallyHidden role="status">{reading}</VisuallyHidden>}
          <FloatingField label="Transaction ID"><InputControl $invalid={false} required disabled={readingActive} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={draft.transactionId} onChange={e => update({ transactionId: normalizeTransactionId(e.target.value) })} /></FloatingField>
          <AmountInput label="Amount paid (UGX)" required disabled={readingActive} value={draft.amountUgx} onValueChange={amountUgx => update({ amountUgx })} />
          <PhoneInput label="Number used to pay" formatValue required disabled={readingActive} value={draft.payerPhone} onValueChange={payerPhone => update({ payerPhone })} />
        </>}
        <WizardActions><Button variant="secondary" disabled={busy || readingActive} onClick={() => { if (attaching) resetCheckout(); else goBack(1); }}>Back</Button>
          <Button type="submit" disabled={busy || readingActive}>Next</Button></WizardActions>
      </form>}
      {draft.step === 3 && <form onSubmit={submit} noValidate style={{ display: "grid", gap: "var(--gh-spacing-3)" }}>
        {summary}
        {external && <div data-payment-review>
          <WizardReview><div><dt>Payment method</dt><dd>{methodNames[receiptProvider]}</dd></div><div><dt>Transaction ID</dt><dd>{draft.transactionId}</dd></div>
            <div><dt>Number used to pay</dt><dd>{formatReviewPhone(draft.payerPhone)}</dd></div>
            {image && <div><dt>Screenshot</dt><dd><PaymentImagePreview image={image} disabled={busy} /></dd></div>}
          </WizardReview>
          {draft.text.trim() && <details><summary>Transaction message</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{draft.text}</p></details>}
        </div>}
        <label><input type="checkbox" disabled={busy} checked={draft.accepted} onChange={e => update({ accepted: e.target.checked })} /> I checked these details and confirm this {draft.purpose === "referral" ? "redemption" : "purchase"}. I accept the <a href="/en/terms" target="_blank" rel="noopener">terms</a>.</label>
        <WizardActions><Button type="button" variant="secondary" disabled={busy || readingActive} onClick={() => goBack(external ? 2 : 1)}>Back</Button>
          <Button type="submit" disabled={busy || readingActive || !draft.accepted || !attaching && !quote || external && (!!image && !screenshotReady || !image && !draft.text.trim())}>Submit</Button></WizardActions>
        {external ? <Button variant="quiet" disabled={busy || readingActive} onClick={() => setNotice({ title: "Payment verification", message: "Reported details and extraction do not verify payment. The admin checks the incoming transfer." })}>About payment verification</Button>
          : <WizardNotice>Your available balance is debited only when you confirm.</WizardNotice>}
      </form>}
    </PaymentWizard>}
  </>;
}

function PaymentDestination({ selection, settings, plans, quoteEpoch, displayed, onError }: { selection: CheckoutSelection; settings: PublicSubscriptionSettings;
  plans: readonly SubscriptionPlanView[]; quoteEpoch: number; displayed: RefObject<DisplayedQuote | null>; onError: (message: string) => void }) {
  const [result, setResult] = useState<{ identity: string; quote: CheckoutQuote } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const selectionKey = JSON.stringify(selection);
  const plan = selection.purpose === "plan" ? plans.find(plan => plan.id === selection.planId) : null;
  const priceUgx = plan?.priceUgx ?? (selection.purpose === "topup" ? selection.topUpUgx : 0);
  const network = selection.method === "mtn" || selection.method === "airtel" ? selection.method : null;
  const provider = network ? manualPaymentProvider(settings, network) : null;
  const identity = JSON.stringify([selectionKey, priceUgx, plan?.durationDays, provider, quoteEpoch]);
  const canQuote = !!selection.method && (selection.purpose !== "referral" || selection.referralDays > 0)
    && (selection.purpose !== "topup" || selection.topUpUgx > 0);
  // Keep the estimate visible while the server verifies the transfer details.
  const preview = { ...selection, priceUgx, durationDays: plan?.durationDays ?? 0, ...fundingAmounts(priceUgx, selection.walletUgx),
    recipient: null, recipientName: null };
  const current = result?.identity === identity && failed !== identity ? result.quote : null;
  const quote = current ?? preview;
  useEffect(() => {
    if (!canQuote) return;
    let alive = true;
    const timer = setTimeout(() => {
      void send<CheckoutQuote>({ action: "quote", selection: JSON.parse(selectionKey) })
        .then(q => { if (alive) { displayed.current = { selectionKey, quote: q }; setResult({ identity, quote: q }); setFailed(null); } })
        .catch(e => { if (alive) { setFailed(identity); onError(e.message); } });
    }, 200);
    return () => { alive = false; clearTimeout(timer); displayed.current = null; };
  }, [selectionKey, identity, canQuote, displayed, onError]);
  const copied = copiedNumber === quote.recipient && !!quote.recipient;
  return <div data-payment-destination aria-busy={canQuote && !current && failed !== identity}><CheckoutPaySummary quote={quote} />
    {quote.recipient && (quote.method === "mtn" || quote.method === "airtel") && <CheckoutPayee>
      <div><CheckoutProviderMark><MobileMoneyLogo network={quote.method} /></CheckoutProviderMark><strong>{localUgandaPhone(quote.recipient)}</strong>
        <Button type="button" variant="quiet" aria-label={copied ? "Number copied" : `Copy ${methodNames[quote.method]} receiving number`} title={copied ? "Copied" : "Copy number"}
          onClick={() => { void navigator.clipboard.writeText(quote.recipient!).then(() => setCopiedNumber(quote.recipient)).catch(() => onError("Select and copy the receiving number.")); }}>{copied ? <CheckIcon /> : <CopyIcon />}</Button></div>
      <small>{quote.recipientName}</small>
      <small>Use {methodNames[quote.method]} on your phone to send {formatUgx(quote.amountToSend)}. Check the registered name before confirming the transfer.</small>
    </CheckoutPayee>}
  </div>;
}
