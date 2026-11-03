"use client";

import { useId, useState } from "react";
import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { authCopy } from "@/i18n/messages/auth";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { GlobeIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import type { SubscriberDirectoryAccount, SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { Badge } from "./admin-form";
import { FloatingField } from "./floating-field";
import { RecordItem, RecordItemMeta, RecordItemTitle } from "./record-workspace";

const statusLabels: Readonly<Record<string, string>> = { open: "Open", blocked: "Blocked", erased: "Erased" };
const accessLabels = { active: "Active access", queued: "Queued access", none: "No current access" } as const;

export function SubscriberDirectoryFilters({ query, plans, onQueryChange }: {
  query: SubscriberDirectoryQuery; plans: readonly SubscriptionPlanView[]; onQueryChange: (query: SubscriberDirectoryQuery) => void;
}) {
  const dialogId = useId(), [open, setOpen] = useState(false), [draft, setDraft] = useState(query);
  const filterCount = Number(query.status !== "all") + Number(query.access !== "all") + Number(query.plan !== "all") + Number(query.recent !== "all");
  const names = [...new Set(plans.map(plan => plan.name))];
  if (query.plan !== "all" && query.plan !== "none" && !names.includes(query.plan)) names.push(query.plan);
  return <Filters data-subscriber-review-filters data-subscriber-search role="search" aria-label="Search and filter subscribers">
    <SearchBar label="Search subscribers" value={query.search} onChange={event => onQueryChange({ ...query, search: event.currentTarget.value })}
      placeholder="Phone, package, code or note" maxLength={120} autoComplete="off"
      filters={{ label: "Advanced filters", dialogId, open, count: filterCount, onOpen: () => { setDraft(query); setOpen(true); } }} />
    {open && <AdvancedFilterDialog id={dialogId} open onCancel={() => setOpen(false)} closeLabel="Close subscriber filters"
      onApply={() => { onQueryChange({ ...draft, search: query.search }); setOpen(false); }}
      onReset={() => setDraft({ ...query, status: "all", access: "all", plan: "all", recent: "all" })}>
    <FilterFields>
    <FloatingField label="Account status"><select value={draft.status} onChange={event => setDraft({ ...draft, status: event.currentTarget.value as SubscriberDirectoryQuery["status"] })}>
      <option value="all">All accounts</option><option value="open">Open</option><option value="blocked">Blocked</option><option value="erased">Erased</option></select></FloatingField>
    <FloatingField label="Access"><select value={draft.access} onChange={event => setDraft({ ...draft, access: event.currentTarget.value as SubscriberDirectoryQuery["access"] })}>
      <option value="all">All access</option><option value="active">Active</option><option value="queued">Queued</option><option value="none">No current access</option></select></FloatingField>
    <FloatingField label="Package"><select value={draft.plan} onChange={event => setDraft({ ...draft, plan: event.currentTarget.value })}>
      <option value="all">All packages</option>{names.map(name => <option key={name} value={name}>{name}</option>)}<option value="none">No current package</option></select></FloatingField>
    <FloatingField label={authCopy.lastLogin}><select value={draft.recent} onChange={event => setDraft({ ...draft, recent: event.currentTarget.value as SubscriberDirectoryQuery["recent"] })}>
      <option value="all">Any time</option><option value="1">Within 24 hours</option><option value="7">Within 7 days</option><option value="30">Within 30 days</option></select></FloatingField>
    </FilterFields></AdvancedFilterDialog>}
  </Filters>;
}

/** Use the same identity row for native navigation and local sample selection. */
export function SubscriberAccountRow({ account, selected, href, onSelect }: {
  account: SubscriberDirectoryAccount; selected: boolean; href?: string; onSelect?: () => void;
}) {
  const networkLabel = account.network === "mtn" ? "MTN network" : account.network === "airtel" ? "Airtel network" : "Network unknown";
  const content = <>
    <span data-review-network role="img" aria-label={networkLabel} title={networkLabel}>{account.network ? <MobileMoneyLogo network={account.network} /> : <GlobeIcon />}</span>
    <RecordItemTitle data-review-phone>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</RecordItemTitle>
    <Badge data-review-row-status data-subscriber-status={account.status} $tone={account.status === "open" ? "good" : account.status === "blocked" ? "warning" : "muted"}>{statusLabels[account.status] ?? "Unknown"}</Badge>
    <RecordItemMeta data-review-row-meta>{account.planNames.length ? account.planNames.join(", ") : accessLabels[account.access]} · <span data-subscriber-last-sign-in>{authCopy.lastLogin} <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></span></RecordItemMeta>
  </>;
  const attributes = { "data-review-subscriber-row": account.id, "data-subscriber-row": account.id };
  return href ? <Row {...attributes} as={Link} href={href} prefetch={false} aria-current={selected ? "page" : undefined}>{content}</Row>
    : <Row {...attributes} type="button" aria-current={selected ? "true" : undefined} onClick={onSelect}>{content}</Row>;
}

const Filters = styled.div`display: grid; min-inline-size: 0;`;
const FilterFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5) var(--gh-spacing-2); min-inline-size: 0;
`;
const Row = styled(RecordItem)`
  grid-template-columns: var(--gh-size-7_5) minmax(0, 1fr) auto; align-items: center; text-decoration: none;
  &[aria-current="page"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: none; }
`;
