"use client";

import type { FormEvent, ReactNode } from "react";
import styled, { css } from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { PhoneInput } from "@/components/ui/controls";
import { ChevronRightIcon, SearchIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";
import type { OwnerAccount } from "@/domain/owner-members";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { media } from "@/styles/theme";
import { ActionButton, Badge } from "./admin-form";
import { EmptyPanel, Panel, PanelHead, RowList, RowMeta, RowTitle, TextAction, rowAction } from "./desk-styles";
import { DirectoryRoot, visuallyHidden } from "./subscriber-styles";

export type SubscriberDirectoryProps = Readonly<{
  accounts: readonly OwnerAccount[];
  selectedId?: string | null;
  search: string;
  filtering: boolean;
  busy: boolean;
  adminPhone?: string | null;
  /** An account is open beside the directory. */
  compact?: boolean;
  onSearchChange: (value: string) => void;
  onSearch: (query: string) => void | Promise<void>;
  /** Shown between the search row and the account list (the add-subscriber drawer). */
  children?: ReactNode;
}>;

const statusLabels: Readonly<Record<string, string>> = { open: "Open", blocked: "Blocked", erased: "Erased" };
const statusTones = { open: "good", blocked: "warning" } as const;

/** Account state is separate from paid access. The same directory supports recent accounts and exact phone searches. */
export function SubscriberDirectory({ accounts, selectedId, search, filtering, busy, adminPhone, compact = false, onSearchChange, onSearch, children }: SubscriberDirectoryProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void onSearch(search);
  }
  function showAll() {
    if (busy) return;
    onSearchChange("");
    void onSearch("");
  }
  return <DirectoryRoot aria-label="Find subscriber" data-subscriber-directory data-subscriber-compact={compact ? "true" : undefined} aria-busy={busy}>
    <SearchForm role="search" method="post" action="/api/admin/subscribers" onSubmit={submit} data-subscriber-search>
      <PhoneInput label="Search by phone" name="search" value={search} onValueChange={onSearchChange} lookup hint="" disabled={busy} />
      <ActionButton type="submit" disabled={busy}><SearchIcon /><span>Search</span></ActionButton>
    </SearchForm>
    {children}
    <Panel as="div">
      <PanelHead>
        <h2>{filtering ? "Search results" : "Recent accounts"}</h2>
        <HeadEnd>
          <Count data-subscriber-count role="status">{accounts.length} account{accounts.length === 1 ? "" : "s"} shown</Count>
          {filtering && <TextAction type="button" disabled={busy} onClick={showAll}>Show all</TextAction>}
        </HeadEnd>
      </PanelHead>
      {accounts.length ? <RowList data-subscriber-results>{accounts.map(account => <li key={account.id}>
        <AccountRow href={`/admin/subscribers?${new URLSearchParams({ accountId: account.id })}`} prefetch={false} data-subscriber-row={account.id}
          aria-current={selectedId === account.id ? "page" : undefined}>
          <RowTitle>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}
            <Badge data-subscriber-status={account.status} $tone={statusTones[account.status as keyof typeof statusTones] ?? "muted"}>{statusLabels[account.status] ?? "Unknown"}</Badge>
          </RowTitle>
          <ChevronRightIcon />
          <RowMeta data-subscriber-last-sign-in>Last sign-in <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></RowMeta>
        </AccountRow>
      </li>)}</RowList> : <EmptyPanel data-subscriber-empty><UserIcon /><p>{filtering ? "No accounts found." : "No subscriber accounts yet."}</p></EmptyPanel>}
      {adminPhone && <AdminNumber><ShieldIcon /><span><strong>+{formatPhone(adminPhone)}</strong> is an administrator number. Its password is managed in the environment.</span></AdminNumber>}
    </Panel>
  </DirectoryRoot>;
}

const searchIconOnly = css`
  > button { min-inline-size: ${({ theme }) => theme.control.minHeight}; padding-inline: 0; }
  > button > span { ${visuallyHidden} }
`;
/** Country, number and Search on one row; the label stays for screen readers and Search becomes an icon where space is short. */
const SearchForm = styled.form`
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px 8px;
  min-inline-size: 0;
  > [data-phone-field] { display: contents; }
  > [data-phone-field] > label { ${visuallyHidden} }
  > [data-phone-field] > [data-phone-control] { grid-column: 1; grid-row: 1; }
  > [data-phone-field] > :not(label):not([data-phone-control]) { grid-column: 1 / -1; }
  > button { grid-column: 2; grid-row: 1; min-block-size: ${({ theme }) => theme.control.minHeight}; }
  > button > svg { flex: none; font-size: 1.125rem; }
  ${media.belowDesktop} { ${searchIconOnly} }
  @container (max-width: 21rem) { ${searchIconOnly} }
`;
const HeadEnd = styled.div`display: flex; align-items: center; gap: 4px 10px;`;
const Count = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-variant-numeric: tabular-nums;
`;
const AccountRow = styled(Link)`
  ${rowAction}
  grid-template-columns: minmax(0, 1fr) 16px;
  > svg { grid-column: 2; grid-row: 1 / span 2; font-size: 1rem; color: ${({ theme }) => theme.color.mutedText}; }
  time { font-variant-numeric: tabular-nums; }
`;
const AdminNumber = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  > svg { flex: none; margin-block-start: 1px; font-size: 1rem; }
  strong { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.desktop} { padding-inline: 16px; }
`;
