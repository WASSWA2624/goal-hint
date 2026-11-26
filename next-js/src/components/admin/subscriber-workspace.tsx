"use client";

import { authCopy } from "@/i18n/messages/auth";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import type { OwnerSubscriber } from "@/domain/owner-members";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryQuery, type SubscriberDirectoryAccount, type SubscriberDirectoryPage,
  type SubscriberDirectoryPaging, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import type { SubscriberIndividualAction } from "@/domain/subscriber-actions";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { Hint } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { RecordBack, RecordCard, RecordEmpty, RecordFeedback, RecordScroll } from "./record-workspace";
import { goHistoryBack } from "@/components/navigation/context-history";
import { SubscriberDirectory } from "./subscriber-directory";
import { SubscriberDirectoryFilters } from "./subscriber-directory-parts";
import { SubscriberDetail } from "./subscriber-detail";
import { subscriberPresentation } from "./subscriber-presentation-styles";
import { RecordFormDialog, RecordPrimaryAction } from "./record-toolbar";
import { AccountColumn, Workspace, WorkspaceTitle } from "./subscriber-styles";

type Props = {
  accounts: readonly SubscriberDirectoryAccount[];
  detail: OwnerSubscriber | null;
  plans: readonly SubscriptionPlanView[];
  initialQuery?: SubscriberDirectoryQuery;
  initialPaging?: SubscriberDirectoryPaging;
  initialAction?: SubscriberIndividualAction;
  selectedExplicitly?: boolean;
  canManagePasswords?: boolean;
};
const queryKey = (query: SubscriberDirectoryQuery) => JSON.stringify(parseSubscriberDirectoryQuery(query) ?? emptySubscriberDirectoryQuery);
type DirectoryLocation = Readonly<{ query: SubscriberDirectoryQuery; page: number }>;
const locationKey = ({ query, page }: DirectoryLocation) => `${queryKey(query)}:${page}`;

/** Server-owned record navigation with cancellable directory queries and shared action forms. */
export function SubscribersWorkspace({ accounts, detail: selected, plans, initialQuery = emptySubscriberDirectoryQuery,
  initialPaging, initialAction, selectedExplicitly = false, canManagePasswords = false }: Props) {
  const router = useRouter(), id = useId();
  const seedPage = initialPaging?.page ?? 1, seedPages = initialPaging?.pages ?? 1, seedTotal = initialPaging?.total ?? accounts.length;
  const [location, setLocation] = useState<DirectoryLocation>({ query: initialQuery, page: seedPage });
  const [directory, setDirectory] = useState<SubscriberDirectoryPage>({ accounts, page: seedPage, pages: seedPages, total: seedTotal });
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [navigating, startNavigation] = useTransition();
  const [adminPhone, setAdminPhone] = useState<string | null>(null), [adding, setAdding] = useState(false), [deletedId, setDeletedId] = useState<string | null>(null);
  const currentLocation = useRef(location), request = useRef<AbortController | null>(null), generation = useRef(0);
  const key = locationKey(location), seedKey = locationKey({ query: initialQuery, page: seedPage });
  const previousSeed = useRef(seedKey), lastQuery = useRef(seedKey);
  const restoringHistory = useRef(false);
  const detailsPane = useRef<HTMLElement>(null);
  const openedFrom = useRef<{ id: string; url: string; scrollTop: number } | null>(null);
  const { query } = location, { accounts: listed, page, pages, total } = directory, formId = `${id}-add-subscriber`;

  const loadDirectory = useCallback(async () => {
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const requested = currentLocation.current;
    let failureMessage = "Subscribers could not be loaded. Try again.";
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/subscribers", { method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...requested.query, page: requested.page }) });
      if (response.status === 401 || response.status === 403) {
        if (version === generation.current) { setDirectory({ accounts: [], page: 1, pages: 1, total: 0 }); router.refresh(); }
        failureMessage = authCopy.administratorSessionEnded;
        throw new Error(failureMessage);
      }
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("accounts" in body) || !Array.isArray(body.accounts)
        || !body.accounts.every(account => account && typeof account === "object" && typeof account.id === "string" && Array.isArray(account.planNames)
          && ["active", "queued", "none"].includes(account.access))
        || !("page" in body) || typeof body.page !== "number" || !Number.isSafeInteger(body.page) || body.page < 1
        || !("pages" in body) || typeof body.pages !== "number" || !Number.isSafeInteger(body.pages) || body.pages < body.page
        || !("total" in body) || typeof body.total !== "number" || !Number.isSafeInteger(body.total) || body.total < body.accounts.length) {
        throw new Error(failureMessage);
      }
      if (version !== generation.current || controller.signal.aborted) return true;
      setDirectory({ accounts: body.accounts as SubscriberDirectoryAccount[], page: body.page, pages: body.pages, total: body.total });
      if (body.page !== requested.page) {
        const accepted = { ...requested, page: body.page };
        currentLocation.current = accepted; lastQuery.current = locationKey(accepted); setLocation(accepted);
      }
      setAdminPhone("adminPhone" in body && typeof body.adminPhone === "string" ? body.adminPhone : null);
      return true;
    } catch {
      // A newer request owns the result; superseding a refresh is not an action failure.
      if (version !== generation.current || controller.signal.aborted) return true;
      setError(failureMessage);
      return false;
    } finally { if (version === generation.current) setLoading(false); }
  }, [router]);
  const action = useCodeAction(async () => { if (!await loadDirectory()) throw new Error("Directory refresh failed"); });

  useEffect(() => {
    const restore = () => { restoringHistory.current = true; };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  // A completed record navigation must not replace a newer search being typed.
  useEffect(() => {
    const current = locationKey(currentLocation.current);
    if (restoringHistory.current || current === previousSeed.current || current === seedKey) {
      generation.current += 1; request.current?.abort();
      const seed = { query: initialQuery, page: seedPage };
      currentLocation.current = seed; lastQuery.current = seedKey;
      setLocation(seed); setDirectory({ accounts, page: seedPage, pages: seedPages, total: seedTotal });
      setAdminPhone(null); setLoading(false); setError("");
    }
    restoringHistory.current = false;
    previousSeed.current = seedKey;
  }, [accounts, initialQuery, seedKey, seedPage, seedPages, seedTotal]);
  useEffect(() => {
    if (lastQuery.current === key) return;
    lastQuery.current = key;
    const timer = setTimeout(() => { void loadDirectory(); }, 180);
    return () => clearTimeout(timer);
  }, [key, loadDirectory]);
  useEffect(() => () => { generation.current += 1; request.current?.abort(); }, []);

  function changeQuery(next: SubscriberDirectoryQuery) {
    const current = currentLocation.current;
    updateLocation({ query: next, page: queryKey(next) === queryKey(current.query) ? current.page : 1 });
  }
  function updateLocation(next: DirectoryLocation) {
    if (locationKey(next) !== locationKey(currentLocation.current)) {
      generation.current += 1; request.current?.abort(); setLoading(true); setError("");
    }
    currentLocation.current = next; setLocation(next);
  }
  function accountHref(accountId?: string, requestedAction?: SubscriberIndividualAction) {
    const parameters = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value && value !== "all") parameters.set(name, value);
    if (location.page > 1) parameters.set("page", String(location.page));
    if (accountId) parameters.set("accountId", accountId);
    if (accountId && requestedAction) parameters.set("action", requestedAction);
    return `/admin/subscribers${parameters.size ? `?${parameters}` : ""}`;
  }
  const detail = selected?.id === deletedId || key !== seedKey && !listed.some(account => account.id === selected?.id) ? null : selected;
  const selectedNetwork = listed.find(account => account.id === detail?.id)?.network ?? null;
  const openedId = selectedExplicitly ? detail?.id : undefined;
  const lastOpened = useRef(openedId);

  useEffect(() => {
    const previous = lastOpened.current;
    lastOpened.current = openedId;
    if (previous === openedId || window.matchMedia(media.desktop.replace(/^@media\s+/u, "")).matches) return;
    if (openedId) {
      detailsPane.current?.querySelector<HTMLElement>("[data-record-back]")?.focus({ preventScroll: true });
    } else {
      const origin = openedFrom.current;
      const list = detailsPane.current?.closest("[data-record-workspace]")?.querySelector<HTMLElement>("[data-record-list-scroll]");
      if (!list?.getClientRects().length) return;
      if (origin) list.scrollTop = origin.scrollTop;
      const row = list.querySelector<HTMLElement>(`[data-subscriber-row="${CSS.escape(origin?.id ?? previous ?? "")}"] [data-subscriber-open]`);
      (row ?? list).focus({ preventScroll: true });
    }
  }, [openedId]);

  function selectAccount(event: MouseEvent<HTMLAnchorElement>, accountId: string) {
    if (action.busy) { event.preventDefault(); return; }
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    openedFrom.current = {
      id: accountId, url: window.location.pathname + window.location.search,
      scrollTop: event.currentTarget.closest<HTMLElement>("[data-record-list-scroll]")?.scrollTop ?? 0,
    };
  }

  function backToDirectory() {
    const origin = openedFrom.current, href = accountHref();
    if (origin?.id === openedId && origin?.url === href) goHistoryBack();
    else startNavigation(() => router.replace(href, { scroll: false }));
  }

  return <LiveWorkspace aria-busy={action.busy || loading || navigating || undefined} $compact $detailOpen={!!openedId} data-subscriber-workspace data-analytics-ignore>
    <WorkspaceTitle><h1>Subscribers</h1><SubscriberDirectoryFilters query={query} plans={plans} onQueryChange={changeQuery}
      trailingAction={<RecordPrimaryAction label="Grant access / add subscriber" icon={<UserPlusIcon />} disabled={action.busy} aria-haspopup="dialog"
        onClick={() => { action.clearFeedback(); setAdding(true); }} />} /></WorkspaceTitle>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <SubscriberDirectory accounts={listed.filter(account => account.id !== deletedId)} selectedId={detail?.id ?? null} query={query} loading={loading} error={error}
      action={action} plans={plans} selectionScope={key} canManagePasswords={canManagePasswords}
      paging={{ page, pages, total, onPage: next => updateLocation({ query: currentLocation.current.query, page: next }) }}
      adminPhone={adminPhone} accountHref={accountHref} onAccountClick={selectAccount} onRetry={() => { void loadDirectory(); }} />
    <AccountColumn ref={detailsPane}>
      <RecordBack disabled={action.busy || navigating} onClick={backToDirectory}>Back to subscribers</RecordBack>
      {detail ? <SubscriberDetail key={`${detail.id}:${initialAction ?? ""}`} account={detail} plans={plans} action={action} presentation="compact-dialog" network={selectedNetwork}
        canManagePasswords={canManagePasswords} {...(initialAction ? { initialAction,
          onInitialActionDismissed: () => router.replace(accountHref(detail.id), { scroll: false }) } : {})}
        onDeleted={() => { setDeletedId(detail.id); router.replace(accountHref(), { scroll: false }); }} />
        : <RecordCard><RecordScroll><RecordEmpty><UserIcon /><h2>Select an account</h2><p>Choose a matching subscriber to manage their access and details.</p></RecordEmpty></RecordScroll></RecordCard>}
    </AccountColumn>
    {adding && <RecordFormDialog id={`${id}-grant-dialog`} title="Grant access / add subscriber" submitLabel="Grant access" formId={formId}
      busy={action.busy} onClose={() => { if (!action.busy) setAdding(false); }}>
      <Hint as="p">A new number creates an account with access.</Hint>
      {action.message && <ActionNotices action={action} />}<ManualCodeForm formId={formId} plans={plans} action={action} externalActions compact onSaved={() => setAdding(false)} />
    </RecordFormDialog>}
  </LiveWorkspace>;
}

const LiveWorkspace = styled(Workspace)`
  ${subscriberPresentation}
`;
