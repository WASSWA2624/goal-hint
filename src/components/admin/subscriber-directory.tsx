"use client";

import type { FormEvent } from "react";
import styled, { css } from "styled-components";
import { Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { PhoneInput } from "@/components/ui/controls";
import { ChevronRightIcon, PhoneIcon, SearchIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";
import type { OwnerAccount } from "@/domain/owner-members";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { ActionButton, Badge } from "./admin-form";

export type SubscriberDirectoryProps = Readonly<{
  accounts: readonly OwnerAccount[];
  selectedId?: string | null;
  search: string;
  filtering: boolean;
  busy: boolean;
  adminPhone?: string | null;
  compact?: boolean;
  onSearchChange: (value: string) => void;
  onSearch: (query: string) => void | Promise<void>;
}>;

const statusLabels: Readonly<Record<string, string>> = { open: "Open", blocked: "Blocked", erased: "Erased" };

/** Account state is separate from paid access. The same directory supports recent accounts and exact phone searches. */
export function SubscriberDirectory({ accounts, selectedId, search, filtering, busy, adminPhone, compact = false, onSearchChange, onSearch }: SubscriberDirectoryProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void onSearch(search);
  }
  function showAll() {
    if (busy) return;
    onSearchChange("");
    void onSearch("");
  }
  return <Directory $compact={compact} data-subscriber-directory data-subscriber-compact={compact ? "true" : undefined} aria-busy={busy}>
    <PanelHeader>
      <h2>{filtering ? "Search results" : "Recent accounts"}</h2>
      <Count data-subscriber-count role="status">{accounts.length} account{accounts.length === 1 ? "" : "s"} shown</Count>
    </PanelHeader>
    <SearchForm $compact={compact} method="post" action="/api/admin/subscribers" onSubmit={submit} data-subscriber-search>
      <PhoneInput label="Search by phone" name="search" value={search} onValueChange={onSearchChange} hint="" disabled={busy} />
      <SearchButton type="submit" $variant="primary" disabled={busy}><SearchIcon />Search</SearchButton>
    </SearchForm>
    {filtering && <FilterSummary><span>Filtered by phone</span><ActionButton type="button" $variant="quiet" disabled={busy} onClick={showAll}>Show all</ActionButton></FilterSummary>}
    {accounts.length ? <Results data-subscriber-results>{accounts.map(account => <li key={account.id}>
      <AccountLink href={`/admin/subscribers?${new URLSearchParams({ accountId: account.id })}`} data-subscriber-row={account.id}
        aria-current={selectedId === account.id ? "page" : undefined}>
        <AccountIcon data-subscriber-row-icon>{account.phone ? <PhoneIcon /> : <UserIcon />}</AccountIcon>
        <AccountIdentity>
          <AccountSummary><strong>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</strong>
            <AccountStatus data-subscriber-status={account.status} $tone={account.status === "blocked" ? "warning" : "muted"}>{statusLabels[account.status] ?? "Unknown"}</AccountStatus>
          </AccountSummary>
          <LastSignIn data-subscriber-last-sign-in>Last sign-in <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></LastSignIn>
        </AccountIdentity>
        <ChevronRightIcon />
      </AccountLink>
    </li>)}</Results> : <EmptyState data-subscriber-empty><UserIcon /><p>{filtering ? "No accounts found." : "No subscriber accounts yet."}</p></EmptyState>}
    {adminPhone && <AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber>}
  </Directory>;
}

const Directory = styled(Panel)<{ $compact: boolean }>`
  h2, p { margin: 0; }
  ${({ $compact }) => $compact && css`
    padding: 12px; gap: 10px;
    > ${PanelHeader} { gap: 6px 10px; }
    > ${PanelHeader} h2 { font-size: 0.875rem; }
    [data-subscriber-count] { font-size: 0.6875rem; }
    [data-subscriber-row] { grid-template-columns: 24px minmax(0, 1fr) 14px; min-block-size: 64px; padding: 8px; gap: 8px; }
    [data-subscriber-row] strong { font-size: 0.8125rem; }
    [data-subscriber-row] > svg { inline-size: 14px; block-size: 14px; }
    [data-subscriber-row-icon] { inline-size: 24px; block-size: 28px; }
    [data-subscriber-row-icon] svg { inline-size: 16px; block-size: 16px; }
    [data-subscriber-status] { padding: 2px 6px; font-size: 0.625rem; }
    [data-subscriber-last-sign-in] { font-size: 0.6875rem; line-height: 1.35; }
  `}
`;
const Count = styled.span`
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem; font-variant-numeric: tabular-nums;
`;
const SearchForm = styled.form<{ $compact: boolean }>`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 6px 8px; min-inline-size: 0;
  /* Let the shared labelled field place validation below the control, keeping the button level with the input. */
  > div { display: contents; }
  > div > label { grid-column: 1 / -1; }
  > div > div { grid-column: 1; }
  @media(max-width: 480px) {
    grid-template-columns: minmax(0, 1fr);
    > div { display: flex; }
    button[type="submit"] { grid-column: 1; grid-row: auto; inline-size: 100%; }
  }
  ${({ $compact }) => $compact && css`
    grid-template-columns: minmax(0, 1fr);
    > div { display: flex; }
    button[type="submit"] { grid-column: 1; grid-row: auto; inline-size: 100%; }
  `}
`;
const SearchButton = styled(ActionButton)`
  grid-column: 2; grid-row: 2; min-block-size: 44px; block-size: 44px; align-self: start;
  svg { inline-size: 18px; block-size: 18px; flex: none; }
`;
const FilterSummary = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem;
  button { min-block-size: 44px; padding-block: 4px; }
`;
const Results = styled.ul`
  list-style: none; margin: 0; padding: 0; min-inline-size: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  > li + li { border-block-start: 1px solid ${({ theme }) => theme.color.border}; }
`;
const AccountLink = styled.a`
  display: grid; grid-template-columns: 32px minmax(0, 1fr) 18px; align-items: center; gap: 10px;
  min-block-size: 76px; padding: 12px; border-inline-start: 3px solid transparent;
  color: ${({ theme }) => theme.color.text}; text-decoration: none;
  > svg { inline-size: 18px; block-size: 18px; color: ${({ theme }) => theme.color.mutedText}; }
  &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; color: ${({ theme }) => theme.color.text}; }
  &[aria-current="page"] { border-inline-start-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.surfaceMuted}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  @media(max-width: 380px) { grid-template-columns: 24px minmax(0, 1fr) 16px; gap: 8px; padding-inline: 8px; }
`;
const AccountIcon = styled.span`
  display: grid; place-items: center; inline-size: 32px; block-size: 32px;
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted};
  svg { inline-size: 18px; block-size: 18px; }
  @media(max-width: 380px) { inline-size: 24px; block-size: 28px; }
`;
const AccountIdentity = styled.div`display: grid; gap: 5px; min-inline-size: 0;`;
const AccountSummary = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px;
  strong { font-size: 0.9375rem; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
`;
const AccountStatus = styled(Badge)`white-space: nowrap; flex: none;`;
const LastSignIn = styled.span`
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.45;
  time { font-variant-numeric: tabular-nums; }
`;
const EmptyState = styled.div`
  display: grid; justify-items: center; gap: 10px; padding: 28px 12px;
  color: ${({ theme }) => theme.color.mutedText}; border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  text-align: center; font-size: 0.875rem;
  > svg { inline-size: 24px; block-size: 24px; }
`;
const AdminNumber = styled.p`
  display: flex; align-items: start; gap: 8px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem;
  > svg { inline-size: 18px; block-size: 18px; flex: none; }
  strong { font-weight: 500; }
`;
