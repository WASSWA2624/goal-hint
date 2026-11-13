"use client";

import type { ComponentType } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { BellIcon, CalendarIcon, CardIcon, ChartIcon, ChevronRightIcon, ImageIcon, UserIcon, UserPlusIcon, type IconProps } from "@/components/ui/icons";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { formatUgx } from "@/domain/subscription-plans";
import type { OwnerOverview } from "@/domain/owner-members";
import type { FootballCoverage } from "@/domain/football-coverage";
import { media } from "@/styles/theme";

type Report = Readonly<{ value: OwnerOverview; noticeCount: number | null; uploadAlertsHref: string }>;
type Metric = Readonly<{
  label: string;
  value: string | number;
  icon: ComponentType<IconProps>;
  href?: string | undefined;
  attention?: boolean;
}>;

const numberFormat = new Intl.NumberFormat("en-UG");
const coverageCount = (count: number | null | undefined) => count === null || count === undefined ? "Unknown" : numberFormat.format(count);
const archivePhase = {
  fixtures: "Historical league seasons", replay: "Deferred fixture imports", details: "Historical match details",
  "half-statistics": "Half statistics pages", "team-statistics": "Team statistics pages",
  "player-statistics": "Player statistics pages", "odds-mapping": "Odds mapping pages",
} as const;
const archiveStatus = {
  running: "Running", "waiting-quota": "Waiting on quota", retrying: "Retrying", "caught-up": "Finished",
  pending: "Pending", unavailable: "Unavailable", unreported: "No worker report yet",
} as const;

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

  return <OverviewMetrics label="Admin overview" metrics={metrics} />;
}

export function FootballCoverageReport({ report }: { report: FootballCoverage }) {
  const { fixtures, archive, odds } = report;
  const oddsSummary = (isPrice: boolean) => {
    if (odds === null) return "Unavailable";
    const batches = odds.filter(({ kind }) => (kind === "prices") === isPrice);
    if (!batches.length) return "No recent imports";
    const complete = batches.reduce((total, batch) => total + (batch.status === "complete" ? batch.batches : 0), 0);
    const incomplete = batches.reduce((total, batch) => total + (batch.status === "complete" ? 0 : batch.batches), 0);
    return `${coverageCount(complete)} complete · ${coverageCount(incomplete)} incomplete`;
  };
  return <OverviewMetrics label="Football coverage" metrics={[
    { label: `Latest provider fixture receipt (${fixtures.date})`, icon: CalendarIcon,
      value: fixtures.receipt ? `${coverageCount(fixtures.receipt.receivedCount)} returned · ${coverageCount(fixtures.receipt.importedCount)} imported · ${coverageCount(fixtures.receipt.rejectedCount)} rejected (${fixtures.receipt.status})`
        : fixtures.attemptFailed ? "Import failed" : "No receipt" },
    { label: "Today's fixtures", icon: CalendarIcon,
      value: `${coverageCount(fixtures.stored)} stored · ${coverageCount(fixtures.publicScope)} in public scope · ${coverageCount(fixtures.published)} published` },
    { label: "Odds catalogs in the last 24 hours", icon: ChartIcon, value: oddsSummary(false) },
    { label: "Odds price batches in the last 24 hours", icon: ChartIcon, value: oddsSummary(true) },
    ...archive.map(({ phase, status, coverage }) => ({ label: archivePhase[phase], icon: ChartIcon,
      value: `${archiveStatus[status]} · ${coverageCount(coverage?.imported)} imported · ${coverageCount(coverage?.remaining)} remaining · ${coverageCount(coverage?.unavailable)} unavailable`,
    })),
  ]} compact />;
}

function OverviewMetrics({ label, metrics, compact = false }: { label: string; metrics: readonly Metric[]; compact?: boolean }) {
  return <MetricGrid aria-label={label}>
    {metrics.map(({ label, value, icon: Icon, href, attention }) => (
      <MetricCard key={label} $attention={attention ?? false} $compact={compact}>
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

const MetricCard = styled.div<{ $attention: boolean; $compact: boolean }>`
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
    font-size: ${({ $compact }) => $compact ? "var(--gh-font-secondary)" : "var(--gh-font-heading)"};
    font-weight: ${({ $compact }) => $compact ? "var(--gh-weight-bold)" : "var(--gh-weight-heavy)"};
    font-variant-numeric: tabular-nums;
    line-height: ${({ $compact }) => $compact ? "var(--gh-leading-body)" : "var(--gh-leading-heading)"};
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
