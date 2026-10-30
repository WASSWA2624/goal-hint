"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import styled, { css } from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { authLabels } from "@/i18n/messages/auth";
import type { OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { formatPhone, type MobileNetwork } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatCredit, formatCreditChange, walletKindLabels, walletRules } from "@/domain/wallet";
import { PhoneInput } from "@/components/ui/phone-input";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { media } from "@/styles/theme";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { ChevronDownIcon, GiftIcon, Icon, ShieldIcon, SignOutIcon, TrashIcon, type IconProps } from "@/components/ui/icons";
import { ActionButton, Badge, DangerButton, FieldBlock, FieldRow } from "./admin-form";
import { ActionNotices, CodeActions, ManualCodeForm, type CodeAction } from "./code-tools";
import { Drawer, MetaLine, Panel, PanelHead, RowList, RowMeta, RowTitle, TextAction, ZoneLabel } from "./desk-styles";
import { SubscriberReviewDialog } from "./subscriber-review-dialog";
import { RecordBody, RecordCard, RecordFooter, RecordScroll } from "./record-workspace";
import { AccountStats, AccountTop, ActionBody, ActionPanel, Badges, BlockedNote, CompactForm, DetailTabs, DrawerPanel, History, Mono, MutedText,
  NoteFooter, PlainDrawer, QuickActions, RecordRow, SensitiveOptions, SpreadRow, TabBody } from "./subscriber-styles";

const SwapIcon = (props: IconProps) => <Icon {...props}><path d="M7 7h12l-3-3M17 17H5l3 3" /></Icon>;
const BanIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></Icon>;

type AccountAction = "grant" | "number" | "block" | "devices";
type Removal = "delete" | "erase";
type Tab = "overview" | "access" | "payments" | "credit" | "devices";
const tabs: readonly Tab[] = ["overview", "access", "payments", "credit", "devices"];
const tabLabels = { overview: "Overview", access: "Access", payments: "Payments", credit: "Credit", devices: "Devices" };
const actionTitles: Record<AccountAction, string> = { grant: "Grant access", number: "Change number",
  block: "Account restriction", devices: `${authLabels.signOut} all devices` };
const codeTones = { active: "good", queued: "warning" } as const;
const paymentTones = { approved: "good", pending: "warning" } as const;

/**
 * One account: who it is, its numbers once, the account actions, then tabs for the records. Destructive removal waits in
 * the last drawer; every action panel returns focus to the control that opened it.
 */
export function SubscriberDetail({ account, plans, action, onDeleted, back, presentation, network }: {
  account: OwnerSubscriber; plans: readonly SubscriptionPlanView[]; action: CodeAction; onDeleted: () => void;
  back?: ReactNode;
  presentation?: "compact-dialog"; network?: MobileNetwork | null;
}) {
  const desktop = useDesktopLayout();
  const dialogMode = presentation === "compact-dialog", externalActionControls = desktop || dialogMode;
  const [tab, setTab] = useState<Tab>("overview"), [active, setActive] = useState<AccountAction | null>(null), [removal, setRemoval] = useState<Removal | null>(null);
  const [noteDirty, setNoteDirty] = useState(false), [creditOpen, setCreditOpen] = useState(false), [creditReady, setCreditReady] = useState(false), [removalConfirmed, setRemovalConfirmed] = useState(false);
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
    setRemoval(null); setRemovalConfirmed(false); requestAnimationFrame(() => removalSummary.current?.focus());
  }
  function chooseRemoval(value: Removal | null) {
    if (value) { setActive(null); setCreditOpen(false); }
    setRemovalConfirmed(false); setRemoval(value);
  }
  function chooseCredit(open: boolean) {
    if (open) { setActive(null); setRemoval(null); setRemovalConfirmed(false); }
    setCreditOpen(open);
  }
  async function signOutDevices() {
    if (action.busy) return;
    const reply = await action.send(path, { action: "sign-out-all" }, "All devices signed out."); if (reply.ok) closeAction();
  }
  function tabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const index = tabs.indexOf(tab);
    const next = (event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length])!;
    setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  function task(value: AccountAction, label: string, icon: ReactNode, disabled = false) {
    return <ActionButton id={`${id}-action-${value}`} type="button" disabled={action.busy || disabled} aria-expanded={active === value} aria-controls={!dialogMode || active === value ? `${id}-action-panel` : undefined} aria-haspopup={dialogMode ? "dialog" : undefined}
      {...value === "grant" ? { $variant: "primary" as const } : {}} onClick={() => {
        if (dialogMode) action.clearFeedback();
        if (active === value) closeAction();
        else { setRemoval(null); setRemovalConfirmed(false); setCreditOpen(false); setActive(value); }
      }}>{icon}{label}</ActionButton>;
  }
  const actionFields = <>
    {active === "grant" && <ManualCodeForm formId={`${id}-form-grant`} externalActions={externalActionControls} plans={plans} action={action} phone={account.phone ?? ""} compact fixedPhone onSaved={closeAction} />}
    {active === "number" && <ChangeNumber formId={`${id}-form-number`} externalActions={externalActionControls} path={path} action={action} onSaved={closeAction} />}
    {active === "block" && <CompactForm id={`${id}-form-block`} method={action.localOnly ? "get" : "post"} action={action.localOnly ? "#" : path} onSubmit={async event => {
      event.preventDefault(); if (action.busy) return;
      const reply = await action.send(path, { action: account.blockedAt ? "unblock" : "block", value: new FormData(event.currentTarget).get("reason") }, account.blockedAt ? "Account unblocked." : "Account blocked and devices signed out.");
      if (reply.ok) closeAction();
    }}><MutedText>{account.blockedAt ? `Allow this member to ${authLabels.signIn.toLowerCase()} again.` : `Prevent sign-in and ${authLabels.signOut.toLowerCase()} every device.`}</MutedText>
      <FieldBlock>Reason<input name="reason" required maxLength={200} disabled={action.busy} /></FieldBlock>
      {!externalActionControls && <ActionButton type="submit" $variant="primary" disabled={action.busy}>{account.blockedAt ? "Unblock account" : "Block account"}</ActionButton>}</CompactForm>}
    {active === "devices" && <><MutedText>The member will need to {authLabels.signIn.toLowerCase()} again on every device.</MutedText>{!externalActionControls && <div><ActionButton type="button" disabled={action.busy} onClick={() => void signOutDevices()}>{actionTitles.devices}</ActionButton></div>}</>}
  </>;
  const footer = removal ? <><ActionButton type="button" disabled={action.busy} onClick={closeRemoval}>Cancel</ActionButton><DangerButton type="submit" form={`${id}-remove`} disabled={action.busy || !removalConfirmed}>{removal === "delete" ? "Permanently delete account" : "Erase personal data"}</DangerButton></>
      : active ? <><ActionButton type="button" disabled={action.busy} onClick={closeAction}>Cancel</ActionButton>{active === "devices"
        ? <ActionButton type="button" disabled={action.busy} onClick={() => void signOutDevices()}>{actionTitles.devices}</ActionButton>
        : <ActionButton type="submit" form={`${id}-form-${active}`} $variant="primary" disabled={action.busy}>{active === "grant" ? "Grant access manually" : active === "number" ? "Change number and move access" : account.blockedAt ? "Unblock account" : "Block account"}</ActionButton>}</>
        : !erased && tab === "overview" ? <ActionButton type="submit" form={`${id}-note`} disabled={action.busy || !noteDirty}>Save note</ActionButton>
          : !erased && tab === "credit" && creditOpen ? <><ActionButton type="button" disabled={action.busy} onClick={() => setCreditOpen(false)}>Cancel</ActionButton><ActionButton type="submit" form={`${id}-credit`} $variant="primary" disabled={action.busy || !creditReady}>Save correction</ActionButton></> : null;
  return <DetailCard $compact={dialogMode} data-subscriber-detail={account.id} data-subscriber-presentation={presentation}>
    <RecordScroll>
    {back}
    <RecordBody>
    <Panel aria-label="Subscriber account" data-subscriber-summary>
      <AccountTop>
        <div>
          <h2>{dialogMode && network && <MobileMoneyLogo network={network} />}{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</h2>
          <MetaLine>Last sign-in {formatPeriodEnd(new Date(account.lastSignInAt))}</MetaLine>
          {account.blockedReason && <BlockedNote role="note">Blocked: {account.blockedReason}</BlockedNote>}
        </div>
        <Badges><Badge $tone={erased ? "muted" : account.blockedAt ? "warning" : "good"}>{erased ? "Erased" : account.blockedAt ? "Blocked" : "Open"}</Badge>
          <Badge $tone={access === "Active access" ? "good" : "muted"}>{access}</Badge></Badges>
      </AccountTop>
      <AccountStats $columns={4} data-subscriber-stats><div><dt>Unlocked devices</dt><dd>{account.devices.length}</dd></div><div><dt>Access periods</dt><dd>{account.codes.length}</dd></div>
        <div><dt>Unlocks · 30 days</dt><dd>{account.unlocks}</dd></div><div><dt>Credit</dt><dd data-subscriber-credit>{formatCredit(account.creditUgx)}</dd></div></AccountStats>
      {!erased && <QuickActions role="group" aria-label="Account actions" data-subscriber-actions>
        {task("grant", "Grant access", <GiftIcon />)}
        {task("number", "Change number", <SwapIcon />)}
        {task("block", account.blockedAt ? "Unblock account" : "Block account", account.blockedAt ? <ShieldIcon /> : <BanIcon />)}
        {task("devices", `${authLabels.signOut} devices`, <SignOutIcon />)}
      </QuickActions>}
    </Panel>
    {active && !dialogMode && <ActionPanel id={`${id}-action-panel`} role="region" aria-labelledby={`${id}-action-title`} data-subscriber-action-panel={active}
      onKeyDown={event => { if (event.key === "Escape" && !action.busy && !event.defaultPrevented) { event.preventDefault(); closeAction(); } }}>
      <PanelHead><h2 id={`${id}-action-title`} tabIndex={-1} ref={heading}>{active === "block" ? account.blockedAt ? "Unblock account" : "Block account" : actionTitles[active]}</h2>
        <TextAction type="button" disabled={action.busy} onClick={closeAction}>Cancel</TextAction></PanelHead>
      <ActionBody>{actionFields}</ActionBody>
    </ActionPanel>}
    <DetailTabs role="tablist" aria-label="Subscriber details" onKeyDown={tabKey} data-subscriber-tabs>
      {tabs.map(value => <button key={value} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-view-${value}`}
        aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{tabLabels[value]}{value === "payments" && ` (${account.submissions.length})`}</button>)}
    </DetailTabs>
    <Panel as="div" role="tabpanel" id={`${id}-view-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} data-subscriber-tab={tab}>
      {tab === "overview" && <TabBody>
        {!erased ? <OwnerNote key={account.ownerNote} account={account} action={action} formId={`${id}-note`} externalActions={desktop && !dialogMode} onDirtyChange={setNoteDirty} /> : <MutedText>Personal data has been erased. Accounting history is retained.</MutedText>}
        <PlainDrawer><summary>Account ID<ChevronDownIcon /></summary><div><Mono>{account.id}</Mono></div></PlainDrawer>
      </TabBody>}
      {tab === "access" && (account.codes.length ? <RowList>{account.codes.map(code => <RecordRow key={code.id}>
        <div><RowTitle>{code.planName} · {code.reference}<Badge $tone={codeTones[code.status as keyof typeof codeTones] ?? "muted"}>{code.status}</Badge></RowTitle>
          <RowMeta>{code.status === "expired" ? `Ended ${formatPeriodEnd(new Date(code.endsAt))}` : code.status === "revoked" ? `Was due to end ${formatPeriodEnd(new Date(code.endsAt))}`
            : `${code.daysLeft} day${code.daysLeft === 1 ? "" : "s"} left · Until ${formatPeriodEnd(new Date(code.endsAt))}`}</RowMeta></div>
        {!erased && code.status !== "revoked" && <CodeActions code={code} action={action} compact />}
      </RecordRow>)}</RowList> : <TabBody><MutedText>No access periods.</MutedText></TabBody>)}
      {tab === "payments" && (account.submissions.length ? <RowList>{account.submissions.map(payment => <RecordRow key={payment.id}><div>
        <RowTitle>{action.localOnly ? payment.reference : <Link href={`/admin/payments?tab=${payment.status === "approved" || payment.status === "reversed" ? "approved" : payment.status === "rejected" ? "rejected" : "pending"}#${payment.id}`} prefetch={false}>{payment.reference}</Link>}
          <Badge $tone={paymentTones[payment.status as keyof typeof paymentTones] ?? "muted"}>{payment.status}</Badge></RowTitle>
        <RowMeta>{payment.purpose === "topup" ? "Credit top-up" : payment.planName} · UGX {(payment.amountReceivedUgx ?? payment.claimedAmountUgx).toLocaleString("en-UG")} · {formatPeriodEnd(new Date(payment.submittedAt))}</RowMeta>
      </div></RecordRow>)}</RowList> : <TabBody><MutedText>No payment submissions.</MutedText></TabBody>)}
      {tab === "credit" && <TabBody>
        <SpreadRow><Badge $tone={account.autoRenew ? "good" : "muted"}>{account.autoRenew ? `Auto-renews ${account.autoRenewPlanName ?? "a plan"}` : "Auto-renewal off"}</Badge>
          {!erased && account.autoRenew && <TextAction type="button" disabled={action.busy} onClick={() => void action.send(path, { action: "auto-renew-off" }, "Auto-renewal turned off.")}>Turn off auto-renewal</TextAction>}</SpreadRow>
        <MutedText>{account.creditUgx < 0 ? "A reversed payment's credit was already spent. Spending stays blocked until a top-up clears the balance."
          : "Plan-only and non-refundable. Approved top-ups and amounts paid above a plan's price add to it."}</MutedText>
        {!erased && <CreditAdjust path={path} action={action} formId={`${id}-credit`} externalActions={desktop && !dialogMode} open={creditOpen} onOpenChange={chooseCredit} onReadyChange={setCreditReady} />}
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
      <Drawer $tone="danger" open={!!removal} onToggle={event => { const open = event.currentTarget.open; if (open !== !!removal) chooseRemoval(open ? "delete" : null); }}
        onKeyDown={event => { if (event.key === "Escape" && removal && !event.defaultPrevented) { event.preventDefault(); closeRemoval(); } }}>
        <summary ref={removalSummary} onClick={event => { if (action.busy) event.preventDefault(); }}><TrashIcon />{erased ? "Delete account" : "Delete or erase"}<ChevronDownIcon /></summary>
        {removal && <div ref={removalBody} tabIndex={-1}>
          {removal === "delete" ? <><ConfirmedRemoval formId={`${id}-remove`} externalActions={desktop && !dialogMode} confirmed={removalConfirmed} onConfirmedChange={setRemovalConfirmed} key="delete" kind="delete" account={account} action={action} onSaved={onDeleted} />
            {!erased && <SensitiveOptions><MutedText>Keep payment amounts and access history for accounting?</MutedText>
              <ActionButton type="button" disabled={action.busy} onClick={() => chooseRemoval("erase")}>Erase personal data instead</ActionButton></SensitiveOptions>}</>
            : <ConfirmedRemoval formId={`${id}-remove`} externalActions={desktop && !dialogMode} confirmed={removalConfirmed} onConfirmedChange={setRemovalConfirmed} key="erase" kind="erase" account={account} action={action} onSaved={closeRemoval} />}
        </div>}
      </Drawer>
    </DrawerPanel>
    </RecordBody>
    </RecordScroll>
    {desktop && footer && !dialogMode && <RecordFooter data-subscriber-footer-action={removal ?? active ?? tab}><span data-record-summary>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</span>{footer}</RecordFooter>}
    {dialogMode && active && <SubscriberReviewDialog id={`${id}-action-panel`} open title={active === "block" ? account.blockedAt ? "Unblock account" : "Block account" : actionTitles[active]} busy={action.busy} onClose={closeAction} footer={footer}>
      <div data-subscriber-action-dialog={active}>{action.message && <ActionNotices action={action} />}{actionFields}</div>
    </SubscriberReviewDialog>}
  </DetailCard>;
}

function OwnerNote({ account, action, formId, externalActions, onDirtyChange }: { account: OwnerSubscriber; action: CodeAction; formId: string; externalActions: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const [note, setNote] = useState(account.ownerNote ?? "");
  useEffect(() => { onDirtyChange(note !== (account.ownerNote ?? "")); }, [account.ownerNote, note, onDirtyChange]);
  return <CompactForm id={formId} method={action.localOnly ? "get" : "post"} action={action.localOnly ? "#" : `/api/admin/subscribers/${account.id}`} onSubmit={async event => {
    event.preventDefault(); if (!action.busy) await action.send(`/api/admin/subscribers/${account.id}`, { action: "note", value: note }, "Owner note saved.");
  }}><FieldBlock>Owner note<textarea name="note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.currentTarget.value)} disabled={action.busy} placeholder="Add a private note…" /></FieldBlock>
    <NoteFooter><span>{note.length}/500 · Admin only</span>{!externalActions && <ActionButton type="submit" disabled={action.busy || note === (account.ownerNote ?? "")}>Save note</ActionButton>}</NoteFooter>
  </CompactForm>;
}

/** A correction with a reason the ledger keeps; a negative amount takes credit away but never below zero. */
function CreditAdjust({ path, action, formId, externalActions, open, onOpenChange, onReadyChange }: { path: string; action: CodeAction; formId: string; externalActions: boolean; open: boolean; onOpenChange: (open: boolean) => void; onReadyChange: (ready: boolean) => void }) {
  const [amount, setAmount] = useState(""), [note, setNote] = useState(""), [confirmed, setConfirmed] = useState(false);
  const value = Number(amount), valid = /^-?\d+$/u.test(amount.trim()) && value !== 0 && Math.abs(value) <= walletRules.adjustmentMaxUgx && !!note.trim();
  useEffect(() => { onReadyChange(valid && confirmed); }, [confirmed, onReadyChange, valid]);
  return <PlainDrawer data-subscriber-credit-adjust open={open} onToggle={event => { if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open); }}><summary>Correct credit<ChevronDownIcon /></summary><div><CompactForm id={formId} method={action.localOnly ? "get" : "post"} action={action.localOnly ? "#" : path} onSubmit={async event => {
    event.preventDefault(); if (action.busy || !valid || !confirmed) return;
    const reply = await action.send(path, { action: "credit-adjust", amount: value, note, confirmed }, `Credit ${value > 0 ? "added" : "removed"}.`);
    if (reply.ok) { setAmount(""); setNote(""); setConfirmed(false); }
  }}><MutedText>Use a negative amount to remove credit. Top-ups are approved from the payment instead.</MutedText>
    <FieldRow><FieldBlock>Amount · UGX<input name="amount" inputMode="numeric" required value={amount} disabled={action.busy} onChange={event => setAmount(event.currentTarget.value)} placeholder="e.g. 5000 or -5000" /></FieldBlock>
      <FieldBlock>Reason<input name="note" required maxLength={200} value={note} disabled={action.busy} onChange={event => setNote(event.currentTarget.value)} placeholder="Shown in the credit history" /></FieldBlock></FieldRow>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => setConfirmed(event.target.checked)} /> I checked this correction.</label>
    {!externalActions && <ActionButton type="submit" $variant="primary" disabled={action.busy || !valid || !confirmed}>Save correction</ActionButton>}
  </CompactForm></div></PlainDrawer>;
}

function ChangeNumber({ path, action, onSaved, formId, externalActions }: { path: string; action: CodeAction; onSaved: () => void; formId: string; externalActions: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (action.busy) return;
    const data = new FormData(event.currentTarget);
    const reply = await action.send(path, { action: "change-number", newPhone: data.get("newPhone"), verifiedBy: data.get("verifiedBy"), confirmed: data.get("confirmed") === "on" }, "Remaining access and credit moved to the new number. Old sessions no longer have access.");
    if (reply.ok) onSaved();
  }
  return <CompactForm id={formId} method={action.localOnly ? "get" : "post"} action={action.localOnly ? "#" : path} onSubmit={submit}><MutedText>Move remaining access, credit and auto-renewal to the new number&apos;s account. Old sessions lose access. Both accounts can then be erased but not permanently deleted.</MutedText>
    <FieldRow><PhoneInput label="New phone number" name="newPhone" lookup required disabled={action.busy} hint="" />
      <FieldBlock>Verified by<select name="verifiedBy" required disabled={action.busy}><option value="">Choose verification</option><option value="old-number">Old number</option><option value="payment-details">Payment details</option></select></FieldBlock></FieldRow>
    <label><input type="checkbox" name="confirmed" required disabled={action.busy} /> I verified this request.</label>
    {!externalActions && <ActionButton type="submit" $variant="primary" disabled={action.busy}>Change number and move access</ActionButton>}
  </CompactForm>;
}

/** The account it removes is named in the header above; the checkbox is the confirmation. */
function ConfirmedRemoval({ kind, account, action, onSaved, formId, externalActions, confirmed, onConfirmedChange }: { kind: Removal; account: OwnerSubscriber; action: CodeAction; onSaved: () => void; formId: string; externalActions: boolean; confirmed: boolean; onConfirmedChange: (confirmed: boolean) => void }) {
  const deleting = kind === "delete";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirmed || action.busy) return;
    const reply = await action.send(`/api/admin/subscribers/${account.id}`, { action: kind, confirmed }, deleting ? "Account and all related information permanently deleted." : "Personal data erased. Accounting history retained.");
    if (reply.ok) onSaved();
  }
  return <CompactForm id={formId} method={action.localOnly ? "get" : "post"} action={action.localOnly ? "#" : `/api/admin/subscribers/${account.id}`} onSubmit={submit} data-subscriber-removal={kind}>
    <MutedText>{deleting ? "Permanently removes the account and all related information, including payments, screenshots, access, saved slips and audit records. Payment totals will change. This cannot be undone."
      : `Clears numbers, passwords, notes, sessions and screenshots.${account.creditUgx > 0 ? ` The ${formatCredit(account.creditUgx)} credit is forfeited.` : ""} Payment amounts, IDs and access history remain for accounting. This cannot be undone.`}</MutedText>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => onConfirmedChange(event.target.checked)} /> I verified this account and understand this cannot be undone.</label>
    {!externalActions && <DangerButton type="submit" disabled={action.busy || !confirmed}>{deleting ? "Permanently delete account" : "Erase personal data"}</DangerButton>}
  </CompactForm>;
}

/** Only the optional review presentation compresses summary and action geometry. */
const DetailCard = styled(RecordCard)<{ $compact: boolean }>`
  ${({ $compact }) => $compact && css`
    border-radius: ${({ theme }) => theme.radius.surface};
    ${RecordBody} { gap: 8px; padding: 10px; }
    [data-subscriber-summary] { border-radius: ${({ theme }) => theme.radius.surface}; }
    ${AccountTop} {
      padding: 8px 10px; gap: 6px 12px; min-block-size: 0;
      h2 { display: flex; align-items: center; gap: 8px; font-size: 1rem; }
      [data-payment-logo] { inline-size: 28px; block-size: 20px; }
      ${MetaLine} { font-size: 0.6875rem; }
    }
    ${Badges} { gap: 4px; }
    ${AccountStats} {
      gap: 0;
      > div { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 3px 8px; padding: 7px 10px; }
      dt { font-size: 0.6875rem; }
      dd { font-size: 0.875rem; }
    }
    ${QuickActions} {
      display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px;
      > button { flex: 0 1 auto; inline-size: auto; min-block-size: 32px; padding: 4px 8px; font-size: 0.75rem; }
      > button:first-child { grid-column: auto; }
      > button > svg { font-size: 0.875rem; }
      @media (pointer: coarse) { > button { min-block-size: 44px; } }
    }
    ${DetailTabs} {
      display: flex; flex-wrap: nowrap; max-inline-size: 100%; overflow-x: auto; justify-self: stretch;
      > button { flex: none; min-block-size: 32px; padding: 4px 10px; font-size: 0.75rem; }
      @media (pointer: coarse) { > button { min-block-size: 44px; } }
    }
    ${TabBody} { gap: 10px; padding: 10px; }
    ${media.belowDesktop} { ${AccountTop} { align-items: stretch; } }
  `}
`;
