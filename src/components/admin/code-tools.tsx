"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Muted, Notice, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/controls";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerCode } from "@/domain/owner-members";
import { ActionButton, ButtonRow, FieldBlock, FieldRow, FormStack, postAdmin, replyMessage, type AdminReply } from "./admin-form";
/** A new access period's 201 answer (068) as one short line: nothing is sent, the account's signed-in devices unlock at once. */
export function grantNotice(body: AdminReply["body"]): string | null {
  if (typeof body.endsAt !== "string" || typeof body.devicesUnlocked !== "number") return null;
  const n = body.devicesUnlocked, line = `${body.status === "approved" ? "Approved" : "Granted"} · access until ${formatPeriodEnd(new Date(body.endsAt))} · ${n} device${n === 1 ? "" : "s"} unlocked`;
  return n ? line : `${line}. Devices already unlocked keep access; the member's next sign-in unlocks one.`;
}
export function useCodeAction() {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [notice, setNotice] = useState(""), [duplicateId, setDuplicateId] = useState<string | null>(null);
  /** `done` is the notice a plain success shows; a new access period always shows its own. */
  async function send(path: string, body: unknown, done = "") {
    setBusy(true); setMessage(""); setNotice(""); setDuplicateId(null);
    const reply = await postAdmin(path, body); setBusy(false);
    if (reply.ok) { setNotice(grantNotice(reply.body) ?? done); router.refresh(); }
    else { setMessage(replyMessage(reply, "The action was refused.")); if (typeof reply.body.submissionId === "string") setDuplicateId(reply.body.submissionId); }
    return reply;
  }
  return { busy, message, notice, duplicateId, send };
}
export type CodeAction = ReturnType<typeof useCodeAction>;
/** The last action's outcome; a duplicate transaction ID links the earlier payment. */
export function ActionNotices({ action }: { action: CodeAction }) {
  return <>{action.notice && <Notice role="status">{action.notice}</Notice>}{action.message && <Notice role="alert" $tone="error">{action.message}{action.duplicateId && <> <a href={`/admin/payments?tab=approved#${action.duplicateId}`}>Earlier payment</a></>}</Notice>}</>;
}
export function PlanField({ plans, value, allowCustom = true }: { plans: readonly SubscriptionPlanView[]; value?: string; allowCustom?: boolean }) { return <FieldBlock>Plan<select name="planId" defaultValue={value ?? plans[0]?.id ?? ""}>{allowCustom && <option value="">Custom days</option>}{plans.map(p => <option key={p.id} value={p.id}>{p.name} · UGX {p.priceUgx.toLocaleString("en-UG")}</option>)}</select></FieldBlock>; }
export function ManualCodeForm({ plans, action, phone = "", amount = 0, note = "" }: { plans: readonly SubscriptionPlanView[]; action: CodeAction; phone?: string; amount?: number; note?: string }) {
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); const planId = String(f.get("planId") ?? ""), network = String(f.get("network") ?? ""), transactionId = String(f.get("transactionId") ?? "").trim();
    await action.send("/api/admin/codes", { action: "manual", phone: f.get("phone"), note: f.get("note"), amount: Number(f.get("amount")), ...(planId ? { planId } : { days: Number(f.get("days")) }), ...(network ? { network } : {}), ...(transactionId ? { transactionId } : {}) }); }
  return <form method="post" action="/api/admin/codes" onSubmit={submit} data-analytics-ignore><FormStack><PhoneInput label="Account number" name="phone" defaultValue={phone || "256"} required /><FieldRow><PlanField plans={plans} /><FieldBlock>Custom days (1–366)<input name="days" type="number" min={1} max={366} defaultValue={1} /></FieldBlock></FieldRow>
    <FieldBlock>Amount received (UGX)<input name="amount" type="number" min={0} max={4294967295} defaultValue={amount} required /></FieldBlock>
    <FieldBlock>Required note<textarea name="note" maxLength={200} defaultValue={note} required /></FieldBlock><FieldRow><FieldBlock>Network (optional)<select name="network"><option value="">No transaction ID</option><option value="mtn">MTN</option><option value="airtel">Airtel</option></select></FieldBlock><FieldBlock>Transaction ID (optional)<input name="transactionId" maxLength={40} /></FieldBlock></FieldRow>
    <Muted>The account&apos;s signed-in devices unlock at once; an account without one unlocks when the member signs in.</Muted>
    <ActionButton type="submit" $variant="primary" disabled={action.busy}>Grant access manually</ActionButton></FormStack></form>;
}
export function CodeActions({ code, action }: { code: OwnerCode; action: CodeAction }) {
  return <FormStack><Muted>Revoke ends this period at once; devices stay unlocked only while another period is live.</Muted><ButtonRow><ActionButton type="button" disabled={action.busy || code.status === "revoked"} onClick={() => void action.send("/api/admin/codes", { action: "revoke", id: code.id, reason: "owner-revoked" })}>Revoke</ActionButton></ButtonRow>
    <form method="post" action="/api/admin/codes" onSubmit={e => { e.preventDefault(); void action.send("/api/admin/codes", { action: "extend", id: code.id, days: Number(new FormData(e.currentTarget).get("days")) }); }}><FieldRow><FieldBlock>Extend by days<input type="number" name="days" min={1} max={60} defaultValue={1} required /></FieldBlock><ActionButton type="submit" disabled={action.busy || code.status === "revoked"}>Extend</ActionButton></FieldRow></form></FormStack>;
}
export function CodesEditor({ initialCodes, plans }: { initialCodes: readonly OwnerCode[]; plans: readonly SubscriptionPlanView[] }) {
  const action = useCodeAction(), [found, setFound] = useState<readonly OwnerCode[] | null>(null), [status, setStatus] = useState("all"), [search, setSearch] = useState("");
  const codes = (found ? found.map(c => initialCodes.find(current => current.id === c.id) ?? c) : initialCodes).filter(c => status === "all" || c.status === status);
  return <div data-analytics-ignore><ActionNotices action={action} />
    <Panel><PanelHeader><h2>Grant access manually</h2></PanelHeader><ManualCodeForm plans={plans} action={action} /></Panel>
    <Panel><form method="post" action="/api/admin/codes" onSubmit={async e => { e.preventDefault(); const r = await action.send("/api/admin/codes", { action: "search", search, status }); if (r.ok) setFound(r.body.codes as OwnerCode[]); }}><FieldRow><FieldBlock>Phone or P-/C-reference<input value={search} onChange={e => setSearch(e.target.value)} maxLength={40} /></FieldBlock><FieldBlock>Status<select value={status} onChange={e => { const value = e.target.value; setStatus(value); void action.send("/api/admin/codes", { action: "search", search, status: value }).then(r => { if (r.ok) setFound(r.body.codes as OwnerCode[]); }); }}>{["all", "active", "queued", "expired", "revoked"].map(s => <option key={s}>{s}</option>)}</select></FieldBlock><ActionButton type="submit" disabled={action.busy}>Search</ActionButton></FieldRow></form></Panel>
    {codes.length === 0 && <Muted>No matching codes.</Muted>}{codes.map(code => <Panel key={code.id}><PanelHeader><h2>{code.reference} · {code.status}</h2></PanelHeader><p><a href={`/admin/subscribers?accountId=${code.accountId}`}>{code.phone ? formatPhone(code.phone) : "Erased account"}</a> · {code.planName} · {code.daysLeft} days left</p><p>{formatPeriodEnd(new Date(code.startsAt))} – {formatPeriodEnd(new Date(code.endsAt))}</p><CodeActions code={code} action={action} /></Panel>)}
  </div>;
}
