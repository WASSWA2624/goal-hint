"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { ChevronLeftIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import type { OwnerSubscriber } from "@/domain/owner-members";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryQuery, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, Hint } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { RecordCard, RecordEmpty, RecordFeedback, RecordScroll } from "./record-workspace";
import { SubscriberDirectory } from "./subscriber-directory";
import { SubscriberDetail } from "./subscriber-detail";
import { subscriberPresentation } from "./subscriber-presentation-styles";
import { SubscriberReviewDialog } from "./subscriber-review-dialog";
import { AccountColumn, BackLink, Workspace, WorkspaceTitle } from "./subscriber-styles";

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
  const [adminPhone, setAdminPhone] = useState<string | null>(null), [adding, setAdding] = useState(false), [deletedId, setDeletedId] = useState<string | null>(null);
  const currentQuery = useRef(initialQuery), request = useRef<AbortController | null>(null), generation = useRef(0);
  const previousSeed = useRef(queryKey(initialQuery)), lastQuery = useRef(queryKey(initialQuery));
  const restoringHistory = useRef(false);
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
        failureMessage = "Your administrator session has ended. Sign in again.";
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

  return <LiveWorkspace $selected={!!detail && selectedExplicitly} data-subscriber-workspace data-analytics-ignore>
    <WorkspaceTitle><h1>Subscribers</h1><ActionButton type="button" disabled={action.busy} aria-haspopup="dialog" onClick={() => { action.clearFeedback(); setAdding(true); }}><UserPlusIcon />Grant access / add subscriber</ActionButton></WorkspaceTitle>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <SubscriberDirectory accounts={listed.filter(account => account.id !== deletedId)} selectedId={detail?.id ?? null} query={query} plans={plans} loading={loading} error={error}
      adminPhone={adminPhone} onQueryChange={changeQuery} accountHref={accountHref} onRetry={() => { void loadDirectory(); }} />
    <AccountColumn $quiet={!detail || !selectedExplicitly}>
      {detail ? <SubscriberDetail key={detail.id} account={detail} plans={plans} action={action} presentation="compact-dialog" network={selectedNetwork}
        back={<BackLink href={accountHref()} prefetch={false}><ChevronLeftIcon />Subscribers</BackLink>}
        onDeleted={() => { setDeletedId(detail.id); router.replace(accountHref(), { scroll: false }); }} />
        : <RecordCard><RecordScroll><RecordEmpty><UserIcon /><h2>Select an account</h2><p>Choose a matching subscriber to manage their access and details.</p></RecordEmpty></RecordScroll></RecordCard>}
    </AccountColumn>
    <SubscriberReviewDialog open={adding} title="Grant access / add subscriber" busy={action.busy} onClose={() => { if (!action.busy) setAdding(false); }}
      footer={<><ActionButton type="button" disabled={action.busy} onClick={() => setAdding(false)}>Cancel</ActionButton><ActionButton type="submit" form={formId} $variant="primary" disabled={action.busy}>Grant access</ActionButton></>}>
      <Hint as="p">A new number creates an account with access.</Hint>
      {action.message && <ActionNotices action={action} />}<ManualCodeForm formId={formId} plans={plans} action={action} externalActions compact onSaved={() => setAdding(false)} />
    </SubscriberReviewDialog>
  </LiveWorkspace>;
}

const LiveWorkspace = styled(Workspace)`
  ${subscriberPresentation}
`;
