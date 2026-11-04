"use client";

import { authCopy } from "@/i18n/messages/auth";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import type { OwnerSubscriber } from "@/domain/owner-members";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryQuery, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
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
  selectedExplicitly?: boolean;
};
const queryKey = (query: SubscriberDirectoryQuery) => JSON.stringify(parseSubscriberDirectoryQuery(query) ?? emptySubscriberDirectoryQuery);

/** Server-owned record navigation with cancellable directory queries and shared action forms. */
export function SubscribersWorkspace({ accounts, detail: selected, plans, initialQuery = emptySubscriberDirectoryQuery, selectedExplicitly = false }: Props) {
  const router = useRouter(), id = useId();
  const [query, setQuery] = useState(initialQuery), [listed, setListed] = useState(accounts);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [navigating, startNavigation] = useTransition();
  const [adminPhone, setAdminPhone] = useState<string | null>(null), [adding, setAdding] = useState(false), [deletedId, setDeletedId] = useState<string | null>(null);
  const currentQuery = useRef(initialQuery), request = useRef<AbortController | null>(null), generation = useRef(0);
  const previousSeed = useRef(queryKey(initialQuery)), lastQuery = useRef(queryKey(initialQuery));
  const restoringHistory = useRef(false);
  const detailsPane = useRef<HTMLElement>(null);
  const openedFrom = useRef<{ id: string; url: string; scrollTop: number } | null>(null);
  const key = queryKey(query), seedKey = queryKey(initialQuery), formId = `${id}-add-subscriber`;

  const loadDirectory = useCallback(async () => {
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    let failureMessage = "Subscribers could not be loaded. Try again.";
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/subscribers", { method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(currentQuery.current) });
      if (response.status === 401 || response.status === 403) {
        if (version === generation.current) { setListed([]); router.refresh(); }
        failureMessage = authCopy.administratorSessionEnded;
        throw new Error(failureMessage);
      }
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("accounts" in body) || !Array.isArray(body.accounts)
        || !body.accounts.every(account => account && typeof account === "object" && typeof account.id === "string" && Array.isArray(account.planNames)
          && ["active", "queued", "none"].includes(account.access))) throw new Error("Subscribers could not be loaded. Try again.");
      if (version !== generation.current || controller.signal.aborted) return true;
      setListed(body.accounts as SubscriberDirectoryAccount[]);
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
    const current = queryKey(currentQuery.current);
    if (restoringHistory.current || current === previousSeed.current || current === seedKey) {
      generation.current += 1; request.current?.abort();
      currentQuery.current = initialQuery; lastQuery.current = seedKey;
      setQuery(initialQuery); setListed(accounts); setAdminPhone(null); setLoading(false); setError("");
    }
    restoringHistory.current = false;
    previousSeed.current = seedKey;
  }, [accounts, initialQuery, seedKey]);
  useEffect(() => {
    if (lastQuery.current === key) return;
    lastQuery.current = key;
    generation.current += 1; request.current?.abort();
    const timer = setTimeout(() => { void loadDirectory(); }, 180);
    return () => clearTimeout(timer);
  }, [key, loadDirectory]);
  useEffect(() => () => { generation.current += 1; request.current?.abort(); }, []);

  function changeQuery(next: SubscriberDirectoryQuery) {
    const changed = queryKey(next) !== queryKey(currentQuery.current);
    currentQuery.current = next; setQuery(next);
    if (changed) { setLoading(true); setError(""); }
  }
  function accountHref(accountId?: string) {
    const parameters = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value && value !== "all") parameters.set(name, value);
    if (accountId) parameters.set("accountId", accountId);
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
      const row = list.querySelector<HTMLElement>(`[data-subscriber-row="${CSS.escape(origin?.id ?? previous ?? "")}"]`);
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
      adminPhone={adminPhone} accountHref={accountHref} onAccountClick={selectAccount} onRetry={() => { void loadDirectory(); }} />
    <AccountColumn ref={detailsPane}>
      <RecordBack disabled={action.busy || navigating} onClick={backToDirectory}>Back to subscribers</RecordBack>
      {detail ? <SubscriberDetail key={detail.id} account={detail} plans={plans} action={action} presentation="compact-dialog" network={selectedNetwork}
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
