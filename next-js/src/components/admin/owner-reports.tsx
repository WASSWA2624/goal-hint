"use client";

import type { ComponentType } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { BellIcon, CalendarIcon, CardIcon, ChartIcon, ChevronRightIcon, ImageIcon, UserIcon, UserPlusIcon, type IconProps } from "@/components/ui/icons";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { formatUgx } from "@/domain/subscription-plans";
import type { OwnerOverview } from "@/domain/owner-members";
import { media } from "@/styles/theme";

type Report = Readonly<{ value: OwnerOverview; noticeCount: number | null; uploadAlertsHref: string }>;
type Metric = Readonly<{
  label: string;
  value: string | number;
  icon: ComponentType<IconProps>;
  href?: string | undefined;
  attention?: boolean;
}>;

export function OverviewReport({ report }: { report: Report }) {
  const { value } = report;
  const metrics: Metric[] = [
    { label: "Pending payments", value: value.pending, icon: CardIcon, href: "/admin/payments", attention: !!value.pending },
    { label: "Upload alerts this week", value: value.busy, icon: ImageIcon, href: report.uploadAlertsHref, attention: !!value.busy },
    { label: "Active paid subscribers", value: value.active, icon: UserIcon },
    { label: "Revenue this week", value: formatUgx(value.weekRevenue), icon: ChartIcon },
    { label: "Revenue this month", value: formatUgx(value.monthRevenue), icon: CalendarIcon },
    { label: "Trials this week", value: value.trials, icon: UserPlusIcon },
    { label: "Credit held by members", value: formatUgx(value.creditHeld), icon: CardIcon },
    { label: "Message notices to check", value: report.noticeCount ?? "Unavailable", icon: BellIcon, attention: !!report.noticeCount },
  ];
  if (value.creditOwed > 0) {
    metrics.push({ label: "Credit owed after reversals", value: formatUgx(value.creditOwed), icon: CardIcon, attention: true });
  }

  return <MetricGrid aria-label="Admin overview">
    {metrics.map(({ label, value, icon: Icon, href, attention }) => (
      <MetricCard key={label} $attention={attention ?? false}>
        <dt>
          <MetricIcon><Icon /></MetricIcon>
          {href ? <MetricLink href={href} prefetch={false}>{label}<ChevronRightIcon /></MetricLink> : label}
        </dt>
        <dd>{value}</dd>
      </MetricCard>
    ))}
  </MetricGrid>;
}

export function OverviewLoading() {
  return <AppLoading />;
}

const MetricGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gh-spacing-2);
  margin: 0;

  ${media.tablet} {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gh-spacing-3);
  }
`;

const MetricIcon = styled.span`
  display: grid;
  place-items: center;
  inline-size: var(--gh-size-8);
  block-size: var(--gh-size-8);
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-title);
`;

const MetricLink = styled(Link)`
  color: inherit;
  text-decoration: none;
  cursor: pointer;

  &::after {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    content: "";
  }

  > svg {
    position: absolute;
    inset-block-start: var(--gh-spacing-5);
    inset-inline-end: var(--gh-spacing-3);
    color: ${({ theme }) => theme.color.link};
    font-size: var(--gh-font-section);
  }

  &:focus-visible { outline: none; }
`;

const MetricCard = styled.div<{ $attention: boolean }>`
  position: relative;
  display: grid;
  grid-template-rows: 1fr auto;
  align-content: start;
  gap: var(--gh-spacing-1);
  min-inline-size: 0;
  padding: var(--gh-spacing-3) var(--gh-spacing-3) var(--gh-spacing-3_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.section};
  cursor: default;
  transition: background-color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing};

  dt {
    display: grid;
    justify-items: start;
    gap: var(--gh-spacing-2_5);
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary);
    font-weight: var(--gh-weight-bold);
  }

  dd {
    margin: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: var(--gh-font-heading);
    font-weight: var(--gh-weight-heavy);
    font-variant-numeric: tabular-nums;
    line-height: var(--gh-leading-heading);
    overflow-wrap: anywhere;
  }

  ${MetricIcon} {
    background: ${({ theme, $attention }) => $attention ? theme.color.outcome.pending.background : theme.color.brandSoft};
    color: ${({ theme, $attention }) => $attention ? theme.color.outcome.pending.text : theme.color.link};
  }

  &:has(${MetricLink}) { cursor: pointer; }
  &:has(${MetricLink}:focus-visible) {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * var(--gh-stroke-strong));
  }

  ${media.hover} {
    &:not([aria-hidden]):hover { background: ${({ theme }) => theme.color.cardHeader}; }
    &:has(${MetricLink}):hover, &:has(${MetricLink}:focus-visible) {
      background: ${({ theme }) => theme.color.rowHover};
    }
  }

  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
