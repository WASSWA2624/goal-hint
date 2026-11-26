"use client";

import styled from "styled-components";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { ShieldIcon, UserIcon } from "@/components/ui/icons";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { formatPhone } from "@/domain/phone";
import type { SubscriberIndividualAction } from "@/domain/subscriber-actions";
import { subscriberDirectoryFiltered, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { ActionButton, FieldError } from "./admin-form";
import { EmptyPanel } from "./desk-styles";
import { RecordListFooter, RecordListScroll, RecordListTools } from "./record-workspace";
import { SubscriberAccountRow } from "./subscriber-directory-parts";
import { DirectoryRoot } from "./subscriber-styles";
import type { CodeAction } from "./code-tools";
import { SubscriberActionMenu, SubscriberMenuButton } from "./subscriber-action-menu";
import { SubscriberBulkDialog, subscriberBulkChoices, type SubscriberBulkOperation, type SubscriberBulkResult } from "./subscriber-bulk-actions";

const pagingLabels = numberedPaginationLabels(createMessages("en"), "Subscriber pages");

export type SubscriberDirectoryProps = Readonly<{
  accounts: readonly SubscriberDirectoryAccount[];
  selectedId?: string | null;
  query: SubscriberDirectoryQuery;
  loading?: boolean;
  error?: string;
  adminPhone?: string | null;
  accountHref: (id: string, action?: SubscriberIndividualAction) => string;
  onAccountClick: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
  onRetry?: () => void;
  action: CodeAction;
  selectionScope: string;
  plans: readonly SubscriptionPlanView[];
  canManagePasswords?: boolean;
  paging?: { page: number; pages: number; total: number; onPage: (page: number) => void };
}>;

/** Search remains available while the latest directory request is in flight. */
export function SubscriberDirectory({ accounts, selectedId, query, loading = false, error, adminPhone, accountHref, onAccountClick, onRetry,
  action, selectionScope, plans, canManagePasswords = false, paging }: SubscriberDirectoryProps) {
  const [selection, setSelection] = useState<{ scope: string; ids: readonly string[] }>({ scope: selectionScope, ids: [] });
  const [operation, setOperation] = useState<SubscriberBulkOperation | null>(null);
  const [result, setResult] = useState<SubscriberBulkResult | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const currentScope = selection.scope === selectionScope;
  if (!currentScope) {
    setSelection({ scope: selectionScope, ids: [] });
    if (!action.busy) setOperation(null);
  } else if (!loading && !error && selection.ids.some(id => !accounts.some(account => account.id === id))) {
    setSelection({ scope: selectionScope, ids: selection.ids.filter(id => accounts.some(account => account.id === id)) });
  }
  const selected = currentScope ? accounts.filter(account => selection.ids.includes(account.id)) : [];
  const selectedCount = selected.length, allSelected = accounts.length > 0 && selectedCount === accounts.length;
  const disabled = loading || !!error || action.busy;
  const choices = subscriberBulkChoices(selected);
  useLayoutEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);
  function checkAccount(id: string, checked: boolean) {
    const selectedIds = selected.map(account => account.id);
    setSelection({ scope: selectionScope, ids: checked ? [...selectedIds, id] : selectedIds.filter(value => value !== id) });
  }
  function completeBulk(outcome: SubscriberBulkResult) {
    const succeeded = new Set(operation?.accounts.map(account => account.id));
    for (const failed of outcome.failures) succeeded.delete(failed.accountId);
    setResult(outcome);
    setOperation(null);
    setSelection(current => current.scope !== selectionScope ? current
      : { scope: current.scope, ids: current.ids.filter(id => !succeeded.has(id)) });
  }
  const filtered = subscriberDirectoryFiltered(query);
  const visibleCount = paging && paging.pages > 1 ? `${accounts.length} of ${paging.total} accounts` : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`;
  return <DirectoryRoot aria-label="Find subscriber" data-subscriber-directory data-review-directory>
    <RecordListTools>
      {error && <DirectoryError role="alert"><FieldError>{error}</FieldError>{onRetry && <ActionButton type="button" onClick={onRetry}>Retry</ActionButton>}</DirectoryError>}
      <SelectionToolbar role="group" aria-label="Subscriber selection" data-subscriber-selection>
        <SelectPage><input ref={selectAll} type="checkbox" checked={allSelected} disabled={disabled || !accounts.length}
          onChange={event => setSelection({ scope: selectionScope, ids: event.currentTarget.checked ? accounts.map(account => account.id) : [] })} />
          <span>Select all on this page</span></SelectPage>
        <span role="status" aria-live="polite" data-subscriber-selected-count>{selectedCount} selected</span>
        <SubscriberActionMenu key={selectionScope} label="Manage" disabled={disabled || !selectedCount}>
          {close => choices.map(choice => <SubscriberMenuButton key={choice.action} onClick={() => {
            close(); action.clearFeedback(); setResult(null); setOperation({ ...choice, requestId: crypto.randomUUID() });
          }}>{choice.label}{choice.accounts.length < selectedCount ? ` (${choice.accounts.length})` : ""}</SubscriberMenuButton>)}
        </SubscriberActionMenu>
      </SelectionToolbar>
      {result && <BulkOutcome data-subscriber-bulk-result>
        <p role="status">{result.succeeded} succeeded · {result.failures.length} failed</p>
        {!!result.failures.length && <ul aria-label="Accounts with failed actions">{result.failures.map(item =>
          <li key={item.accountId}><strong>{item.identity}</strong> · {item.message}</li>)}</ul>}
      </BulkOutcome>}
    </RecordListTools>
    <RecordListScroll data-subscriber-results data-review-subscriber-list aria-label="Subscriber accounts" aria-busy={loading} tabIndex={0}>
      {accounts.length ? accounts.map(account => <li key={account.id}><SubscriberAccountRow account={account} selected={selectedId === account.id}
        href={accountHref(account.id)} onAccountClick={event => onAccountClick(event, account.id)}
        controls={{ checked: selected.some(item => item.id === account.id), disabled, canManagePasswords, onCheck: checked => checkAccount(account.id, checked),
          actionHref: next => accountHref(account.id, next) }} /></li>)
        : !loading && <li><EmptyPanel data-subscriber-empty><UserIcon /><p>{filtered ? "No matching subscribers." : "No subscriber accounts yet."}</p></EmptyPanel></li>}
      {adminPhone && <li><AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber></li>}
    </RecordListScroll>
    <RecordListFooter>
      <span data-subscriber-count role="status" aria-live="polite">{visibleCount}</span>
      {paging && paging.pages > 1 && <NumberedPagination compact page={paging.page} pages={paging.pages} labels={pagingLabels}
        disabled={disabled} onPage={paging.onPage} />}
    </RecordListFooter>
    {operation && <SubscriberBulkDialog key={operation.requestId} operation={operation} plans={plans} action={action} onSuccess={completeBulk}
      onClose={() => { if (!action.busy) { action.clearFeedback(); setOperation(null); } }} />}
  </DirectoryRoot>;
}

const SelectionToolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2); min-inline-size: 0;
  min-block-size: var(--form-control-height);
  > :last-child { margin-inline-start: auto; }
`;
const SelectPage = styled.label`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height);
  cursor: pointer; font-size: var(--gh-font-secondary);
  > input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); margin: 0; accent-color: ${({ theme }) => theme.color.link}; }
`;
const BulkOutcome = styled.div`
  display: grid; min-inline-size: 0; gap: var(--gh-spacing-1);
  font-size: var(--gh-font-secondary);
  > ul { margin: 0; padding-inline-start: var(--gh-spacing-4); }
  li { overflow-wrap: anywhere; }
`;
const DirectoryError = styled.div`display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0; > span { flex: 1 1 var(--gh-size-48); }`;
const AdminNumber = styled.p`
  display: flex; align-items: flex-start; gap: var(--gh-spacing-2); padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5);
  border-block-start: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
  > svg { flex: none; margin-block-start: var(--gh-spacing-0_25); font-size: var(--gh-font-section); }
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
