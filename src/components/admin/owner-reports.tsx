"use client";
import { useRouter } from "next/navigation";
import { Muted, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import { formatUgx } from "@/domain/subscription-plans";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerAuditRow, OwnerOverview } from "@/domain/owner-members";
import { FieldBlock, FieldRow } from "./admin-form";
export function OverviewReport({ value: v }: { value: OwnerOverview }) {
  return <><FieldRow>{[["Pending payments",v.pending],["Active paid subscribers",v.active],["Revenue this EAT week",formatUgx(v.weekRevenue)],["Revenue this EAT month",formatUgx(v.monthRevenue)],["Trials sent this week",v.trials],["Upload busy alerts this week",v.busy]].map(([label,value]) => <Panel key={label}><PanelHeader><h2>{label}</h2></PanelHeader><strong>{value}</strong></Panel>)}</FieldRow><Panel><p>Payment numbers last changed {v.paymentNumbersChangedAt ? formatPeriodEnd(new Date(v.paymentNumbersChangedAt)) : "—"}</p><Muted>Revenue includes received approved payments and manual amounts; reversed payments are excluded. Trials do not count as paid subscribers.</Muted></Panel></>;
}
export function AuditReport({ rows, actions, action }: { rows: readonly OwnerAuditRow[]; actions: readonly string[]; action: string }) {
  const router = useRouter();
  return <div data-analytics-ignore><Panel><FieldBlock>Action<select value={action} onChange={e => { router.push(`/admin/audit${e.target.value ? `?action=${encodeURIComponent(e.target.value)}` : ""}`); }}><option value="">All actions</option>{actions.map(a => <option key={a}>{a}</option>)}</select></FieldBlock></Panel>{rows.length === 0 && <Muted>No audit rows match.</Muted>}{rows.map(r => <Panel key={r.id}><PanelHeader><h2>{r.action}</h2><p>{formatPeriodEnd(new Date(r.at))} · {r.actor}</p></PanelHeader><p>{r.targetType} · {r.targetId}</p>{r.accountId && <a href={`/admin/subscribers?accountId=${r.accountId}`}>Subscriber</a>}</Panel>)}</div>;
}
