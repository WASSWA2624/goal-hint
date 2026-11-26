"use client";

import { useId, useState, type ReactNode } from "react";
import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { authCopy } from "@/i18n/messages/auth";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { GlobeIcon, MoreIcon } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/controls";
import { subscriberActionLabel, subscriberIndividualActions, type SubscriberIndividualAction } from "@/domain/subscriber-actions";
import { formatPhone } from "@/domain/phone";
import type { SubscriberDirectoryAccount, SubscriberDirectoryQuery } from "@/domain/subscriber-directory";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { Badge } from "./admin-form";
import { FloatingField } from "./floating-field";
import { RecordItem, RecordItemTitle, RecordRowContent } from "./record-workspace";
import { SubscriberActionMenu, SubscriberMenuLink } from "./subscriber-action-menu";

const statusLabels: Readonly<Record<string, string>> = { open: "Open", blocked: "Blocked", erased: "Erased" };
const accessLabels = { active: "Active access", queued: "Queued access", none: "No current access" } as const;

export function SubscriberDirectoryFilters({ query, plans, onQueryChange, trailingAction }: {
  query: SubscriberDirectoryQuery; plans: readonly SubscriptionPlanView[]; onQueryChange: (query: SubscriberDirectoryQuery) => void; trailingAction?: ReactNode;
}) {
  const dialogId = useId(), [open, setOpen] = useState(false), [draft, setDraft] = useState(query);
  const filterCount = Number(query.status !== "all") + Number(query.access !== "all") + Number(query.plan !== "all") + Number(query.recent !== "all");
  const names = [...new Set(plans.map(plan => plan.name))];
  if (query.plan !== "all" && query.plan !== "none" && !names.includes(query.plan)) names.push(query.plan);
  return <Filters data-subscriber-review-filters data-subscriber-search role="search" aria-label="Search and filter subscribers">
    <SearchBar label="Search subscribers" value={query.search} onChange={event => onQueryChange({ ...query, search: event.currentTarget.value })}
      placeholder="Phone, package, code or note" maxLength={120} autoComplete="off" trailingAction={trailingAction}
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
export function SubscriberAccountRow({ account, selected, href, onSelect, onAccountClick, controls }: {
  account: SubscriberDirectoryAccount; selected: boolean; href?: string; onSelect?: () => void;
  onAccountClick?: React.MouseEventHandler<HTMLAnchorElement>;
  controls?: { checked: boolean; disabled: boolean; canManagePasswords: boolean; onCheck: (checked: boolean) => void;
    actionHref: (action: SubscriberIndividualAction) => string };
}) {
  const networkLabel = account.network === "mtn" ? "MTN network" : account.network === "airtel" ? "Airtel network" : "Network unknown";
  const identity = account.phone ? `+${formatPhone(account.phone)}` : `Erased account ${account.id}`;
  const content = <RecordRowContent
    icon={<span data-review-network role="img" aria-label={networkLabel} title={networkLabel}>{account.network ? <MobileMoneyLogo network={account.network} /> : <GlobeIcon />}</span>}
    primary={<><RecordItemTitle data-review-phone>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</RecordItemTitle>
      <Badge data-review-row-status data-subscriber-status={account.status} $tone={account.status === "open" ? "good" : account.status === "blocked" ? "warning" : "muted"}>{statusLabels[account.status] ?? "Unknown"}</Badge></>}
    secondary={<span data-review-row-meta>{account.planNames.length ? account.planNames.join(", ") : accessLabels[account.access]} · <span data-subscriber-last-sign-in>{authCopy.lastLogin} <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></span></span>} />;
  const attributes = { "data-review-subscriber-row": account.id, "data-subscriber-row": account.id };
  if (href && controls) {
    const actions = subscriberIndividualActions.filter(action => account.status === "erased" ? action === "delete"
      : action !== "password-reset" || controls.canManagePasswords && account.status !== "blocked");
    return <ManageableRow {...attributes} data-current={selected || undefined}>
      <RowCheck><input type="checkbox" aria-label={`Select ${identity}`} checked={controls.checked} disabled={controls.disabled}
        onChange={event => controls.onCheck(event.currentTarget.checked)} /></RowCheck>
      {content}
      <OpenAccount href={href} prefetch={false} scroll={false} variant="quiet" aria-label={`Open ${identity}`}
        aria-current={selected ? "page" : undefined} data-subscriber-open {...(onAccountClick ? { onClick: onAccountClick } : {})}>Open</OpenAccount>
      <SubscriberActionMenu label={`More actions for ${identity}`} icon={<MoreIcon />} disabled={controls.disabled}>
        {close => actions.map(action => <SubscriberMenuLink key={action} href={controls.actionHref(action)} prefetch={false} scroll={false}
          onClick={event => { close(); onAccountClick?.(event); }}>{subscriberActionLabel(action, account.status === "blocked")}</SubscriberMenuLink>)}
      </SubscriberActionMenu>
    </ManageableRow>;
  }
  return href ? <Row {...attributes} as={Link} href={href} prefetch={false} scroll={false} onClick={event => onAccountClick?.(event)} aria-current={selected ? "page" : undefined}>{content}</Row>
    : <Row {...attributes} type="button" aria-current={selected ? "true" : undefined} onClick={onSelect}>{content}</Row>;
}

const Filters = styled.div`display: grid; min-inline-size: 0;`;
const FilterFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5) var(--gh-spacing-2); min-inline-size: 0;
`;
const Row = styled(RecordItem)`
  text-decoration: none;
  &[aria-current="page"] { background: ${({ theme }) => theme.color.brandSoft}; box-shadow: none; }
`;
const ManageableRow = styled.div`
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; min-inline-size: 0;
  gap: var(--gh-spacing-1); min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_5) var(--gh-spacing-2_5);
  &[data-current] { background: ${({ theme }) => theme.color.brandSoft}; }
`;
const RowCheck = styled.label`
  display: grid; place-items: center; min-inline-size: var(--gh-size-8); min-block-size: var(--form-control-height); cursor: pointer;
  > input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); margin: 0; accent-color: ${({ theme }) => theme.color.link}; }
`;
const OpenAccount = styled(ButtonLink)`
  && { min-inline-size: 0; padding-inline: var(--gh-spacing-1_5); }
`;
