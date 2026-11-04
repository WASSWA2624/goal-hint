"use client";

import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";

import { controlRow } from "@/components/ui/control-layout";

import { FloatingField } from "@/components/ui/floating-field";
import { authCopy } from "@/i18n/messages/auth";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/navigation/navigation-link";
import styled, { css } from "styled-components";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone } from "@/domain/phone";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChevronDownIcon, PlusIcon, TicketIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { media } from "@/styles/theme";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { paymentNotificationNotice } from "@/domain/payment-notification";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { OwnerCode } from "@/domain/owner-members";
import { ActionButton, Badge, DangerButton, FieldBlock, FormStack, Hint, postAdmin, replyMessage, type AdminReply } from "./admin-form";
import { FactList, Panel, TextAction } from "./desk-styles";
import { RecordBody, RecordCard, RecordDetailHead, RecordDetails, RecordDisclosureSummary, RecordEmpty, RecordFeedback, RecordFooter, RecordItem,
  RecordItemTitle, RecordList, RecordListFooter, RecordListScroll, RecordRowContent, RecordScroll, RecordWorkspace } from "./record-workspace";
import { RecordFormDialog, RecordPrimaryAction, RecordToolbar } from "./record-toolbar";
import { refreshPendingPayments } from "./pending-payments";
import { useAdminRefresh } from "./use-admin-refresh";
import { NetworkChoice } from "./network-choice";
import { balancedCodePresentation, codePresentation } from "./code-presentation-styles";

type CodeRequest = typeof postAdmin;
type CodeActionOptions = Readonly<{ request: CodeRequest; localOnly: true }>;
/** Keep the access decision visible alongside the separate payment notification outcome. */
export function grantNotice(body: AdminReply["body"]): string | null {
  const credit = typeof body.creditAddedUgx === "number" && typeof body.balanceUgx === "number"
    ? `UGX ${body.creditAddedUgx.toLocaleString("en-UG")} added to credit (balance UGX ${body.balanceUgx.toLocaleString("en-UG")})` : "";
  if (body.status === "credited") return [`Approved · ${credit}`, paymentNotificationNotice(body.notification)].filter(Boolean).join(" · ");
  if (typeof body.endsAt !== "string" || typeof body.devicesUnlocked !== "number") return null;
  const n = body.devicesUnlocked, line = `${body.status === "approved" ? "Approved" : "Granted"} · access until ${formatPeriodEnd(new Date(body.endsAt))} · ${n} device${n === 1 ? "" : "s"} unlocked`;
  const grant = n ? line : `${line}. ${authCopy.accessNextLogin}`;
  return [grant, credit, paymentNotificationNotice(body.notification)].filter(Boolean).join(" · ");
}
export function useCodeAction(onChanged?: () => Promise<void>, options?: CodeActionOptions) {
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
      const reply = await (options?.request ?? postAdmin)(path, body);
      if (reply.ok) {
        setNotice(grantNotice(reply.body) ?? [done, paymentNotificationNotice(reply.body.notification)].filter(Boolean).join(" · "));
        // Apply local selection/URL changes before revalidation so they cannot interrupt its router action.
        if (mounted.current) onSaved?.();
        if (refresh) {
          if (onChanged) {
            try { await onChanged(); }
            catch { setMessage("The change was saved, but the latest data could not be loaded. Refresh to update this screen."); }
          }
          if (!options?.localOnly && path.startsWith("/api/admin/payments/")) void refreshPendingPayments(true);
          // Invalidate server-seeded history entries while retaining the current view if revalidation fails.
          if (!options?.localOnly) refreshAdmin();
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
  function clearFeedback() {
    if (inFlight.current) return;
    setMessage(""); setNotice(""); setDuplicateId(null);
  }
  return { busy: busy || refreshing, message, notice, duplicateId, send, clearFeedback, localOnly: options?.localOnly ?? false };
}
export type CodeAction = ReturnType<typeof useCodeAction>;
/** The last action's outcome; a duplicate transaction ID links the earlier payment. */
export function ActionNotices({ action }: { action: CodeAction }) {
  return <>{action.notice && <Notice role="status">{action.notice}</Notice>}{action.message && <Notice role="alert" $tone="error">{action.message}{action.duplicateId && <> <Link href={`/admin/payments?paymentId=${encodeURIComponent(action.duplicateId)}`} prefetch={false}>Earlier payment</Link></>}</Notice>}</>;
}
export function PlanField({ plans, value, allowCustom = true, onValueChange, disabled }: { plans: readonly SubscriptionPlanView[]; value?: string; allowCustom?: boolean; onValueChange?: (value: string) => void; disabled?: boolean }) {
  return <FieldBlock label={"Plan"}><select name="planId" defaultValue={value ?? plans[0]?.id ?? ""} disabled={disabled} onChange={event => onValueChange?.(event.currentTarget.value)}>{allowCustom && <option value="">Custom days</option>}
    {plans.map(p => <option key={p.id} value={p.id}>{p.name} · UGX {p.priceUgx.toLocaleString("en-UG")}{p.active ? "" : " · inactive"}</option>)}</select></FieldBlock>;
}
/**
 * One grant form for the Codes side panel, the add-subscriber drawer, the subscriber detail (`fixedPhone`) and payment
 * recovery (`withoutTransaction`). Custom days only counts when the plan is "Custom days", so it is disabled otherwise.
 */
export function ManualCodeForm({ plans, action, phone = "", amount = 0, note = "", compact = false, fixedPhone = false, withoutTransaction = false, onStart, onSaved, formId, externalActions = false }: { plans: readonly SubscriptionPlanView[]; action: CodeAction; phone?: string; amount?: number; note?: string; compact?: boolean; fixedPhone?: boolean; withoutTransaction?: boolean; onStart?: () => void; onSaved?: () => void; formId?: string; externalActions?: boolean }) {
  const reasonId = useId();
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? "");
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); const planId = String(f.get("planId") ?? ""), network = String(f.get("network") ?? ""), transactionId = String(f.get("transactionId") ?? "").trim();
    if (action.busy) return;
    onStart?.();
    const reply = await action.send("/api/admin/codes", { action: "manual", phone: f.get("phone"), note: f.get("note"), amount: Number(f.get("amount")), ...(planId ? { planId } : { days: Number(f.get("days")) }), ...(network ? { network } : {}), ...(transactionId ? { transactionId } : {}) });
    if (reply.ok) onSaved?.(); }
  return <form id={formId} method="post" action={action.localOnly ? "#" : "/api/admin/codes"} onSubmit={submit} data-analytics-ignore data-manual-code-form><FormStack data-code-form-stack>
    <GrantSection data-grant-section="account">
      {fixedPhone ? <input type="hidden" name="phone" value={phone} /> : <PhoneInput label="Account number" name="phone" defaultValue={phone || "256"} lookup required disabled={action.busy} />}
      <PlanField plans={plans} disabled={action.busy} onValueChange={setSelectedPlan} />
    </GrantSection>
    <FieldPair data-grant-section="terms">
      <FieldBlock label={<><span>Custom days <NoWrap>(1–366)</NoWrap></span></>}><input name="days" type="number" inputMode="numeric" min={1} max={366} defaultValue={1} required disabled={action.busy || selectedPlan !== ""} /></FieldBlock>
      <FieldBlock label={<><span>Amount received <NoWrap>(UGX)</NoWrap></span></>}><input name="amount" type="number" inputMode="numeric" min={0} max={4294967295} defaultValue={amount} required disabled={action.busy} /></FieldBlock>
    </FieldPair>
    <GrantSection data-grant-section="reason"><FieldBlock label={"Reason for granting access (required)"}><textarea name="note" maxLength={200} defaultValue={note} placeholder="For example, offline payment or complimentary access" required rows={2} disabled={action.busy} aria-describedby={reasonId} /></FieldBlock>
      <Hint id={reasonId}>A short reason for the access record. Maximum 200 characters.</Hint></GrantSection>
    {!withoutTransaction && <PlainDrawer data-grant-payment><summary>Payment details · optional<ChevronDownIcon /></summary>
      <GrantSection><NetworkChoice disabled={action.busy} />
        <FieldBlock label={"Transaction ID"}><input name="transactionId" maxLength={40} autoComplete="off" placeholder="Enter the payment reference" disabled={action.busy} /></FieldBlock></GrantSection></PlainDrawer>}
    {!compact && <Hint as="p" data-grant-hint>{authCopy.accessDeviceHelp}</Hint>}
    {!externalActions && <GrantButton type="submit" $variant="primary" $inline={fixedPhone} disabled={action.busy}>Grant access manually</GrantButton>}</FormStack></form>;
}
const NoWrap = styled.span`white-space: nowrap;`;
const GrantSection = styled.div`display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;`;
/** Two fields side by side at every width; inputs line up when one label wraps. */
const FieldPair = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: var(--gh-spacing-2_5);

  ${controlRow}
`;
const PlainDrawer = styled.details`
  min-inline-size: 0;
  > summary {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-2);
    min-block-size: var(--form-control-height);
    color: ${({ theme }) => theme.color.link};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; margin-inline-start: auto; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-section); transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  }
  &[open] > summary { margin-block-end: var(--gh-spacing-2); > svg { transform: rotate(180deg); } }
  @media (prefers-reduced-motion: reduce) { > summary > svg { transition: none; } }
  ${media.desktop} { > summary { min-block-size: var(--form-control-height); } }
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
    {code.source !== "referral" && <ExtendForm method="post" action={action.localOnly ? "#" : "/api/admin/codes"} onSubmit={event => { event.preventDefault(); if (!action.busy) void action.send("/api/admin/codes", { action: "extend", id: code.id, days: Number(new FormData(event.currentTarget).get("days")) }, "Access period extended."); }}>
      <ExtendField label="Extend by (days)"><input type="number" name="days" inputMode="numeric" min={1} max={60} defaultValue={1} required disabled={locked} /></ExtendField>
      <ActionButton type="submit" disabled={locked}>Extend</ActionButton>
    </ExtendForm>}
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
  gap: var(--gh-spacing-2) var(--gh-spacing-3);
  min-inline-size: 0;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
`;
const ExtendForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;

  ${controlRow}
`;
const ExtendField = styled(FloatingField)`flex: 1;`;
/** Stacked, so it never needs more width than the controls above it (a list may give them only an auto column). */
const RevokeConfirmation = styled.div`
  flex: 1 1 100%;
  display: grid;
  justify-items: start;
  gap: var(--gh-spacing-2);
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  p { color: ${({ theme }) => theme.color.outcome.pending.text}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  > div { display: flex; flex-wrap: wrap; gap: var(--gh-spacing-2); }
`;

const codeTone = (status: OwnerCode["status"]) => status === "active" ? "good" : status === "queued" ? "warning" : "muted";
const codeStatusLabel = { all: "All", active: "Active", queued: "Queued", expired: "Expired", revoked: "Revoked" } as const;
export type CodesPreview = Readonly<{ variant: string; initialView: "grant" | "details"; request: CodeRequest }>;
/** Access records use the shared desktop workspace and mobile disclosures. */
export function CodesEditor({ initialCodes, plans, preview }: { initialCodes: readonly OwnerCode[]; plans: readonly SubscriptionPlanView[]; preview?: CodesPreview }) {
  const router = useRouter(), desktop = useDesktopLayout(), id = useId(), [grantOpen, setGrantOpen] = useState(preview?.initialView === "grant");
  const [selectedId, setSelectedId] = useState(initialCodes[0]?.id ?? "");
  const [found, setFound] = useState<readonly OwnerCode[] | null>(null), [status, setStatus] = useState("all"), [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false), [draftStatus, setDraftStatus] = useState("all");
  const appliedSearch = useRef({ search: "", status: "all" });
  const request = preview?.request ?? postAdmin;
  const action = useCodeAction(async () => {
    if (!appliedSearch.current.search && appliedSearch.current.status === "all") { setFound(null); return; }
    const reply = await request("/api/admin/codes", { action: "search", ...appliedSearch.current });
    if (!preview && (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden")) router.refresh();
    if (!reply.ok || !Array.isArray(reply.body.codes)) throw new Error("Code refresh failed");
    setFound(reply.body.codes as OwnerCode[]);
  }, preview ? { request, localOnly: true } : undefined);
  const codes = (found ?? initialCodes).filter(c => status === "all" || c.status === status);
  const selected = codes.find(code => code.id === selectedId) ?? codes[0];
  const grantId = `${id}-manual-grant`;
  async function find(nextStatus: string) {
    const query = { search, status: nextStatus };
    const reply = await action.send("/api/admin/codes", { action: "search", ...query }, "", false);
    if (reply.ok && Array.isArray(reply.body.codes)) { appliedSearch.current = query; setStatus(nextStatus); setFound(reply.body.codes as OwnerCode[]); }
  }
  function select(code: OwnerCode) {
    if (action.busy) return;
    setSelectedId(code.id); setGrantOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-codes-detail-scroll]")?.scrollTo({ top: 0 }));
  }
  return <Codes aria-busy={action.busy || undefined} data-codes-workspace data-code-variant={preview?.variant ?? "balanced"} data-analytics-ignore>
    <RecordToolbar><h1>Codes</h1>
      <form method="post" action={preview ? "#" : "/api/admin/codes"} onSubmit={event => { event.preventDefault(); void find(status); }} role="search" aria-label="Find codes">
        <SearchBar label="Phone or reference" submitLabel="Search" value={search} onChange={e => setSearch(e.target.value)} maxLength={40} autoComplete="off" disabled={action.busy}
          filters={{ label: "Advanced filters", dialogId: `${id}-filters`, open: filtersOpen, count: Number(status !== "all"),
            onOpen: () => { setDraftStatus(status); setFiltersOpen(true); } }}
          trailingAction={<RecordPrimaryAction label="Grant access manually" icon={<PlusIcon />} disabled={action.busy} aria-haspopup="dialog"
            onClick={() => { action.clearFeedback(); setGrantOpen(true); }} />} />
      </form>
      {filtersOpen && <AdvancedFilterDialog id={`${id}-filters`} open closeLabel="Close code filters" onCancel={() => setFiltersOpen(false)}
        onApply={() => { setFiltersOpen(false); void find(draftStatus); }} onReset={() => setDraftStatus("all")}>
        <FloatingField label="Status"><select value={draftStatus} onChange={event => setDraftStatus(event.currentTarget.value)}>
          {Object.entries(codeStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></FloatingField>
      </AdvancedFilterDialog>}
    </RecordToolbar>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <RecordList aria-label="Code directory">
      <RecordListScroll aria-label="Codes" tabIndex={0} data-codes-list-scroll>
        {codes.length === 0 ? <li><RecordEmpty>No matching codes.</RecordEmpty></li> : codes.map(code => {
          const content = <RecordRowContent icon={<TicketIcon />} primary={<><RecordItemTitle>{code.reference}</RecordItemTitle>
            <Badge $tone={codeTone(code.status)}>{codeStatusLabel[code.status]}</Badge></>}
            secondary={<>{code.phone ? `+${formatPhone(code.phone)}` : "Erased account"} · {code.planName}</>} />;
          return desktop ? <li key={code.id}><RecordItem type="button" aria-current={selected?.id === code.id ? "true" : undefined} aria-controls={`${id}-detail`} disabled={action.busy} onClick={() => select(code)} data-code-row={code.id}>
            {content}
          </RecordItem></li> : <li key={code.id} id={`${id}-${code.id}`} data-code-row={code.id} tabIndex={-1}>
            <MobileCodeDetails open={preview?.initialView === "details" && selected?.id === code.id} data-mobile-code-details>
              <RecordDisclosureSummary>{content}<ChevronDownIcon /></RecordDisclosureSummary><CodeFacts code={code} preview={!!preview} />
              {code.status !== "revoked" && <CodeActions code={code} action={action} onRevoked={() => document.getElementById(`${id}-${code.id}`)?.focus()} />}</MobileCodeDetails>
          </li>;
        })}
      </RecordListScroll>
      <RecordListFooter>{codes.length} access period{codes.length === 1 ? "" : "s"} · up to 100</RecordListFooter>
    </RecordList>
    {desktop && <RecordDetails id={`${id}-detail`} aria-label="Selected access record">
      <RecordCard>
        <RecordScroll data-codes-detail-scroll tabIndex={desktop ? 0 : undefined}>
          {selected ? <>
            <RecordDetailHead><h2>{selected.reference}</h2><Badge $tone={codeTone(selected.status)}>{codeStatusLabel[selected.status]}</Badge></RecordDetailHead>
            <RecordBody><Panel><CodeFacts code={selected} preview={!!preview} /></Panel><Hint>Revoke ends a period at once; devices stay unlocked only while another period is live.</Hint></RecordBody>
          </> : <RecordEmpty><h2>Select an access record</h2><p>Find a record or grant access manually.</p></RecordEmpty>}
        </RecordScroll>
        {selected && selected.status !== "revoked" && <RecordFooter><CodeActions key={selected.id} code={selected} action={action} /></RecordFooter>}
      </RecordCard>
    </RecordDetails>}
    {grantOpen && <RecordFormDialog id={`${id}-grant-dialog`} title="Grant access manually" submitLabel="Grant access" formId={grantId}
      busy={action.busy} onClose={() => { if (!action.busy) setGrantOpen(false); }}>
      {action.message && <ActionNotices action={action} />}
      <ManualCodeForm plans={plans} action={action} formId={grantId} externalActions compact onSaved={() => setGrantOpen(false)} />
    </RecordFormDialog>}
  </Codes>;
}
function CodeFacts({ code, preview }: { code: OwnerCode; preview: boolean }) {
  const phone = code.phone ? `+${formatPhone(code.phone)}` : "Erased account";
  return <Facts data-code-facts>
    <div><dt>Subscriber</dt><dd>{preview ? phone : <Link href={`/admin/subscribers?accountId=${code.accountId}`} prefetch={false}>{phone}</Link>}</dd></div>
    <div><dt>Plan</dt><dd>{code.planName}</dd></div>
    <div><dt>Starts</dt><dd>{formatPeriodEnd(new Date(code.startsAt))}</dd></div>
    <div><dt>Ends</dt><dd>{formatPeriodEnd(new Date(code.endsAt))}</dd></div>
    <div><dt>Days left</dt><dd>{code.daysLeft}</dd></div>
  </Facts>;
}
const Codes = styled(RecordWorkspace)`
  ${codePresentation}
  &[data-code-variant="balanced"] { ${balancedCodePresentation} }
`;
const Facts = styled(FactList)`padding: var(--gh-spacing-3);`;
const MobileCodeDetails = styled(PlainDrawer)`
  > summary { min-block-size: var(--form-control-height); }
  > [data-record-actions] { margin-block-start: var(--gh-spacing-3); }
`;
