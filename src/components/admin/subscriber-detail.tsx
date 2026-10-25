"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatCredit, formatCreditChange, walletKindLabels, walletRules } from "@/domain/wallet";
import { PhoneInput } from "@/components/ui/controls";
import { ChevronDownIcon, GiftIcon, Icon, KeyIcon, ShieldIcon, SignOutIcon, TrashIcon, type IconProps } from "@/components/ui/icons";
import { ActionButton, Badge, DangerButton, FieldBlock, FieldRow } from "./admin-form";
import { CodeActions, ManualCodeForm, type CodeAction } from "./code-tools";
import { DeskColumn, Drawer, MetaLine, Panel, PanelHead, RowList, RowMeta, RowTitle, TextAction, ZoneLabel } from "./desk-styles";
import { PasswordReset, type Revealed } from "./subscriber-credentials";
import { AccountStats, AccountTop, ActionBody, ActionPanel, ActionHint, Badges, BlockedNote, CompactForm, DetailTabs, DrawerPanel, History, Mono, MutedText,
  NoteFooter, PlainDrawer, QuickActions, RecordRow, SensitiveOptions, SpreadRow, TabBody } from "./subscriber-styles";

const SwapIcon = (props: IconProps) => <Icon {...props}><path d="M7 7h12l-3-3M17 17H5l3 3" /></Icon>;
const BanIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></Icon>;

type AccountAction = "grant" | "number" | "password" | "block" | "devices";
type Removal = "delete" | "erase";
type Tab = "overview" | "access" | "payments" | "credit" | "devices";
const tabs: readonly Tab[] = ["overview", "access", "payments", "credit", "devices"];
const tabLabels = { overview: "Overview", access: "Access", payments: "Payments", credit: "Credit", devices: "Devices" };
const actionTitles: Record<AccountAction, string> = { grant: "Grant access", number: "Change number", password: "Reset password",
  block: "Account restriction", devices: "Sign out all devices" };
const codeTones = { active: "good", queued: "warning" } as const;
const paymentTones = { approved: "good", pending: "warning" } as const;

/**
 * One account: who it is, its numbers once, the account actions, then tabs for the records. Destructive removal waits in
 * the last drawer; every action panel returns focus to the control that opened it.
 */
export function SubscriberDetail({ account, plans, action, onDeleted, onReveal }: {
  account: OwnerSubscriber; plans: readonly SubscriptionPlanView[]; action: CodeAction; onDeleted: () => void; onReveal: (value: Revealed) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview"), [active, setActive] = useState<AccountAction | null>(null), [removal, setRemoval] = useState<Removal | null>(null);
  const id = useId(), heading = useRef<HTMLHeadingElement>(null), removalSummary = useRef<HTMLElement>(null), removalBody = useRef<HTMLDivElement>(null);
  const path = `/api/admin/subscribers/${account.id}`, erased = !!account.erasedAt;
  const access = account.codes.some(code => code.status === "active") ? "Active access" : account.codes.some(code => code.status === "queued") ? "Queued access" : "No current access";
  useEffect(() => { if (active) heading.current?.focus(); }, [active]);
  useEffect(() => { if (removal === "erase") removalBody.current?.focus(); }, [removal]);
  function closeAction() {
    if (action.busy) return;
    const previous = active;
    setActive(null); requestAnimationFrame(() => document.getElementById(`${id}-action-${previous}`)?.focus());
  }
  function closeRemoval() {
    if (action.busy) return;
    setRemoval(null); requestAnimationFrame(() => removalSummary.current?.focus());
  }
  function tabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const index = tabs.indexOf(tab);
    const next = (event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length])!;
    setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  function task(value: AccountAction, label: string, icon: ReactNode, disabled = false) {
    return <ActionButton id={`${id}-action-${value}`} type="button" disabled={action.busy || disabled} aria-expanded={active === value} aria-controls={`${id}-action-panel`}
      {...value === "grant" ? { $variant: "primary" as const } : {}} onClick={() => active === value ? closeAction() : setActive(value)}>{icon}{label}</ActionButton>;
  }
  return <DeskColumn data-subscriber-detail={account.id}>
    <Panel aria-label="Subscriber account">
      <AccountTop>
        <div>
          <h2>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</h2>
          <MetaLine>Last sign-in {formatPeriodEnd(new Date(account.lastSignInAt))}</MetaLine>
          {account.blockedReason && <BlockedNote role="note">Blocked: {account.blockedReason}</BlockedNote>}
        </div>
        <Badges><Badge $tone={erased ? "muted" : account.blockedAt ? "warning" : "good"}>{erased ? "Erased" : account.blockedAt ? "Blocked" : "Open"}</Badge>
          <Badge $tone={access === "Active access" ? "good" : "muted"}>{access}</Badge></Badges>
      </AccountTop>
      <AccountStats $columns={4}><div><dt>Unlocked devices</dt><dd>{account.devices.length}</dd></div><div><dt>Access periods</dt><dd>{account.codes.length}</dd></div>
        <div><dt>Unlocks · 30 days</dt><dd>{account.unlocks}</dd></div><div><dt>Credit</dt><dd data-subscriber-credit>{formatCredit(account.creditUgx)}</dd></div></AccountStats>
      {!erased && <QuickActions role="group" aria-label="Account actions" data-subscriber-actions>
        {task("grant", "Grant access", <GiftIcon />)}
        {task("number", "Change number", <SwapIcon />)}
        {task("password", "Reset password", <KeyIcon />, !!account.blockedAt)}
        {task("block", account.blockedAt ? "Unblock account" : "Block account", account.blockedAt ? <ShieldIcon /> : <BanIcon />)}
        {task("devices", "Sign out devices", <SignOutIcon />)}
      </QuickActions>}
      {!erased && account.blockedAt && <ActionHint>Unblock this account to reset its password.</ActionHint>}
    </Panel>
    {active && <ActionPanel id={`${id}-action-panel`} role="region" aria-labelledby={`${id}-action-title`} data-subscriber-action-panel={active}
      onKeyDown={event => { if (event.key === "Escape" && !action.busy && !event.defaultPrevented) { event.preventDefault(); closeAction(); } }}>
      <PanelHead><h2 id={`${id}-action-title`} tabIndex={-1} ref={heading}>{active === "block" ? account.blockedAt ? "Unblock account" : "Block account" : actionTitles[active]}</h2>
        <TextAction type="button" disabled={action.busy} onClick={closeAction}>Cancel</TextAction></PanelHead>
      <ActionBody>
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
        {active === "devices" && <><MutedText>The member will need to log in again on every device.</MutedText><div><ActionButton type="button" disabled={action.busy} onClick={async () => {
          const reply = await action.send(path, { action: "sign-out-all" }, "All devices signed out."); if (reply.ok) closeAction();
        }}>Sign out all devices</ActionButton></div></>}
      </ActionBody>
    </ActionPanel>}
    <DetailTabs role="tablist" aria-label="Subscriber details" onKeyDown={tabKey} data-subscriber-tabs>
      {tabs.map(value => <button key={value} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-view-${value}`}
        aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{tabLabels[value]}{value === "payments" && ` (${account.submissions.length})`}</button>)}
    </DetailTabs>
    <Panel as="div" role="tabpanel" id={`${id}-view-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} data-subscriber-tab={tab}>
      {tab === "overview" && <TabBody>
        {!erased ? <OwnerNote key={account.ownerNote} account={account} action={action} /> : <MutedText>Personal data has been erased. Accounting history is retained.</MutedText>}
        <PlainDrawer><summary>Account ID<ChevronDownIcon /></summary><div><Mono>{account.id}</Mono></div></PlainDrawer>
      </TabBody>}
      {tab === "access" && (account.codes.length ? <RowList>{account.codes.map(code => <RecordRow key={code.id}>
        <div><RowTitle>{code.planName} · {code.reference}<Badge $tone={codeTones[code.status as keyof typeof codeTones] ?? "muted"}>{code.status}</Badge></RowTitle>
          <RowMeta>{code.status === "expired" ? `Ended ${formatPeriodEnd(new Date(code.endsAt))}` : code.status === "revoked" ? `Was due to end ${formatPeriodEnd(new Date(code.endsAt))}`
            : `${code.daysLeft} day${code.daysLeft === 1 ? "" : "s"} left · Until ${formatPeriodEnd(new Date(code.endsAt))}`}</RowMeta></div>
        {!erased && code.status !== "revoked" && <CodeActions code={code} action={action} compact />}
      </RecordRow>)}</RowList> : <TabBody><MutedText>No access periods.</MutedText></TabBody>)}
      {tab === "payments" && (account.submissions.length ? <RowList>{account.submissions.map(payment => <RecordRow key={payment.id}><div>
        <RowTitle><a href={`/admin/payments?tab=${payment.status === "approved" || payment.status === "reversed" ? "approved" : payment.status === "rejected" ? "rejected" : "pending"}#${payment.id}`}>{payment.reference}</a>
          <Badge $tone={paymentTones[payment.status as keyof typeof paymentTones] ?? "muted"}>{payment.status}</Badge></RowTitle>
        <RowMeta>{payment.purpose === "topup" ? "Credit top-up" : payment.planName} · UGX {(payment.amountReceivedUgx ?? payment.claimedAmountUgx).toLocaleString("en-UG")} · {formatPeriodEnd(new Date(payment.submittedAt))}</RowMeta>
      </div></RecordRow>)}</RowList> : <TabBody><MutedText>No payment submissions.</MutedText></TabBody>)}
      {tab === "credit" && <TabBody>
        <SpreadRow><Badge $tone={account.autoRenew ? "good" : "muted"}>{account.autoRenew ? `Auto-renews ${account.autoRenewPlanName ?? "a plan"}` : "Auto-renewal off"}</Badge>
          {!erased && account.autoRenew && <TextAction type="button" disabled={action.busy} onClick={() => void action.send(path, { action: "auto-renew-off" }, "Auto-renewal turned off.")}>Turn off auto-renewal</TextAction>}</SpreadRow>
        <MutedText>{account.creditUgx < 0 ? "A reversed payment's credit was already spent. Spending stays blocked until a top-up clears the balance."
          : "Plan-only and non-refundable. Approved top-ups and amounts paid above a plan's price add to it."}</MutedText>
        {!erased && <CreditAdjust path={path} action={action} />}
        <ZoneLabel as="h3">History</ZoneLabel>
        {account.wallet.length ? <History data-subscriber-wallet>{account.wallet.map(entry => <li key={entry.id}>
          <span><strong>{walletKindLabels[entry.kind]} · {formatCreditChange(entry.amountUgx)}</strong>
            <RowMeta>{[entry.payment, entry.period, entry.note].filter(Boolean).join(" · ") || (entry.actor === "system" ? "Automatic" : entry.actor === "member" ? "By the member" : "By the owner")} · {formatPeriodEnd(new Date(entry.createdAt))}</RowMeta></span>
          <span>{formatCredit(entry.balanceAfter)}</span></li>)}</History> : <MutedText>No credit history.</MutedText>}
      </TabBody>}
      {tab === "devices" && (account.devices.length ? <RowList>{account.devices.map((device, index) => <RecordRow key={`${device.createdAt}-${index}`}><div>
        <RowTitle>Device {index + 1}</RowTitle><RowMeta>Last seen {formatPeriodEnd(new Date(device.lastSeenAt))} · Expires {formatPeriodEnd(new Date(device.expiresAt))}</RowMeta>
      </div></RecordRow>)}</RowList> : <TabBody><MutedText>No unlocked devices.</MutedText></TabBody>)}
    </Panel>
    {tabs.filter(value => value !== tab).map(value => <div key={value} role="tabpanel" hidden id={`${id}-view-${value}`} aria-labelledby={`${id}-tab-${value}`} />)}
    <DrawerPanel as="div">
      <Drawer $tone="danger" open={!!removal} onToggle={event => { const open = event.currentTarget.open; if (open !== !!removal) setRemoval(open ? "delete" : null); }}
        onKeyDown={event => { if (event.key === "Escape" && removal && !event.defaultPrevented) { event.preventDefault(); closeRemoval(); } }}>
        <summary ref={removalSummary} onClick={event => { if (action.busy) event.preventDefault(); }}><TrashIcon />{erased ? "Delete account" : "Delete or erase"}<ChevronDownIcon /></summary>
        {removal && <div ref={removalBody} tabIndex={-1}>
          {removal === "delete" ? <><ConfirmedRemoval key="delete" kind="delete" account={account} action={action} onSaved={onDeleted} />
            {!erased && <SensitiveOptions><MutedText>Keep payment amounts and access history for accounting?</MutedText>
              <ActionButton type="button" disabled={action.busy} onClick={() => setRemoval("erase")}>Erase personal data instead</ActionButton></SensitiveOptions>}</>
            : <ConfirmedRemoval key="erase" kind="erase" account={account} action={action} onSaved={closeRemoval} />}
        </div>}
      </Drawer>
    </DrawerPanel>
  </DeskColumn>;
}

function OwnerNote({ account, action }: { account: OwnerSubscriber; action: CodeAction }) {
  const [note, setNote] = useState(account.ownerNote ?? "");
  return <CompactForm method="post" action={`/api/admin/subscribers/${account.id}`} onSubmit={async event => {
    event.preventDefault(); if (!action.busy) await action.send(`/api/admin/subscribers/${account.id}`, { action: "note", value: note }, "Owner note saved.");
  }}><FieldBlock>Owner note<textarea name="note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.currentTarget.value)} disabled={action.busy} placeholder="Add a private note…" /></FieldBlock>
    <NoteFooter><span>{note.length}/500 · Admin only</span><ActionButton type="submit" disabled={action.busy || note === (account.ownerNote ?? "")}>Save note</ActionButton></NoteFooter>
  </CompactForm>;
}

/** A correction with a reason the ledger keeps; a negative amount takes credit away but never below zero. */
function CreditAdjust({ path, action }: { path: string; action: CodeAction }) {
  const [amount, setAmount] = useState(""), [note, setNote] = useState(""), [confirmed, setConfirmed] = useState(false);
  const value = Number(amount), valid = /^-?\d+$/u.test(amount.trim()) && value !== 0 && Math.abs(value) <= walletRules.adjustmentMaxUgx && !!note.trim();
  return <PlainDrawer data-subscriber-credit-adjust><summary>Correct credit<ChevronDownIcon /></summary><div><CompactForm method="post" action={path} onSubmit={async event => {
    event.preventDefault(); if (action.busy || !valid || !confirmed) return;
    const reply = await action.send(path, { action: "credit-adjust", amount: value, note, confirmed }, `Credit ${value > 0 ? "added" : "removed"}.`);
    if (reply.ok) { setAmount(""); setNote(""); setConfirmed(false); }
  }}><MutedText>Use a negative amount to remove credit. Top-ups are approved from the payment instead.</MutedText>
    <FieldRow><FieldBlock>Amount · UGX<input name="amount" inputMode="numeric" required value={amount} disabled={action.busy} onChange={event => setAmount(event.currentTarget.value)} placeholder="e.g. 5000 or -5000" /></FieldBlock>
      <FieldBlock>Reason<input name="note" required maxLength={200} value={note} disabled={action.busy} onChange={event => setNote(event.currentTarget.value)} placeholder="Shown in the credit history" /></FieldBlock></FieldRow>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => setConfirmed(event.target.checked)} /> I checked this correction.</label>
    <ActionButton type="submit" $variant="primary" disabled={action.busy || !valid || !confirmed}>Save correction</ActionButton>
  </CompactForm></div></PlainDrawer>;
}

function ChangeNumber({ path, action, onSaved }: { path: string; action: CodeAction; onSaved: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (action.busy) return;
    const data = new FormData(event.currentTarget);
    const reply = await action.send(path, { action: "change-number", newPhone: data.get("newPhone"), verifiedBy: data.get("verifiedBy"), confirmed: data.get("confirmed") === "on" }, "Remaining access and credit moved to the new number. Old sessions no longer have access.");
    if (reply.ok) onSaved();
  }
  return <CompactForm method="post" action={path} onSubmit={submit}><MutedText>Move remaining access, credit and auto-renewal to the new number&apos;s account. Old sessions lose access. Both accounts can then be erased but not permanently deleted.</MutedText>
    <FieldRow><PhoneInput label="New phone number" name="newPhone" lookup required disabled={action.busy} hint="" />
      <FieldBlock>Verified by<select name="verifiedBy" required disabled={action.busy}><option value="">Choose verification</option><option value="old-number">Old number</option><option value="payment-details">Payment details</option></select></FieldBlock></FieldRow>
    <label><input type="checkbox" name="confirmed" required disabled={action.busy} /> I verified this request.</label>
    <ActionButton type="submit" $variant="primary" disabled={action.busy}>Change number and move access</ActionButton>
  </CompactForm>;
}

/** The account it removes is named in the header above; the checkbox is the confirmation. */
function ConfirmedRemoval({ kind, account, action, onSaved }: { kind: Removal; account: OwnerSubscriber; action: CodeAction; onSaved: () => void }) {
  const [confirmed, setConfirmed] = useState(false), deleting = kind === "delete";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirmed || action.busy) return;
    const reply = await action.send(`/api/admin/subscribers/${account.id}`, { action: kind, confirmed }, deleting ? "Account and all related information permanently deleted." : "Personal data erased. Accounting history retained.");
    if (reply.ok) onSaved();
  }
  return <CompactForm method="post" action={`/api/admin/subscribers/${account.id}`} onSubmit={submit} data-subscriber-removal={kind}>
    <MutedText>{deleting ? "Permanently removes the account and all related information, including payments, screenshots, access, saved slips and audit records. Payment totals will change. This cannot be undone."
      : `Clears numbers, passwords, notes, sessions and screenshots.${account.creditUgx > 0 ? ` The ${formatCredit(account.creditUgx)} credit is forfeited.` : ""} Payment amounts, IDs and access history remain for accounting. This cannot be undone.`}</MutedText>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => setConfirmed(event.target.checked)} /> I verified this account and understand this cannot be undone.</label>
    <DangerButton type="submit" disabled={action.busy || !confirmed}>{deleting ? "Permanently delete account" : "Erase personal data"}</DangerButton>
  </CompactForm>;
}
