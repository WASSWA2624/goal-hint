"use client";
import { useState, type FormEvent } from "react";
import styled from "styled-components";
import { Muted, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/controls";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerAccount, OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, ButtonRow, FieldBlock, FieldRow, FormStack, Hint } from "./admin-form";
import { ActionNotices, CodeActions, ManualCodeForm, useCodeAction, type CodeAction } from "./code-tools";
/** An owner reset's answer (068 D1-reset), held in memory only: shown once, never stored, gone on Done or leaving the page. */
type Revealed = Readonly<{ password: string; accountId: string; phone: string | null; created: boolean; sessionsDeleted: number }>;
export function SubscribersEditor({ accounts, detail, plans }: { accounts: readonly OwnerAccount[]; detail: OwnerSubscriber | null; plans: readonly SubscriptionPlanView[] }) {
  const action = useCodeAction(), [found, setFound] = useState<readonly OwnerAccount[] | null>(null), [search, setSearch] = useState(""), [adminPhone, setAdminPhone] = useState<string | null>(null), [revealed, setRevealed] = useState<Revealed | null>(null);
  const path = detail ? `/api/admin/subscribers/${detail.id}` : "/api/admin/subscribers";
  return <div data-analytics-ignore><ActionNotices action={action} />{revealed && <TemporaryPassword value={revealed} done={() => setRevealed(null)} />}
    <Panel><form method="post" action="/api/admin/subscribers" onSubmit={async e => { e.preventDefault(); const r = await action.send("/api/admin/subscribers", { search }); if (r.ok) { setFound(r.body.accounts as OwnerAccount[]); setAdminPhone(typeof r.body.adminPhone === "string" ? r.body.adminPhone : null); } }}><FieldRow><PhoneInput label="Search by phone" value={search} onValueChange={setSearch} /><ActionButton disabled={action.busy}>Search</ActionButton></FieldRow></form>
      {(found ?? accounts).map(a => <p key={a.id}><a href={`/admin/subscribers?accountId=${a.id}`}>{a.phone ? formatPhone(a.phone) : "Erased account"}</a> · {a.status}</p>)}
      {adminPhone && <FormStack><Muted>{formatPhone(adminPhone)} is an administrator number without an account. A temporary password creates its account.</Muted>
        <PasswordReset path="/api/admin/subscribers" phone={adminPhone} action={action} reveal={value => { setAdminPhone(null); setRevealed(value); }} /></FormStack>}</Panel>
    {detail && <><Panel><PanelHeader><h2>{detail.phone ? formatPhone(detail.phone) : "Erased account"}</h2></PanelHeader><p>{detail.erasedAt ? "Erased" : detail.blockedAt ? "Blocked" : detail.codes.some(c => c.status === "active") ? "Active access" : detail.codes.some(c => c.status === "queued") ? "Queued access" : "No current access"} · {detail.unlocks} unlocks in the last 30 days</p>{detail.blockedReason && <p>{detail.blockedReason}</p>}
      {!detail.erasedAt && <FormStack><ActionButton type="button" disabled={action.busy} onClick={() => void action.send(path, { action: "sign-out-all" })}>Sign out all devices</ActionButton>
        <form method="post" action={path} onSubmit={e => { e.preventDefault(); void action.send(path, { action: detail.blockedAt ? "unblock" : "block", value: new FormData(e.currentTarget).get("reason") }); }}><FieldBlock>Reason<input name="reason" required maxLength={200} /></FieldBlock><ActionButton disabled={action.busy}>{detail.blockedAt ? "Unblock" : "Block"}</ActionButton></form>
        <form method="post" action={path} onSubmit={e => { e.preventDefault(); void action.send(path, { action: "note", value: new FormData(e.currentTarget).get("note") }); }}><FieldBlock>Owner note<textarea key={detail.ownerNote} name="note" maxLength={500} defaultValue={detail.ownerNote ?? ""} /></FieldBlock><ActionButton disabled={action.busy}>Save note</ActionButton></form>
      </FormStack>}
    </Panel>
    {!detail.erasedAt && <Panel><PanelHeader><h2>Password</h2></PanelHeader><Muted>For a member who forgot their password and called you. Every device of this account signs out.</Muted>
      {detail.blockedAt ? <Muted>Unblock this account before setting a password.</Muted> : <PasswordReset path={path} action={action} reveal={value => setRevealed({ ...value, phone: detail.phone })} />}</Panel>}
    <Panel><PanelHeader><h2>Unlocked devices ({detail.devices.length})</h2></PanelHeader>{detail.devices.map((d,i) => <p key={i}>Device {i+1} · last seen {formatPeriodEnd(new Date(d.lastSeenAt))}</p>)}{!detail.devices.length && <Muted>No unlocked devices.</Muted>}</Panel>
    <Panel><PanelHeader><h2>Access</h2></PanelHeader>{detail.codes.map(c => <FormStack key={c.id}><p>{c.reference} · {c.planName} · {c.status} · {c.daysLeft} days left</p><p>Until {formatPeriodEnd(new Date(c.endsAt))}</p>{!detail.erasedAt && <CodeActions code={c} action={action} />}</FormStack>)}{!detail.codes.length && <Muted>No access periods.</Muted>}</Panel>
    <Panel><PanelHeader><h2>Payment submissions</h2></PanelHeader>{detail.submissions.map(p => <p key={p.id}><a href={`/admin/payments?tab=${p.status === "approved" || p.status === "reversed" ? "approved" : p.status === "rejected" ? "rejected" : "pending"}#${p.id}`}>{p.reference}</a> · {p.status} · {p.planName} · UGX {(p.amountReceivedUgx ?? p.claimedAmountUgx).toLocaleString("en-UG")}</p>)}</Panel>
    {!detail.erasedAt && <><Panel><PanelHeader><h2>Grant access manually</h2></PanelHeader><ManualCodeForm plans={plans} action={action} phone={detail.phone ?? ""} /></Panel>
    <Panel><PanelHeader><h2>Change number</h2></PanelHeader><Muted>First verify the request from the old number or against the payment details. Remaining access moves to the new number&apos;s account and unlocks its signed-in devices; old sessions lose access.</Muted>
      <form method="post" action={path} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void action.send(path, { action: "change-number", newPhone: f.get("newPhone"), verifiedBy: f.get("verifiedBy"), confirmed: f.get("confirmed") === "on" }); }}><FormStack><PhoneInput label="New phone number" name="newPhone" required /><FieldBlock>Verified by<select name="verifiedBy" required><option value="">Choose how you verified</option><option value="old-number">Old number</option><option value="payment-details">Payment details</option></select></FieldBlock><label><input type="checkbox" name="confirmed" required /> I verified this request.</label><ActionButton disabled={action.busy}>Change number and move access</ActionButton></FormStack></form>
    </Panel><Panel><PanelHeader><h2>Erase personal data</h2></PanelHeader><Muted>This clears numbers, notes, sessions and screenshots. Payment amounts, IDs and access history remain for accounting. This cannot be undone.</Muted>
      <form method="post" action={path} onSubmit={e => { e.preventDefault(); void action.send(path, { action: "erase", confirmed: new FormData(e.currentTarget).get("confirmed") === "on" }); }}><FormStack><label><input type="checkbox" name="confirmed" required /> I verified the account and want to erase its personal data.</label><ActionButton disabled={action.busy}>Erase personal data</ActionButton></FormStack></form>
    </Panel></>}
    </>}
  </div>;
}
/** Sets a temporary password for the account at `path`, or by `phone` for an allow-listed administrator number without one. */
function PasswordReset({ path, phone, action, reveal }: { path: string; phone?: string; action: CodeAction; reveal: (value: Revealed) => void }) {
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget, confirmed = new FormData(form).get("confirmed") === "on";
    const r = await action.send(path, { action: "temporary-password", ...(phone ? { phone } : {}), confirmed });
    if (r.ok && r.body.status === "reset" && typeof r.body.temporaryPassword === "string" && typeof r.body.accountId === "string") { form.reset();
      reveal({ password: r.body.temporaryPassword, accountId: r.body.accountId, phone: phone ?? null, created: r.body.created === true, sessionsDeleted: typeof r.body.sessionsDeleted === "number" ? r.body.sessionsDeleted : 0 }); } }
  return <form method="post" action={path} onSubmit={submit}><FormStack><label><input type="checkbox" name="confirmed" required /> I am on a call with the member and checked it is their number.</label><ActionButton disabled={action.busy}>Set temporary password</ActionButton></FormStack></form>;
}
function TemporaryPassword({ value, done }: { value: Revealed; done: () => void }) {
  const [copied, setCopied] = useState(false);
  return <Panel aria-label="Temporary password"><PanelHeader><h2>Temporary password{value.phone ? ` · ${formatPhone(value.phone)}` : ""}</h2></PanelHeader>
    <Secret translate="no">{value.password}</Secret><ButtonRow><ActionButton type="button" onClick={() => { void navigator.clipboard?.writeText(value.password).then(() => setCopied(true), () => {}); }}>{copied ? "Copied" : "Copy"}</ActionButton><ActionButton type="button" onClick={done}>Done</ActionButton></ButtonRow>
    <Hint>Read it to the member on the phone. They should change it under Account.</Hint>
    <Muted>{value.sessionsDeleted} device{value.sessionsDeleted === 1 ? "" : "s"} signed out. It is shown only now; set a new one if it is lost.</Muted>
    {value.created && <p><a href={`/admin/subscribers?accountId=${value.accountId}`}>Open the new account</a></p>}
  </Panel>;
}
const Secret = styled.p`font-size: clamp(1.3rem, 5vw, 2rem); font-weight: 800; letter-spacing: 0.08em; overflow-wrap: anywhere;`;
