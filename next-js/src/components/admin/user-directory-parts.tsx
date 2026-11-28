"use client";

import { useId, useState, type ReactNode } from "react";
import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { authCopy } from "@/i18n/messages/auth";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { GlobeIcon, MoreIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { userActionLabel, type UserIndividualAction } from "@/domain/user-actions";
import { formatPhone, type MobileNetwork } from "@/domain/phone";
import type { UserAccess, UserDirectoryAccount, UserDirectoryQuery } from "@/domain/user-directory";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { formatCompactKampalaTimestamp, formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { Badge } from "./admin-form";
import { FloatingField } from "./floating-field";
import { RecordItem, RecordItemMeta, RecordItemTitle, RecordRowContent } from "./record-workspace";
import { UserActionMenu, UserMenuLink } from "./user-action-menu";
import { DirectoryCheckbox } from "./user-styles";

const statusLabels: Readonly<Record<string, string>> = { open: "Open", blocked: "Blocked", erased: "Erased" };
const accessLabels = { active: "Active access", queued: "Queued access", none: "No current access" } as const;
export type UserReviewAccount = UserDirectoryAccount & {
  access: UserAccess; planNames: readonly string[]; network: MobileNetwork | null;
};

export function UserDirectoryFilters({ query, plans, onQueryChange, trailingAction }: {
  query: UserDirectoryQuery; plans: readonly SubscriptionPlanView[]; onQueryChange: (query: UserDirectoryQuery) => void; trailingAction?: ReactNode;
}) {
  const dialogId = useId(), [open, setOpen] = useState(false), [draft, setDraft] = useState(query);
  const filterCount = Number(query.status !== "all") + Number(query.access !== "all") + Number(query.plan !== "all") + Number(query.recent !== "all");
  const names = [...new Set(plans.map(plan => plan.name))];
  if (query.plan !== "all" && query.plan !== "none" && !names.includes(query.plan)) names.push(query.plan);
  return <Filters data-user-review-filters data-user-search role="search" aria-label="Search and filter users">
    <SearchBar label="Search users" value={query.search} onChange={event => onQueryChange({ ...query, search: event.currentTarget.value })}
      placeholder="Phone, package, code or note" maxLength={120} autoComplete="off" trailingAction={trailingAction}
      filters={{ label: "Advanced filters", dialogId, open, count: filterCount, onOpen: () => { setDraft(query); setOpen(true); } }} />
    {open && <AdvancedFilterDialog id={dialogId} open onCancel={() => setOpen(false)} closeLabel="Close user filters"
      onApply={() => { onQueryChange({ ...draft, search: query.search }); setOpen(false); }}
      onReset={() => setDraft({ ...query, status: "all", access: "all", plan: "all", recent: "all" })}>
    <FilterFields>
    <FloatingField label="Account status"><select value={draft.status} onChange={event => setDraft({ ...draft, status: event.currentTarget.value as UserDirectoryQuery["status"] })}>
      <option value="all">All accounts</option><option value="open">Open</option><option value="blocked">Blocked</option><option value="erased">Erased</option></select></FloatingField>
    <FloatingField label="Access"><select value={draft.access} onChange={event => setDraft({ ...draft, access: event.currentTarget.value as UserDirectoryQuery["access"] })}>
      <option value="all">All access</option><option value="active">Active</option><option value="queued">Queued</option><option value="none">No current access</option></select></FloatingField>
    <FloatingField label="Package"><select value={draft.plan} onChange={event => setDraft({ ...draft, plan: event.currentTarget.value })}>
      <option value="all">All packages</option>{names.map(name => <option key={name} value={name}>{name}</option>)}<option value="none">No current package</option></select></FloatingField>
    <FloatingField label={authCopy.lastLogin}><select value={draft.recent} onChange={event => setDraft({ ...draft, recent: event.currentTarget.value as UserDirectoryQuery["recent"] })}>
      <option value="all">Any time</option><option value="1">Within 24 hours</option><option value="7">Within 7 days</option><option value="30">Within 30 days</option></select></FloatingField>
    </FilterFields></AdvancedFilterDialog>}
  </Filters>;
}

/** The identity link has its own space beside the bulk checkbox and account menu. */
export function UserAccountRow({ account, asOf, selected, href, checked, disabled, onCheck, actionHref, onAccountClick }: {
  account: UserDirectoryAccount; asOf: Date; selected: boolean; href: string; checked: boolean; disabled: boolean;
  onCheck: (checked: boolean) => void; actionHref: (action: UserIndividualAction) => string;
  onAccountClick: (event: React.MouseEvent<HTMLAnchorElement>, action?: UserIndividualAction) => void;
}) {
  const identity = account.phone ? `+${formatPhone(account.phone)}` : account.status === "erased"
    ? `Erased account ${account.id}` : `Account ${account.id}`;
  const menuAction = account.status === "erased" ? "delete" : "note";
  const signedIn = new Date(account.lastSignInAt || "");
  return <ManageableRow data-user-row={account.id} data-current={selected || undefined}>
    <RowCheck><DirectoryCheckbox type="checkbox" aria-label={`Select ${identity}`} checked={checked} disabled={disabled}
      onChange={event => onCheck(event.currentTarget.checked)} /></RowCheck>
    <Identity as={Link} href={href} prefetch={false} scroll={false} aria-current={selected ? "true" : undefined}
      data-user-open onClick={event => onAccountClick(event)}>
      <span>{identity}</span>
      <RowMetadata data-user-row-meta>
        <span>{account.access === "none" ? "No access" : accessLabels[account.access]}</span><span aria-hidden="true"> · </span>
        <span data-user-last-sign-in>{Number.isFinite(+signedIn) ? <>{authCopy.lastLogin} <time dateTime={account.lastSignInAt}>
          <span aria-hidden="true">{formatCompactKampalaTimestamp(signedIn, asOf)}</span>
          <VisuallyHidden>{formatSubscriptionExpiry(signedIn)}</VisuallyHidden>
        </time></> : authCopy.noLoginRecorded}</span>
      </RowMetadata>
    </Identity>
    <UserActionMenu label={`More actions for ${identity}`} icon={<MoreIcon strokeWidth={2.5} />} plain disabled={disabled}>
      {close => <UserMenuLink href={actionHref(menuAction)} prefetch={false} scroll={false}
        onClick={event => { close(); onAccountClick(event, menuAction); }}>{userActionLabel(menuAction)}</UserMenuLink>}
    </UserActionMenu>
  </ManageableRow>;
}

export function UserReviewAccountRow({ account, selected, onSelect }: {
  account: UserReviewAccount; selected: boolean; onSelect: () => void;
}) {
  const networkLabel = account.network === "mtn" ? "MTN network" : account.network === "airtel" ? "Airtel network" : "Network unknown";
  const content = <RecordRowContent
    icon={<span data-review-network role="img" aria-label={networkLabel} title={networkLabel}>{account.network ? <MobileMoneyLogo network={account.network} /> : <GlobeIcon />}</span>}
    primary={<><RecordItemTitle data-review-phone>{account.phone ? `+${formatPhone(account.phone)}` : "Erased account"}</RecordItemTitle>
      <Badge data-review-row-status data-user-status={account.status} $tone={account.status === "open" ? "good" : account.status === "blocked" ? "warning" : "muted"}>{statusLabels[account.status] ?? "Unknown"}</Badge></>}
    secondary={<span data-review-row-meta>{account.planNames.length ? account.planNames.join(", ") : accessLabels[account.access]} · <span data-user-last-sign-in>{authCopy.lastLogin} <time dateTime={account.lastSignInAt}>{formatPeriodEnd(new Date(account.lastSignInAt))}</time></span></span>} />;
  const attributes = { "data-review-user-row": account.id, "data-user-row": account.id };
  return <RecordItem {...attributes} type="button" aria-current={selected ? "true" : undefined} onClick={onSelect}>{content}</RecordItem>;
}

const Filters = styled.div`
  display: grid; min-inline-size: 0;
  [data-admin-toolbar] & > [data-search-bar] { flex-wrap: wrap; }
  [data-admin-toolbar] & > [data-search-bar] > [data-feed-search] { flex-basis: var(--gh-size-44); }
`;
const FilterFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5) var(--gh-spacing-2); min-inline-size: 0;
`;
const ManageableRow = styled.div`
  --directory-row-block-inset: var(--gh-spacing-1);
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; min-inline-size: 0;
  gap: var(--gh-spacing-1); min-block-size: var(--form-control-height); padding-inline: var(--directory-row-inset);
  &[data-current] { background: ${({ theme }) => theme.color.brandSoft}; }
`;
const Identity = styled(RecordItemTitle)`
  display: grid; align-content: start; align-self: stretch; gap: var(--gh-spacing-0_25);
  min-block-size: var(--form-control-height); padding-block: var(--directory-row-block-inset);
  color: ${({ theme }) => theme.color.text}; text-decoration: none; font-variant-numeric: tabular-nums;
  &:hover > :first-child { color: ${({ theme }) => theme.color.link}; text-decoration: underline; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
`;
const RowMetadata = styled(RecordItemMeta)`font-weight: var(--gh-weight-body); line-height: var(--gh-leading-label);`;
const RowCheck = styled.label`
  display: grid; place-items: start; align-self: stretch;
  min-inline-size: var(--gh-size-7); min-block-size: var(--form-control-height);
  padding-block: calc(var(--directory-row-block-inset) + var(--gh-spacing-1_5)) var(--directory-row-block-inset);
  padding-block-start: calc(var(--directory-row-block-inset) + (1lh - 1cap) / 2);
  cursor: pointer;
`;
