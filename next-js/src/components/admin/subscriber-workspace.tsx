"use client";

import { useCallback, useEffect, useEffectEvent, useId, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import { goHistoryBack, writeContextHistory } from "@/components/navigation/context-history";
import { UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryPage, parseSubscriberDirectoryQuery, type SubscriberDirectoryAccount,
  type SubscriberDirectoryPage, type SubscriberDirectoryPaging, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import { parseSubscriberIndividualAction, type SubscriberIndividualAction } from "@/domain/subscriber-actions";
import type { OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { authCopy } from "@/i18n/messages/auth";
import { media } from "@/styles/theme";
import { ActionButton, FieldError, Hint } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { RecordBack, RecordCard, RecordEmpty, RecordFeedback, RecordScroll } from "./record-workspace";
import { SubscriberDirectory } from "./subscriber-directory";
import { SubscriberDirectoryFilters } from "./subscriber-directory-parts";
import { SubscriberDetail } from "./subscriber-detail";
import { RecordFormDialog, RecordPrimaryAction } from "./record-toolbar";
import { AccountColumn, Workspace, WorkspaceTitle } from "./subscriber-styles";

type Props = {
  accounts: readonly SubscriberDirectoryAccount[];
  detail: OwnerSubscriber | null;
  plans: readonly SubscriptionPlanView[];
  initialQuery?: SubscriberDirectoryQuery;
  initialPaging?: SubscriberDirectoryPaging;
  initialDirectoryAsOf?: string;
  initialRequestedPage?: number;
  initialAccountId?: string;
  initialAction?: SubscriberIndividualAction;
  initialDirectoryError?: string;
  initialDetailError?: string;
  initialPlansError?: string;
  initialAdminPhone?: string;
  selectedExplicitly?: boolean;
  canManagePasswords?: boolean;
};
type DirectoryLocation = Readonly<{ query: SubscriberDirectoryQuery; page: number }>;
type RecordLocation = Readonly<{ accountId: string | null; action: SubscriberIndividualAction | null }>;
const directoryPath = "/admin/subscribers";
const directoryApi = "/api/admin/subscribers";
const queryKey = (query: SubscriberDirectoryQuery) => JSON.stringify(parseSubscriberDirectoryQuery(query) ?? emptySubscriberDirectoryQuery);
const locationKey = ({ query, page }: DirectoryLocation) => `${queryKey(query)}:${page}`;
const requestHeaders = { Accept: "application/json" };

function subscriberHref({ query, page }: DirectoryLocation, { accountId, action }: RecordLocation) {
  const params = new URLSearchParams();
  const normalized = parseSubscriberDirectoryQuery(query) ?? emptySubscriberDirectoryQuery;
  for (const name of Object.keys(normalized) as (keyof SubscriberDirectoryQuery)[]) {
    if (normalized[name] !== emptySubscriberDirectoryQuery[name]) params.set(name, normalized[name]);
  }
  if (page > 1) params.set("page", String(page));
  if (accountId) params.set("accountId", accountId);
  if (accountId && action) params.set("action", action);
  return params.size ? `${directoryPath}?${params}` : directoryPath;
}

function writeLocation(location: DirectoryLocation, record: RecordLocation, mode: "replace" | "push" = "replace") {
  const href = subscriberHref(location, record);
  if (window.location.pathname === directoryPath && window.location.pathname + window.location.search !== href) {
    writeContextHistory({}, href, mode);
  }
}

function isDirectoryPage(value: unknown): value is SubscriberDirectoryPage {
  if (!value || typeof value !== "object") return false;
  const { accounts, page, pages, total, asOf } = value as Partial<SubscriberDirectoryPage>;
  return Array.isArray(accounts) && accounts.every(account => account && typeof account.id === "string"
      && (typeof account.phone === "string" || account.phone === null) && typeof account.status === "string"
      && ["active", "queued", "none"].includes(account.access))
    && typeof asOf === "string" && Number.isFinite(Date.parse(asOf))
    && typeof page === "number" && Number.isSafeInteger(page) && page >= 1
    && typeof pages === "number" && Number.isSafeInteger(pages) && pages >= page
    && typeof total === "number" && Number.isSafeInteger(total) && total >= accounts.length;
}

function useSubscriberRead(error = "") {
  const [status, setStatus] = useState({ busy: false, error });
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback((busy = false) => {
    active.current?.abort();
    active.current = null;
    setStatus({ busy, error: "" });
  }, []);
  useEffect(() => () => { active.current?.abort(); }, []);

  async function read(load: (signal: AbortSignal) => Promise<void>, failed: string) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setStatus({ busy: true, error: "" });
    try {
      await load(controller.signal);
      if (!controller.signal.aborted) setStatus({ busy: false, error: "" });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return true;
      setStatus({ busy: false, error: error instanceof SubscriberReadError ? error.message : failed });
      return false;
    }
  }
  return { ...status, read, cancel };
}

class SubscriberReadError extends Error {}

/** Directory and record reads update their own pane. Account links remain navigable URLs. */
export function SubscribersWorkspace({ accounts, detail: initialDetail, plans: seedPlans, initialQuery = emptySubscriberDirectoryQuery,
  initialPaging, initialDirectoryAsOf = "", initialRequestedPage, initialAccountId, initialAction, initialDirectoryError, initialDetailError, initialPlansError,
  initialAdminPhone, selectedExplicitly = false, canManagePasswords = false }: Props) {
  const router = useRouter(), parameters = useSearchParams().toString(), id = useId();
  const [location, setLocation] = useState<DirectoryLocation>({ query: initialQuery, page: initialRequestedPage ?? initialPaging?.page ?? 1 });
  const [directory, setDirectory] = useState<SubscriberDirectoryPage>({ accounts, asOf: initialDirectoryAsOf, page: 1, pages: 1, total: accounts.length, ...initialPaging });
  const [record, setRecord] = useState<RecordLocation>({ accountId: selectedExplicitly ? initialAccountId ?? initialDetail?.id ?? null : null, action: initialAction ?? null });
  const [detail, setDetail] = useState(initialDetail);
  const [plans, setPlans] = useState(seedPlans);
  const [adminPhone, setAdminPhone] = useState(initialAdminPhone ?? null);
  const [adding, setAdding] = useState(false), [sessionEnded, setSessionEnded] = useState(false);
  const listRead = useSubscriberRead(initialDirectoryError), detailRead = useSubscriberRead(initialDetailError), plansRead = useSubscriberRead(initialPlansError);
  const currentLocation = useRef(location), currentRecord = useRef(record), displayedDetail = useRef(detail);
  const detailTarget = useRef(initialAccountId ?? initialDetail?.id ?? null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const detailsPane = useRef<HTMLElement>(null), listScroll = useRef<HTMLOListElement>(null);
  const openedFrom = useRef<{ id: string; url: string; scrollTop: number } | null>(null);
  const { query } = location, { accounts: listed, page, pages, total } = directory;
  const formId = `${id}-add-subscriber`;

  function replaceDetail(next: OwnerSubscriber | null) {
    displayedDetail.current = next;
    setDetail(next);
  }

  function checkSession(response: Response, signal: AbortSignal) {
    if (signal.aborted || response.status !== 401) return;
    clearTimeout(searchTimer.current);
    listRead.cancel(); detailRead.cancel(); plansRead.cancel();
    replaceDetail(null);
    setDirectory({ accounts: [], asOf: "", page: 1, pages: 1, total: 0 });
    setAdminPhone(null);
    setPlans([]);
    setAdding(false);
    setSessionEnded(true);
    router.refresh();
  }

  function loadDetail(accountId: string) {
    detailTarget.current = accountId;
    return detailRead.read(async signal => {
      const response = await fetch(`${directoryApi}/${encodeURIComponent(accountId)}`, { cache: "no-store", headers: requestHeaders, signal });
      checkSession(response, signal);
      if (signal.aborted) return;
      if (response.status === 404) {
        if (displayedDetail.current?.id === accountId) replaceDetail(null);
        throw new SubscriberReadError("This subscriber account is no longer available.");
      }
      if (!response.ok) throw new Error();
      const body: { detail?: OwnerSubscriber } = await response.json();
      if (signal.aborted) return;
      if (body?.detail?.id !== accountId || !Array.isArray(body.detail.codes) || !Array.isArray(body.detail.submissions)
        || !Array.isArray(body.detail.devices) || !Array.isArray(body.detail.wallet)) throw new Error();
      replaceDetail(body.detail);
    }, "Account details could not be loaded. Try again.");
  }

  function loadDirectory() {
    clearTimeout(searchTimer.current);
    const requested = currentLocation.current;
    return listRead.read(async signal => {
      const response = await fetch(directoryApi, { method: "POST", cache: "no-store", signal,
        headers: { ...requestHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ ...requested.query, page: requested.page }) });
      checkSession(response, signal);
      if (signal.aborted) return;
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (signal.aborted) return;
      if (!isDirectoryPage(body)) throw new Error();
      setDirectory(body);
      setAdminPhone("adminPhone" in body && typeof body.adminPhone === "string" ? body.adminPhone : null);
      if (body.page !== requested.page) {
        const accepted = { ...requested, page: body.page };
        currentLocation.current = accepted;
        setLocation(accepted);
        writeLocation(accepted, currentRecord.current);
      }
    }, "Subscribers could not be loaded. Try again.");
  }

  function loadPlans() {
    return plansRead.read(async signal => {
      const response = await fetch("/api/admin/plans", { cache: "no-store", headers: requestHeaders, signal });
      checkSession(response, signal);
      if (signal.aborted) return;
      if (!response.ok) throw new Error();
      const body: { plans?: SubscriptionPlanView[] } = await response.json();
      if (signal.aborted) return;
      if (!Array.isArray(body?.plans)) throw new Error();
      setPlans(body.plans);
    }, "Subscription plans could not be loaded. Try again.");
  }

  const action = useCodeAction(async () => {
    const accountId = detailTarget.current;
    const results = await Promise.all([loadDirectory(), accountId ? loadDetail(accountId) : true]);
    if (results.includes(false)) throw new Error("Subscriber data could not be refreshed.");
  });

  function updateLocation(next: DirectoryLocation, { write = true, debounce = false } = {}) {
    const changed = locationKey(next) !== locationKey(currentLocation.current);
    currentLocation.current = next;
    setLocation(next);
    if (write && changed) writeLocation(next, currentRecord.current);
    if (!changed) return;
    if (listScroll.current) listScroll.current.scrollTop = 0;
    clearTimeout(searchTimer.current);
    if (debounce) {
      listRead.cancel(true);
      searchTimer.current = setTimeout(() => { void loadDirectory(); }, 180);
    }
    else void loadDirectory();
  }

  function updateRecord(next: RecordLocation) {
    currentRecord.current = next;
    setRecord(next);
    const target = next.accountId ?? displayedDetail.current?.id ?? listed[0]?.id ?? null;
    if (target === detailTarget.current && !(target && detailRead.error && target !== displayedDetail.current?.id)) return;
    if (target && target !== displayedDetail.current?.id) { void loadDetail(target); return; }
    detailRead.cancel();
    detailTarget.current = target;
  }

  // Native history handles record deep links and browser Back without reloading the other pane.
  const syncHistory = useEffectEvent((encoded: string) => {
    const params = new URLSearchParams(encoded);
    const query = parseSubscriberDirectoryQuery({
      ...emptySubscriberDirectoryQuery,
      ...Object.fromEntries(Object.keys(emptySubscriberDirectoryQuery).flatMap(key => params.has(key) ? [[key, params.get(key)]] : [])),
    }) ?? emptySubscriberDirectoryQuery;
    const nextLocation = { query, page: parseSubscriberDirectoryPage(params.get("page") ?? undefined) ?? 1 };
    if (locationKey(nextLocation) !== locationKey(currentLocation.current)) updateLocation(nextLocation, { write: false });
    const requested = params.get("accountId");
    const accountId = requested && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(requested) ? requested.toLowerCase() : null;
    const nextAction = accountId ? parseSubscriberIndividualAction(params.get("action")) : null;
    if (accountId !== currentRecord.current.accountId || nextAction !== currentRecord.current.action) {
      updateRecord({ accountId, action: nextAction });
    }
  });
  const lastParameters = useRef(parameters);
  useEffect(() => {
    if (lastParameters.current === parameters) return;
    lastParameters.current = parameters;
    // A newer search or click can already have updated the browser before this commit.
    if (parameters === new URLSearchParams(window.location.search).toString()) syncHistory(parameters);
  }, [parameters]);
  useEffect(() => {
    const restoreRecord = () => {
      if (window.location.pathname === directoryPath) syncHistory(window.location.search);
    };
    window.addEventListener("popstate", restoreRecord);
    return () => window.removeEventListener("popstate", restoreRecord);
  }, []);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const lastOpened = useRef(record.accountId);
  useEffect(() => {
    const previous = lastOpened.current;
    lastOpened.current = record.accountId;
    if (previous === record.accountId || window.matchMedia(media.desktop.replace(/^@media\s+/u, "")).matches) return;
    if (record.accountId) {
      detailsPane.current?.querySelector<HTMLElement>("[data-record-back]")?.focus({ preventScroll: true });
    } else {
      const origin = openedFrom.current, list = listScroll.current;
      if (!list?.getClientRects().length) return;
      if (origin) list.scrollTop = origin.scrollTop;
      const row = list.querySelector<HTMLElement>(`[data-subscriber-row="${CSS.escape(origin?.id ?? previous ?? "")}"] [data-subscriber-open]`);
      (row ?? list).focus({ preventScroll: true });
    }
  }, [record.accountId]);

  function accountHref(accountId: string, requestedAction?: SubscriberIndividualAction) {
    return subscriberHref(location, { accountId, action: requestedAction ?? null });
  }

  function selectAccount(event: MouseEvent<HTMLAnchorElement>, accountId: string, requestedAction?: SubscriberIndividualAction) {
    if (action.busy) { event.preventDefault(); return; }
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (requestedAction) action.clearFeedback();
    const changed = currentRecord.current.accountId !== accountId;
    if (changed) openedFrom.current = { id: accountId, url: window.location.pathname + window.location.search, scrollTop: listScroll.current?.scrollTop ?? 0 };
    const next = { accountId, action: requestedAction ?? null };
    writeLocation(currentLocation.current, next, changed ? "push" : "replace");
    updateRecord(next);
  }

  function backToDirectory() {
    const origin = openedFrom.current, next = { accountId: null, action: null };
    if (origin?.id === record.accountId && origin.url === subscriberHref(currentLocation.current, next)) { goHistoryBack(); return; }
    writeLocation(currentLocation.current, next);
    updateRecord(next);
  }

  function dismissAction() {
    const next = { ...currentRecord.current, action: null };
    writeLocation(currentLocation.current, next);
    updateRecord(next);
  }

  function removeAccount(accountId: string) {
    detailRead.cancel();
    replaceDetail(null);
    detailTarget.current = null;
    setDirectory(previous => ({ ...previous, accounts: previous.accounts.filter(account => account.id !== accountId) }));
    const next = { accountId: null, action: null };
    currentRecord.current = next;
    setRecord(next);
    writeLocation(currentLocation.current, next);
  }

  const requestedDetail = !record.accountId || detail?.id === record.accountId;
  const detailsError = sessionEnded ? authCopy.administratorSessionEnded : detailRead.error;
  return <LiveWorkspace aria-busy={action.busy || undefined} $compact $detailOpen={!!record.accountId} data-subscriber-workspace data-analytics-ignore>
    <WorkspaceTitle><h1>Subscribers</h1><SubscriberDirectoryFilters query={query} plans={plans} onQueryChange={next => {
      const current = currentLocation.current;
      updateLocation({ query: next, page: queryKey(next) === queryKey(current.query) ? current.page : 1 }, { debounce: next.search !== current.query.search });
    }} trailingAction={<RecordPrimaryAction label="Grant access / add subscriber" icon={<UserPlusIcon />} disabled={action.busy || sessionEnded} aria-haspopup="dialog"
      onClick={() => { action.clearFeedback(); setAdding(true); }} />} /></WorkspaceTitle>
    {(action.notice || action.message || plansRead.error) && <RecordFeedback>
      <ActionNotices action={action} />
      {plansRead.error && <ReadError message={plansRead.error} label="Retry subscription plans" onRetry={() => { void loadPlans(); }} />}
    </RecordFeedback>}
    <SubscriberDirectory accounts={listed} asOf={directory.asOf} selectedId={record.accountId ?? detail?.id ?? null} query={query}
      loading={listRead.busy} error={sessionEnded ? authCopy.administratorSessionEnded : listRead.error}
      action={action} plans={plans} selectionScope={locationKey(location)} listRef={listScroll}
      paging={{ page, pages, total, onPage: next => updateLocation({ ...currentLocation.current, page: next }) }}
      adminPhone={adminPhone} accountHref={accountHref} onAccountClick={selectAccount} onRefresh={sessionEnded ? undefined : () => { void loadDirectory(); }} />
    <DetailColumn ref={detailsPane} aria-label="Account details" aria-busy={detailRead.busy || plansRead.busy || undefined}>
      <RecordBack disabled={action.busy} onClick={backToDirectory}>Back to subscribers</RecordBack>
      <DetailContent>
        {detailsError && <ReadError message={detailsError} label="Retry account details" onRetry={sessionEnded ? undefined : () => {
          if (detailTarget.current) void loadDetail(detailTarget.current);
        }} />}
        {detail ? <DetailRecord inert={!requestedDetail || undefined}>
          <SubscriberDetail key={detail.id} account={detail} plans={plans} action={action} presentation="workspace"
            canManagePasswords={canManagePasswords} showNoteAction={!listed.some(account => account.id === detail.id)}
            {...(requestedDetail && record.action ? { initialAction: record.action, onInitialActionDismissed: dismissAction } : {})}
            onDeleted={() => removeAccount(detail.id)} />
        </DetailRecord> : <RecordCard><RecordScroll><RecordEmpty><UserIcon />
          {!detailsError && <><h2>{detailRead.busy ? "Loading account details" : "Select an account"}</h2>
            {!detailRead.busy && <p>Choose a matching subscriber to manage their access and details.</p>}</>}
        </RecordEmpty></RecordScroll></RecordCard>}
      </DetailContent>
    </DetailColumn>
    {adding && <RecordFormDialog id={`${id}-grant-dialog`} title="Grant access / add subscriber" submitLabel="Grant access" formId={formId}
      busy={action.busy} onClose={() => { if (!action.busy) setAdding(false); }}>
      <Hint as="p">A new number creates an account with access.</Hint>
      {action.message && <ActionNotices action={action} />}<ManualCodeForm formId={formId} plans={plans} action={action} externalActions compact onSaved={() => setAdding(false)} />
    </RecordFormDialog>}
  </LiveWorkspace>;
}

function ReadError({ message, label, onRetry }: { message: string; label: string; onRetry?: (() => void) | undefined }) {
  return <PaneError role="alert"><FieldError>{message}</FieldError>
    {onRetry && <ActionButton type="button" aria-label={label} onClick={onRetry}>Retry</ActionButton>}
  </PaneError>;
}

const DetailColumn = styled(AccountColumn)`
  [data-record-workspace][data-record-detail-open] > & { grid-template-rows: auto minmax(0, 1fr); }
  ${media.desktop} { [data-record-workspace] > && { grid-template-rows: minmax(0, 1fr); } }
`;
const LiveWorkspace = styled(Workspace)`
  &[data-record-compact] { --record-list-default: 37%; }
`;
const DetailContent = styled.div`
  display: grid; grid-template-rows: minmax(0, 1fr); min-block-size: 0; min-inline-size: 0;
  &:has(> [role="alert"]) { grid-template-rows: auto minmax(0, 1fr); }
`;
const DetailRecord = styled.div`display: grid; min-block-size: 0; min-inline-size: 0;`;
const PaneError = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2);
  padding: var(--gh-spacing-1_5) ${({ theme }) => theme.layout.sectionPadding};
`;
