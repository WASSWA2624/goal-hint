"use client";

import { DateTimeField } from "@/components/ui/date-time-field";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { CardIcon, DocumentIcon, DownloadIcon, GiftIcon, LayersIcon, SearchIcon,
  ShieldIcon, SlidersIcon, UserIcon } from "@/components/ui/icons";
import { auditActionLabel, auditActorLabel, auditCategories, auditCategory, auditCategoryLabel, auditCsv, auditDateBounds, auditDay, auditPeriods, auditReference,
  auditTargetLabel, filterAuditRows, type AuditCategory, type AuditPeriod } from "@/domain/admin-audit";
import type { OwnerAuditRow } from "@/domain/owner-members";
import { publicPolicy } from "@/domain/public-policy";
import { auditEventLink } from "@/domain/admin-audit-links";
import { createMessages } from "@/i18n/messages";
import { FloatingField } from "./floating-field";
import { EmptyPanel, TextAction } from "./desk-styles";
import { RecordBack, RecordBody, RecordCard, RecordDetailHead, RecordDetails, RecordFeedback, RecordFooter, RecordItem, RecordList,
  RecordListFooter, RecordItemTitle, RecordRowContent, RecordScroll, RecordWorkspace, useRecordView } from "./record-workspace";
import { AuditDay, AuditEvents, AuditFeed, AuditSummary, EventFacts, EventIcon, EventLink,
  EventTime, FilterBody } from "./audit-styles";
import { RecordToolbar } from "./record-toolbar";

const pageSize = 20;
const paginationLabels = numberedPaginationLabels(createMessages("en"), "Audit pages");
const categoryIcons = { security: ShieldIcon, accounts: UserIcon, payments: CardIcon, access: GiftIcon,
  plans: LayersIcon, settings: SlidersIcon, system: SlidersIcon, other: DocumentIcon };
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const validDate = (at: string) => Number.isFinite(Date.parse(at));
const timeLabel = (at: string) => validDate(at) ? timeFormat.format(new Date(at)) : "—";
const dateLabel = (at: string) => validDate(at) ? dateFormat.format(new Date(at)) : "Date unavailable";
/** Identifiers read as code and take the full row; worded references ("Admin dashboard") stay plain. */
const isCode = (value: string) => value.length > 12 && !/\s/u.test(value);

function Fact({ label, value }: { label: string; value: string }) {
  const code = isCode(value);
  return <div data-wide={code || undefined}><dt>{label}</dt><dd data-code={code || undefined}>{value}</dd></div>;
}

/**
 * A readable, bounded activity view. Event and date filtering happen on the server before its newest-100 limit.
 * Each row names the event, actor and record type. The detail pane adds its full timestamp, references and related page.
 */
export function AuditReport({ rows, actions, action, period = "all", startDate = "", endDate = "" }: {
  rows: readonly OwnerAuditRow[]; actions: readonly string[]; action: string; period?: AuditPeriod; startDate?: string; endDate?: string;
}) {
  const router = useRouter();
  const { detailOpen, openDetail, closeDetail } = useRecordView();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const filtersId = useId();
  const [draft, setDraft] = useState({ category, action, period, startDate, endDate });
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, startNavigation] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const matches = useMemo(() => filterAuditRows(rows, { search, category }), [rows, search, category]);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = pageRows.find(row => row.id === selectedId) ?? pageRows[0];
  const selectedLink = selected ? auditEventLink(selected) : null;
  const selectedReference = selected ? auditReference(selected) : null;
  const groups = new Map<string, OwnerAuditRow[]>();
  for (const row of pageRows) { const day = auditDay(row.at); groups.set(day, [...(groups.get(day) ?? []), row]); }
  const filtered = search !== "" || category !== "" || period !== "all" || action !== "";
  const activeFilters = [category !== "", action !== "", period !== "all"].filter(Boolean).length;
  const eventOptions = [...actions].sort((a, b) => auditActionLabel(a).localeCompare(auditActionLabel(b)));

  function changeFilters(nextAction: string, nextPeriod: AuditPeriod, nextStart = "", nextEnd = "") {
    const params = new URLSearchParams();
    if (nextAction) params.set("action", nextAction);
    if (nextPeriod !== "all") params.set("period", nextPeriod);
    if (nextPeriod === "custom") { params.set("startDate", nextStart); params.set("endDate", nextEnd); }
    setPageIndex(0); setSelectedId(null); setExportStatus(null);
    startNavigation(() => router.push(`/admin/audit${params.size ? `?${params}` : ""}`, { scroll: false }));
  }
  function applyFilters() {
    if (draft.period === "custom") {
      try { auditDateBounds({ period: "custom", startDate: draft.startDate, endDate: draft.endDate }); }
      catch { setRangeError("Enter valid dates with the end date on or after the start date."); return; }
    }
    setCategory(draft.category); setPageIndex(0); setSelectedId(null); setExportStatus(null); setFiltersOpen(false);
    if (draft.action !== action || draft.period !== period || draft.startDate !== startDate || draft.endDate !== endDate)
      changeFilters(draft.action, draft.period, draft.startDate, draft.endDate);
  }
  function paginate(next: number) {
    setPageIndex(next - 1);
    requestAnimationFrame(() => {
      const feed = document.getElementById("audit-results");
      feed?.focus({ preventScroll: true });
      feed?.scrollTo({ top: 0 });
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
  return <RecordWorkspace $compact $detailOpen={detailOpen} data-audit-report data-analytics-ignore>
    <RecordToolbar><h1>Audit</h1>
      <div role="search" aria-label="Find audit activity">
        <SearchBar id="audit-search" label="Search recent activity" value={search} maxLength={160} autoComplete="off" disabled={pending}
          onChange={event => { setSearch(event.target.value); setPageIndex(0); setExportStatus(null); }}
          filters={{ label: "Advanced filters", dialogId: filtersId, open: filtersOpen, count: activeFilters,
            onOpen: () => { setDraft({ category, action, period, startDate, endDate }); setRangeError(null); setFiltersOpen(true); } }}
          />
        {period === "custom" && <p data-audit-applied-range>{startDate} – {endDate} · EAT</p>}
        {filtersOpen && <AdvancedFilterDialog id={filtersId} open onCancel={() => setFiltersOpen(false)} closeLabel="Close audit filters"
          onApply={applyFilters}
          onReset={() => { setDraft({ category: "", action: "", period: "all", startDate: "", endDate: "" }); setRangeError(null); }}>
          <FilterBody>
            <FloatingField label="Category"><select id="audit-category" value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value as AuditCategory | "" }))}>
              <option value="">All categories</option>{auditCategories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></FloatingField>
            <FloatingField label="Event"><select id="audit-action" value={draft.action} onChange={event => setDraft(current => ({ ...current, action: event.target.value }))}>
              <option value="">All events</option>{eventOptions.map(value => <option key={value} value={value}>{auditActionLabel(value)}</option>)}
            </select></FloatingField>
            <FloatingField label="Date"><select id="audit-period" value={draft.period} onChange={event => setDraft(current => ({ ...current, period: event.target.value as AuditPeriod }))}>
              {auditPeriods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></FloatingField>
            {draft.period === "custom" && <>
              <DateTimeField label="Start date" id="audit-start-date" required value={draft.startDate} max={draft.endDate || undefined} onValueChange={startDate => setDraft(current => ({ ...current, startDate }))} />
              <DateTimeField label="End date" id="audit-end-date" required value={draft.endDate} min={draft.startDate || undefined} onValueChange={endDate => setDraft(current => ({ ...current, endDate }))} />
            </>}
            {rangeError && <p role="alert">{rangeError}</p>}
          </FilterBody>
        </AdvancedFilterDialog>}
      </div>
    </RecordToolbar>
    {exportStatus && <RecordFeedback><Notice role="status">{exportStatus}</Notice></RecordFeedback>}
    <RecordList aria-label="Audit activity list">
      <AuditFeed as="section" id="audit-results" tabIndex={0} aria-label="Audit activity" aria-busy={pending}>
        {matches.length === 0 ? <EmptyPanel data-audit-empty><SearchIcon /><strong>{filtered ? "No matching activity" : "No activity yet"}</strong></EmptyPanel>
          : [...groups].map(([day, events]) => <div key={day}>
            <AuditDay>{day ? dateLabel(`${day}T12:00:00+03:00`) : "Date unavailable"}</AuditDay>
            <AuditEvents>
              {events.map(row => {
                const kind = auditCategory(row.action), Icon = categoryIcons[kind];
                return <li key={row.id}>
                  <RecordItem type="button" data-audit-event={row.id} disabled={pending} aria-controls="audit-record-detail"
                    aria-current={selected?.id === row.id ? "true" : undefined} onClick={event => {
                      setSelectedId(row.id);
                      openDetail(event.currentTarget);
                    }}>
                    <RecordRowContent icon={<EventIcon $category={kind}><Icon /></EventIcon>}
                      primary={<><RecordItemTitle>{auditActionLabel(row.action)}</RecordItemTitle><EventTime dateTime={row.at}>{timeLabel(row.at)}</EventTime></>}
                      secondary={<>{auditActorLabel(row.actor)} · {auditTargetLabel(row.targetType)}</>} />
                  </RecordItem>
                </li>;
              })}
            </AuditEvents>
          </div>)}
      </AuditFeed>
      <RecordListFooter>
        <AuditSummary>
          <div>
            <b aria-live="polite" data-audit-count>{matches.length} {matches.length === 1 ? "event" : "events"}</b>
            <span>Up to 100 recent {action || period !== "all" ? "matching " : ""}events · EAT</span>
          </div>
          <TextAction type="button" disabled={!matches.length || pending} onClick={download} data-audit-export><DownloadIcon />Export CSV</TextAction>
        </AuditSummary>
        {pageCount > 1 && <NumberedPagination compact page={currentPage + 1} pages={pageCount} labels={paginationLabels} disabled={pending} onPage={paginate} />}
      </RecordListFooter>
    </RecordList>
    <RecordDetails id="audit-record-detail" aria-label="Selected audit event">
      <RecordBack onClick={closeDetail} disabled={pending}>Back to audit</RecordBack>
      <RecordCard key={selected?.id ?? "empty"} data-audit-detail={selected?.id}>
        <RecordScroll tabIndex={0} aria-label="Audit event details">
          {selected ? <>
            <RecordDetailHead><h2>{auditActionLabel(selected.action)}</h2><EventTime dateTime={selected.at}>{dateLabel(selected.at)} · {timeLabel(selected.at)} EAT</EventTime></RecordDetailHead>
            <RecordBody><EventFacts>
              <Fact label="Performed by" value={auditActorLabel(selected.actor)} />
              <Fact label="Record type" value={auditTargetLabel(selected.targetType)} />
              <Fact label="Category" value={auditCategoryLabel(auditCategory(selected.action))} />
              <Fact label="Event reference" value={selected.id} />
              {selectedReference && selectedReference !== selected.accountId && <Fact label="Record reference" value={selectedReference} />}
              {selected.accountId && <Fact label="Subscriber reference" value={selected.accountId} />}
            </EventFacts></RecordBody>
          </> : <EmptyPanel><DocumentIcon /><strong>Select an audit event</strong></EmptyPanel>}
        </RecordScroll>
        {selectedLink && <RecordFooter><EventLink href={selectedLink.href} variant="secondary" prefetch={false}>{selectedLink.label}</EventLink></RecordFooter>}
      </RecordCard>
    </RecordDetails>
  </RecordWorkspace>;
}
