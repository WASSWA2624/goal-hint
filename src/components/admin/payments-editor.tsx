"use client";
import { useState, type FormEvent } from "react";
import styled from "styled-components";
import { Muted, Notice, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { Button } from "@/components/ui/controls";
import { parsePaymentSms, type PaymentSms } from "@/domain/payment-sms";
import { normalizeTransactionId } from "@/domain/payment";
import { formatPhone, smsHref, waHref } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { PaymentQueue } from "@/domain/owner-members";
import { ActionButton, ButtonRow, FieldBlock, FieldRow, FormStack, Hint } from "./admin-form";
import { CodeReadyPanel } from "./code-ready";
import { ManualCodeForm, PlanField, useCodeAction, type CodeAction } from "./code-tools";
const reasons = ["unreadable", "amount-mismatch", "not-received", "duplicate", "wrong-number", "other"];
export function PaymentsEditor({ owner, queue, plans, tab }: { owner: string; queue: PaymentQueue; plans: readonly SubscriptionPlanView[]; tab: string }) {
  const action = useCodeAction(owner);
  return <div data-analytics-ignore><CodeReadyPanel owner={owner} immediate={action.delivery} done={action.clear} />{action.message && <Notice $tone="error" role="alert">{action.message}{action.duplicateId && <p><a href={`/admin/payments?tab=approved#${action.duplicateId}`}>Earlier payment</a></p>}</Notice>}
    <ButtonRow>{["pending", "approved", "rejected"].map(t => <ActionButton as="a" key={t} href={`/admin/payments?tab=${t}`} aria-current={tab === t ? "page" : undefined}>{t === "pending" ? `Pending (${queue.pendingCount})` : t === "approved" ? "Approved" : "Rejected"}</ActionButton>)}</ButtonRow>
    {tab === "pending" && queue.trials.map(t => <Panel key={t.id}><PanelHeader><h2>Free trial · {t.phone ? formatPhone(t.phone) : "Erased"}</h2></PanelHeader><p>{formatPeriodEnd(new Date(t.trialRequestedAt))}</p><Muted>{t.ipCount === null ? "Client address unavailable" : `This IP asked for ${t.ipCount} trials today`}</Muted><ButtonRow><ActionButton type="button" disabled={action.busy} onClick={() => void action.send("/api/admin/codes", { action: "trial", id: t.id })}>Send free trial</ActionButton><ActionButton type="button" disabled={action.busy} onClick={() => void action.send("/api/admin/codes", { action: "dismiss-trial", id: t.id })}>Dismiss</ActionButton></ButtonRow></Panel>)}
    {queue.payments.length === 0 && <Panel><Muted>No payments in this tab.</Muted></Panel>}{queue.payments.map(p => <PaymentCard key={p.id} payment={p} plans={plans} action={action} />)}
  </div>;
}
function PaymentCard({ payment: p, plans, action }: { payment: PaymentQueue["payments"][number]; plans: readonly SubscriptionPlanView[]; action: CodeAction }) {
  const [network, setNetwork] = useState(p.network), [id, setId] = useState(p.transactionId), [amount, setAmount] = useState(p.amount), [sms, setSms] = useState<PaymentSms>({});
  const [rejected, setRejected] = useState(""), [recovery, setRecovery] = useState(false), [reversed, setReversed] = useState(false), [carried, setCarried] = useState(false);
  async function approve(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = new FormData(e.currentTarget); await action.send(`/api/admin/payments/${p.id}`, { action: "approve", network, transactionId: id, amount, planId: form.get("planId") }); }
  function parse(text: string) { const v = parsePaymentSms(text, {}); setSms(v); if (v.amount !== undefined) setAmount(v.amount); if (v.transactionId) setId(v.transactionId); if (v.network) setNetwork(v.network); }
  const phone = p.accountPhone;
  const rejectionMessage = `Goal Hint ${p.reference}: ${rejected}. Please check your payment details and contact us.`;
  return <Panel id={p.id}><PanelHeader><h2>{p.reference} · {reversed ? "reversed" : p.status}</h2><p>{formatPeriodEnd(new Date(p.submittedAt))}</p></PanelHeader>
    <FieldRow><div>{p.hasImage ? <a href={`/api/admin/payments/${p.id}/screenshot`} target="_blank" rel="noopener noreferrer" aria-label={`Zoom screenshot ${p.reference}`}><Receipt src={`/api/admin/payments/${p.id}/screenshot`} alt={`Payment screenshot ${p.reference}`} loading="lazy" /></a> : <Muted>Image unavailable or purged</Muted>}</div><div><h3>Subscriber says</h3><p>Payer: {p.payerPhone ? formatPhone(p.payerPhone) : "—"}</p><p>{p.network.toUpperCase()} · {p.transactionId}</p><p>UGX {p.amount.toLocaleString("en-UG")} · {p.planName} (UGX {p.price.toLocaleString("en-UG")})</p>{p.final && <p>Approved: {p.final.network} · {p.final.transactionId} · UGX {p.final.amount?.toLocaleString("en-UG")}</p>}</div></FieldRow>
    <Checks aria-label="Automatic checks">{p.checks.map((c,i) => <Check key={i} $tone={c.tone}>{c.text}</Check>)}</Checks>
    <p>Code goes to {phone ? formatPhone(phone) : "erased account"} (account number)</p>
    {["pending", "superseded"].includes(p.status) && <><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={approve}><FormStack>
      <FieldBlock>Paste my SMS<textarea maxLength={12000} onChange={e => parse(e.target.value)} /></FieldBlock>
      {Object.keys(sms).length > 0 && <Notice><strong>Your SMS says</strong><p>{sms.network?.toUpperCase()} · {sms.transactionId ?? "ID not found"} · UGX {sms.amount?.toLocaleString("en-UG") ?? "—"}</p>{sms.counterparty && <p>Sender {formatPhone(sms.counterparty)}: {sms.counterparty === p.payerPhone ? "matches payer" : "differs from payer; verify"}</p>}</Notice>}
      <FieldRow><FieldBlock>Network<select value={network} onChange={e => setNetwork(e.target.value)}><option value="mtn">MTN</option><option value="airtel">Airtel</option></select></FieldBlock><FieldBlock>Transaction ID<input required maxLength={40} value={id} onChange={e => setId(normalizeTransactionId(e.target.value))} /></FieldBlock></FieldRow>
      <FieldRow><FieldBlock>Amount received (UGX)<input type="number" min={0} required value={amount} onChange={e => setAmount(Number(e.target.value))} /></FieldBlock><PlanField plans={plans} value={p.planId} allowCustom={false} /></FieldRow>
      <Button size="large" type="submit" disabled={action.busy || !phone}>I found this payment in my account</Button><Hint>Find the money and right sender in your own wallet before approving. Checks do not verify receipt.</Hint>
    </FormStack></form><details><summary>Reject</summary><form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await action.send(`/api/admin/payments/${p.id}`, { action: "reject", reason: f.get("reason"), text: f.get("text"), deleteImage: f.get("deleteImage") === "on" }); if (r.ok) setRejected(String(f.get("text") || f.get("reason"))); }}><FormStack><FieldBlock>Reason<select name="reason">{reasons.map(r => <option key={r}>{r}</option>)}</select></FieldBlock><FieldBlock>Optional explanation<textarea name="text" maxLength={200} /></FieldBlock><label><input type="checkbox" name="deleteImage" /> Delete image now</label><ActionButton disabled={action.busy}>Reject payment</ActionButton></FormStack></form></details></>}
    {rejected && phone && <ButtonRow><ActionButton as="a" href={waHref(phone,rejectionMessage)} target="_blank" rel="noopener noreferrer" data-analytics-ignore>Tell them · WhatsApp</ActionButton><ActionButton as="a" href={smsHref(phone,rejectionMessage)} target="_blank" rel="noopener noreferrer" data-analytics-ignore>Tell them · SMS</ActionButton></ButtonRow>}
    {p.status === "approved" && !reversed && <form method="post" action={`/api/admin/payments/${p.id}`} onSubmit={async e => { e.preventDefault(); const reason = new FormData(e.currentTarget).get("reason"); const r = await action.send(`/api/admin/payments/${p.id}`, { action: "reverse", reason }); if (r.ok) { setReversed(true); setCarried(r.body.carriedOtherDays === true); setRecovery(reason === "wrong-account"); } }}><FieldBlock>Reverse reason<select name="reason"><option value="network-reversal">Network reversal</option><option value="wrong-account">Wrong account</option></select></FieldBlock><ActionButton type="submit" disabled={action.busy}>Reverse payment and revoke code</ActionButton></form>}
    {carried && <Notice $tone="warning">The revoked code carried other days from a number change. Generate a code for any verified remaining days.</Notice>}
    {recovery && <><h3>Generate code for the real payer</h3><Muted>Keep the ID on this reversed payment. Use no ID here so the payment is counted once.</Muted><ManualCodeForm plans={plans} action={action} phone={p.payerPhone ?? ""} amount={p.final?.amount ?? p.amount} note={`for ${p.reference}`} /></>}
  </Panel>;
}
const Receipt = styled.img`display:block; max-inline-size:100%; max-block-size:20rem; object-fit:contain;`;
const Checks = styled.ul`padding-inline-start:1.25rem; display:grid; gap:6px;`;
const Check = styled.li<{ $tone: "good" | "warning" | "info" }>`color:${({theme,$tone}) => $tone === "good" ? theme.color.outcome.correct.text : $tone === "warning" ? theme.color.outcome.pending.text : theme.color.mutedText};`;
