"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/navigation/navigation-link";
import styled, { css } from "styled-components";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChevronDownIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { media } from "@/styles/theme";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { paymentNotificationNotice } from "@/domain/payment-notification";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerCode } from "@/domain/owner-members";
import { ActionButton, adminControl, Badge, DangerButton, FieldBlock, FormStack, Hint, postAdmin, replyMessage, type AdminReply } from "./admin-form";
import { Drawer, FactList, Panel, RowMeta, RowTitle, TextAction } from "./desk-styles";
import { RecordBody, RecordCard, RecordDetailHead, RecordDetails, RecordEmpty, RecordFeedback, RecordFooter, RecordHead, RecordItem,
  RecordItemMeta, RecordItemTitle, RecordList, RecordListFooter, RecordListScroll, RecordListTools, RecordScroll, RecordWorkspace } from "./record-workspace";
import { refreshPendingPayments } from "./pending-payments";
import { useAdminRefresh } from "./use-admin-refresh";
/** Keep the access decision visible alongside the separate payment notification outcome. */
export function grantNotice(body: AdminReply["body"]): string | null {
  const credit = typeof body.creditAddedUgx === "number" && typeof body.balanceUgx === "number"
    ? `UGX ${body.creditAddedUgx.toLocaleString("en-UG")} added to credit (balance UGX ${body.balanceUgx.toLocaleString("en-UG")})` : "";
  if (body.status === "credited") return [`Approved · ${credit}`, paymentNotificationNotice(body.notification)].filter(Boolean).join(" · ");
  if (typeof body.endsAt !== "string" || typeof body.devicesUnlocked !== "number") return null;
  const n = body.devicesUnlocked, line = `${body.status === "approved" ? "Approved" : "Granted"} · access until ${formatPeriodEnd(new Date(body.endsAt))} · ${n} device${n === 1 ? "" : "s"} unlocked`;
  const grant = n ? line : `${line}. Devices already unlocked keep access; the member's next sign-in unlocks one.`;
  return [grant, credit, paymentNotificationNotice(body.notification)].filter(Boolean).join(" · ");
}
export function useCodeAction(onChanged?: () => Promise<void>) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [notice, setNotice] = useState(""), [duplicateId, setDuplicateId] = useState<string | null>(null);
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { refreshing, refresh: refreshAdmin } = useAdminRefresh(message => setMessage(`The change was saved. ${message}`));
  /** `done` is the notice a plain success shows; a new access period always shows its own. */
  async function send(path: string, body: unknown, done = "", refresh = true, onSaved?: () => void): Promise<AdminReply> {
    // Disabled controls update on the next render; the ref also blocks submissions in the same event turn.
    if (inFlight.current || refreshing) return { ok: false, status: 409, body: { message: "An action is already in progress." } };
    inFlight.current = true;
    setBusy(true); setMessage(""); setNotice(""); setDuplicateId(null);
    try {
      const reply = await postAdmin(path, body);
      if (reply.ok) {
        setNotice(grantNotice(reply.body) ?? [done, paymentNotificationNotice(reply.body.notification)].filter(Boolean).join(" · "));
        // Apply local selection/URL changes before revalidation so they cannot interrupt its router action.
        if (mounted.current) onSaved?.();
        if (refresh) {
          if (onChanged) {
            try { await onChanged(); }
            catch { setMessage("The change was saved, but the latest data could not be loaded. Refresh to update this screen."); }
          }
          if (path.startsWith("/api/admin/payments/")) void refreshPendingPayments(true);
          // Invalidate server-seeded history entries while retaining the current view if revalidation fails.
          refreshAdmin();
        }
      }
      else {
        setMessage(replyMessage(reply, "The action was refused."));
        if (typeof reply.body.submissionId === "string") setDuplicateId(reply.body.submissionId);
        if (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden") router.refresh();
      }
      return reply;
    } finally { inFlight.current = false; setBusy(false); }
  }
  return { busy: busy || refreshing, message, notice, duplicateId, send };
}
export type CodeAction = ReturnType<typeof useCodeAction>;
/** The last action's outcome; a duplicate transaction ID links the earlier payment. */
export function ActionNotices({ action }: { action: CodeAction }) {
  return <>{action.notice && <Notice role="status">{action.notice}</Notice>}{action.message && <Notice role="alert" $tone="error">{action.message}{action.duplicateId && <> <Link href={`/admin/payments?tab=approved#${action.duplicateId}`} prefetch={false}>Earlier payment</Link></>}</Notice>}</>;
}
export function PlanField({ plans, value, allowCustom = true, onValueChange, disabled }: { plans: readonly SubscriptionPlanView[]; value?: string; allowCustom?: boolean; onValueChange?: (value: string) => void; disabled?: boolean }) {
  return <FieldBlock>Plan<select name="planId" defaultValue={value ?? plans[0]?.id ?? ""} disabled={disabled} onChange={event => onValueChange?.(event.currentTarget.value)}>{allowCustom && <option value="">Custom days</option>}
    {plans.map(p => <option key={p.id} value={p.id}>{p.name} · UGX {p.priceUgx.toLocaleString("en-UG")}{p.active ? "" : " · inactive"}</option>)}</select></FieldBlock>;
}
/**
 * One grant form for the Codes side panel, the add-subscriber drawer, the subscriber detail (`fixedPhone`) and payment
 * recovery (`withoutTransaction`). Custom days only counts when the plan is "Custom days", so it is disabled otherwise.
 */
export function ManualCodeForm({ plans, action, phone = "", amount = 0, note = "", compact = false, fixedPhone = false, withoutTransaction = false, onStart, onSaved, formId, externalActions = false }: { plans: readonly SubscriptionPlanView[]; action: CodeAction; phone?: string; amount?: number; note?: string; compact?: boolean; fixedPhone?: boolean; withoutTransaction?: boolean; onStart?: () => void; onSaved?: () => void; formId?: string; externalActions?: boolean }) {
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? "");
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); const planId = String(f.get("planId") ?? ""), network = String(f.get("network") ?? ""), transactionId = String(f.get("transactionId") ?? "").trim();
    if (action.busy) return;
    onStart?.();
    const reply = await action.send("/api/admin/codes", { action: "manual", phone: f.get("phone"), note: f.get("note"), amount: Number(f.get("amount")), ...(planId ? { planId } : { days: Number(f.get("days")) }), ...(network ? { network } : {}), ...(transactionId ? { transactionId } : {}) });
    if (reply.ok) onSaved?.(); }
  return <form id={formId} method="post" action="/api/admin/codes" onSubmit={submit} data-analytics-ignore><FormStack>
    {fixedPhone ? <input type="hidden" name="phone" value={phone} /> : <PhoneInput label="Account number" name="phone" defaultValue={phone || "256"} lookup required disabled={action.busy} />}
    <PlanField plans={plans} disabled={action.busy} onValueChange={setSelectedPlan} />
    <FieldPair>
      <FieldBlock><span>Custom days <NoWrap>(1–366)</NoWrap></span><input name="days" type="number" inputMode="numeric" min={1} max={366} defaultValue={1} required disabled={action.busy || selectedPlan !== ""} /></FieldBlock>
      <FieldBlock><span>Amount received <NoWrap>(UGX)</NoWrap></span><input name="amount" type="number" inputMode="numeric" min={0} max={4294967295} defaultValue={amount} required disabled={action.busy} /></FieldBlock>
    </FieldPair>
    <FieldBlock>Required note<textarea name="note" maxLength={200} defaultValue={note} required rows={2} disabled={action.busy} /></FieldBlock>
    {!withoutTransaction && <PlainDrawer><summary>Payment details · optional<ChevronDownIcon /></summary>
      <FieldPair><FieldBlock>Network<select name="network" disabled={action.busy}><option value="">None</option><option value="mtn">MTN</option><option value="airtel">Airtel</option></select></FieldBlock>
        <FieldBlock>Transaction ID<input name="transactionId" maxLength={40} autoComplete="off" disabled={action.busy} /></FieldBlock></FieldPair></PlainDrawer>}
    {!compact && <Hint as="p">Signed-in devices unlock at once; others unlock when the member signs in.</Hint>}
    {!externalActions && <GrantButton type="submit" $variant="primary" $inline={fixedPhone} disabled={action.busy}>Grant access manually</GrantButton>}</FormStack></form>;
}
const NoWrap = styled.span`white-space: nowrap;`;
/** Two fields side by side at every width; inputs line up when one label wraps. */
const FieldPair = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 10px;
`;
const PlainDrawer = styled.details`
  min-inline-size: 0;
  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: ${({ theme }) => theme.control.minHeight};
    color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: 1rem; transition: transform 0.15s ease; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  }
  &[open] > summary { margin-block-end: 8px; > svg { transform: rotate(180deg); } }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
  ${media.desktop} { > summary { min-block-size: 36px; } }
`;
const GrantButton = styled(ActionButton)<{ $inline: boolean }>`
  inline-size: 100%;
  ${({ $inline }) => $inline && css`${media.desktop} { inline-size: auto; justify-self: start; }`}
`;
/**
 * Extend and Revoke for one access period: "Extend by [n] days · Extend · Revoke" on one line, and Revoke asks once
 * before it ends the period. `onRevoked` lets a list move focus somewhere that outlives these controls.
 */
export function CodeActions({ code, action, onRevoked }: { code: OwnerCode; action: CodeAction; compact?: boolean; onRevoked?: () => void }) {
  const [confirming, setConfirming] = useState(false), revokeTrigger = useRef<HTMLButtonElement>(null), tools = useRef<HTMLDivElement>(null), id = useId();
  const locked = action.busy || code.status === "revoked";
  function cancel() { setConfirming(false); revokeTrigger.current?.focus(); }
  return <CodeTools ref={tools} tabIndex={-1} role="group" aria-label={`Actions for ${code.reference}`} data-record-actions>
    <ExtendForm method="post" action="/api/admin/codes" onSubmit={event => { event.preventDefault(); if (!action.busy) void action.send("/api/admin/codes", { action: "extend", id: code.id, days: Number(new FormData(event.currentTarget).get("days")) }, "Access period extended."); }}>
      <ExtendField>Extend by<input type="number" name="days" inputMode="numeric" min={1} max={60} defaultValue={1} required disabled={locked} />days</ExtendField>
      <ActionButton type="submit" disabled={locked}>Extend</ActionButton>
    </ExtendForm>
    <TextAction ref={revokeTrigger} type="button" $tone="danger" disabled={locked} aria-expanded={confirming} aria-controls={confirming ? `${id}-revoke` : undefined}
      onClick={() => setConfirming(value => !value)}>Revoke</TextAction>
    {confirming && <RevokeConfirmation id={`${id}-revoke`} role="group" aria-labelledby={`${id}-revoke-title`} onKeyDown={event => { if (event.key === "Escape" && !action.busy) { event.preventDefault(); cancel(); } }}>
      <p id={`${id}-revoke-title`}>End this access period now?</p>
      <div><ActionButton type="button" disabled={action.busy} onClick={cancel}>Cancel</ActionButton>
        <DangerButton type="button" disabled={action.busy} onClick={async () => {
          const reply = await action.send("/api/admin/codes", { action: "revoke", id: code.id, reason: "owner-revoked" }, "Access period revoked.");
          if (reply.ok) { setConfirming(false); if (onRevoked) onRevoked(); else tools.current?.focus(); }
        }}>Confirm revoke</DangerButton></div>
    </RevokeConfirmation>}
  </CodeTools>;
}
const CodeTools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-inline-size: 0;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
const ExtendForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
`;
const ExtendField = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  input {
    ${adminControl}
    inline-size: 3.25rem;
    padding-inline: 4px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    appearance: textfield;
    &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { appearance: none; margin: 0; }
  }
`;
/** Stacked, so it never needs more width than the controls above it (a list may give them only an auto column). */
const RevokeConfirmation = styled.div`
  flex: 1 1 100%;
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 10px 12px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.outcome.pending.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.color.outcome.pending.background};
  p { color: ${({ theme }) => theme.color.outcome.pending.text}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > div { display: flex; flex-wrap: wrap; gap: 8px; }
`;

const codeTone = (status: OwnerCode["status"]) => status === "active" ? "good" : status === "queued" ? "warning" : "muted";
/** Access records use the shared desktop workspace; mobile keeps inline controls and its grant drawer. */
export function CodesEditor({ initialCodes, plans }: { initialCodes: readonly OwnerCode[]; plans: readonly SubscriptionPlanView[] }) {
  const router = useRouter(), desktop = useDesktopLayout(), id = useId(), [grantOpen, setGrantOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialCodes[0]?.id ?? "");
  const [found, setFound] = useState<readonly OwnerCode[] | null>(null), [status, setStatus] = useState("all"), [search, setSearch] = useState("");
  const appliedSearch = useRef({ search: "", status: "all" });
  const action = useCodeAction(async () => {
    if (!appliedSearch.current.search && appliedSearch.current.status === "all") { setFound(null); return; }
    const reply = await postAdmin("/api/admin/codes", { action: "search", ...appliedSearch.current });
    if (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden") router.refresh();
    if (!reply.ok || !Array.isArray(reply.body.codes)) throw new Error("Code refresh failed");
    setFound(reply.body.codes as OwnerCode[]);
  });
  const codes = (found ?? initialCodes).filter(c => status === "all" || c.status === status);
  const selected = codes.find(code => code.id === selectedId) ?? codes[0];
  const grantId = `${id}-manual-grant`;
  async function find(nextStatus: string) {
    const query = { search, status: nextStatus };
    const reply = await action.send("/api/admin/codes", { action: "search", ...query }, "", false);
    if (reply.ok && Array.isArray(reply.body.codes)) { appliedSearch.current = query; setFound(reply.body.codes as OwnerCode[]); }
  }
  function select(code: OwnerCode) {
    if (action.busy) return;
    setSelectedId(code.id); setGrantOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-codes-detail-scroll]")?.scrollTo({ top: 0 }));
  }
  return <Codes data-codes-workspace data-analytics-ignore>
    <RecordHead><h1>Codes</h1><HeaderEnd><ActionButton type="button" disabled={action.busy} onClick={() => setGrantOpen(true)}><PlusIcon />Grant access manually</ActionButton></HeaderEnd></RecordHead>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <CodeList aria-label="Code directory">
      <RecordListTools>
        <SearchForm method="post" action="/api/admin/codes" onSubmit={event => { event.preventDefault(); void find(status); }} role="search" aria-label="Find codes">
          <FieldBlock>Phone or reference<input value={search} onChange={e => setSearch(e.target.value)} maxLength={40} autoComplete="off" disabled={action.busy} /></FieldBlock>
          <FieldBlock>Status<select value={status} disabled={action.busy} onChange={e => { const value = e.target.value; setStatus(value); void find(value); }}>{["all", "active", "queued", "expired", "revoked"].map(value => <option key={value}>{value}</option>)}</select></FieldBlock>
          <ActionButton type="submit" disabled={action.busy}><SearchIcon />Search</ActionButton>
        </SearchForm>
      </RecordListTools>
      <RecordListScroll aria-label="Codes" tabIndex={0} data-codes-list-scroll>
        {codes.length === 0 ? <li><RecordEmpty>No matching codes.</RecordEmpty></li> : codes.map(code => {
          const live = code.status === "active" || code.status === "queued";
          return desktop ? <li key={code.id}><RecordItem aria-current={!grantOpen && selected?.id === code.id ? "true" : undefined} aria-controls={`${id}-detail`} disabled={action.busy} onClick={() => select(code)} data-code-row={code.id}>
            <RecordItemTitle>{code.reference}</RecordItemTitle><Badge $tone={codeTone(code.status)}>{code.status}</Badge>
            <RecordItemMeta>{code.phone ? `+${formatPhone(code.phone)}` : "Erased account"}</RecordItemMeta><RecordItemMeta>{code.planName}</RecordItemMeta>
            <CodePeriod>{live ? `${code.daysLeft} day${code.daysLeft === 1 ? "" : "s"} left · ` : ""}{formatPeriodEnd(new Date(code.endsAt))}</CodePeriod>
          </RecordItem></li> : <CodeRow key={code.id} id={`${id}-${code.id}`} tabIndex={-1}>
            <RowTitle>{code.reference}<Badge $tone={codeTone(code.status)}>{code.status}</Badge></RowTitle>
            <CodeLine><Link href={`/admin/subscribers?accountId=${code.accountId}`} prefetch={false}>{code.phone ? formatPhone(code.phone) : "Erased account"}</Link> · {code.planName}{live && ` · ${code.daysLeft} day${code.daysLeft === 1 ? "" : "s"} left`}</CodeLine>
            <RowMeta>{formatPeriodEnd(new Date(code.startsAt))} – {formatPeriodEnd(new Date(code.endsAt))}</RowMeta>
            {code.status !== "revoked" && <CodeActions code={code} action={action} onRevoked={() => document.getElementById(`${id}-${code.id}`)?.focus()} />}
          </CodeRow>;
        })}
      </RecordListScroll>
      <RecordListFooter>{codes.length} access period{codes.length === 1 ? "" : "s"} · up to 100</RecordListFooter>
    </CodeList>
    <CodeDetails id={`${id}-detail`} aria-label="Selected access record">
      <RecordCard>
        <RecordScroll data-codes-detail-scroll tabIndex={desktop ? 0 : undefined}>
          <GrantPanel hidden={desktop && !grantOpen}>
            {desktop && <RecordDetailHead><h2>Grant access manually</h2></RecordDetailHead>}
            <GrantDrawer data-grant-desktop={desktop} open={grantOpen} onToggle={event => setGrantOpen(event.currentTarget.open)}>
              <summary><PlusIcon />Grant access manually<ChevronDownIcon /></summary>
              <div><ManualCodeForm plans={plans} action={action} formId={grantId} externalActions={desktop} /></div>
            </GrantDrawer>
          </GrantPanel>
          {desktop && !grantOpen && (selected ? <>
            <RecordDetailHead><h2>{selected.reference}</h2><Badge $tone={codeTone(selected.status)}>{selected.status}</Badge></RecordDetailHead>
            <RecordBody><Panel><Facts>
              <div><dt>Subscriber</dt><dd><Link href={`/admin/subscribers?accountId=${selected.accountId}`} prefetch={false}>{selected.phone ? `+${formatPhone(selected.phone)}` : "Erased account"}</Link></dd></div>
              <div><dt>Plan</dt><dd>{selected.planName}</dd></div>
              <div><dt>Starts</dt><dd>{formatPeriodEnd(new Date(selected.startsAt))}</dd></div>
              <div><dt>Ends</dt><dd>{formatPeriodEnd(new Date(selected.endsAt))}</dd></div>
              <div><dt>Days left</dt><dd>{selected.daysLeft}</dd></div>
            </Facts></Panel><Hint>Revoke ends a period at once; devices stay unlocked only while another period is live.</Hint></RecordBody>
          </> : <RecordEmpty><h2>Select an access record</h2><p>Find a record or grant access manually.</p></RecordEmpty>)}
        </RecordScroll>
        {desktop && (grantOpen ? <RecordFooter><ActionButton type="button" disabled={action.busy} onClick={() => setGrantOpen(false)}>Cancel</ActionButton><ActionButton type="submit" form={grantId} $variant="primary" disabled={action.busy}>Grant access manually</ActionButton></RecordFooter>
          : selected && selected.status !== "revoked" ? <RecordFooter><CodeActions key={selected.id} code={selected} action={action} /></RecordFooter> : null)}
      </RecordCard>
    </CodeDetails>
  </Codes>;
}
const Codes = styled(RecordWorkspace)``;
const HeaderEnd = styled.div`margin-inline-start: auto; ${media.belowDesktop} { display: none; }`;
const CodeList = styled(RecordList)`${media.belowDesktop} { order: 2; }`;
const CodeDetails = styled(RecordDetails)`${media.belowDesktop} { order: 1; }`;
const CodePeriod = styled(RecordItemMeta)`grid-column: 1 / -1;`;
const GrantPanel = styled.div`min-inline-size: 0; &[hidden] { display: none; } ${media.belowDesktop} { background: ${({ theme }) => theme.color.surface}; border: 1px solid ${({ theme }) => theme.color.border}; border-radius: 2px; }`;
const Facts = styled(FactList)`padding: 12px;`;
const SearchForm = styled.form`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; min-inline-size: 0;
  > :first-child { grid-column: 1 / -1; }
  > button > svg { flex: none; font-size: 1rem; }
  ${media.desktop} { input, select { min-block-size: 34px; font-size: 0.8125rem; } > button { min-block-size: 32px; } }
`;
const CodeRow = styled.li`
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  > ${CodeTools} { margin-block-start: 8px; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  ${media.desktop} { padding-inline: 16px; }
  @container (min-width: 36rem) {
    grid-template-columns: minmax(0, 1fr) auto;
    /* The spare last row takes the height an open confirmation adds, so the three text lines stay together. */
    grid-template-rows: auto auto auto minmax(0, 1fr);
    align-items: center;
    column-gap: 16px;
    > :not(${CodeTools}) { grid-column: 1; }
    /* A wrapping flex row would size this column to the sum of its parts, confirmation included; a grid does not. */
    > ${CodeTools} { display: grid; grid-template-columns: auto auto; justify-content: end; grid-column: 2; grid-row: 1 / -1; margin-block-start: 0; }
    > ${CodeTools} > ${RevokeConfirmation} { grid-column: 1 / -1; justify-self: stretch; }
  }
`;
const CodeLine = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  overflow-wrap: anywhere;
  a {
    color: ${({ theme }) => theme.color.link};
    font-size: ${({ theme }) => theme.typography.scale.emphasis};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    ${media.hover} { &:hover { text-decoration: underline; } }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
    ${media.belowDesktop} { display: inline-flex; align-items: center; min-block-size: ${({ theme }) => theme.control.minHeight}; vertical-align: middle; }
  }
`;
const GrantDrawer = styled(Drawer)`
  ${media.desktop} { &[data-grant-desktop="true"] > summary { display: none; } > div { padding: 12px; } }
  > div { padding-block-start: 14px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
`;
