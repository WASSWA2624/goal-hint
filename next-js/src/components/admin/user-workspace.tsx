"use client";

import { useCallback, useEffect, useEffectEvent, useId, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import { goHistoryBack, writeContextHistory } from "@/components/navigation/context-history";
import { UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { appendUniqueRecords, useAppendRequest } from "@/components/ui/use-append-request";
import { startRequestDeadline } from "@/domain/request-deadline";
import { emptyUserDirectoryQuery, parseUserDirectoryPage, parseUserDirectoryQuery, type UserDirectoryAccount,
  type UserDirectoryPage, type UserDirectoryPaging, type UserDirectoryQuery } from "@/domain/user-directory";
import { parseUserIndividualAction, type UserIndividualAction } from "@/domain/user-actions";
import type { OwnerUser } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { authCopy } from "@/i18n/messages/auth";
import { media } from "@/styles/theme";
import { ActionButton, FieldError, Hint } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { RecordBack, RecordCard, RecordEmpty, RecordFeedback, RecordScroll } from "./record-workspace";
import { UserDirectory } from "./user-directory";
import { postUserAction } from "./user-bulk-actions";
import { UserDirectoryFilters } from "./user-directory-parts";
import { UserDetail } from "./user-detail";
import { RecordFormDialog, RecordPrimaryAction } from "./record-toolbar";
import { AccountColumn, Workspace, WorkspaceTitle } from "./user-styles";

type Props = {
  accounts: readonly UserDirectoryAccount[];
  detail: OwnerUser | null;
  plans: readonly SubscriptionPlanView[];
  initialQuery?: UserDirectoryQuery;
  initialPaging?: UserDirectoryPaging;
  initialDirectoryAsOf?: string;
  initialRequestedPage?: number;
  initialAccountId?: string;
  initialAction?: UserIndividualAction;
  initialDirectoryError?: string;
  initialDetailError?: string;
  initialPlansError?: string;
  initialAdminPhone?: string;
  selectedExplicitly?: boolean;
  canManagePasswords?: boolean;
};
type DirectoryLocation = Readonly<{ query: UserDirectoryQuery; page: number }>;
type RecordLocation = Readonly<{ accountId: string | null; action: UserIndividualAction | null }>;
type DirectoryAppend = Readonly<{ scope: string; accounts: readonly UserDirectoryAccount[];
  cursor: UserDirectoryAccount | null; hasMore: boolean; total: number }>;
const directoryPath = "/admin/users";
const directoryApi = "/api/admin/users";
const queryKey = (query: UserDirectoryQuery) => JSON.stringify(parseUserDirectoryQuery(query) ?? emptyUserDirectoryQuery);
const locationKey = ({ query, page }: DirectoryLocation) => `${queryKey(query)}:${page}`;
const requestHeaders = { Accept: "application/json" };
const directoryReadDeadlineMs = 15_000;

function userDirectoryHref({ query, page }: DirectoryLocation, { accountId, action }: RecordLocation) {
  const params = new URLSearchParams();
  const normalized = parseUserDirectoryQuery(query) ?? emptyUserDirectoryQuery;
  for (const name of Object.keys(normalized) as (keyof UserDirectoryQuery)[]) {
    if (normalized[name] !== emptyUserDirectoryQuery[name]) params.set(name, normalized[name]);
  }
  if (page > 1) params.set("page", String(page));
  if (accountId) params.set("accountId", accountId);
  if (accountId && action) params.set("action", action);
  return params.size ? `${directoryPath}?${params}` : directoryPath;
}

function writeLocation(location: DirectoryLocation, record: RecordLocation, mode: "replace" | "push" = "replace") {
  const href = userDirectoryHref(location, record);
  if (window.location.pathname === directoryPath && window.location.pathname + window.location.search !== href) {
    writeContextHistory({}, href, mode);
  }
}

function isDirectoryPage(value: unknown): value is UserDirectoryPage {
  if (!value || typeof value !== "object") return false;
  const { accounts, page, pages, total, asOf, hasMore } = value as Partial<UserDirectoryPage>;
  return Array.isArray(accounts) && accounts.every(account => account && typeof account.id === "string"
      && (typeof account.phone === "string" || account.phone === null) && typeof account.status === "string"
      && typeof account.lastSignInAt === "string" && Number.isFinite(Date.parse(account.lastSignInAt))
      && ["active", "queued", "none"].includes(account.access))
    && typeof asOf === "string" && Number.isFinite(Date.parse(asOf))
    && typeof page === "number" && Number.isSafeInteger(page) && page >= 1
    && typeof pages === "number" && Number.isSafeInteger(pages) && pages >= page
    && typeof total === "number" && Number.isSafeInteger(total) && total >= accounts.length
    && (hasMore === undefined || typeof hasMore === "boolean");
}

function useUserRead(error = "") {
  const [status, setStatus] = useState({ busy: false, error });
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback((busy = false) => {
    active.current?.abort();
    active.current = null;
    setStatus({ busy, error: "" });
  }, []);
  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  async function read(load: (signal: AbortSignal) => Promise<void>, failed: string) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const clearDeadline = startRequestDeadline(controller, directoryReadDeadlineMs);
    setStatus({ busy: true, error: "" });
    try {
      await load(controller.signal);
      if (active.current !== controller) return true;
      controller.signal.throwIfAborted();
      setStatus({ busy: false, error: "" });
      return true;
    } catch (error) {
      if (active.current !== controller) return true;
      setStatus({ busy: false, error: controller.signal.aborted ? "The request took too long. Try again."
        : error instanceof UserReadError ? error.message : failed });
      return false;
    } finally {
      clearDeadline();
      if (active.current === controller) active.current = null;
    }
  }
  return { ...status, read, cancel };
}

class UserReadError extends Error {}

/** Directory and record reads update their own pane. Account links remain navigable URLs. */
export function UsersWorkspace({ accounts, detail: initialDetail, plans: seedPlans, initialQuery = emptyUserDirectoryQuery,
  initialPaging, initialDirectoryAsOf = "", initialRequestedPage, initialAccountId, initialAction, initialDirectoryError, initialDetailError, initialPlansError,
  initialAdminPhone, selectedExplicitly = false, canManagePasswords = false }: Props) {
  const router = useRouter(), parameters = useSearchParams().toString(), id = useId();
  const [location, setLocation] = useState<DirectoryLocation>({ query: initialQuery, page: initialRequestedPage ?? initialPaging?.page ?? 1 });
  const [directory, setDirectory] = useState<UserDirectoryPage>({ accounts, asOf: initialDirectoryAsOf, page: 1, pages: 1, total: accounts.length, ...initialPaging });
  const [added, setAdded] = useState<DirectoryAppend | null>(null);
  const [record, setRecord] = useState<RecordLocation>({ accountId: selectedExplicitly ? initialAccountId ?? initialDetail?.id ?? null : null, action: initialAction ?? null });
  const [detail, setDetail] = useState(initialDetail);
  const [plans, setPlans] = useState(seedPlans);
  const [adminPhone, setAdminPhone] = useState(initialAdminPhone ?? null);
  const [adding, setAdding] = useState(false), [sessionEnded, setSessionEnded] = useState(false);
  const listRead = useUserRead(initialDirectoryError), detailRead = useUserRead(initialDetailError), plansRead = useUserRead(initialPlansError);
  const currentLocation = useRef(location), currentRecord = useRef(record), displayedDetail = useRef(detail);
  const detailTarget = useRef(initialAccountId ?? initialDetail?.id ?? null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const detailsPane = useRef<HTMLElement>(null), listScroll = useRef<HTMLOListElement>(null);
  const openedFrom = useRef<{ id: string; url: string; scrollTop: number } | null>(null);
  const { query } = location, scope = locationKey(location);
  const append = useAppendRequest(scope, directoryReadDeadlineMs);
  const tail = added?.scope === scope ? added : null;
  const listed = tail ? appendUniqueRecords(directory.accounts, tail.accounts, account => account.id) : directory.accounts;
  const hasMore = tail?.hasMore ?? directory.page < directory.pages;
  const formId = `${id}-add-user`;

  function replaceDetail(next: OwnerUser | null) {
    displayedDetail.current = next;
    setDetail(next);
  }

  function checkSession(response: Response, signal: AbortSignal) {
    if (signal.aborted || response.status !== 401) return;
    clearTimeout(searchTimer.current);
    listRead.cancel(); detailRead.cancel(); plansRead.cancel(); append.cancel();
    replaceDetail(null);
    setDirectory({ accounts: [], asOf: "", page: 1, pages: 1, total: 0 });
    setAdded(null);
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
        throw new UserReadError("This user account is no longer available.");
      }
      if (!response.ok) throw new Error();
      const body: { detail?: OwnerUser } = await response.json();
      if (signal.aborted) return;
      if (body?.detail?.id !== accountId || !Array.isArray(body.detail.codes) || !Array.isArray(body.detail.submissions)
        || !Array.isArray(body.detail.devices) || !Array.isArray(body.detail.wallet)) throw new Error();
      replaceDetail(body.detail);
    }, "Account details could not be loaded. Try again.");
  }

  function loadDirectory() {
    clearTimeout(searchTimer.current);
    append.cancel();
    const requested = currentLocation.current;
    return listRead.read(async signal => {
      const response = await fetch(directoryApi, { method: "POST", cache: "no-store", signal,
        headers: { ...requestHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ ...requested.query, page: requested.page }) });
      checkSession(response, signal);
      if (signal.aborted) return;
      if ([502, 503, 504].includes(response.status)) throw new UserReadError("Users are temporarily unavailable. Try again.");
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (signal.aborted) return;
      if (!isDirectoryPage(body)) throw new Error();
      setDirectory(body);
      setAdded(null);
      setAdminPhone("adminPhone" in body && typeof body.adminPhone === "string" ? body.adminPhone : null);
      if (body.page !== requested.page) {
        const accepted = { ...requested, page: body.page };
        currentLocation.current = accepted;
        setLocation(accepted);
        writeLocation(accepted, currentRecord.current);
      }
    }, "Users could not be loaded. Try again.");
  }

  function appendDirectory() {
    const frontier = tail ? tail.cursor : directory.accounts.at(-1);
    if (!hasMore || !frontier || listRead.busy || listRead.error || sessionEnded) return;
    const requested = currentLocation.current;
    const { id, lastSignInAt } = frontier;
    void append.append(async signal => {
      const response = await fetch(directoryApi, { method: "POST", cache: "no-store", signal,
        headers: { ...requestHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ...requested.query, page: requested.page, after: { id, lastSignInAt } }) });
      checkSession(response, signal);
      if (signal.aborted) return;
      if (!response.ok) throw new Error();
      const batch: unknown = await response.json();
      if (signal.aborted || scope !== locationKey(currentLocation.current)) return;
      if (!isDirectoryPage(batch) || typeof batch.hasMore !== "boolean" || (batch.hasMore && !batch.accounts.length)) throw new Error();
      const { hasMore } = batch;
      setAdded(current => ({
        scope, hasMore, total: batch.total, cursor: batch.accounts.at(-1) ?? null,
        accounts: appendUniqueRecords(current?.scope === scope ? current.accounts : [], batch.accounts, account => account.id),
      }));
    });
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
    if (results.includes(false)) throw new Error("User data could not be refreshed.");
  }, { request: postUserAction });

  function updateLocation(next: DirectoryLocation, { write = true, debounce = false } = {}) {
    const changed = locationKey(next) !== locationKey(currentLocation.current);
    currentLocation.current = next;
    setLocation(next);
    if (write && changed) writeLocation(next, currentRecord.current);
    if (!changed) return;
    append.cancel();
    setAdded(null);
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
    const query = parseUserDirectoryQuery({
      ...emptyUserDirectoryQuery,
      ...Object.fromEntries(Object.keys(emptyUserDirectoryQuery).flatMap(key => params.has(key) ? [[key, params.get(key)]] : [])),
    }) ?? emptyUserDirectoryQuery;
    const nextLocation = { query, page: parseUserDirectoryPage(params.get("page") ?? undefined) ?? 1 };
    if (locationKey(nextLocation) !== locationKey(currentLocation.current)) updateLocation(nextLocation, { write: false });
    const requested = params.get("accountId");
    const accountId = requested && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(requested) ? requested.toLowerCase() : null;
    const nextAction = accountId ? parseUserIndividualAction(params.get("action")) : null;
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
      const row = list.querySelector<HTMLElement>(`[data-user-row="${CSS.escape(origin?.id ?? previous ?? "")}"] [data-user-open]`);
      (row ?? list).focus({ preventScroll: true });
    }
  }, [record.accountId]);

  function accountHref(accountId: string, requestedAction?: UserIndividualAction) {
    return userDirectoryHref(location, { accountId, action: requestedAction ?? null });
  }

  function selectAccount(event: MouseEvent<HTMLAnchorElement>, accountId: string, requestedAction?: UserIndividualAction) {
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
    if (origin?.id === record.accountId && origin.url === userDirectoryHref(currentLocation.current, next)) { goHistoryBack(); return; }
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
    setAdded(previous => previous && ({ ...previous, accounts: previous.accounts.filter(account => account.id !== accountId) }));
    const next = { accountId: null, action: null };
    currentRecord.current = next;
    setRecord(next);
    writeLocation(currentLocation.current, next);
  }

  const requestedDetail = !record.accountId || detail?.id === record.accountId;
  const detailsError = sessionEnded ? authCopy.administratorSessionEnded : detailRead.error;
  return <LiveWorkspace aria-busy={action.busy || undefined} $compact $detailOpen={!!record.accountId} data-user-workspace data-analytics-ignore>
    <WorkspaceTitle><h1>Users</h1><UserDirectoryFilters query={query} plans={plans} onQueryChange={next => {
      const current = currentLocation.current;
      updateLocation({ query: next, page: queryKey(next) === queryKey(current.query) ? current.page : 1 }, { debounce: next.search !== current.query.search });
    }} trailingAction={<RecordPrimaryAction label="Grant access / add user" icon={<UserPlusIcon />} disabled={action.busy || sessionEnded} aria-haspopup="dialog"
      onClick={() => { action.clearFeedback(); setAdding(true); }} />} /></WorkspaceTitle>
    {(action.notice || action.message || plansRead.error) && <RecordFeedback>
      <ActionNotices action={action} />
      {plansRead.error && <ReadError message={plansRead.error} label="Retry subscription plans" onRetry={() => { void loadPlans(); }} />}
    </RecordFeedback>}
    <UserDirectory accounts={listed} asOf={directory.asOf} selectedId={record.accountId ?? detail?.id ?? null} query={query}
      loading={listRead.busy} error={sessionEnded ? authCopy.administratorSessionEnded : listRead.error}
      action={action} plans={plans} selectionScope={scope} listRef={listScroll}
      paging={{ hasMore, total: tail?.total ?? directory.total, loading: append.loading, failed: append.failed, onShowMore: appendDirectory }}
      adminPhone={adminPhone} accountHref={accountHref} onAccountClick={selectAccount} onRefresh={sessionEnded ? undefined : () => { void loadDirectory(); }} />
    <DetailColumn ref={detailsPane} aria-label="Account details" aria-busy={detailRead.busy || plansRead.busy || undefined}>
      <RecordBack disabled={action.busy} onClick={backToDirectory}>Back to users</RecordBack>
      <DetailContent>
        {detailsError && <ReadError message={detailsError} label="Retry account details" onRetry={sessionEnded ? undefined : () => {
          if (detailTarget.current) void loadDetail(detailTarget.current);
        }} />}
        {detail ? <DetailRecord inert={!requestedDetail || undefined}>
          <UserDetail key={detail.id} account={detail} plans={plans} action={action} presentation="workspace"
            canManagePasswords={canManagePasswords} showNoteAction={!listed.some(account => account.id === detail.id)}
            {...(requestedDetail && record.action ? { initialAction: record.action, onInitialActionDismissed: dismissAction } : {})}
            onDeleted={() => removeAccount(detail.id)} />
        </DetailRecord> : <RecordCard><RecordScroll><RecordEmpty><UserIcon />
          {!detailsError && <><h2>{detailRead.busy ? "Loading account details" : "Select an account"}</h2>
            {!detailRead.busy && <p>Choose a matching user to manage their access and details.</p>}</>}
        </RecordEmpty></RecordScroll></RecordCard>}
      </DetailContent>
    </DetailColumn>
    {adding && <RecordFormDialog id={`${id}-grant-dialog`} title="Grant access / add user" submitLabel="Grant access" formId={formId}
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
