"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { ButtonLink, SelectInput, TextInput } from "@/components/ui/controls";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, GiftIcon, ResetIcon, SearchIcon, ShieldIcon, SlidersIcon, UserIcon } from "@/components/ui/icons";
import { auditActionLabel, auditActorLabel, auditCategories, auditCategory, auditCategoryLabel, auditCsv, auditDay, auditReference,
  auditTargetLabel, filterAuditRows, type AuditCategory, type AuditPeriod } from "@/domain/admin-audit";
import type { OwnerAuditRow } from "@/domain/owner-members";
import { publicPolicy } from "@/domain/public-policy";
import { ActionButton } from "./admin-form";
import { AuditDay, AuditEmpty, AuditEvent, AuditFacts, AuditFeed, AuditFilters, AuditLayout, AuditPagination, AuditSearchRow, AuditSummary,
  AuditToolbar, EventDetails, EventIcon, EventMain, EventWhen } from "./audit-styles";

const pageSize = 20;
const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const categoryIcons = { security: ShieldIcon, accounts: UserIcon, payments: DocumentIcon, access: GiftIcon,
  plans: DocumentIcon, settings: SlidersIcon, system: SlidersIcon, other: DocumentIcon };
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const validDate = (at: string) => Number.isFinite(Date.parse(at));
const timeLabel = (at: string) => validDate(at) ? timeFormat.format(new Date(at)) : "—";
const dateLabel = (at: string) => validDate(at) ? dateFormat.format(new Date(at)) : "Date unavailable";

function eventLink(row: OwnerAuditRow): { href: string; label: string } | null {
  if (row.accountId && recordId.test(row.accountId)) return { href: `/admin/subscribers?accountId=${encodeURIComponent(row.accountId)}`, label: "View subscriber" };
  if (row.targetType === "settings") return { href: "/admin/settings", label: "Open settings" };
  if (row.targetType === "plan") return { href: "/admin/plans", label: "View plans" };
  if (row.targetType === "payment" && recordId.test(row.targetId)) return { href: `/admin/payments#${encodeURIComponent(row.targetId)}`, label: "View payment" };
  return null;
}

/** A readable, bounded activity view. Exact-event filtering happens on the server before its newest-100 limit. */
export function AuditReport({ rows, actions, action }: { rows: readonly OwnerAuditRow[]; actions: readonly string[]; action: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [period, setPeriod] = useState<AuditPeriod>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [pending, startNavigation] = useTransition();
  const matches = useMemo(() => filterAuditRows(rows, { search, category, period }), [rows, search, category, period]);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const groups = new Map<string, OwnerAuditRow[]>();
  for (const row of pageRows) { const day = auditDay(row.at); groups.set(day, [...(groups.get(day) ?? []), row]); }
  const filtered = search !== "" || category !== "" || period !== "all" || action !== "";
  const eventOptions = [...actions].sort((a, b) => auditActionLabel(a).localeCompare(auditActionLabel(b)));

  function changeEvent(value: string) {
    setPageIndex(0); setExportStatus(null);
    startNavigation(() => router.push(`/admin/audit${value ? `?action=${encodeURIComponent(value)}` : ""}`));
  }
  function reset() {
    setSearch(""); setCategory(""); setPeriod("all"); setPageIndex(0); setExportStatus(null);
    if (action) changeEvent("");
  }
  function paginate(next: number) {
    setPageIndex(next);
    requestAnimationFrame(() => {
      const feed = document.getElementById("audit-results");
      feed?.focus({ preventScroll: true }); feed?.scrollIntoView({ block: "start" });
    });
  }
  function download() {
    if (!matches.length || pending) return;
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([auditCsv(matches)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = `goal-hint-audit-${auditDay(new Date().toISOString())}.csv`;
      document.body.append(link); link.click(); link.remove();
      setExportStatus(`Exported ${matches.length} ${matches.length === 1 ? "event" : "events"}.`);
    } catch { setExportStatus("Export unavailable. Try again."); }
    finally { if (url) { const savedUrl = url; setTimeout(() => URL.revokeObjectURL(savedUrl), 1_000); } }
  }

  return <AuditLayout data-audit-report data-analytics-ignore>
    <AuditToolbar aria-label="Find audit activity">
      <AuditSearchRow>
        <TextInput id="audit-search" type="search" label="Search recent activity" placeholder="Event, person or reference" leading={<SearchIcon />}
          value={search} maxLength={160} autoComplete="off" onChange={event => { setSearch(event.target.value); setPageIndex(0); setExportStatus(null); }} />
        <ActionButton type="button" disabled={!matches.length || pending} onClick={download} data-audit-export
          title={`Export all ${matches.length} matching events from the loaded activity`}><DocumentIcon />Export CSV</ActionButton>
      </AuditSearchRow>
      <AuditFilters>
        <SelectInput id="audit-category" label="Category" value={category} onChange={event => { setCategory(event.target.value as AuditCategory | ""); setPageIndex(0); setExportStatus(null); }}>
          <option value="">All categories</option>{auditCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </SelectInput>
        <SelectInput id="audit-action" label="Event" value={action} disabled={pending} onChange={event => changeEvent(event.target.value)}>
          <option value="">All events</option>{eventOptions.map(value => <option key={value} value={value}>{auditActionLabel(value)}</option>)}
        </SelectInput>
        <SelectInput id="audit-period" label="Date" value={period} onChange={event => { setPeriod(event.target.value as AuditPeriod); setPageIndex(0); setExportStatus(null); }}>
          <option value="all">Any date</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option>
        </SelectInput>
      </AuditFilters>
    </AuditToolbar>
    <AuditSummary>
      <p aria-live="polite" data-audit-count>{pending ? "Loading activity…" : `${matches.length} ${matches.length === 1 ? "event" : "events"}`}
        {matches.length > pageSize && ` · ${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, matches.length)} shown`}</p>
      {filtered && <ActionButton type="button" disabled={pending} onClick={reset}><ResetIcon />Reset filters</ActionButton>}
      <p>Up to 100 recent {action ? "matching " : ""}events · EAT</p>
    </AuditSummary>
    {exportStatus && <Notice role="status">{exportStatus}</Notice>}
    <AuditFeed id="audit-results" tabIndex={-1} aria-label="Audit activity" aria-busy={pending}>
      {matches.length === 0 ? <AuditEmpty data-audit-empty><SearchIcon /><p>{filtered ? "No matching activity" : "No activity yet"}</p></AuditEmpty>
        : [...groups].map(([day, events]) => <Fragment key={day}>
          <AuditDay>{day ? dateLabel(`${day}T12:00:00+03:00`) : "Date unavailable"}</AuditDay>
          {events.map(row => {
            const kind = auditCategory(row.action), Icon = categoryIcons[kind], reference = auditReference(row), link = eventLink(row);
            return <AuditEvent key={row.id} data-audit-event={row.id}>
              <summary><EventMain><EventIcon $category={kind}><Icon /></EventIcon><div><strong>{auditActionLabel(row.action)}</strong>
                <span>{auditActorLabel(row.actor)} · {auditTargetLabel(row.targetType)}</span></div></EventMain>
                <EventWhen><time dateTime={row.at}>{timeLabel(row.at)}</time><ChevronDownIcon /></EventWhen>
              </summary>
              <EventDetails><AuditFacts>
                <div><dt>Date & time</dt><dd>{dateLabel(row.at)} · {timeLabel(row.at)} EAT</dd></div>
                <div><dt>Performed by</dt><dd>{auditActorLabel(row.actor)}</dd></div>
                <div><dt>Category</dt><dd>{auditCategoryLabel(kind)}</dd></div>
                <div><dt>Related item</dt><dd>{auditTargetLabel(row.targetType)}</dd></div>
                {reference && <div><dt>Record reference</dt><dd>{reference}</dd></div>}
                {row.accountId && <div><dt>Subscriber reference</dt><dd>{row.accountId}</dd></div>}
                <div><dt>Event reference</dt><dd>{row.id}</dd></div>
              </AuditFacts>{link && <div><ButtonLink href={link.href} variant="secondary" prefetch={false}>{link.label}</ButtonLink></div>}</EventDetails>
            </AuditEvent>;
          })}
        </Fragment>)}
    </AuditFeed>
    {pageCount > 1 && <AuditPagination aria-label="Audit pages">
      <ActionButton type="button" disabled={currentPage === 0 || pending} onClick={() => paginate(currentPage - 1)}><ChevronLeftIcon />Previous</ActionButton>
      <span>Page {currentPage + 1} of {pageCount}</span>
      <ActionButton type="button" disabled={currentPage === pageCount - 1 || pending} onClick={() => paginate(currentPage + 1)}>Next<ChevronRightIcon /></ActionButton>
    </AuditPagination>}
  </AuditLayout>;
}
