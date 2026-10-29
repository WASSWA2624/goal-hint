"use client";

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
  const names = [...new Set(plans.map(plan => plan.name))];
  if (query.plan !== "all" && query.plan !== "none" && !names.includes(query.plan)) names.push(query.plan);
  return <Filters data-subscriber-review-filters data-subscriber-search role="search" aria-label="Search and filter subscribers">
    <FloatingField label="Search subscribers"><input type="search" value={query.search} onChange={event => onQueryChange({ ...query, search: event.currentTarget.value })}
      placeholder="Phone, package, code or note" maxLength={120} autoComplete="off" /></FloatingField>
    <FloatingField label="Account status"><select value={query.status} onChange={event => onQueryChange({ ...query, status: event.currentTarget.value as SubscriberDirectoryQuery["status"] })}>
      <option value="all">All accounts</option><option value="open">Open</option><option value="blocked">Blocked</option><option value="erased">Erased</option></select></FloatingField>
    <FloatingField label="Access"><select value={query.access} onChange={event => onQueryChange({ ...query, access: event.currentTarget.value as SubscriberDirectoryQuery["access"] })}>
      <option value="all">All access</option><option value="active">Active</option><option value="queued">Queued</option><option value="none">No current access</option></select></FloatingField>
    <FloatingField label="Package"><select value={query.plan} onChange={event => onQueryChange({ ...query, plan: event.currentTarget.value })}>
      <option value="all">All packages</option>{names.map(name => <option key={name} value={name}>{name}</option>)}<option value="none">No current package</option></select></FloatingField>
    <FloatingField label="Last sign-in"><select value={query.recent} onChange={event => onQueryChange({ ...query, recent: event.currentTarget.value as SubscriberDirectoryQuery["recent"] })}>
      <option value="all">Any time</option><option value="1">Within 24 hours</option><option value="7">Within 7 days</option><option value="30">Within 30 days</option></select></FloatingField>
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
    <RecordItemMeta data-review-row-meta>{account.planNames.length ? account.planNames.join(", ") : accessLabels[account.access]} · <span data-subscriber-last-sign-in>Last sign-in <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></span></RecordItemMeta>
  </>;
  const attributes = { "data-review-subscriber-row": account.id, "data-subscriber-row": account.id };
  return href ? <Row {...attributes} as={Link} href={href} prefetch={false} aria-current={selected ? "page" : undefined}>{content}</Row>
    : <Row {...attributes} type="button" aria-current={selected ? "true" : undefined} onClick={onSelect}>{content}</Row>;
}

const Filters = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 8px; min-inline-size: 0;
  > :first-child { grid-column: 1 / -1; }
`;
const Row = styled(RecordItem)`
  grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; text-decoration: none;
  &[aria-current="page"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: inset 3px 0 ${({ theme }) => theme.color.link}; }
`;
