"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { PhoneInput } from "@/components/ui/controls";
import { GiftIcon, KeyIcon, PhoneIcon, ShieldIcon, SignOutIcon, TrashIcon } from "@/components/ui/icons";
import { ActionButton, DangerButton, FieldBlock } from "./admin-form";
import { CodeActions, ManualCodeForm, type CodeAction } from "./code-tools";
import { PasswordReset, type Revealed } from "./subscriber-credentials";
import { ActionClose, CompactForm, DetailHeading, DetailLayout, DetailPanel, MutedText, NoteFooter, QuickActions, RecordHeader,
  Records, SectionHeader, SensitiveOptions, Stats, Status, StatusRow, Tabs } from "./subscriber-styles";

type AccountAction = "grant" | "number" | "password" | "block" | "devices" | "delete" | "erase";
type Tab = "overview" | "access" | "payments" | "devices";
const tabs: readonly Tab[] = ["overview", "access", "payments", "devices"];
const tabLabels = { overview: "Overview", access: "Access", payments: "Payments", devices: "Devices" };
const actionTitles: Record<AccountAction, string> = { grant: "Grant access", number: "Change number", password: "Reset password",
  block: "Account restriction", devices: "Sign out all devices", delete: "Permanently delete account", erase: "Erase personal data" };

export function SubscriberDetail({ account, plans, action, onDeleted, onReveal }: {
  account: OwnerSubscriber; plans: readonly SubscriptionPlanView[]; action: CodeAction; onDeleted: () => void; onReveal: (value: Revealed) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview"), [active, setActive] = useState<AccountAction | null>(null);
  const id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const path = `/api/admin/subscribers/${account.id}`, erased = !!account.erasedAt;
  const access = account.codes.some(code => code.status === "active") ? "Active access" : account.codes.some(code => code.status === "queued") ? "Queued access" : "No current access";
  const counts = { overview: null, access: account.codes.length, payments: account.submissions.length, devices: account.devices.length };
  useEffect(() => { if (active) heading.current?.focus(); }, [active]);
  function closeAction() {
    if (action.busy) return;
    const previous = active === "erase" ? "delete" : active;
    setActive(null); requestAnimationFrame(() => document.getElementById(`${id}-action-${previous}`)?.focus());
  }
  function tabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const index = tabs.indexOf(tab);
    const next = (event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length])!;
    setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  function task(value: AccountAction, label: string, icon: ReactNode, disabled = false) {
    const props = { id: `${id}-action-${value}`, type: "button" as const, disabled: action.busy || disabled,
      "aria-expanded": active === value || value === "delete" && active === "erase", "aria-controls": `${id}-action-panel`,
      onClick: () => active === value ? closeAction() : setActive(value) };
    return value === "delete" ? <DangerButton {...props}>{icon}{label}</DangerButton> : <ActionButton {...props} $variant={value === "grant" ? "primary" : "secondary"}>{icon}{label}</ActionButton>;
  }
  return <DetailLayout data-subscriber-detail={account.id}>
    <DetailPanel aria-label="Subscriber account">
      <DetailHeading><div><h2>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</h2>
        <p>Last sign-in {formatPeriodEnd(new Date(account.lastSignInAt))}</p>
        <StatusRow><Status $tone={erased ? "muted" : account.blockedAt ? "warning" : "good"}>{erased ? "Erased" : account.blockedAt ? "Blocked" : "Open"}</Status>
          <Status $tone={access === "Active access" ? "good" : "muted"}>{access}</Status></StatusRow>
      </div></DetailHeading>
      <Stats><div><dt>Unlocked devices</dt><dd>{account.devices.length}</dd></div><div><dt>Access periods</dt><dd>{account.codes.length}</dd></div><div><dt>Unlocks · 30 days</dt><dd>{account.unlocks}</dd></div></Stats>
      {account.blockedReason && <MutedText role="note">Blocked: {account.blockedReason}</MutedText>}
      <QuickActions aria-label="Account actions" data-subscriber-actions>
        {!erased && <>
          {task("grant", "Grant access", <GiftIcon />)}
          {task("number", "Change number", <PhoneIcon />)}
          {task("password", "Reset password", <KeyIcon />, !!account.blockedAt)}
          {task("block", account.blockedAt ? "Unblock account" : "Block account", <ShieldIcon />)}
          {task("devices", "Sign out devices", <SignOutIcon />)}
        </>}
        {task("delete", "Delete account", <TrashIcon />)}
      </QuickActions>
      {!erased && account.blockedAt && <MutedText>Unblock this account to reset its password.</MutedText>}
    </DetailPanel>
    {active && <DetailPanel id={`${id}-action-panel`} role="region" aria-labelledby={`${id}-action-title`} data-subscriber-action-panel={active}
      onKeyDown={event => { if (event.key === "Escape" && !action.busy) { event.preventDefault(); closeAction(); } }}>
      <SectionHeader><h2 id={`${id}-action-title`} tabIndex={-1} ref={heading}>{active === "block" ? account.blockedAt ? "Unblock account" : "Block account" : actionTitles[active]}</h2>
        <ActionClose type="button" disabled={action.busy} onClick={closeAction}>Cancel</ActionClose></SectionHeader>
      {active === "grant" && <ManualCodeForm plans={plans} action={action} phone={account.phone ?? ""} compact fixedPhone onSaved={closeAction} />}
      {active === "password" && <><MutedText>Every device signs out. The temporary password works once and expires in 15 minutes.</MutedText>
        <PasswordReset path={path} action={action} reveal={value => { onReveal({ ...value, phone: account.phone }); setActive(null); }} /></>}
      {active === "number" && <ChangeNumber path={path} action={action} onSaved={closeAction} />}
      {active === "block" && <CompactForm method="post" action={path} onSubmit={async event => {
        event.preventDefault(); if (action.busy) return;
        const reply = await action.send(path, { action: account.blockedAt ? "unblock" : "block", value: new FormData(event.currentTarget).get("reason") }, account.blockedAt ? "Account unblocked." : "Account blocked and devices signed out.");
        if (reply.ok) closeAction();
      }}><MutedText>{account.blockedAt ? "Allow this member to sign in again." : "Prevent sign-in and sign out every device."}</MutedText>
        <FieldBlock>Reason<input name="reason" required maxLength={200} disabled={action.busy} /></FieldBlock>
        <ActionButton type="submit" $variant="primary" disabled={action.busy}>{account.blockedAt ? "Unblock account" : "Block account"}</ActionButton></CompactForm>}
      {active === "devices" && <><MutedText>The member will need to log in again on every device.</MutedText><ActionButton type="button" disabled={action.busy} onClick={async () => {
        const reply = await action.send(path, { action: "sign-out-all" }, "All devices signed out."); if (reply.ok) closeAction();
      }}>Sign out all devices</ActionButton></>}
      {active === "delete" && <><ConfirmedRemoval key="delete" kind="delete" account={account} action={action} onSaved={onDeleted} />
        {!erased && <SensitiveOptions><MutedText>Keep payment amounts and access history for accounting?</MutedText>
          <ActionButton type="button" disabled={action.busy} onClick={() => setActive("erase")}>Erase personal data instead</ActionButton></SensitiveOptions>}</>}
      {active === "erase" && <ConfirmedRemoval key="erase" kind="erase" account={account} action={action} onSaved={closeAction} />}
    </DetailPanel>}
    <Tabs role="tablist" aria-label="Subscriber details" onKeyDown={tabKey} data-subscriber-tabs>
      {tabs.map(value => <button key={value} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-view-${value}`}
        aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{tabLabels[value]}{counts[value] !== null && <span>({counts[value]})</span>}</button>)}
    </Tabs>
    <DetailPanel role="tabpanel" id={`${id}-view-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} data-subscriber-tab={tab}>
      {tab === "overview" && <>
        {!erased ? <OwnerNote key={account.ownerNote} account={account} action={action} /> : <MutedText>Personal data has been erased. Accounting history is retained.</MutedText>}
        <details><summary>Account ID</summary><MutedText>{account.id}</MutedText></details>
      </>}
      {tab === "access" && <><SectionHeader><h2>Access periods</h2>{!erased && <ActionButton type="button" disabled={action.busy} onClick={() => setActive("grant")}>Grant access</ActionButton>}</SectionHeader>
        {account.codes.length ? <Records>{account.codes.map(code => <li key={code.id}><RecordHeader><strong>{code.planName} · {code.reference}</strong><Status $tone={code.status === "active" ? "good" : code.status === "queued" ? "warning" : "muted"}>{code.status}</Status></RecordHeader>
          <p>{code.daysLeft} days left · Until {formatPeriodEnd(new Date(code.endsAt))}</p>
          {!erased && <CodeActions code={code} action={action} compact />}</li>)}</Records> : <MutedText>No access periods.</MutedText>}</>}
      {tab === "payments" && <><h2>Payment submissions</h2>{account.submissions.length ? <Records>{account.submissions.map(payment => <li key={payment.id}>
        <RecordHeader><a href={`/admin/payments?tab=${payment.status === "approved" || payment.status === "reversed" ? "approved" : payment.status === "rejected" ? "rejected" : "pending"}#${payment.id}`}>{payment.reference}</a>
          <Status $tone={payment.status === "approved" ? "good" : payment.status === "pending" ? "warning" : "muted"}>{payment.status}</Status></RecordHeader>
        <p>{payment.planName} · UGX {(payment.amountReceivedUgx ?? payment.claimedAmountUgx).toLocaleString("en-UG")}</p>
        <small>{formatPeriodEnd(new Date(payment.submittedAt))}</small>
      </li>)}</Records> : <MutedText>No payment submissions.</MutedText>}</>}
      {tab === "devices" && <><SectionHeader><h2>Unlocked devices</h2>{!erased && account.devices.length > 0 && <ActionButton type="button" disabled={action.busy} onClick={() => setActive("devices")}>Sign out all</ActionButton>}</SectionHeader>
        {account.devices.length ? <Records>{account.devices.map((device, index) => <li key={`${device.createdAt}-${index}`}><strong>Device {index + 1}</strong><p>Last seen {formatPeriodEnd(new Date(device.lastSeenAt))}</p><small>Expires {formatPeriodEnd(new Date(device.expiresAt))}</small></li>)}</Records> : <MutedText>No unlocked devices.</MutedText>}</>}
    </DetailPanel>
    {tabs.filter(value => value !== tab).map(value => <div key={value} role="tabpanel" hidden id={`${id}-view-${value}`} aria-labelledby={`${id}-tab-${value}`} />)}
  </DetailLayout>;
}

function OwnerNote({ account, action }: { account: OwnerSubscriber; action: CodeAction }) {
  const [note, setNote] = useState(account.ownerNote ?? "");
  return <CompactForm method="post" action={`/api/admin/subscribers/${account.id}`} onSubmit={async event => {
    event.preventDefault(); if (!action.busy) await action.send(`/api/admin/subscribers/${account.id}`, { action: "note", value: note }, "Owner note saved.");
  }}><FieldBlock>Owner note<textarea name="note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.currentTarget.value)} disabled={action.busy} placeholder="Add a private note…" /></FieldBlock>
    <NoteFooter><span>{note.length}/500 · Admin only</span><ActionButton type="submit" $variant="primary" disabled={action.busy || note === (account.ownerNote ?? "")}>Save note</ActionButton></NoteFooter>
  </CompactForm>;
}

function ChangeNumber({ path, action, onSaved }: { path: string; action: CodeAction; onSaved: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (action.busy) return;
    const data = new FormData(event.currentTarget);
    const reply = await action.send(path, { action: "change-number", newPhone: data.get("newPhone"), verifiedBy: data.get("verifiedBy"), confirmed: data.get("confirmed") === "on" }, "Remaining access moved to the new number. Old sessions no longer have access.");
    if (reply.ok) onSaved();
  }
  return <CompactForm method="post" action={path} onSubmit={submit}><MutedText>Move remaining access to the new number&apos;s account. Old sessions lose access.</MutedText>
    <PhoneInput label="New phone number" name="newPhone" required disabled={action.busy} hint="" />
    <FieldBlock>Verified by<select name="verifiedBy" required disabled={action.busy}><option value="">Choose verification</option><option value="old-number">Old number</option><option value="payment-details">Payment details</option></select></FieldBlock>
    <label><input type="checkbox" name="confirmed" required disabled={action.busy} /> I verified this request.</label>
    <ActionButton type="submit" $variant="primary" disabled={action.busy}>Change number and move access</ActionButton>
  </CompactForm>;
}

function ConfirmedRemoval({ kind, account, action, onSaved }: { kind: "delete" | "erase"; account: OwnerSubscriber; action: CodeAction; onSaved: () => void }) {
  const [confirmed, setConfirmed] = useState(false), deleting = kind === "delete";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirmed || action.busy) return;
    const reply = await action.send(`/api/admin/subscribers/${account.id}`, { action: kind, confirmed }, deleting ? "Account and all related information permanently deleted." : "Personal data erased. Accounting history retained.");
    if (reply.ok) onSaved();
  }
  return <CompactForm method="post" action={`/api/admin/subscribers/${account.id}`} onSubmit={submit} data-subscriber-removal={kind}>
    <strong>{account.phone ? `+${formatPhone(account.phone)}` : `Erased account · ${account.id}`}</strong>
    <MutedText>{deleting ? "Permanently removes the account and all related information, including payments, screenshots, access, saved slips and audit records. Payment totals will change. This cannot be undone."
      : "Clears numbers, passwords, notes, sessions and screenshots. Payment amounts, IDs and access history remain for accounting. This cannot be undone."}</MutedText>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => setConfirmed(event.target.checked)} /> I verified this account and understand this cannot be undone.</label>
    <DangerButton type="submit" disabled={action.busy || !confirmed}>{deleting ? "Permanently delete account" : "Erase personal data"}</DangerButton>
  </CompactForm>;
}
