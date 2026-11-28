"use client";

import styled from "styled-components";
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type Ref } from "react";
import { Button } from "@/components/ui/controls";
import { GearIcon, ResetIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";
import { ShowMore } from "@/components/ui/show-more";
import { formatPhone } from "@/domain/phone";
import type { UserIndividualAction } from "@/domain/user-actions";
import { userDirectoryFiltered, type UserDirectoryAccount, type UserDirectoryQuery } from "@/domain/user-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { ActionButton, FieldError } from "./admin-form";
import { EmptyPanel } from "./desk-styles";
import { RecordListScroll, RecordListTools } from "./record-workspace";
import { UserAccountRow } from "./user-directory-parts";
import { DirectoryCheckbox, DirectoryRoot } from "./user-styles";
import type { CodeAction } from "./code-tools";
import { UserActionMenu, UserMenuButton } from "./user-action-menu";
import { UserBulkDialog, userBulkChoices, type UserBulkOperation, type UserBulkResult } from "./user-bulk-actions";

const messages = createMessages("en");

export type UserDirectoryProps = Readonly<{
  accounts: readonly UserDirectoryAccount[];
  asOf: string;
  selectedId?: string | null;
  query: UserDirectoryQuery;
  loading?: boolean;
  error?: string;
  adminPhone?: string | null;
  accountHref: (id: string, action?: UserIndividualAction) => string;
  onAccountClick: (event: MouseEvent<HTMLAnchorElement>, id: string, action?: UserIndividualAction) => void;
  onRefresh?: (() => void) | undefined;
  listRef?: Ref<HTMLOListElement>;
  action: CodeAction;
  selectionScope: string;
  plans: readonly SubscriptionPlanView[];
  paging?: { hasMore: boolean; total: number; failed: boolean; loading: boolean; onShowMore: () => void };
}>;

/** Search remains available while the latest directory request is in flight. */
export function UserDirectory({ accounts, asOf, selectedId, query, loading = false, error, adminPhone, accountHref, onAccountClick, onRefresh,
  action, selectionScope, plans, paging, listRef }: UserDirectoryProps) {
  const [selection, setSelection] = useState<{ scope: string; ids: readonly string[] }>({ scope: selectionScope, ids: [] });
  const [operation, setOperation] = useState<UserBulkOperation | null>(null);
  const [result, setResult] = useState<UserBulkResult | null>(null);
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
  const allSelected = accounts.length > 0 && selectedCount === accounts.length;
  const disabled = loading || !!error || action.busy;
  const choices = userBulkChoices(selected);
  useLayoutEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);
  function checkAccount(id: string, checked: boolean) {
    const selectedIds = selected.map(account => account.id);
    setSelection({ scope: selectionScope, ids: checked ? [...selectedIds, id] : selectedIds.filter(value => value !== id) });
  }
  function completeBulk(outcome: UserBulkResult) {
    const succeeded = new Set(operation?.accounts.map(account => account.id));
    for (const failed of outcome.failures) succeeded.delete(failed.accountId);
    setResult(outcome);
    setOperation(null);
    setSelection(current => current.scope !== selectionScope ? current
      : { scope: current.scope, ids: current.ids.filter(id => !succeeded.has(id)) });
  }
  const filtered = userDirectoryFiltered(query);
  const total = paging?.total ?? accounts.length;
  const referenceDate = new Date(asOf);
  const totalLabel = `${total.toLocaleString("en-UG")} user${total === 1 ? "" : "s"}`;
  return <DirectoryRoot aria-label="Find user" data-user-directory data-review-directory>
    <DirectoryTools>
      <SelectionToolbar role="group" aria-label="User selection" data-user-selection>
        <SelectPage><DirectoryCheckbox ref={selectAll} type="checkbox" checked={allSelected} disabled={disabled || !accounts.length}
          onChange={event => setSelection({ scope: selectionScope, ids: event.currentTarget.checked ? accounts.map(account => account.id) : [] })} />
          <span>Select all</span></SelectPage>
        <SelectionCounts>
          <SelectionCount role="status" aria-live="polite" data-user-count>{totalLabel}</SelectionCount>
          <SelectionCount role="status" data-user-selected-count>{selectedCount ? `${selectedCount.toLocaleString("en-UG")} selected` : ""}</SelectionCount>
        </SelectionCounts>
        <UserActionMenu key={selectionScope} label="Manage" icon={<GearIcon />} showLabel disabled={disabled || !selectedCount}>
          {close => choices.map(choice => <UserMenuButton key={choice.action} onClick={() => {
            close(); action.clearFeedback(); setResult(null); setOperation({ ...choice, requestId: crypto.randomUUID() });
          }}>{choice.label}{choice.accounts.length < selectedCount ? ` (${choice.accounts.length})` : ""}</UserMenuButton>)}
        </UserActionMenu>
        <RefreshButton type="button" variant="quiet" aria-label="Refresh user list" title="Refresh"
          disabled={!onRefresh || loading || action.busy} onClick={onRefresh}><ResetIcon /></RefreshButton>
      </SelectionToolbar>
      {error && <DirectoryError role="alert"><FieldError>{error}</FieldError>{onRefresh && <ActionButton type="button"
        aria-label="Retry user list" onClick={onRefresh}>Retry</ActionButton>}</DirectoryError>}
      {result && <BulkOutcome data-user-bulk-result>
        <p role="status">{result.succeeded} succeeded · {result.failures.length} failed</p>
        {!!result.failures.length && <ul aria-label="Accounts with failed actions">{result.failures.map(item =>
          <li key={item.accountId}><strong>{item.identity}</strong> · {item.message}</li>)}</ul>}
      </BulkOutcome>}
    </DirectoryTools>
    <RecordListScroll ref={listRef} data-user-results data-review-user-list aria-label="User accounts" aria-busy={loading || paging?.loading || false} tabIndex={0}>
      {accounts.length ? accounts.map(account => <li key={account.id}><UserAccountRow account={account} asOf={referenceDate} selected={selectedId === account.id}
        href={accountHref(account.id)} onAccountClick={(event, next) => onAccountClick(event, account.id, next)}
        checked={checkedIds.has(account.id)} disabled={disabled} onCheck={checked => checkAccount(account.id, checked)}
        actionHref={next => accountHref(account.id, next)} /></li>)
        : !loading && !error && <li><EmptyPanel data-user-empty><UserIcon /><p>{filtered ? "No matching users." : "No user accounts yet."}</p></EmptyPanel></li>}
      {adminPhone && <li><AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber></li>}
      {paging?.hasMore && <li><DirectoryShowMore hasMore messages={messages} disabled={disabled} loading={paging.loading} failed={paging.failed}
        onShowMore={paging.onShowMore} /></li>}
    </RecordListScroll>
    {operation && <UserBulkDialog key={operation.requestId} operation={operation} plans={plans} action={action} onSuccess={completeBulk}
      onClose={() => { if (!action.busy) { action.clearFeedback(); setOperation(null); } }} />}
  </DirectoryRoot>;
}

const DirectoryTools = styled(RecordListTools)`
  && { padding-inline: var(--directory-row-inset); }
`;
const SelectionToolbar = styled.div`
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center;
  gap: var(--gh-spacing-1); min-inline-size: 0; white-space: nowrap;
  min-block-size: var(--form-control-height); font-size: var(--gh-font-secondary);
  @container directory (max-width: ${({ theme }) => theme.viewport[18]}) {
    gap: var(--gh-spacing-0_75); font-size: var(--gh-font-caption);
  }
`;
const SelectionCounts = styled.div`
  display: grid; min-inline-size: 0; line-height: var(--gh-leading-heading);
`;
const SelectionCount = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  min-inline-size: 0; overflow: hidden; text-overflow: ellipsis;
  &:empty { display: none; }
`;
const RefreshButton = styled(Button)`
  --refresh-size: calc(var(--form-control-height) - 2 * var(--gh-spacing-1));
  && { inline-size: var(--refresh-size); min-inline-size: var(--refresh-size); min-block-size: var(--refresh-size); padding: 0; }
  > svg { font-size: var(--gh-font-emphasis); }
`;
const SelectPage = styled.label`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1); min-block-size: var(--form-control-height);
  cursor: pointer;
`;
const DirectoryShowMore = styled(ShowMore)`> button { inline-size: 100%; }`;
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
