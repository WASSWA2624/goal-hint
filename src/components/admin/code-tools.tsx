"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Muted, Notice, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import type { CodeDelivery } from "@/domain/code-delivery";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/controls";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerCode } from "@/domain/owner-members";
import { ActionButton, ButtonRow, FieldBlock, FieldRow, FormStack, postAdmin, replyMessage } from "./admin-form";
import { CodeReadyPanel, hasPendingCode, rememberCode } from "./code-ready";
export function useCodeAction(owner: string) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [delivery, setDelivery] = useState<CodeDelivery | null>(null), [duplicateId, setDuplicateId] = useState<string | null>(null);
  async function send(path: string, body: unknown) {
    if (typeof body === "object" && body && "action" in body && ["approve", "manual", "reissue", "trial", "change-number"].includes(String(body.action)) && (delivery || hasPendingCode(owner))) {
      const text = "Send the code in the open panel, then tap Done, sent before generating another."; setMessage(text); return { ok: false, status: 409, body: { message: text } };
    }
    setBusy(true); setMessage(""); setDuplicateId(null);
    const reply = await postAdmin(path, body); setBusy(false);
    if (reply.ok) { if (reply.body.delivery) { const value = reply.body.delivery as CodeDelivery; setDelivery(value); rememberCode(owner, value); } router.refresh(); }
    else { setMessage(replyMessage(reply, "The action was refused.")); if (typeof reply.body.submissionId === "string") setDuplicateId(reply.body.submissionId); }
    return reply;
  }
  return { busy, message, delivery, duplicateId, send, clear: () => setDelivery(null) };
}
export type CodeAction = ReturnType<typeof useCodeAction>;
export function PlanField({ plans, value, allowCustom = true }: { plans: readonly SubscriptionPlanView[]; value?: string; allowCustom?: boolean }) { return <FieldBlock>Plan<select name="planId" defaultValue={value ?? plans[0]?.id ?? ""}>{allowCustom && <option value="">Custom days</option>}{plans.map(p => <option key={p.id} value={p.id}>{p.name} · UGX {p.priceUgx.toLocaleString("en-UG")}</option>)}</select></FieldBlock>; }
export function ManualCodeForm({ plans, action, phone = "", amount = 0, note = "" }: { plans: readonly SubscriptionPlanView[]; action: CodeAction; phone?: string; amount?: number; note?: string }) {
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); const planId = String(f.get("planId") ?? ""), network = String(f.get("network") ?? ""), transactionId = String(f.get("transactionId") ?? "").trim();
    await action.send("/api/admin/codes", { action: "manual", phone: f.get("phone"), note: f.get("note"), amount: Number(f.get("amount")), ...(planId ? { planId } : { days: Number(f.get("days")) }), ...(network ? { network } : {}), ...(transactionId ? { transactionId } : {}) }); }
  return <form method="post" action="/api/admin/codes" onSubmit={submit} data-analytics-ignore><FormStack><PhoneInput label="Account number" name="phone" defaultValue={phone || "256"} required /><FieldRow><PlanField plans={plans} /><FieldBlock>Custom days (1–366)<input name="days" type="number" min={1} max={366} defaultValue={1} /></FieldBlock></FieldRow>
    <FieldBlock>Amount received (UGX)<input name="amount" type="number" min={0} max={4294967295} defaultValue={amount} required /></FieldBlock>
    <FieldBlock>Required note<textarea name="note" maxLength={200} defaultValue={note} required /></FieldBlock><FieldRow><FieldBlock>Network (optional)<select name="network"><option value="">No transaction ID</option><option value="mtn">MTN</option><option value="airtel">Airtel</option></select></FieldBlock><FieldBlock>Transaction ID (optional)<input name="transactionId" maxLength={40} /></FieldBlock></FieldRow>
    <ActionButton type="submit" $variant="primary" disabled={action.busy}>Generate manual code</ActionButton></FormStack></form>;
}
export function CodeActions({ code, action }: { code: OwnerCode; action: CodeAction }) {
  return <FormStack><Muted>If the code was shared, also tap Sign out all devices on the subscriber page.</Muted><ButtonRow><ActionButton type="button" disabled={action.busy || code.status === "revoked"} onClick={() => void action.send("/api/admin/codes", { action: "reissue", id: code.id })}>Reissue</ActionButton><ActionButton type="button" disabled={action.busy || code.status === "revoked"} onClick={() => void action.send("/api/admin/codes", { action: "revoke", id: code.id, reason: "owner-revoked" })}>Revoke</ActionButton></ButtonRow>
    <form method="post" action="/api/admin/codes" onSubmit={e => { e.preventDefault(); void action.send("/api/admin/codes", { action: "extend", id: code.id, days: Number(new FormData(e.currentTarget).get("days")) }); }}><FieldRow><FieldBlock>Extend by days<input type="number" name="days" min={1} max={60} defaultValue={1} required /></FieldBlock><ActionButton type="submit" disabled={action.busy || code.status === "revoked"}>Extend</ActionButton></FieldRow></form></FormStack>;
}
export function CodesEditor({ owner, initialCodes, plans }: { owner: string; initialCodes: readonly OwnerCode[]; plans: readonly SubscriptionPlanView[] }) {
  const action = useCodeAction(owner), [found, setFound] = useState<readonly OwnerCode[] | null>(null), [status, setStatus] = useState("all"), [search, setSearch] = useState("");
  const codes = (found ? found.map(c => initialCodes.find(current => current.id === c.id) ?? c) : initialCodes).filter(c => status === "all" || c.status === status);
  return <div data-analytics-ignore><CodeReadyPanel owner={owner} immediate={action.delivery} done={action.clear} />{action.message && <Notice role="alert" $tone="error">{action.message}{action.duplicateId && <p><a href={`/admin/payments?tab=approved#${action.duplicateId}`}>Earlier payment</a></p>}</Notice>}
    <Panel><PanelHeader><h2>Generate a manual code</h2></PanelHeader><ManualCodeForm plans={plans} action={action} /></Panel>
    <Panel><form method="post" action="/api/admin/codes" onSubmit={async e => { e.preventDefault(); const r = await action.send("/api/admin/codes", { action: "search", search, status }); if (r.ok) setFound(r.body.codes as OwnerCode[]); }}><FieldRow><FieldBlock>Phone or P-/C-reference<input value={search} onChange={e => setSearch(e.target.value)} maxLength={40} /></FieldBlock><FieldBlock>Status<select value={status} onChange={e => { const value = e.target.value; setStatus(value); void action.send("/api/admin/codes", { action: "search", search, status: value }).then(r => { if (r.ok) setFound(r.body.codes as OwnerCode[]); }); }}>{["all", "active", "queued", "expired", "revoked"].map(s => <option key={s}>{s}</option>)}</select></FieldBlock><ActionButton type="submit" disabled={action.busy}>Search</ActionButton></FieldRow></form></Panel>
    {codes.length === 0 && <Muted>No matching codes.</Muted>}{codes.map(code => <Panel key={code.id}><PanelHeader><h2>{code.reference} · {code.status}</h2></PanelHeader><p><a href={`/admin/subscribers?accountId=${code.accountId}`}>{code.phone ? formatPhone(code.phone) : "Erased account"}</a> · {code.planName} · {code.daysLeft} days left</p><p>{formatPeriodEnd(new Date(code.startsAt))} – {formatPeriodEnd(new Date(code.endsAt))}</p><CodeActions code={code} action={action} /></Panel>)}
  </div>;
}
