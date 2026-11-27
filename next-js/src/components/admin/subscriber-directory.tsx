"use client";

import styled from "styled-components";
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type Ref } from "react";
import { Button } from "@/components/ui/controls";
import { ResetIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";
import { ShowMore } from "@/components/ui/show-more";
import { formatPhone } from "@/domain/phone";
import type { SubscriberIndividualAction } from "@/domain/subscriber-actions";
import { subscriberDirectoryFiltered, subscriberDirectoryPageSize, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { ActionButton, FieldError } from "./admin-form";
import { EmptyPanel } from "./desk-styles";
import { RecordListScroll, RecordListTools } from "./record-workspace";
import { SubscriberAccountRow } from "./subscriber-directory-parts";
import { DirectoryRoot } from "./subscriber-styles";
import type { CodeAction } from "./code-tools";
import { SubscriberActionMenu, SubscriberMenuButton } from "./subscriber-action-menu";
import { SubscriberBulkDialog, subscriberBulkChoices, type SubscriberBulkOperation, type SubscriberBulkResult } from "./subscriber-bulk-actions";

const messages = createMessages("en");

export type SubscriberDirectoryProps = Readonly<{
  accounts: readonly SubscriberDirectoryAccount[];
  asOf: string;
  selectedId?: string | null;
  query: SubscriberDirectoryQuery;
  loading?: boolean;
  error?: string;
  adminPhone?: string | null;
  accountHref: (id: string, action?: SubscriberIndividualAction) => string;
  onAccountClick: (event: MouseEvent<HTMLAnchorElement>, id: string, action?: SubscriberIndividualAction) => void;
  onRefresh?: (() => void) | undefined;
  listRef?: Ref<HTMLOListElement>;
  action: CodeAction;
  selectionScope: string;
  plans: readonly SubscriptionPlanView[];
  paging?: { hasMore: boolean; total: number; failed: boolean; loading: boolean; onShowMore: () => void };
}>;

/** Search remains available while the latest directory request is in flight. */
export function SubscriberDirectory({ accounts, asOf, selectedId, query, loading = false, error, adminPhone, accountHref, onAccountClick, onRefresh,
  action, selectionScope, plans, paging, listRef }: SubscriberDirectoryProps) {
  const [selection, setSelection] = useState<{ scope: string; ids: readonly string[] }>({ scope: selectionScope, ids: [] });
  const [operation, setOperation] = useState<SubscriberBulkOperation | null>(null);
  const [result, setResult] = useState<SubscriberBulkResult | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const visibleIds = useMemo(() => new Set(accounts.map(account => account.id)), [accounts]);
  const currentScope = selection.scope === selectionScope;
  if (!currentScope) {
    setSelection({ scope: selectionScope, ids: [] });
    if (!action.busy) setOperation(null);
  } else if (!loading && !error && selection.ids.some(id => !visibleIds.has(id))) {
    setSelection({ scope: selectionScope, ids: selection.ids.filter(id => visibleIds.has(id)) });
  }
  const checkedIds = currentScope ? new Set(selection.ids.filter(id => visibleIds.has(id))) : new Set<string>();
  const selected = accounts.filter(account => checkedIds.has(account.id));
  const selectedCount = selected.length;
  const selectable = accounts.slice(0, subscriberDirectoryPageSize);
  const capped = selectedCount >= subscriberDirectoryPageSize;
  const allSelected = selectable.length > 0 && selectable.every(account => checkedIds.has(account.id));
  const disabled = loading || !!error || action.busy;
  const choices = subscriberBulkChoices(selected);
  useLayoutEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);
  function checkAccount(id: string, checked: boolean) {
    if (checked && capped) return;
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
  const total = paging?.total ?? accounts.length;
  const referenceDate = new Date(asOf);
  const totalLabel = `${total.toLocaleString("en-UG")} subscriber${total === 1 ? "" : "s"}`;
  return <DirectoryRoot aria-label="Find subscriber" data-subscriber-directory data-review-directory>
    <RecordListTools>
      <SelectionToolbar role="group" aria-label="Subscriber selection" data-subscriber-selection>
        <SelectPage><input ref={selectAll} type="checkbox" checked={allSelected} disabled={disabled || !accounts.length}
          onChange={event => setSelection({ scope: selectionScope, ids: event.currentTarget.checked ? selectable.map(account => account.id) : [] })} />
          <span>{accounts.length > subscriberDirectoryPageSize ? `Select first ${subscriberDirectoryPageSize} loaded` : "Select all loaded"}</span></SelectPage>
        <SelectionCount role="status" aria-live="polite" data-subscriber-count>{totalLabel}</SelectionCount>
        <SelectionCount role="status" aria-live="polite" data-subscriber-selected-count>{selectedCount ? `${selectedCount} selected` : ""}</SelectionCount>
        <ListActions>
        <SubscriberActionMenu key={selectionScope} label="Manage" disabled={disabled || !selectedCount}>
          {close => choices.map(choice => <SubscriberMenuButton key={choice.action} onClick={() => {
            close(); action.clearFeedback(); setResult(null); setOperation({ ...choice, requestId: crypto.randomUUID() });
          }}>{choice.label}{choice.accounts.length < selectedCount ? ` (${choice.accounts.length})` : ""}</SubscriberMenuButton>)}
        </SubscriberActionMenu>
        <RefreshButton type="button" variant="quiet" aria-label="Refresh subscriber list" title="Refresh"
          disabled={!onRefresh || loading || action.busy} onClick={onRefresh}><ResetIcon /></RefreshButton>
        </ListActions>
      </SelectionToolbar>
      {error && <DirectoryError role="alert"><FieldError>{error}</FieldError>{onRefresh && <ActionButton type="button"
        aria-label="Retry subscriber list" onClick={onRefresh}>Retry</ActionButton>}</DirectoryError>}
      {result && <BulkOutcome data-subscriber-bulk-result>
        <p role="status">{result.succeeded} succeeded · {result.failures.length} failed</p>
        {!!result.failures.length && <ul aria-label="Accounts with failed actions">{result.failures.map(item =>
          <li key={item.accountId}><strong>{item.identity}</strong> · {item.message}</li>)}</ul>}
      </BulkOutcome>}
    </RecordListTools>
    <RecordListScroll ref={listRef} data-subscriber-results data-review-subscriber-list aria-label="Subscriber accounts" aria-busy={loading} tabIndex={0}>
      {accounts.length ? accounts.map(account => <li key={account.id}><SubscriberAccountRow account={account} asOf={referenceDate} selected={selectedId === account.id}
        href={accountHref(account.id)} onAccountClick={(event, next) => onAccountClick(event, account.id, next)}
        checked={checkedIds.has(account.id)} disabled={disabled} checkDisabled={capped && !checkedIds.has(account.id)} onCheck={checked => checkAccount(account.id, checked)}
        actionHref={next => accountHref(account.id, next)} /></li>)
        : !loading && !error && <li><EmptyPanel data-subscriber-empty><UserIcon /><p>{filtered ? "No matching subscribers." : "No subscriber accounts yet."}</p></EmptyPanel></li>}
      {adminPhone && <li><AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber></li>}
      {paging?.hasMore && <li><ShowMore hasMore messages={messages} disabled={disabled} loading={paging.loading} failed={paging.failed}
        onShowMore={paging.onShowMore} /></li>}
    </RecordListScroll>
    {operation && <SubscriberBulkDialog key={operation.requestId} operation={operation} plans={plans} action={action} onSuccess={completeBulk}
      onClose={() => { if (!action.busy) { action.clearFeedback(); setOperation(null); } }} />}
  </DirectoryRoot>;
}

const SelectionToolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-2); min-inline-size: 0;
  min-block-size: var(--form-control-height);
  > :last-child { margin-inline-start: auto; }
`;
const SelectionCount = styled.span`
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
  &:empty { display: none; }
`;
const ListActions = styled.div`display: flex; gap: var(--gh-spacing-1); align-items: center;`;
const RefreshButton = styled(Button)`
  && { inline-size: var(--form-control-height); min-inline-size: var(--form-control-height); padding-inline: 0; }
  > svg { font-size: var(--gh-font-section); }
`;
const SelectPage = styled.label`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height);
  cursor: pointer; font-size: var(--gh-font-secondary);
  > input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); margin: 0; accent-color: ${({ theme }) => theme.color.link}; }
`;
const BulkOutcome = styled.div`
  display: grid; min-inline-size: 0; gap: var(--gh-spacing-1);
  font-size: var(--gh-font-secondary);
  > ul { margin: 0; padding-inline-start: var(--gh-spacing-4); max-block-size: var(--gh-size-32); overflow-y: auto; }
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
