"use client";

import styled from "styled-components";
import { BellIcon, CalendarIcon, CardIcon, ChartIcon, ImageIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { formatUgx } from "@/domain/subscription-plans";
import type { OwnerOverview } from "@/domain/owner-members";
import { media } from "@/styles/theme";

export function OverviewReport({ value, noticeCount }: { value: OwnerOverview; noticeCount: number | null }) {
  const metrics = [
    { label: "Pending payments", value: value.pending, icon: CardIcon, attention: value.pending > 0 },
    { label: "Active paid subscribers", value: value.active, icon: UserIcon },
    { label: "Revenue this week", value: formatUgx(value.weekRevenue), icon: ChartIcon },
    { label: "Revenue this month", value: formatUgx(value.monthRevenue), icon: CalendarIcon },
    { label: "Trials this week", value: value.trials, icon: UserPlusIcon },
    { label: "Upload alerts this week", value: value.busy, icon: ImageIcon, attention: value.busy > 0 },
    { label: "Credit held by members", value: formatUgx(value.creditHeld), icon: CardIcon },
    { label: "Message notices to check", value: noticeCount ?? "Unavailable", icon: BellIcon, attention: !!noticeCount },
    ...(value.creditOwed > 0 ? [{ label: "Credit owed after reversals", value: formatUgx(value.creditOwed), icon: CardIcon, attention: true }] : []),
  ];

  return <MetricGrid aria-label="Admin overview">
    {metrics.map(({ label, value, icon: Icon, attention }) => (
      <MetricCard key={label} $attention={attention ?? false}>
        <dt><Icon />{label}</dt>
        <dd>{value}</dd>
      </MetricCard>
    ))}
  </MetricGrid>;
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

const MetricCard = styled.div<{ $attention: boolean }>`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  padding: var(--gh-spacing-3);
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface};

  dt {
    display: grid;
    justify-items: start;
    gap: var(--gh-spacing-2);
    color: ${({ theme }) => theme.color.mutedText};
    font-size: var(--gh-font-secondary);
    font-weight: var(--gh-weight-bold);
  }

  svg {
    box-sizing: content-box;
    padding: var(--gh-spacing-1_5);
    border-radius: ${({ theme }) => theme.radius.control};
    background: ${({ theme, $attention }) => $attention ? theme.color.outcome.pending.background : theme.color.brandSoft};
    color: ${({ theme, $attention }) => $attention ? theme.color.outcome.pending.text : theme.color.link};
    font-size: var(--gh-font-title);
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
`;
