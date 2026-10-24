"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, InfoIcon, ResetIcon } from "@/components/ui/icons";
import type { PaymentStatus } from "@/domain/payment";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import { createMessages } from "@/i18n/messages";
import { AccountSupportLink, AdminContactLinks } from "./admin-contact";
import { refreshMemberSession } from "./member-session";
import { Action, ActionLink, Disclosure, HelpActions, Note, PaymentReviewBox, StatusBox, StatusFacts, StatusTitle } from "./subscribe-styles";

export type StatusSettings = Pick<SubscriptionSettings, "contactPhone" | "whatsappPhone" | "reviewTime">;
const rejectReasons = ["unreadable", "amount-mismatch", "not-received", "duplicate", "wrong-number", "other"] as const;
type RejectReason = (typeof rejectReasons)[number];
const reasonOf = (code: string | null): RejectReason => rejectReasons.find((reason) => reason === code) ?? "other";

/** While a report or trial waits, re-read the page every 20 s and whenever the tab comes back. router.refresh also drops the
 * client router cache, so the render that first shows the approval already carries the unlocked tier to every gated page. */
export function useApprovalRefresh(waiting: boolean, refreshAt: string | null = null) {
  const router = useRouter();
  useEffect(() => {
    const expiresAt = refreshAt ? Date.parse(refreshAt) : NaN;
    if (!waiting && !Number.isFinite(expiresAt)) return;
    void refreshMemberSession();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh(); void refreshMemberSession();
    };
    const onRestore = () => { if (waiting || expiresAt <= Date.now()) refresh(); };
    const timer = waiting ? setInterval(refresh, 20_000) : undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleExpiry = () => {
      const delay = expiresAt - Date.now();
      if (delay <= 0) refresh();
      else expiryTimer = setTimeout(scheduleExpiry, Math.min(delay, 2_147_483_647));
    };
    if (Number.isFinite(expiresAt)) scheduleExpiry();
    document.addEventListener("visibilitychange", onRestore);
    window.addEventListener("focus", onRestore);
    return () => { clearInterval(timer); clearTimeout(expiryTimer); document.removeEventListener("visibilitychange", onRestore); window.removeEventListener("focus", onRestore); };
  }, [router, waiting, refreshAt]);
}
/** The hook for server-rendered pages that only show the card. */
export function ApprovalRefresh({ waiting, refreshAt = null }: { waiting: boolean; refreshAt?: string | null }) {
  useApprovalRefresh(waiting, refreshAt);
  return null;
}

function PaymentDetails({ locale, status, pending, reviewTime }: {
  locale: string; status: PaymentStatus; pending: boolean; reviewTime?: string | null;
}) {
  const m = createMessages(locale);
  const sent = <div><dt>{m.text("subscribe.sentLabel")}</dt><dd>{formatPeriodEnd(new Date(status.submittedAt))}</dd></div>;
  return <>
    <StatusFacts aria-label={m.text("subscribe.paymentDetails")} data-payment-summary>
      <div><dt>{m.text("subscribe.referenceLabel")}</dt><dd>{status.reference}</dd></div>
      <div><dt>{m.text("subscribe.planLabel")}</dt><dd>{status.planName}</dd></div>
      <div><dt>{m.text("subscribe.amountLabel")}</dt><dd>UGX {m.number(status.priceUgx)}</dd></div>
      {pending && sent}
    </StatusFacts>
    {(!pending || reviewTime) && <Disclosure key={status.reference} data-payment-details>
      <summary>{m.text("subscribe.morePaymentDetails")}<ChevronDownIcon /></summary><div>
        {!pending && <StatusFacts>{sent}</StatusFacts>}
        {reviewTime && <Note>{m.text("subscribe.reviewTime", { time: reviewTime })}</Note>}
      </div>
    </Disclosure>}
  </>;
}

/** The account's latest report: under review, approved while its period runs, or refused with a reason.
 * Approval needs nothing from the member: access opens on the account's signed-in devices by itself. */
export function PaymentStatusCard({ locale, status, settings, phone, activeUntil, returnTo, heading = "h3", replace, newPayment }: {
  locale: string; status: PaymentStatus | null; settings: StatusSettings; phone: string; activeUntil: string | null; returnTo: string | null;
  heading?: "h2" | "h3"; replace?: Readonly<{ open: boolean; controls: string; toggle: () => void; disabled?: boolean }> | undefined;
  newPayment?: Readonly<{ controls: string; start: () => void }> | undefined;
}) {
  const m = createMessages(locale);
  if (!status) return null;
  if (status.status === "approved") return activeUntil ? <StatusBox data-payment-status="approved">
    <StatusTitle as={heading}><CheckIcon />{m.text("subscribe.approvedTitle")}</StatusTitle>
    <p>{m.text("subscribe.activeUntil", { end: formatSubscriptionExpiry(new Date(activeUntil)) })}</p>
    <HelpActions><ActionLink href={returnTo ?? "/en"} prefetch={false}>{m.text("subscribe.seePredictions")}<ChevronRightIcon /></ActionLink></HelpActions>
  </StatusBox> : null;
  const pending = status.status === "pending" || status.status === "superseded", rejected = status.status === "rejected", reversed = status.status === "reversed";
  if (!pending && !rejected && !reversed) return null;
  const StatusIcon = pending ? ClockIcon : rejected ? InfoIcon : ResetIcon;
  const title = pending ? "subscribe.pendingTitle" : rejected ? "subscribe.rejectedTitle" : "subscribe.reversedTitle";
  const message = rejected ? status.rejectText ?? m.text(`subscribe.reason.${reasonOf(status.rejectReason)}`)
    : m.text(pending ? "subscribe.pendingLead" : "subscribe.reversedLead");
  const contactDetails = { reference: status.reference, phone: formatPhone(phone) };
  const supportText = pending ? m.text("subscribe.helpPaid", { ...contactDetails, price: String(status.priceUgx), plan: status.planName })
    : m.text(reversed ? "subscribe.helpReversed" : "subscribe.helpRejected", contactDetails);
  const nextAction = reversed
    ? newPayment && <Action id={`${newPayment.controls}-toggle`} type="button" variant="quiet" onClick={newPayment.start} data-payment-resubmit>{m.text("subscribe.submitAnother")}</Action>
    : replace && <Action id={`${replace.controls}-toggle`} type="button" variant="quiet" disabled={replace.disabled}
      aria-expanded={replace.open} aria-controls={replace.controls} onClick={replace.toggle} data-payment-update>
      {m.text(replace.open ? "subscribe.hidePaymentForm" : "subscribe.replace")}
    </Action>;
  return <PaymentReviewBox data-payment-status={pending ? "pending" : status.status}>
    <header role="status">
      <StatusTitle as={heading}><StatusIcon />{m.text(title)}</StatusTitle>
      <p>{message}</p>
    </header>
    <PaymentDetails locale={locale} status={status} pending={pending} reviewTime={pending ? settings.reviewTime : null} />
    {settings.contactPhone || settings.whatsappPhone
      ? <AdminContactLinks locale={locale} contact={settings} compact text={supportText} />
      : <AccountSupportLink locale={locale} contact={settings} />}
    {nextAction}
  </PaymentReviewBox>;
}

/** A requested trial waits for the owner's Grant free trial, which unlocks the account's devices by itself. */
export function TrialStatusCard({ locale, settings, phone, heading = "h3" }: { locale: string; settings: StatusSettings; phone: string; heading?: "h2" | "h3" }) {
  const m = createMessages(locale);
  return <StatusBox role="status" data-trial-status="requested">
    <StatusTitle as={heading}>{m.text("subscribe.trialRequested")}</StatusTitle>
    <p>{m.text("subscribe.trialWaiting")}</p>
    {settings.reviewTime && <Note>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</Note>}
    <AdminContactLinks locale={locale} contact={settings} text={m.text("subscribe.helpTrial", { phone: formatPhone(phone) })} />
  </StatusBox>;
}
