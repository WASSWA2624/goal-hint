"use client";

import styled from "styled-components";
import { ShieldIcon, UserIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import { emptySubscriberDirectoryQuery, subscriberDirectoryFiltered, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ActionButton, FieldError } from "./admin-form";
import { EmptyPanel, TextAction } from "./desk-styles";
import { RecordListFooter, RecordListScroll, RecordListTools } from "./record-workspace";
import { SubscriberAccountRow, SubscriberDirectoryFilters } from "./subscriber-directory-parts";
import { DirectoryRoot } from "./subscriber-styles";

export type SubscriberDirectoryProps = Readonly<{
  accounts: readonly SubscriberDirectoryAccount[];
  selectedId?: string | null;
  query: SubscriberDirectoryQuery;
  plans: readonly SubscriptionPlanView[];
  loading?: boolean;
  error?: string;
  adminPhone?: string | null;
  onQueryChange: (query: SubscriberDirectoryQuery) => void;
  accountHref: (id: string) => string;
  onRetry?: () => void;
}>;

/** Search remains available while the latest directory request is in flight. */
export function SubscriberDirectory({ accounts, selectedId, query, plans, loading = false, error, adminPhone, onQueryChange, accountHref, onRetry }: SubscriberDirectoryProps) {
  const filtered = subscriberDirectoryFiltered(query);
  return <DirectoryRoot aria-label="Find subscriber" data-subscriber-directory data-review-directory>
    <RecordListTools>
      <SubscriberDirectoryFilters query={query} plans={plans} onQueryChange={onQueryChange} />
      {error && <DirectoryError role="alert"><FieldError>{error}</FieldError>{onRetry && <ActionButton type="button" onClick={onRetry}>Retry</ActionButton>}</DirectoryError>}
    </RecordListTools>
    <RecordListScroll data-subscriber-results data-review-subscriber-list aria-label="Subscriber accounts" aria-busy={loading} tabIndex={0}>
      {accounts.length ? accounts.map(account => <li key={account.id}><SubscriberAccountRow account={account} selected={selectedId === account.id} href={accountHref(account.id)} /></li>)
        : <li><EmptyPanel data-subscriber-empty><UserIcon /><p>{loading ? "Finding subscribers…" : filtered ? "No matching subscribers." : "No subscriber accounts yet."}</p></EmptyPanel></li>}
      {adminPhone && <li><AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber></li>}
    </RecordListScroll>
    <RecordListFooter>
      <span data-subscriber-count role="status" aria-live="polite">{loading ? "Updating…" : `${accounts.length} account${accounts.length === 1 ? "" : "s"} shown · up to 100`}</span>
      {filtered && <TextAction type="button" onClick={() => onQueryChange(emptySubscriberDirectoryQuery)}>Clear filters</TextAction>}
    </RecordListFooter>
  </DirectoryRoot>;
}

const DirectoryError = styled.div`display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-inline-size: 0; > span { flex: 1 1 12rem; }`;
const AdminNumber = styled.p`
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
  > svg { flex: none; margin-block-start: 1px; font-size: 1rem; }
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
