"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { SelectInput, TextInput } from "@/components/ui/controls";
import { CardIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, DownloadIcon, GiftIcon, LayersIcon, ResetIcon, SearchIcon,
  ShieldIcon, SlidersIcon, UserIcon } from "@/components/ui/icons";
import { auditActionLabel, auditActorLabel, auditCategories, auditCategory, auditCategoryLabel, auditCsv, auditDay, auditReference,
  auditTargetLabel, filterAuditRows, type AuditCategory, type AuditPeriod } from "@/domain/admin-audit";
import type { OwnerAuditRow } from "@/domain/owner-members";
import { publicPolicy } from "@/domain/public-policy";
import { DrawerNote, EmptyPanel, Panel, PanelBody, TextAction } from "./desk-styles";
import { RecordBody, RecordCard, RecordDetailHead, RecordFeedback, RecordFooter, RecordHead, RecordList, RecordListFooter, RecordScroll } from "./record-workspace";
import { AuditDay, AuditDetails, AuditEvent, AuditFeed, AuditLayout, AuditPager, AuditSummary, AuditTools, EventDetails, EventFacts, EventIcon, EventLink,
  EventText, EventTime, ExportButton, FilterBody, FilterDrawer, FilterToggle, HeadActions, SearchField } from "./audit-styles";

const pageSize = 20;
const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const categoryIcons = { security: ShieldIcon, accounts: UserIcon, payments: CardIcon, access: GiftIcon,
  plans: LayersIcon, settings: SlidersIcon, system: SlidersIcon, other: DocumentIcon };
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const validDate = (at: string) => Number.isFinite(Date.parse(at));
const timeLabel = (at: string) => validDate(at) ? timeFormat.format(new Date(at)) : "—";
const dateLabel = (at: string) => validDate(at) ? dateFormat.format(new Date(at)) : "Date unavailable";
/** Identifiers read as code and take the full row; worded references ("Admin dashboard") stay plain. */
const isCode = (value: string) => value.length > 12 && !/\s/u.test(value);

function eventLink(row: OwnerAuditRow): { href: string; label: string } | null {
  if (row.accountId && recordId.test(row.accountId)) return { href: `/admin/subscribers?accountId=${encodeURIComponent(row.accountId)}`, label: "View subscriber" };
  if (row.targetType === "settings") return { href: "/admin/settings", label: "Open settings" };
  if (row.targetType === "plan") return { href: "/admin/plans", label: "View plans" };
  if (row.targetType === "payment" && recordId.test(row.targetId)) return { href: `/admin/payments#${encodeURIComponent(row.targetId)}`, label: "View payment" };
  return null;
}

function Fact({ label, value }: { label: string; value: string }) {
  const code = isCode(value);
  return <div data-wide={code || undefined}><dt>{label}</dt><dd data-code={code || undefined}>{value}</dd></div>;
}

/**
 * A readable, bounded activity view. Exact-event filtering happens on the server before its newest-100 limit.
 * Each row names the event, who did it and what it touched; the day header and row time carry the date, so an opened
 * row adds only its category, references and the related page.
 */
export function AuditReport({ rows, actions, action }: { rows: readonly OwnerAuditRow[]; actions: readonly string[]; action: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [period, setPeriod] = useState<AuditPeriod>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, startNavigation] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const matches = useMemo(() => filterAuditRows(rows, { search, category, period }), [rows, search, category, period]);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = pageRows.find(row => row.id === selectedId) ?? pageRows[0];
  const selectedLink = selected ? eventLink(selected) : null;
  const groups = new Map<string, OwnerAuditRow[]>();
  for (const row of pageRows) { const day = auditDay(row.at); groups.set(day, [...(groups.get(day) ?? []), row]); }
  const filtered = search !== "" || category !== "" || period !== "all" || action !== "";
  const activeFilters = [category !== "", action !== "", period !== "all"].filter(Boolean).length;
  const eventOptions = [...actions].sort((a, b) => auditActionLabel(a).localeCompare(auditActionLabel(b)));

  function changeEvent(value: string) {
    setPageIndex(0); setExportStatus(null);
    startNavigation(() => router.push(`/admin/audit${value ? `?action=${encodeURIComponent(value)}` : ""}`, { scroll: false }));
  }
  function reset() {
    setSearch(""); setCategory(""); setPeriod("all"); setPageIndex(0); setExportStatus(null);
    if (action) changeEvent("");
  }
  function paginate(next: number) {
    setPageIndex(next);
    requestAnimationFrame(() => {
      const feed = document.getElementById("audit-results");
      feed?.focus({ preventScroll: true });
      if (window.matchMedia("(min-width: 64rem)").matches) { if (feed) feed.scrollTop = 0; }
      else feed?.scrollIntoView({ block: "start" });
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
  const exportButton = <ExportButton type="button" disabled={!matches.length || pending} onClick={download}
    data-audit-export title={`Export all ${matches.length} matching events from the loaded activity`}><DownloadIcon />Export CSV</ExportButton>;

  return <AuditLayout data-audit-report data-analytics-ignore>
    <RecordHead><h1>Audit log</h1><HeadActions>{exportButton}</HeadActions></RecordHead>
    {exportStatus && <RecordFeedback><Notice role="status">{exportStatus}</Notice></RecordFeedback>}
    <RecordList aria-label="Audit activity list">
      <AuditTools role="search" aria-label="Find audit activity">
        <SearchField>
          <TextInput id="audit-search" type="search" label="Search recent activity" placeholder="Event, person or reference" leading={<SearchIcon />}
            value={search} maxLength={160} autoComplete="off" onChange={event => { setSearch(event.target.value); setPageIndex(0); setExportStatus(null); }} />
        </SearchField>
        <FilterDrawer>
          <FilterToggle type="button" aria-expanded={filtersOpen} aria-controls="audit-filters" onClick={() => setFiltersOpen(open => !open)}>
            <SlidersIcon />Filters<DrawerNote>{activeFilters ? `${activeFilters} active` : "none active"}</DrawerNote><ChevronDownIcon />
          </FilterToggle>
          <FilterBody id="audit-filters" $open={filtersOpen}>
            <SelectInput id="audit-category" label="Category" value={category} onChange={event => { setCategory(event.target.value as AuditCategory | ""); setPageIndex(0); setExportStatus(null); }}>
              <option value="">All categories</option>{auditCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectInput>
            <SelectInput id="audit-action" label="Event" value={action} disabled={pending} onChange={event => changeEvent(event.target.value)}>
              <option value="">All events</option>{eventOptions.map(value => <option key={value} value={value}>{auditActionLabel(value)}</option>)}
            </SelectInput>
            <SelectInput id="audit-period" label="Date" value={period} onChange={event => { setPeriod(event.target.value as AuditPeriod); setPageIndex(0); setExportStatus(null); }}>
              <option value="all">Any date</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option>
            </SelectInput>
          </FilterBody>
        </FilterDrawer>
      </AuditTools>
      <AuditFeed as="section" id="audit-results" tabIndex={0} aria-label="Audit activity" aria-busy={pending}>
        {matches.length === 0 ? <EmptyPanel data-audit-empty><SearchIcon /><strong>{filtered ? "No matching activity" : "No activity yet"}</strong></EmptyPanel>
          : [...groups].map(([day, events]) => <Fragment key={day}>
            <AuditDay>{day ? dateLabel(`${day}T12:00:00+03:00`) : "Date unavailable"}</AuditDay>
            {events.map(row => {
              const kind = auditCategory(row.action), Icon = categoryIcons[kind], reference = auditReference(row), link = eventLink(row);
              return <AuditEvent key={row.id} data-audit-event={row.id}>
                <summary aria-current={selected?.id === row.id ? "true" : undefined} onClick={event => {
                  setSelectedId(row.id);
                  if (window.matchMedia("(min-width: 64rem)").matches) event.preventDefault();
                }}>
                  <EventIcon $category={kind}><Icon /></EventIcon>
                  <EventText><strong>{auditActionLabel(row.action)}</strong><span>{auditActorLabel(row.actor)} · {auditTargetLabel(row.targetType)}</span></EventText>
                  <EventTime dateTime={row.at}>{timeLabel(row.at)}</EventTime><ChevronDownIcon />
                </summary>
                <EventDetails data-audit-inline-details>
                  <EventFacts>
                    <Fact label="Category" value={auditCategoryLabel(kind)} /><Fact label="Event reference" value={row.id} />
                    {reference && reference !== row.accountId && <Fact label="Record reference" value={reference} />}
                    {row.accountId && <Fact label="Subscriber reference" value={row.accountId} />}
                  </EventFacts>
                  {link && <EventLink href={link.href} variant="secondary" prefetch={false}>{link.label}</EventLink>}
                </EventDetails>
              </AuditEvent>;
            })}
          </Fragment>)}
      </AuditFeed>
      <RecordListFooter>
        <AuditSummary>
          <div>
            <p aria-live="polite" data-audit-count>{pending ? "Loading activity…" : <b>{matches.length} {matches.length === 1 ? "event" : "events"}</b>}
              {!pending && matches.length > pageSize && ` · ${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, matches.length)} shown`}</p>
            {filtered && <TextAction type="button" disabled={pending} onClick={reset}><ResetIcon />Reset filters</TextAction>}
          </div>
          <p>Up to 100 recent {action ? "matching " : ""}events · EAT</p>
        </AuditSummary>
          {pageCount > 1 && <AuditPager aria-label="Audit pages">
            <TextAction type="button" disabled={currentPage === 0 || pending} onClick={() => paginate(currentPage - 1)}><ChevronLeftIcon />Previous</TextAction>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <TextAction type="button" disabled={currentPage === pageCount - 1 || pending} onClick={() => paginate(currentPage + 1)}>Next<ChevronRightIcon /></TextAction>
          </AuditPager>}
      </RecordListFooter>
    </RecordList>
    <AuditDetails aria-label="Selected audit event">
      <RecordCard key={selected?.id ?? "empty"} data-audit-detail={selected?.id}>
        <RecordScroll tabIndex={0} aria-label="Audit event details">
          {selected ? <>
            <RecordDetailHead><h2>{auditActionLabel(selected.action)}</h2><EventTime dateTime={selected.at}>{dateLabel(selected.at)} · {timeLabel(selected.at)} EAT</EventTime></RecordDetailHead>
            <RecordBody><Panel><PanelBody><EventFacts>
              <Fact label="Performed by" value={auditActorLabel(selected.actor)} />
              <Fact label="Record type" value={auditTargetLabel(selected.targetType)} />
              <Fact label="Category" value={auditCategoryLabel(auditCategory(selected.action))} />
              <Fact label="Event reference" value={selected.id} />
              {auditReference(selected) && auditReference(selected) !== selected.accountId && <Fact label="Record reference" value={auditReference(selected)} />}
              {selected.accountId && <Fact label="Subscriber reference" value={selected.accountId} />}
            </EventFacts></PanelBody></Panel></RecordBody>
          </> : <EmptyPanel><DocumentIcon /><strong>Select an audit event</strong><p>Choose another filter to find an event.</p></EmptyPanel>}
        </RecordScroll>
        {selectedLink && <RecordFooter><EventLink href={selectedLink.href} variant="secondary" prefetch={false}>{selectedLink.label}</EventLink></RecordFooter>}
      </RecordCard>
    </AuditDetails>
  </AuditLayout>;
}
