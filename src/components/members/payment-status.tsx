"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ImageIcon } from "@/components/ui/icons";
import type { PaymentStatus } from "@/domain/payment";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import { createMessages } from "@/i18n/messages";
import { AccountSupportLink, AdminContactLinks } from "./admin-contact";
import { refreshMemberSession } from "./member-session";
import { Action, ActionLink, Disclosure, HelpActions, Note, RowButton, StatusBox, StatusFacts, StatusTitle } from "./subscribe-styles";

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

/** The account's latest report: waiting (with the admin's numbers), approved while its period runs, or refused with a reason.
 * Approval needs nothing from the member: access opens on the account's signed-in devices by itself. */
export function PaymentStatusCard({ locale, status, settings, phone, activeUntil, returnTo, heading = "h3", replace, newPayment }: {
  locale: string; status: PaymentStatus | null; settings: StatusSettings; phone: string; activeUntil: string | null; returnTo: string | null;
  heading?: "h2" | "h3"; replace?: Readonly<{ open: boolean; controls: string; toggle: () => void }> | undefined;
  newPayment?: Readonly<{ start: () => void }> | undefined;
}) {
  const m = createMessages(locale);
  if (!status) return null;
  const facts = (sent: boolean) => <StatusFacts>
    <div><dt>{m.text("subscribe.referenceLabel")}</dt><dd>{status.reference}</dd></div>
    <div><dt>{m.text("subscribe.planLabel")}</dt><dd>{status.planName}</dd></div>
    <div><dt>{m.text("subscribe.amountLabel")}</dt><dd>UGX {m.number(status.priceUgx)}</dd></div>
    {sent && <div><dt>{m.text("subscribe.sentLabel")}</dt><dd>{formatPeriodEnd(new Date(status.submittedAt))}</dd></div>}
  </StatusFacts>;
  if (status.status === "pending" || status.status === "superseded") return <StatusBox role="status" data-payment-status="pending">
    <StatusTitle as={heading}>{m.text("subscribe.pendingTitle")}</StatusTitle>
    <p>{m.text("subscribe.pendingLead")}</p>
    {facts(true)}
    {settings.reviewTime && <Note>{m.text("subscribe.reviewTime", { time: settings.reviewTime })}</Note>}
    <AdminContactLinks locale={locale} contact={settings} text={m.text("subscribe.helpPaid", { price: String(status.priceUgx), plan: status.planName,
      phone: formatPhone(phone), reference: status.reference })} />
    {replace && <RowButton variant="quiet" aria-expanded={replace.open} aria-controls={replace.controls} onClick={replace.toggle}><ImageIcon />{m.text("subscribe.replace")}</RowButton>}
  </StatusBox>;
  if (status.status === "approved") return activeUntil ? <StatusBox data-payment-status="approved">
    <StatusTitle as={heading}><CheckIcon />{m.text("subscribe.approvedTitle")}</StatusTitle>
    <p>{m.text("subscribe.activeUntil", { end: formatSubscriptionExpiry(new Date(activeUntil)) })}</p>
    <HelpActions><ActionLink href={returnTo ?? "/en"} prefetch={false}>{m.text("subscribe.seePredictions")}<ChevronRightIcon /></ActionLink></HelpActions>
  </StatusBox> : null;
  if (status.status === "reversed") return <StatusBox role="status" data-payment-status="reversed">
    <StatusTitle as={heading}>{m.text("subscribe.reversedTitle")}</StatusTitle>
    <p>{m.text("subscribe.reversedLead")}</p>
    <Disclosure key={status.reference} data-payment-details>
      <summary>{m.text("subscribe.paymentDetails")}<ChevronDownIcon /></summary><div>{facts(false)}</div>
    </Disclosure>
    <HelpActions>
      <AccountSupportLink locale={locale} contact={settings} text={m.text("subscribe.helpReversed", { reference: status.reference, phone: formatPhone(phone) })} />
      {newPayment && <Action type="button" variant="secondary" onClick={newPayment.start} data-payment-resubmit>{m.text("subscribe.submitAnother")}</Action>}
    </HelpActions>
  </StatusBox>;
  if (status.status !== "rejected") return null;
  // Rejections retain the owner's explanation and existing correction flow.
  return <StatusBox role="status" data-payment-status={status.status}>
    <StatusTitle as={heading}>{m.text("subscribe.rejectedTitle")}</StatusTitle>
    <p>{status.rejectText ?? m.text(`subscribe.reason.${reasonOf(status.rejectReason)}`)}</p>
    {facts(false)}
    <Note>{m.text("subscribe.rejectedNext")}</Note>
    <AdminContactLinks locale={locale} contact={settings} text={m.text("subscribe.helpRejected", { reference: status.reference, phone: formatPhone(phone) })} />
  </StatusBox>;
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
