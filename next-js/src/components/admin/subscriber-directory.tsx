"use client";

import styled from "styled-components";
import type { MouseEvent } from "react";
import { ShieldIcon, UserIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import { subscriberDirectoryFiltered, type SubscriberDirectoryAccount, type SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import { ActionButton, FieldError } from "./admin-form";
import { EmptyPanel } from "./desk-styles";
import { RecordListFooter, RecordListScroll, RecordListTools } from "./record-workspace";
import { SubscriberAccountRow } from "./subscriber-directory-parts";
import { DirectoryRoot } from "./subscriber-styles";

export type SubscriberDirectoryProps = Readonly<{
  accounts: readonly SubscriberDirectoryAccount[];
  selectedId?: string | null;
  query: SubscriberDirectoryQuery;
  loading?: boolean;
  error?: string;
  adminPhone?: string | null;
  accountHref: (id: string) => string;
  onAccountClick: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
  onRetry?: () => void;
}>;

/** Search remains available while the latest directory request is in flight. */
export function SubscriberDirectory({ accounts, selectedId, query, loading = false, error, adminPhone, accountHref, onAccountClick, onRetry }: SubscriberDirectoryProps) {
  const filtered = subscriberDirectoryFiltered(query);
  return <DirectoryRoot aria-label="Find subscriber" data-subscriber-directory data-review-directory>
    {error && <RecordListTools><DirectoryError role="alert"><FieldError>{error}</FieldError>{onRetry && <ActionButton type="button" onClick={onRetry}>Retry</ActionButton>}</DirectoryError></RecordListTools>}
    <RecordListScroll data-subscriber-results data-review-subscriber-list aria-label="Subscriber accounts" aria-busy={loading} tabIndex={0}>
      {accounts.length ? accounts.map(account => <li key={account.id}><SubscriberAccountRow account={account} selected={selectedId === account.id}
        href={accountHref(account.id)} onAccountClick={event => onAccountClick(event, account.id)} /></li>)
        : !loading && <li><EmptyPanel data-subscriber-empty><UserIcon /><p>{filtered ? "No matching subscribers." : "No subscriber accounts yet."}</p></EmptyPanel></li>}
      {adminPhone && <li><AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber></li>}
    </RecordListScroll>
    <RecordListFooter>
      <span data-subscriber-count role="status" aria-live="polite">{`${accounts.length} account${accounts.length === 1 ? "" : "s"}${accounts.length === 100 ? " shown · result limit" : ""}`}</span>
    </RecordListFooter>
  </DirectoryRoot>;
}

const DirectoryError = styled.div`display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0; > span { flex: 1 1 var(--gh-size-48); }`;
const AdminNumber = styled.p`
  display: flex; align-items: flex-start; gap: var(--gh-spacing-2); padding: var(--gh-spacing-2_5) var(--gh-spacing-3_5);
  border-block-start: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary};
  > svg { flex: none; margin-block-start: var(--gh-spacing-0_25); font-size: var(--gh-font-section); }
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
