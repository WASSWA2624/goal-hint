"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { authCopy } from "@/i18n/messages/auth";
import type { OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { subscriberActionLabel, type SubscriberIndividualAction } from "@/domain/subscriber-actions";
import { formatPhone, type MobileNetwork } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatCredit, formatCreditChange, walletKindLabels, walletRules } from "@/domain/wallet";
import { PhoneInput } from "@/components/ui/phone-input";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { media } from "@/styles/theme";
import { ChevronDownIcon, GiftIcon, Icon, KeyIcon, MoreIcon, ShieldIcon, SignOutIcon, TrashIcon, type IconProps } from "@/components/ui/icons";
import { ActionButton, Badge, CheckField, DangerButton, FieldBlock, FieldRow } from "./admin-form";
import { ActionNotices, CodeActions, ManualCodeForm, type CodeAction } from "./code-tools";
import { Drawer, FactList, MetaLine, Panel, RowList, RowMeta, RowTitle, TextAction, ZoneLabel } from "./desk-styles";
import { SubscriberActionMenu, SubscriberMenuButton } from "./subscriber-action-menu";
import { SubscriberReviewDialog } from "./subscriber-review-dialog";
import { RecordBody, RecordCard, RecordFooter, RecordScroll } from "./record-workspace";
import { AccountStats, AccountTop, Badges, BlockedNote, CompactForm, DetailTabs, DrawerPanel, History, Mono, MutedText,
  NoteFooter, PlainDrawer, QuickActions, RecordRow, SensitiveOptions, SpreadRow, TabBody } from "./subscriber-styles";

const SwapIcon = (props: IconProps) => <Icon {...props}><path d="M7 7h12l-3-3M17 17H5l3 3" /></Icon>;
const BanIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></Icon>;

type Removal = "delete" | "erase";
type FooterAction = Exclude<SubscriberIndividualAction, Removal | "note">;
type Tab = "overview" | "access" | "payments" | "credit" | "devices";
const tabs: readonly Tab[] = ["overview", "access", "payments", "credit", "devices"];
const tabLabels = { overview: "Overview", access: "Access", payments: "Payments", credit: "Credit", devices: "Devices" };
const codeTones = { active: "good", queued: "warning" } as const;
const paymentTones = { approved: "good", pending: "warning" } as const;
const submitLabels: Partial<Record<SubscriberIndividualAction, string>> = {
  grant: "Grant access manually", number: "Change number and move access", note: "Save note", "password-reset": "Open password request",
};

/**
 * The summary identifies the account, tabs show its records, and account actions return focus to their trigger.
 */
export function SubscriberDetail({ account, plans, action, onDeleted, back, presentation = "compact-dialog", network, initialAction, onInitialActionDismissed,
  canManagePasswords = false, showNoteAction = false }: {
  account: OwnerSubscriber; plans: readonly SubscriptionPlanView[]; action: CodeAction; onDeleted: () => void;
  back?: ReactNode;
  presentation?: "compact-dialog" | "workspace"; network?: MobileNetwork | null;
  initialAction?: SubscriberIndividualAction; onInitialActionDismissed?: () => void; canManagePasswords?: boolean;
  showNoteAction?: boolean;
}) {
  const router = useRouter(), workspace = presentation === "workspace";
  const erased = !!account.erasedAt;
  const canReset = canManagePasswords && !account.blockedAt && !erased && account.phone !== null;
  const [tab, setTab] = useState<Tab>("overview");
  const [previousInitialAction, setPreviousInitialAction] = useState(initialAction);
  const [dialogAction, setDialogAction] = useState<SubscriberIndividualAction | undefined>(initialAction);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<readonly string[]>([]);
  const [noteDirty, setNoteDirty] = useState(false), [creditOpen, setCreditOpen] = useState(false), [removalConfirmed, setRemovalConfirmed] = useState(false);
  const id = useId(), removalBody = useRef<HTMLDivElement>(null);
  if (initialAction !== previousInitialAction) {
    setPreviousInitialAction(initialAction);
    setDialogAction(initialAction);
    setNoteDirty(false);
    setRemovalConfirmed(false);
    setSelectedDeviceIds([]);
  }
  const permitted = (!erased || dialogAction === "delete") && (dialogAction !== "password-reset" || canReset);
  const active = permitted ? dialogAction : undefined;
  const removal = active === "erase" || active === "delete" ? active : undefined;
  const path = `/api/admin/subscribers/${account.id}`;
  const selectedDevices = account.devices.filter(device => selectedDeviceIds.includes(device.id));
  const access = account.codes.some(code => code.status === "active") ? "Active access" : account.codes.some(code => code.status === "queued") ? "Queued access" : "No current access";
  const identity = account.phone ? `+${formatPhone(account.phone)}` : erased ? "Erased account" : `Account ${account.id}`;
  const accessBadge = <Badge $tone={access === "Active access" ? "good" : "muted"}>{access}</Badge>;
  function closeAction() {
    if (action.busy) return;
    setDialogAction(undefined);
    if (initialAction) onInitialActionDismissed?.();
  }
  function openAction(value: SubscriberIndividualAction) {
    action.clearFeedback();
    setSelectedDeviceIds([]);
    setNoteDirty(false);
    setRemovalConfirmed(false);
    setDialogAction(value);
  }
  async function signOutDevices(all: boolean) {
    if (action.busy || !all && !selectedDevices.length) return;
    const request = all ? { action: "sign-out-all" }
      : { action: "sign-out-selected", value: selectedDevices.map(device => device.id) };
    const reply = await action.send(path, request, all ? authCopy.allDevicesLoggedOut : authCopy.selectedDevicesLoggedOut);
    if (reply.ok) closeAction();
  }
  function tabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const index = tabs.indexOf(tab);
    const next = (event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length])!;
    setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  function task(value: FooterAction, label: string, icon: ReactNode) {
    return <ActionButton type="button" disabled={action.busy} aria-haspopup="dialog"
      {...value === "grant" ? { $variant: "primary" as const } : {}} onClick={() => openAction(value)}>{icon}{label}</ActionButton>;
  }
  const deviceButtons = <>
    <ActionButton type="button" disabled={action.busy} onClick={() => void signOutDevices(true)}>{authCopy.logoutAllDevices}</ActionButton>
    {!!account.devices.length && <ActionButton type="button" $variant="primary" disabled={action.busy || !selectedDevices.length}
      onClick={() => void signOutDevices(false)}>{authCopy.logoutSelectedDevices}</ActionButton>}
  </>;
  const actionFields = <>
    {active === "grant" && <ManualCodeForm formId={`${id}-form-grant`} externalActions plans={plans} action={action}
      {...(action.localOnly ? {} : { accountId: account.id })} phone={account.phone ?? ""} compact fixedPhone onSaved={closeAction} />}
    {active === "number" && <ChangeNumber formId={`${id}-form-number`} path={path} action={action} onSaved={closeAction} />}
    {active === "note" && <OwnerNote account={account} action={action} formId={`${id}-form-note`} onDirtyChange={setNoteDirty} onSaved={closeAction} />}
    {active === "password-reset" && <CompactForm id={`${id}-form-password-reset`} method="post" action={action.localOnly ? "#" : path} onSubmit={async event => {
      event.preventDefault();
      if (!canReset || action.busy) return;
      const reply = await action.send(path, { action: "password-reset" }, "", false);
      if (reply.ok && typeof reply.body.requestId === "string") {
        router.push(`/admin/password-requests?${new URLSearchParams({ requestId: reply.body.requestId })}`);
      }
    }}>
      <MutedText>Continue to Password Requests to verify the registered number and create a one-time reset link.</MutedText>
    </CompactForm>}
    {active === "block" && <CompactForm id={`${id}-form-block`} method="post" action={action.localOnly ? "#" : path} onSubmit={async event => {
      event.preventDefault(); if (action.busy) return;
      const reply = await action.send(path, { action: account.blockedAt ? "unblock" : "block", value: new FormData(event.currentTarget).get("reason") }, account.blockedAt ? "Account unblocked." : authCopy.blockedDevicesLoggedOut);
      if (reply.ok) closeAction();
    }}><MutedText>{account.blockedAt ? authCopy.unblockHelp : authCopy.blockHelp}</MutedText>
      <FieldBlock label={"Reason"}><input name="reason" required maxLength={200} disabled={action.busy} /></FieldBlock>
    </CompactForm>}
    {active === "devices" && <>
      <MutedText>{authCopy.devicesLoginHelp}</MutedText>
      {account.devices.length ? <div role="group" aria-label={authCopy.signedInDevices}>
        {account.devices.map((device, index) => <CheckField key={device.id}>
          <input type="checkbox" checked={selectedDeviceIds.includes(device.id)} disabled={action.busy} onChange={event => {
            const checked = event.currentTarget.checked;
            setSelectedDeviceIds(ids => checked ? [...ids, device.id] : ids.filter(id => id !== device.id));
          }} />
          <span><DeviceDetails device={device} number={index + 1} /></span>
        </CheckField>)}
      </div> : <MutedText>{authCopy.noSignedInDevices}</MutedText>}
    </>}
  </>;
  const activeTitle = active ? subscriberActionLabel(active, !!account.blockedAt) : "";
  const footer = active && <>
    <ActionButton type="button" disabled={action.busy} onClick={closeAction}>Cancel</ActionButton>
    {removal ? <DangerButton type="submit" form={`${id}-remove`} disabled={action.busy || !removalConfirmed}>{activeTitle}</DangerButton>
      : active === "devices" ? deviceButtons
      : <ActionButton type="submit" form={`${id}-form-${active}`} $variant="primary" disabled={action.busy || active === "note" && !noteDirty}>
        {submitLabels[active] ?? activeTitle}
      </ActionButton>}
  </>;
  const accountActions = !erased && <QuickActions role="group" aria-label="Account actions" data-subscriber-actions>
    {task("grant", "Grant access", <GiftIcon />)}
    {task("number", "Change number", <SwapIcon />)}
    {task("block", account.blockedAt ? "Unblock account" : "Block account", account.blockedAt ? <ShieldIcon /> : <BanIcon />)}
    {task("devices", authCopy.logoutDevices, <SignOutIcon />)}
    {canReset && task("password-reset", subscriberActionLabel("password-reset"), <KeyIcon />)}
  </QuickActions>;
  const removalFields = removal && <div ref={removalBody}>
    <ConfirmedRemoval formId={`${id}-remove`} confirmed={removalConfirmed} onConfirmedChange={setRemovalConfirmed}
      kind={removal} account={account} action={action} onSaved={removal === "delete" ? onDeleted : closeAction} />
    {removal === "delete" && !erased && <SensitiveOptions><MutedText>Keep payment amounts and access history for accounting?</MutedText>
      <ActionButton type="button" disabled={action.busy} onClick={() => {
        openAction("erase"); requestAnimationFrame(() => removalBody.current?.querySelector("input")?.focus());
      }}>Erase personal data instead</ActionButton></SensitiveOptions>}
  </div>;
  const login = <MetaLine>{authCopy.lastLogin} <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></MetaLine>;
  const studySummary = !workspace && <Panel aria-label="Subscriber account" data-subscriber-summary>
    <AccountTop>
      <div>
        <h2>{network && <MobileMoneyLogo network={network} />}{identity}</h2>
        {login}
        {account.blockedReason && <BlockedNote role="note">Blocked: {account.blockedReason}</BlockedNote>}
      </div>
      <Badges>
        <Badge $tone={erased ? "muted" : account.blockedAt ? "warning" : "good"}>{erased ? "Erased" : account.blockedAt ? "Blocked" : "Open"}</Badge>
        {accessBadge}
      </Badges>
    </AccountTop>
    <AccountStats $columns={4} data-subscriber-stats>
      <div><dt>{authCopy.signedInDevices}</dt><dd>{account.devices.length}</dd></div>
      <div><dt>Access periods</dt><dd>{account.codes.length}</dd></div>
      <div><dt>Credit</dt><dd data-subscriber-credit>{formatCredit(account.creditUgx)}</dd></div>
    </AccountStats>
  </Panel>;
  const Tabs = workspace ? WorkspaceTabs : DetailTabs;
  const accountTabs = <Tabs role="tablist" aria-label="Subscriber details" onKeyDown={tabKey} data-subscriber-tabs>
    {tabs.map(value => <button key={value} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-view-${value}`}
      aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>
      {tabLabels[value]}{!workspace && value === "payments" && ` (${account.submissions.length})`}
    </button>)}
  </Tabs>;
  return <DetailCard $workspace={workspace} data-subscriber-detail={account.id} data-subscriber-presentation={presentation}>
    <RecordScroll>
    {back}
    {workspace && <>
      <WorkspaceAccountTop aria-label="Subscriber account" data-subscriber-summary>
        <div><h2>{identity}</h2>{login}</div>
        {!erased && <NoteMenuSlot $onDesktop={showNoteAction}>
          <SubscriberActionMenu label={`More actions for ${identity}`} icon={<MoreIcon />} disabled={action.busy}>
            {() => <SubscriberMenuButton type="button" onClick={() => openAction("note")}>Edit admin note</SubscriberMenuButton>}
          </SubscriberActionMenu>
        </NoteMenuSlot>}
      </WorkspaceAccountTop>
      {accountTabs}
    </>}
    <RecordBody>
    {studySummary}
    {!workspace && accountTabs}
    <Panel as="div" role="tabpanel" id={`${id}-view-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} data-subscriber-tab={tab}>
      {tab === "overview" && <TabBody>
        {workspace ? <AccountFacts>
          {(erased || account.blockedAt) && <div><dt>Account status</dt><dd>
            <Badge $tone={erased ? "muted" : "warning"}>{erased ? "Erased" : "Blocked"}</Badge>
            {account.blockedReason && <BlockedNote role="note">{account.blockedReason}</BlockedNote>}
          </dd></div>}
          <div><dt>Credit balance</dt><dd data-subscriber-credit>{formatCredit(account.creditUgx)}</dd></div>
          <div><dt>Account ID</dt><dd><Mono as="span">{account.id}</Mono></dd></div>
        </AccountFacts> : <>
          {!erased && <OwnerNote key={account.ownerNote} account={account} action={action} formId={`${id}-note`} />}
          <PlainDrawer><summary>Account ID<ChevronDownIcon /></summary><div><Mono>{account.id}</Mono></div></PlainDrawer>
        </>}
        {erased && <MutedText>Personal data has been erased. Accounting history is retained.</MutedText>}
      </TabBody>}
      {tab === "access" && <>
        {workspace && <TabBody><AccountFacts>
          <div><dt>Current access</dt><dd>{accessBadge}</dd></div>
          <div><dt>Access periods</dt><dd>{account.codes.length}</dd></div>
        </AccountFacts></TabBody>}
        {account.codes.length ? <RowList>{account.codes.map(code => <RecordRow key={code.id}>
        <div><RowTitle>{code.planName} · {code.reference}<Badge $tone={codeTones[code.status as keyof typeof codeTones] ?? "muted"}>{code.status}</Badge></RowTitle>
          <RowMeta>{code.status === "expired" ? `Ended ${formatPeriodEnd(new Date(code.endsAt))}` : code.status === "revoked" ? `Was due to end ${formatPeriodEnd(new Date(code.endsAt))}`
            : `${code.daysLeft} day${code.daysLeft === 1 ? "" : "s"} left · Until ${formatPeriodEnd(new Date(code.endsAt))}`}</RowMeta></div>
        {!erased && code.status !== "revoked" && <CodeActions code={code} action={action} compact />}
        </RecordRow>)}</RowList> : !workspace && <TabBody><MutedText>No access periods.</MutedText></TabBody>}
      </>}
      {tab === "payments" && (account.submissions.length ? <RowList>{account.submissions.map(payment => <RecordRow key={payment.id}><div>
        <RowTitle>{action.localOnly ? payment.reference : <Link href={`/admin/payments?paymentId=${encodeURIComponent(payment.id)}`} prefetch={false}>{payment.reference}</Link>}
          <Badge $tone={paymentTones[payment.status as keyof typeof paymentTones] ?? "muted"}>{payment.status}</Badge></RowTitle>
        <RowMeta>{payment.purpose === "topup" ? "Credit top-up" : payment.planName} · UGX {(payment.amountReceivedUgx ?? payment.claimedAmountUgx).toLocaleString("en-UG")} · {formatPeriodEnd(new Date(payment.submittedAt))}</RowMeta>
      </div></RecordRow>)}</RowList> : <TabBody><MutedText>No payment submissions.</MutedText></TabBody>)}
      {tab === "credit" && <TabBody>
        <SpreadRow><Badge $tone={account.autoRenew ? "good" : "muted"}>{account.autoRenew ? `Auto-renews ${account.autoRenewPlanName ?? "a plan"}` : "Auto-renewal off"}</Badge>
          {!erased && account.autoRenew && <TextAction type="button" disabled={action.busy} onClick={() => void action.send(path, { action: "auto-renew-off" }, "Auto-renewal turned off.")}>Turn off auto-renewal</TextAction>}</SpreadRow>
        <MutedText>{account.creditUgx < 0 ? "A reversed payment's credit was already spent. Spending stays blocked until a top-up clears the balance."
          : "Plan-only and non-refundable. Approved top-ups and amounts paid above a plan's price add to it."}</MutedText>
        {!erased && <CreditAdjust path={path} action={action} formId={`${id}-credit`} open={creditOpen} onOpenChange={setCreditOpen} />}
        <ZoneLabel as="h3">History</ZoneLabel>
        {account.wallet.length ? <History data-subscriber-wallet>{account.wallet.map(entry => <li key={entry.id}>
          <span><strong>{walletKindLabels[entry.kind]} · {formatCreditChange(entry.amountUgx)}</strong>
            <RowMeta>{[entry.payment, entry.period, entry.note].filter(Boolean).join(" · ") || (entry.actor === "system" ? "Automatic" : entry.actor === "member" ? "By the member" : "By the owner")} · {formatPeriodEnd(new Date(entry.createdAt))}</RowMeta></span>
          <span>{formatCredit(entry.balanceAfter)}</span></li>)}</History> : <MutedText>No credit history.</MutedText>}
      </TabBody>}
      {tab === "devices" && <>
        {workspace && <TabBody><AccountFacts><div><dt>{authCopy.signedInDevices}</dt><dd>{account.devices.length}</dd></div></AccountFacts></TabBody>}
        {account.devices.length ? <RowList>{account.devices.map((device, index) => <RecordRow key={device.id}><div>
          <DeviceDetails device={device} number={index + 1} />
        </div></RecordRow>)}</RowList> : !workspace && <TabBody><MutedText>{authCopy.noSignedInDevices}</MutedText></TabBody>}
      </>}
    </Panel>
    {tabs.filter(value => value !== tab).map(value => <div key={value} role="tabpanel" hidden id={`${id}-view-${value}`} aria-labelledby={`${id}-tab-${value}`} />)}
    {workspace ? <RemovalTrigger type="button" aria-haspopup="dialog" disabled={action.busy} onClick={() => openAction("delete")}>
      <TrashIcon />{erased ? "Delete account" : "Delete or erase"}
    </RemovalTrigger> : <DrawerPanel as="div">
      <Drawer $tone="danger" open={false}>
        <summary aria-haspopup="dialog" onClick={event => {
          event.preventDefault();
          if (!action.busy) openAction("delete");
        }}><TrashIcon />{erased ? "Delete account" : "Delete or erase"}<ChevronDownIcon /></summary>
      </Drawer>
    </DrawerPanel>}
    </RecordBody>
    </RecordScroll>
    {accountActions && <AccountActionsFooter $workspace={workspace}>{accountActions}</AccountActionsFooter>}
    {active && <SubscriberReviewDialog id={`${id}-action-panel`} open title={activeTitle}
      busy={action.busy} onClose={closeAction} footer={footer}>
      <div data-subscriber-action-dialog={active}>
        <MutedText>{account.phone ? `Account ${identity}` : erased ? `Erased account ${account.id}` : identity}</MutedText>
        {action.message && <ActionNotices action={action} />}{removal ? removalFields : actionFields}
      </div>
    </SubscriberReviewDialog>}
  </DetailCard>;
}

function DeviceDetails({ device, number }: { device: OwnerSubscriber["devices"][number]; number: number }) {
  return <><RowTitle>Device {number}</RowTitle>
    <RowMeta>Last seen {formatPeriodEnd(new Date(device.lastSeenAt))} · Expires {formatPeriodEnd(new Date(device.expiresAt))}</RowMeta></>;
}

const AccountActionsFooter = styled(RecordFooter)<{ $workspace: boolean }>`
  && > [data-subscriber-actions] { padding-inline: 0; }
  ${media.desktop} { && > [data-subscriber-actions] { padding-block: 0; } }
  ${media.belowDesktop} { && { padding-block: 0; } }
  ${({ $workspace }) => $workspace && css`
    justify-content: flex-start;
    && > [data-subscriber-actions] {
      gap: var(--gh-spacing-1_5);
      > button { font-size: var(--gh-font-secondary); }
    }
  `}
`;

function OwnerNote({ account, action, formId, onDirtyChange, onSaved }: {
  account: OwnerSubscriber; action: CodeAction; formId: string; onDirtyChange?: (dirty: boolean) => void; onSaved?: () => void;
}) {
  const [note, setNote] = useState(account.ownerNote ?? "");
  const dirty = note !== (account.ownerNote ?? "");
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  return <CompactForm id={formId} method="post" action={action.localOnly ? "#" : `/api/admin/subscribers/${account.id}`} onSubmit={async event => {
    event.preventDefault();
    if (action.busy || !dirty) return;
    const reply = await action.send(`/api/admin/subscribers/${account.id}`, { action: "note", value: note }, "Owner note saved.");
    if (reply.ok) onSaved?.();
  }}><FieldBlock label={onDirtyChange ? "Admin note" : "Owner note"}><textarea name="note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.currentTarget.value)} disabled={action.busy} placeholder="Add a private note…" /></FieldBlock>
    <NoteFooter><span>{note.length}/500 · Admin only</span>{!onDirtyChange && <ActionButton type="submit" disabled={action.busy || !dirty}>Save note</ActionButton>}</NoteFooter>
  </CompactForm>;
}

/** A correction with a reason the ledger keeps; a negative amount takes credit away but never below zero. */
function CreditAdjust({ path, action, formId, open, onOpenChange }: { path: string; action: CodeAction; formId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [amount, setAmount] = useState(""), [note, setNote] = useState(""), [confirmed, setConfirmed] = useState(false);
  const value = Number(amount), valid = /^-?\d+$/u.test(amount.trim()) && value !== 0 && Math.abs(value) <= walletRules.adjustmentMaxUgx && !!note.trim();
  return <PlainDrawer data-subscriber-credit-adjust open={open} onToggle={event => { if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open); }}><summary>Correct credit<ChevronDownIcon /></summary><div><CompactForm id={formId} method="post" action={action.localOnly ? "#" : path} onSubmit={async event => {
    event.preventDefault(); if (action.busy || !valid || !confirmed) return;
    const reply = await action.send(path, { action: "credit-adjust", amount: value, note, confirmed }, `Credit ${value > 0 ? "added" : "removed"}.`);
    if (reply.ok) { setAmount(""); setNote(""); setConfirmed(false); }
  }}><MutedText>Use a negative amount to remove credit. Top-ups are approved from the payment instead.</MutedText>
    <FieldRow><FieldBlock label={"Amount · UGX"}><input name="amount" inputMode="numeric" required value={amount} disabled={action.busy} onChange={event => setAmount(event.currentTarget.value)} placeholder="e.g. 5000 or -5000" /></FieldBlock>
      <FieldBlock label={"Reason"}><input name="note" required maxLength={200} value={note} disabled={action.busy} onChange={event => setNote(event.currentTarget.value)} placeholder="Shown in the credit history" /></FieldBlock></FieldRow>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => setConfirmed(event.target.checked)} /> I checked this correction.</label>
    <ActionButton type="submit" $variant="primary" disabled={action.busy || !valid || !confirmed}>Save correction</ActionButton>
  </CompactForm></div></PlainDrawer>;
}

function ChangeNumber({ path, action, onSaved, formId }: { path: string; action: CodeAction; onSaved: () => void; formId: string }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (action.busy) return;
    const data = new FormData(event.currentTarget);
    const reply = await action.send(path, { action: "change-number", newPhone: data.get("newPhone"), verifiedBy: data.get("verifiedBy"), confirmed: data.get("confirmed") === "on" }, "Remaining access and credit moved to the new number. Old sessions no longer have access.");
    if (reply.ok) onSaved();
  }
  return <CompactForm id={formId} method="post" action={action.localOnly ? "#" : path} onSubmit={submit}><MutedText>Move remaining access, credit and auto-renewal to the new number&apos;s account. Old sessions lose access. Both accounts can then be erased but not permanently deleted.</MutedText>
    <FieldRow><PhoneInput label="New phone number" name="newPhone" lookup required disabled={action.busy} hint="" />
      <FieldBlock label={"Verified by"}><select name="verifiedBy" required disabled={action.busy}><option value="">Choose verification</option><option value="old-number">Old number</option><option value="payment-details">Payment details</option></select></FieldBlock></FieldRow>
    <label><input type="checkbox" name="confirmed" required disabled={action.busy} /> I verified this request.</label>
  </CompactForm>;
}

/** The account it removes is named in the header above; the checkbox is the confirmation. */
function ConfirmedRemoval({ kind, account, action, onSaved, formId, confirmed, onConfirmedChange }: { kind: Removal; account: OwnerSubscriber; action: CodeAction; onSaved: () => void; formId: string; confirmed: boolean; onConfirmedChange: (confirmed: boolean) => void }) {
  const deleting = kind === "delete";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirmed || action.busy) return;
    const reply = await action.send(`/api/admin/subscribers/${account.id}`, { action: kind, confirmed }, deleting ? "Account and eligible linked records permanently deleted." : "Personal data erased. Accounting history retained.");
    if (reply.ok) onSaved();
  }
  return <CompactForm id={formId} method="post" action={action.localOnly ? "#" : `/api/admin/subscribers/${account.id}`} onSubmit={submit} data-subscriber-removal={kind}>
    <MutedText>{deleting ? "Permanently removes the account and eligible linked records. Receipts and other records that must be retained can prevent deletion. Removing eligible payments changes their dashboard totals. This cannot be undone."
      : `Clears numbers, passwords, notes, sessions and screenshots.${account.creditUgx > 0 ? ` The ${formatCredit(account.creditUgx)} credit is forfeited.` : ""} Payment amounts, IDs and access history remain for accounting. This cannot be undone.`}</MutedText>
    <label><input type="checkbox" name="confirmed" required checked={confirmed} disabled={action.busy} onChange={event => onConfirmedChange(event.target.checked)} /> I verified this account and understand this cannot be undone.</label>
  </CompactForm>;
}

const WorkspaceAccountTop = styled(AccountTop)`
  flex-direction: row; justify-content: space-between; align-items: center;
  gap: var(--gh-spacing-2);
  > div:first-child { min-inline-size: 0; }
  h2 { font-size: var(--gh-font-subheading); }
  ${media.desktop} { padding-block: var(--gh-spacing-3); }
`;
const NoteMenuSlot = styled.div<{ $onDesktop: boolean }>`
  flex: none;
  ${({ $onDesktop }) => !$onDesktop && css`${media.desktop} { display: none; }`}
`;
const WorkspaceTabs = styled(DetailTabs)`
  justify-self: stretch;
  gap: var(--gh-spacing-1);
  padding-inline: var(--gh-spacing-2);
  border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.none};
  > button, > button[aria-selected="true"] {
    flex: 0 0 auto;
    font-size: var(--gh-font-secondary);
    background: transparent;
    border-block-end: var(--gh-stroke-strong) solid transparent;
  }
  > button[aria-selected="true"] {
    color: ${({ theme }) => theme.color.link};
    border-block-end-color: currentColor;
  }
`;
const AccountFacts = styled(FactList)`
  && > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
    align-content: center;
    min-block-size: var(--form-control-height);
    background: transparent;
    border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  }
  dd { text-align: start; overflow-wrap: anywhere; }
`;
const RemovalTrigger = styled(DangerButton)`
  justify-self: start;
`;
const DetailCard = styled(RecordCard)<{ $workspace: boolean }>`
  ${({ $workspace }) => $workspace ? css`
    background: ${({ theme }) => theme.color.surface};
    ${RecordBody} { gap: var(--gh-spacing-2_5); padding: var(--gh-spacing-2_5) ${({ theme }) => theme.layout.sectionPadding}; }
    [data-subscriber-tab] { border-radius: ${({ theme }) => theme.radius.none}; }
    ${TabBody} { padding: var(--gh-spacing-1) 0 0; }
    ${RecordRow} { padding-inline: 0; }
    ${QuickActions} {
      display: flex; flex-wrap: wrap;
      > button { flex: 0 1 auto; inline-size: auto; padding-inline: var(--gh-spacing-2_5); }
      ${media.belowDesktop} { > button { flex: 1 1 auto; } }
    }
  ` : css`
    ${AccountTop} {
      h2 { display: flex; align-items: center; gap: var(--gh-spacing-2); font-size: var(--gh-font-section); }
      [data-payment-logo] { inline-size: var(--gh-size-7); block-size: var(--gh-size-5); }
      ${MetaLine} { font-size: var(--gh-font-caption); }
    }
    ${Badges} { gap: var(--gh-spacing-1); }
    ${AccountStats} {
      gap: 0;
      > div { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gh-spacing-0_75) var(--gh-spacing-2); padding: var(--gh-spacing-1_75) var(--gh-spacing-2_5); }
      dt { font-size: var(--gh-font-caption); }
      dd { font-size: var(--gh-font-emphasis); }
    }
    ${QuickActions} {
      display: flex; flex-wrap: wrap; gap: var(--gh-spacing-1_5); padding: var(--gh-spacing-2) var(--gh-spacing-2_5);
      > button { flex: 0 1 auto; inline-size: auto; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2); font-size: var(--gh-font-secondary); }
      > button:first-child { grid-column: auto; }
      > button > svg { font-size: var(--gh-font-emphasis); }
      @media (pointer: coarse) { > button { min-block-size: var(--form-control-height); } }
    }
    ${DetailTabs} {
      display: flex; flex-wrap: nowrap; max-inline-size: 100%; overflow-x: auto; justify-self: stretch;
      > button { flex: none; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2_5); font-size: var(--gh-font-secondary); }
      @media (pointer: coarse) { > button { min-block-size: var(--form-control-height); } }
    }
    ${TabBody} { gap: var(--gh-spacing-2_5); padding: var(--gh-spacing-2_5); }
    ${media.belowDesktop} { ${AccountTop} { align-items: stretch; } }
  `}
`;
