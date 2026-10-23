"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Muted, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/controls";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerAccount, OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, ButtonRow, DangerButton, FieldBlock, FormStack, Hint } from "./admin-form";
import { ActionNotices, CodeActions, ManualCodeForm, useCodeAction, type CodeAction } from "./code-tools";
import { SubscriberDirectory } from "./subscriber-directory";
/** An owner reset's answer (068 D1-reset), held in memory only: shown once, never stored, gone on Done or leaving the page. */
export type Revealed = Readonly<{ password: string; accountId: string; phone: string | null; created: boolean; sessionsDeleted: number; expiresAt: string }>;
export function SubscribersEditor({ accounts, detail: selected, plans }: { accounts: readonly OwnerAccount[]; detail: OwnerSubscriber | null; plans: readonly SubscriptionPlanView[] }) {
  const router = useRouter(), action = useCodeAction(), [found, setFound] = useState<readonly OwnerAccount[] | null>(null), [search, setSearch] = useState(""), [filtering, setFiltering] = useState(false), [adminPhone, setAdminPhone] = useState<string | null>(null), [revealed, setRevealed] = useState<Revealed | null>(null), [deletedId, setDeletedId] = useState<string | null>(null);
  const detail = selected?.id === deletedId ? null : selected;
  const currentAccounts = new Map(accounts.map(account => [account.id, account]));
  const listedAccounts = (found ?? accounts).filter(account => account.id !== deletedId).map(account => currentAccounts.get(account.id) ?? account);
  const path = detail ? `/api/admin/subscribers/${detail.id}` : "/api/admin/subscribers";
  return <div data-analytics-ignore><ActionNotices action={action} />{revealed && <TemporaryPassword value={revealed} done={() => setRevealed(null)} />}
    <SubscriberDirectory accounts={listedAccounts} selectedId={detail?.id ?? null}
      search={search} onSearchChange={setSearch} filtering={filtering} busy={action.busy} adminPhone={adminPhone}
      onSearch={async query => {
        if (action.busy) return;
        const reply = await action.send("/api/admin/subscribers", { search: query });
        if (reply.ok) {
          setFound(reply.body.accounts as OwnerAccount[]); setFiltering(query.trim() !== "");
          setAdminPhone(typeof reply.body.adminPhone === "string" ? reply.body.adminPhone : null);
        }
      }} />
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
    <DeleteAccount key={detail.id} account={detail} action={action} onDeleted={() => { setDeletedId(detail.id); setRevealed(null); router.replace("/admin/subscribers", { scroll: false }); }} />
    </>}
  </div>;
}
function DeleteAccount({ account, action, onDeleted }: { account: OwnerSubscriber; action: CodeAction; onDeleted: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || action.busy) return;
    const reply = await action.send(`/api/admin/subscribers/${account.id}`, { action: "delete", confirmed }, "Account and all related information permanently deleted.");
    if (reply.ok) onDeleted();
  }
  return <Panel><PanelHeader><h2>Permanently delete account</h2></PanelHeader>
    <p>{account.phone ? formatPhone(account.phone) : `Erased account · ${account.id}`}</p>
    <Muted>This permanently removes the account, passwords, all sessions, verification records, saved slips, payments, screenshots, access history and related audit records. Payment totals will change. This cannot be undone.</Muted>
    <form method="post" action={`/api/admin/subscribers/${account.id}`} onSubmit={submit}><FormStack>
      <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => setConfirmed(event.target.checked)} /> I verified this account and want to permanently delete it and all related information.</label>
      <DangerButton type="submit" disabled={action.busy || !confirmed}>Permanently delete account</DangerButton>
    </FormStack></form>
  </Panel>;
}
/** Generates a single-use member recovery password after the admin verifies the caller. */
export function PasswordReset({ path, phone, action, reveal }: { path: string; phone?: string; action: CodeAction; reveal: (value: Revealed) => void }) {
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget, confirmed = new FormData(form).get("confirmed") === "on";
    const r = await action.send(path, { action: "temporary-password", ...(phone ? { phone } : {}), confirmed });
    if (r.ok && r.body.status === "reset" && typeof r.body.temporaryPassword === "string" && typeof r.body.accountId === "string") { form.reset();
      reveal({ password: r.body.temporaryPassword, accountId: r.body.accountId, phone: phone ?? null, created: r.body.created === true,
        expiresAt: typeof r.body.expiresAt === "string" ? r.body.expiresAt : "", sessionsDeleted: typeof r.body.sessionsDeleted === "number" ? r.body.sessionsDeleted : 0 }); } }
  return <form method="post" action={path} onSubmit={submit}><FormStack><label><input type="checkbox" name="confirmed" required /> I am on a call with the member and checked it is their number.</label><ActionButton disabled={action.busy}>Set temporary password</ActionButton></FormStack></form>;
}
export function TemporaryPassword({ value, done }: { value: Revealed; done: () => void }) {
  const [copied, setCopied] = useState(false);
  return <Panel aria-label="Temporary password"><PanelHeader><h2>Temporary password{value.phone ? ` · ${formatPhone(value.phone)}` : ""}</h2></PanelHeader>
    <Secret translate="no">{value.password}</Secret><ButtonRow><ActionButton type="button" onClick={() => { void navigator.clipboard?.writeText(value.password).then(() => setCopied(true), () => {}); }}>{copied ? "Copied" : "Copy"}</ActionButton><ActionButton type="button" onClick={done}>Done</ActionButton></ButtonRow>
    <Hint>Read it to the member on the phone. It works once and requires them to choose a new password before signing in.</Hint>
    {value.expiresAt && <p>Expires {formatPeriodEnd(new Date(value.expiresAt))} (15 minutes).</p>}
    <Muted>{value.sessionsDeleted} device{value.sessionsDeleted === 1 ? "" : "s"} signed out. It is shown only now; set a new one if it is lost.</Muted>
    {value.created && <p><a href={`/admin/subscribers?accountId=${value.accountId}`}>Open the new account</a></p>}
  </Panel>;
}
const Secret = styled.p`font-size: clamp(1.3rem, 5vw, 2rem); font-weight: 800; letter-spacing: 0.08em; overflow-wrap: anywhere;`;
