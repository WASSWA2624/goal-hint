"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, InputControl } from "@/components/ui/controls";
import { FloatingField } from "@/components/ui/floating-field";
import { AmountInput } from "@/components/ui/amount-input";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { CardIcon, CheckIcon, ClipboardIcon, CopyIcon, GiftIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { checkoutLabels, checkoutMethodAvailable, checkoutOpenStatuses, duplicateReceiptMessage, type CheckoutEvidenceCheck, type CheckoutQuote, type CheckoutRequest, type CheckoutSelection, type CheckoutView } from "@/domain/checkout";
import type { ScreenshotMetadata } from "@/domain/payment-screenshot";
import { formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import type { PublicSubscriptionSettings } from "@/domain/public-subscription-settings";
import { paymentEvidence } from "@/domain/payment-sms";
import { checkoutDetailsIssue, paymentDestinationMismatch } from "@/domain/checkout-evidence";
import { paymentEvidenceDate } from "@/domain/payment-evidence-date";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { validMobilePhone } from "@/domain/phone-mobile";
import { normalizeTransactionId } from "@/domain/payment";
import { localUgandaPhone } from "@/domain/phone";
import { formatNationalPhone, splitPhoneValue } from "@/domain/phone-countries";
import { refreshMemberSession } from "./member-session";
import { PaymentWizard, WizardActions, WizardNotice, WizardPlans, WizardReview } from "./payment-wizard";
import { Plan, PlanName, PlanPrice, Preview } from "./subscribe-styles";
import { CheckoutActions, CheckoutChoices, CheckoutDialog, CheckoutFundingFields, CheckoutFundingInput, CheckoutMessage, CheckoutPanel, CheckoutPayee, CheckoutPaySummary, CheckoutProviderMark, CheckoutSupport, FundingBreakdown } from "./checkout-parts";
import { PaymentScreenshot, screenshotDigest } from "./payment-screenshot";
import { sendCheckout as send } from "./checkout-client";
import { MobileMoneyLogo } from "./mobile-money-logo";
import { capCheckoutFunding, chooseCheckoutMethod, loadCheckoutDraft, saveCheckoutDraft, type CheckoutDraft } from "./checkout-draft";

const emptyView: CheckoutView = { availableWalletUgx: 0, availableReferralDays: 0, lastMethod: null, requests: [] };
const methodNames = { mtn: "MTN Mobile Money", airtel: "Airtel Money", wallet: "Wallet balance", referral: "Referral days" };
const localDate = (date = new Date()) => new Date(+date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
function formatReviewPhone(value: string) {
  const parts = splitPhoneValue(value);
  return `+${parts.callingCode} ${formatNationalPhone(parts)}`.trim();
}

export function CheckoutFlow({ locale, settings, plans, account, initialView, topUp = false }: {
  locale: string; settings: PublicSubscriptionSettings; plans: readonly SubscriptionPlanView[];
  account: { id: string; phone: string }; initialView: CheckoutView; topUp?: boolean;
}) {
  const router = useRouter(), [view, setView] = useState(initialView ?? emptyView);
  const initial = (): CheckoutDraft => ({ requestKey: "", step: 0, purpose: topUp ? "topup" : "plan", planId: plans[0]?.id ?? "",
    method: "", useWallet: false, useReferral: false, walletUgx: "0", referralDays: "0", topUpUgx: "", transactionId: "", amountUgx: "", payerPhone: account.phone,
    paidAt: localDate(), text: "", extracted: {}, originalText: "", accepted: false, attachingId: null });
  const [draft, setDraft] = useState(initial), [image, setImage] = useState<Blob | null>(null), [loaded, setLoaded] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(""), storageWarning = useRef(false);
  const [notice, setNotice] = useState<{ title: string; message: string; confirm?: () => void; confirmLabel?: string; cancelLabel?: string } | null>(null);
  const [readingActive, setReadingActive] = useState(false);
  const [showNew, setShowNew] = useState(false), submitting = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const [quoteEpoch, setQuoteEpoch] = useState(0), lastQuoteKey = useRef<string | null>(null);
  const evidenceId = useId(), messageInput = useRef<HTMLTextAreaElement>(null);
  const key = `${account.id}:${topUp ? "topup" : "plan"}`;
  const selectedPlanPrice = plans.find(plan => plan.id === draft.planId)?.priceUgx ?? 0;
  const walletMaximum = Math.min(view.availableWalletUgx, selectedPlanPrice);
  const networkAvailable = (method: string) => checkoutMethodAvailable(method, view, settings);
  useEffect(() => {
    let alive = true;
    void loadCheckoutDraft(key).then(stored => {
      if (!alive) return;
      if (stored?.draft && stored.draft.purpose === (topUp ? "topup" : stored.draft.purpose)) {
        const restored = capCheckoutFunding({ ...stored.draft, accepted: false }, initialView, plans);
        setDraft({ ...restored, step: restored.step === 2 && !restored.attachingId && (restored.method === "wallet" || restored.method === "referral") ? 3 : restored.step }); setImage(stored.image);
      } else setDraft(current => {
        const previous = initialView.lastMethod;
        const method = previous && Object.hasOwn(methodNames, previous)
          && checkoutMethodAvailable(previous, initialView, settings)
          && (!topUp || previous === "mtn" || previous === "airtel") ? previous as CheckoutSelection["method"] : "";
        const nextDraft = { ...current, requestKey: crypto.randomUUID() };
        return method ? chooseCheckoutMethod(nextDraft, method, true, initialView, plans) : nextDraft;
      });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [key, topUp, initialView, plans, settings]);
  useEffect(() => { if (loaded) void saveCheckoutDraft(key, { draft, image }).then(saved => {
    if (!saved && !storageWarning.current) setError("Browser storage is unavailable. Keep this page open to preserve your draft.");
    storageWarning.current = !saved;
  }); }, [key, loaded, draft, image]);
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
      if (!r.ok || !alive) return; const next: CheckoutView = await r.json();
      if (alive) { setView(next); setDraft(current => capCheckoutFunding(current, next, plans)); void refreshMemberSession(); }
    }).catch(() => {}); };
    const timer = setInterval(update, 20_000); window.addEventListener("focus", update); window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("online", update); document.removeEventListener("visibilitychange", update); };
  }, [plans]);
  const update = (values: Partial<CheckoutDraft>) => { setDraft(d => capCheckoutFunding({ ...d, ...values, accepted: values.accepted ?? false }, view, plans)); setError(""); };
  const chooseMethod = (method: CheckoutSelection["method"], selected: boolean) => {
    setDraft(current => chooseCheckoutMethod(current, method, selected, view, plans)); setError("");
  };
  const selection = (): CheckoutSelection => ({ purpose: draft.purpose, planId: draft.purpose === "plan" ? draft.planId : null,
    method: draft.method as CheckoutSelection["method"], walletUgx: Number(draft.walletUgx), referralDays: Number(draft.referralDays), topUpUgx: Number(draft.topUpUgx) });
  const selectionKey = JSON.stringify(selection());
  useEffect(() => {
    const retry = () => setQuoteEpoch(epoch => epoch + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    if (!loaded || draft.step < 2 || draft.attachingId) return;
    let alive = true;
    void send<CheckoutQuote>({ action: "quote", selection: JSON.parse(selectionKey) }).then(value => { if (alive) {
      if (lastQuoteKey.current && lastQuoteKey.current !== value.quoteKey) {
        setDraft(d => ({ ...d, accepted: false })); setError("Funding changed. Check the updated summary and confirm again.");
      }
      lastQuoteKey.current = value.quoteKey; setQuote(value);
    } })
      .catch(e => { if (alive) { setQuote(null); setError(e.message); } });
    return () => { alive = false; };
  }, [loaded, draft.step, draft.attachingId, selectionKey, quoteEpoch]);
  useEffect(() => { if (loaded) heading.current?.focus({ preventScroll: true }); }, [loaded, draft.step]);
  async function next() {
    setError("");
    if (draft.step === 0) { update({ step: 1 }); return; }
    if (!draft.method) { setError(draft.useWallet ? `Choose MTN or Airtel to pay the remaining ${formatUgx(selectedPlanPrice - Number(draft.walletUgx))}.` : "Choose a payment method."); return; }
    if (draft.purpose === "referral" && Number(draft.referralDays) < 1) { setError("Choose at least one available referral day."); return; }
    setBusy(true);
    try { const value = await send<CheckoutQuote>({ action: "quote", selection: selection() }); lastQuoteKey.current = value.quoteKey; setQuote(value); update({ step: value.amountToSend > 0 ? 2 : 3 }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const attaching = view.requests.find(r => r.id === draft.attachingId);
  const external = !!attaching || ["mtn", "airtel"].includes(draft.method);
  const receiptProvider = (attaching?.method ?? draft.method) === "airtel" ? "airtel" : "mtn";
  const screenshotReady = !!image && draft.screenshot?.version === 1 && draft.screenshot.provider === receiptProvider;
  const numbers = { mtn: settings.mtnNumber, airtel: settings.airtelNumber };
  const screenshotText = image && typeof draft.extracted.screenshotText === "string" ? draft.extracted.screenshotText : "";
  const effectiveQuote = attaching ? { ...attaching, purpose: attaching.purpose as CheckoutQuote["purpose"] } : quote;
  function detailsIssue() {
    return external ? checkoutDetailsIssue({ ...draft, screenshotText, hasImage: !!image, screenshotReady }, receiptProvider, numbers) : null;
  }
  function review(event: FormEvent) {
    event.preventDefault();
    if (busy || readingActive) return;
    const issue = detailsIssue();
    if (issue) { setError(issue); return; }
    update({ step: 3 });
  }
  async function submit(event?: FormEvent, adjustmentAccepted = false, reuseAccepted = false) {
    event?.preventDefault(); if (submitting.current || readingActive) return;
    if (draft.step !== 3) return;
    if (!draft.accepted) { setError("Check the details and confirm the purchase terms."); return; }
    const issue = detailsIssue();
    if (issue) { update({ step: 2 }); setError(issue); return; }
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
            cancelLabel: "Review details", confirmLabel: "Submit for review", confirm: () => { void submit(undefined, adjustmentAccepted, true); } }); return;
        }
      }
      if (external && effectiveQuote && !adjustmentAccepted) {
        const difference = Number(draft.amountUgx) + (attaching?.verifiedUgx ?? 0) - effectiveQuote.amountToSend;
        if (difference !== 0) {
          setNotice({ title: difference > 0 ? "Extra payment" : "Remaining payment", cancelLabel: "Review amount",
            confirm: () => { void submit(undefined, true, reuseAccepted); },
            message: difference > 0 ? `If confirmed, ${formatUgx(difference)} extra will be added to your wallet.`
              : `If confirmed, ${formatUgx(-difference)} will remain. Your request stays open until the full payment is verified.` }); return;
        }
      }
      const evidenceDate = paymentEvidenceDate(draft.text) ?? paymentEvidenceDate(screenshotText);
      const proof = external ? { transactionId: draft.transactionId, amountUgx: Number(draft.amountUgx), payerPhone: draft.payerPhone,
        paidAt: evidenceDate ?? new Date().toISOString(), original: { text: draft.text.trim(),
          extracted: { ...draft.extracted, paymentDateSource: evidenceDate ? "evidence" : "submission" } } } : undefined;
      const q = attaching ? null : await send<CheckoutQuote>({ action: "quote", selection: selection() });
      if (q && (!quote || q.quoteKey !== quote.quoteKey)) { setQuote(q); update({ accepted: false }); throw new Error("Funding changed. Check the updated summary and confirm again."); }
      const saved = await send<CheckoutRequest>(attaching ? { action: "attach", id: attaching.id, proof }
        : { action: "confirm", selection: selection(), requestKey: draft.requestKey, quoteKey: q!.quoteKey, confirmed: true, ...(proof ? { proof } : {}) }, external ? image : null);
      await refresh();
      setShowNew(false); setDraft({ ...initial(), requestKey: crypto.randomUUID() }); setImage(null); setQuote(null);
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
    const mismatch = paymentDestinationMismatch(text, receiptProvider, numbers, fromScreenshot ? "screenshot" : "transaction message");
    if (mismatch) setError(mismatch);
    else if (!evidence.transactionId && !evidence.amount) setError("We couldn’t find transaction details in this message. Paste the complete payment message, or check and enter its transaction details below.");
  }
  async function pasteMessage() {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error();
      extract(text.slice(0, 12000));
    } catch { messageInput.current?.focus(); setError("Paste your transaction message into the field, or add a screenshot."); }
  }
  const active = view.requests.filter(r => (checkoutOpenStatuses as readonly string[]).includes(r.status));
  const visibleRequests = view.requests.slice(0, 5);
  const showForm = loaded && (showNew || active.length === 0 || !!attaching);
  const summary = effectiveQuote && <FundingBreakdown quote={effectiveQuote} {...(external && draft.amountUgx !== "" ? { reportedUgx: Number(draft.amountUgx) + (attaching?.verifiedUgx ?? 0) } : {})} />;
  function startReceipt(request: CheckoutRequest) {
    setQuote(null); setShowNew(true); setImage(null);
    setDraft({ ...initial(), requestKey: crypto.randomUUID(), step: 2, purpose: request.purpose as CheckoutDraft["purpose"], planId: request.planId ?? "",
      method: request.method as CheckoutDraft["method"], attachingId: request.id });
  }
  return <>
    {visibleRequests.map(request => <CheckoutPanel key={request.id} data-checkout-status={request.status}>
      <header role="status"><h2>{checkoutLabels[request.status] ?? request.status}</h2><p>Request ID: <strong>{request.reference}</strong></p></header>
      {request.status === "approved" ? <p>{request.purpose === "topup" ? "Wallet credited." : `Access until ${request.endsAt ? formatPeriodEnd(new Date(request.endsAt)) : "—"} (EAT).`}</p>
        : <><p>{request.planName} · {formatUgx(request.priceUgx)}</p>
          {request.verifiedUgx > 0 && <p>Verified: {formatUgx(request.verifiedUgx)} · Remaining: {formatUgx(request.remainingUgx)}</p>}
          {request.status === "pending" && <p>Your subscription activates after the admin verifies enough incoming funds.</p>}</>}
      {request.status !== "approved" && request.reportedUgx > 0 && request.verifiedUgx === 0 && <p>Reported payment: {formatUgx(request.reportedUgx)}.
        {request.reportedUgx < request.amountToSend ? ` If confirmed, ${formatUgx(request.amountToSend - request.reportedUgx)} remains.`
          : request.reportedUgx > request.amountToSend ? ` If confirmed, ${formatUgx(request.reportedUgx - request.amountToSend)} extra will be added to your wallet.` : " Awaiting verification."}</p>}
      {request.reason && <p>{request.reason}</p>}
      {request.receipts.some(r => r.disputed) && <p>{duplicateReceiptMessage}</p>}
      {request.receipts.length > 0 && <ul>{request.receipts.map(receipt => <li key={receipt.id}>{receipt.transactionId} · reported {formatUgx(receipt.amountUgx)} · {receipt.withdrawn ? "evidence withdrawn" : receipt.disputed ? "disputed" : receipt.verified ? "verified" : "awaiting verification"}
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
        {["rejected", "cancelled", "approved"].includes(request.status) && <Button variant="secondary" onClick={() => { setShowNew(true); update({ step: 0, attachingId: null, requestKey: crypto.randomUUID(), transactionId: "" }); }}>Start another purchase</Button>}
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
    {showForm && <PaymentWizard locale={locale} step={draft.step} totalSteps={4} inlineLabels labels={["Package", "Pay", "Details", "Review"]} hideTitle title={["Choose package", "Choose Payment Methods", "Payment details", "Review payment"][draft.step]!} headingRef={heading}>
      {draft.step === 0 && <>
        {topUp ? <AmountInput label="Wallet top-up (UGX)" value={draft.topUpUgx} onValueChange={topUpUgx => update({ topUpUgx })} />
          : <WizardPlans $columns={1} aria-label="Packages">{plans.map(plan => <Plan key={plan.id}><input type="radio" name="checkout-package" checked={draft.planId === plan.id} onChange={() => update({ planId: plan.id })} />
            <PlanName>{plan.name} · {plan.durationDays} {plan.durationDays === 1 ? "day" : "days"}</PlanName><PlanPrice>{formatUgx(plan.priceUgx)}</PlanPrice></Plan>)}</WizardPlans>}
        <WizardActions><Button disabled={busy} onClick={next}>Next</Button></WizardActions>
      </>}
      {draft.step === 1 && <>
        <CheckoutChoices><VisuallyHidden as="legend">Payment method</VisuallyHidden>{(Object.keys(methodNames) as CheckoutSelection["method"][]).filter(method => topUp ? ["mtn", "airtel"].includes(method) : true).map(method => <label key={method}>
          <input type={method === "wallet" || method === "referral" ? "checkbox" : "radio"} name={method === "wallet" || method === "referral" ? `checkout-${method}` : "checkout-method"}
            checked={method === "wallet" ? draft.useWallet : method === "referral" ? draft.useReferral : draft.method === method} disabled={busy || !networkAvailable(method)}
            onChange={event => chooseMethod(method, event.target.checked)} />
          {method === "mtn" || method === "airtel" ? <CheckoutProviderMark><MobileMoneyLogo network={method} /></CheckoutProviderMark> : method === "wallet" ? <CardIcon /> : <GiftIcon />}
          <span data-method-text>{methodNames[method]}{method === "wallet" && <small>{formatUgx(view.availableWalletUgx)}</small>}{method === "referral" && <small>{view.availableReferralDays} days available</small>}</span>
        </label>)}</CheckoutChoices>
        {!topUp && (draft.method || draft.useWallet || draft.useReferral) && <CheckoutFundingFields>
          {draft.purpose === "plan" && <CheckoutFundingInput label="Wallet to use (UGX)" maxLabel="Use max wallet amount" disabled={busy}
            maximum={walletMaximum} value={draft.walletUgx} onValueChange={walletUgx => update({ walletUgx, useWallet: true })} />}
          <CheckoutFundingInput label={`Referral days${draft.method === "referral" ? " to redeem" : " to add"}`} maxLabel="Use max referral days" disabled={busy}
            maximum={Math.min(365, view.availableReferralDays)} value={draft.referralDays} onValueChange={referralDays => update({ referralDays, useReferral: true })} />
        </CheckoutFundingFields>}
        {draft.method && (draft.purpose !== "referral" || Number(draft.referralDays) > 0) && <PaymentDestination selection={selection()} onError={setError} />}
        <WizardActions><Button variant="secondary" onClick={() => update({ step: 0 })}>Back</Button><Button disabled={busy} onClick={next}>Next</Button></WizardActions>
      </>}
      {draft.step === 2 && <form onSubmit={review} noValidate style={{ display: "grid", gap: 12 }}>
        {external && <>
          <WizardNotice id={`${evidenceId}-requirement`}>Message or screenshot required.</WizardNotice>
          <FloatingField label={`Transaction message${screenshotReady ? " (optional)" : ""}`}
            action={<Button variant="quiet" disabled={busy || readingActive} onClick={() => void pasteMessage()}><ClipboardIcon />Paste</Button>}>
            <CheckoutMessage ref={messageInput} id={`${evidenceId}-message`} rows={3} maxLength={12000} disabled={readingActive} required={!screenshotReady}
              aria-describedby={`${evidenceId}-requirement`} placeholder="Enter or paste the payment message"
              value={draft.text} onChange={e => update({ text: e.target.value })} onBlur={() => { if (draft.text && draft.text !== draft.originalText) extract(draft.text); }} />
          </FloatingField>
          <PaymentScreenshot image={image} metadata={draft.screenshot ?? null} provider={receiptProvider} numbers={numbers} optional={!!draft.text.trim()} messageTransactionId={paymentEvidence(draft.text).transactionId}
            submissionId={attaching?.id ?? null} disabled={busy} requirementId={`${evidenceId}-requirement`} onBusyChange={setReadingActive}
            onPasteMessage={() => messageInput.current?.focus()} onAccept={(screenshot, metadata, text) => { setImage(screenshot); extract(text, true, metadata); }}
            onRemove={() => { setImage(null); setReading(""); update({ screenshot: null,
              extracted: Object.fromEntries(Object.entries(draft.extracted).filter(([name]) => !name.startsWith("screenshot"))) }); }} />
          {reading && <VisuallyHidden role="status">{reading}</VisuallyHidden>}
          <FloatingField label="Transaction ID"><InputControl $invalid={false} required disabled={readingActive} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={draft.transactionId} onChange={e => update({ transactionId: normalizeTransactionId(e.target.value) })} /></FloatingField>
          <AmountInput label="Reported amount (UGX)" required disabled={readingActive} value={draft.amountUgx} onValueChange={amountUgx => update({ amountUgx })} />
          <PhoneInput label="My number used to pay" formatValue required disabled={readingActive} value={draft.payerPhone} onValueChange={payerPhone => update({ payerPhone })} />
        </>}
        <WizardActions><Button variant="secondary" disabled={busy || readingActive} onClick={() => { if (attaching) update({ attachingId: null, step: 0 }); else update({ step: 1 }); }}>Back</Button>
          <Button type="submit" disabled={busy || readingActive || external && (!!image && !screenshotReady || !image && !draft.text.trim())}>Next</Button></WizardActions>
      </form>}
      {draft.step === 3 && <form onSubmit={submit} noValidate style={{ display: "grid", gap: 12 }}>
        {summary}
        {external && <div data-payment-review>
          <WizardReview><div><dt>Payment method</dt><dd>{methodNames[receiptProvider]}</dd></div><div><dt>Transaction ID</dt><dd>{draft.transactionId}</dd></div>
            <div><dt>My number used to pay</dt><dd>{formatReviewPhone(draft.payerPhone)}</dd></div>
            {image && <div><dt>Screenshot</dt><dd><ScreenshotReview image={image} /></dd></div>}
          </WizardReview>
          {draft.text.trim() && <details><summary>Transaction message</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{draft.text}</p></details>}
        </div>}
        <label><input type="checkbox" disabled={busy} checked={draft.accepted} onChange={e => update({ accepted: e.target.checked })} /> I checked these details and confirm this {draft.purpose === "referral" ? "redemption" : "purchase"}. I accept the <a href="/en/terms" target="_blank" rel="noopener">terms</a>.</label>
        <WizardActions><Button type="button" variant="secondary" disabled={busy || readingActive} onClick={() => update({ step: external ? 2 : 1 })}>Back</Button>
          <Button type="submit" disabled={busy || readingActive || !draft.accepted || !attaching && !quote || external && (!!image && !screenshotReady || !image && !draft.text.trim())}>{busy ? "Saving…" : "Submit"}</Button></WizardActions>
        {external ? <Button variant="quiet" disabled={busy || readingActive} onClick={() => setNotice({ title: "Payment verification", message: "Reported details and extraction do not verify payment. The admin checks the incoming transfer." })}>About payment verification</Button>
          : <WizardNotice>Your available balance is debited only when you confirm.</WizardNotice>}
      </form>}
    </PaymentWizard>}
  </>;
}

function ScreenshotReview({ image }: { image: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(image); Promise.resolve().then(() => setUrl(next)); return () => URL.revokeObjectURL(next); }, [image]);
  return url ? <a href={url} target="_blank" rel="noopener"><Preview src={url} alt="Payment screenshot" /></a> : null;
}

function PaymentDestination({ selection, onError }: { selection: CheckoutSelection; onError: (message: string) => void }) {
  const [quote, setQuote] = useState<CheckoutQuote | null>(null), [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const identity = JSON.stringify(selection);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { void send<CheckoutQuote>({ action: "quote", selection: JSON.parse(identity) }).then(q => {
      if (alive) { setQuote(q); setError(""); setCopied(false); }
    }).catch(e => { if (alive) { setQuote(null); setError(e.message); onError(e.message); } }); }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [identity, onError]);
  if (error) return null;
  if (!quote || quote.method !== selection.method || quote.walletUgx !== selection.walletUgx || quote.referralDays !== selection.referralDays || quote.planId !== selection.planId) return <p role="status">Calculating payment…</p>;
  return <div data-payment-destination><CheckoutPaySummary quote={quote} />
    {quote.recipient && (quote.method === "mtn" || quote.method === "airtel") && <CheckoutPayee>
      <div><CheckoutProviderMark><MobileMoneyLogo network={quote.method} /></CheckoutProviderMark><strong>{localUgandaPhone(quote.recipient)}</strong>
        <Button type="button" variant="quiet" aria-label={copied ? "Number copied" : `Copy ${methodNames[quote.method]} receiving number`} title={copied ? "Copied" : "Copy number"}
          onClick={() => { void navigator.clipboard.writeText(quote.recipient!).then(() => setCopied(true)).catch(() => onError("Select and copy the receiving number.")); }}>{copied ? <CheckIcon /> : <CopyIcon />}</Button></div>
      <small>{quote.recipientName}</small>
    </CheckoutPayee>}
  </div>;
}
