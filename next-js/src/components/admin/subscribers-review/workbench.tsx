"use client";

import { useId, useState } from "react";
import styled from "styled-components";
import { ChevronLeftIcon, UserPlusIcon } from "@/components/ui/icons";
import { localUgandaPhone } from "@/domain/phone";
import type { SubscriberDirectoryQuery, SubscriberDirectoryAccount } from "@/domain/subscriber-directory";
import { media } from "@/styles/theme";
import { ActionButton } from "../admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "../code-tools";
import { TextAction } from "../desk-styles";
import { SubscriberAccountRow, SubscriberDirectoryFilters } from "../subscriber-directory-parts";
import { RecordCard, RecordDetails, RecordEmpty, RecordFeedback, RecordHead,
  RecordList, RecordListFooter, RecordListScroll, RecordListTools, RecordWorkspace } from "../record-workspace";
import { SubscriberDetail } from "../subscriber-detail";
import { SubscriberReviewDialog } from "../subscriber-review-dialog";
import { reviewNow, samplePlans, type SubscriberReviewRecord, type useSubscriberDemo } from "./demo-state";

type Demo = ReturnType<typeof useSubscriberDemo>;
type Filters = Omit<SubscriberDirectoryQuery, "search">;
const emptyFilters: Filters = { status: "all", access: "all", plan: "all", recent: "all" };
const statusLabels: Readonly<Record<string, string>> = { open: "Open", blocked: "Blocked", erased: "Erased" };
const accessLabels = { active: "Active access", queued: "Queued access", none: "No current access" };

function accessFor(record: SubscriberReviewRecord) {
  return record.detail.codes.find(code => code.status === "active") ?? record.detail.codes.find(code => code.status === "queued");
}

function matches(record: SubscriberReviewRecord, search: string, filters: Filters) {
  const period = accessFor(record), access = period?.status ?? "none";
  if (filters.status !== "all" && record.status !== filters.status || filters.access !== "all" && access !== filters.access) return false;
  if (filters.plan !== "all" && (filters.plan === "none" ? !!period : period?.planName !== filters.plan)) return false;
  if (filters.recent !== "all" && reviewNow - new Date(record.lastSignInAt).getTime() > Number(filters.recent) * 86_400_000) return false;
  const text = [record.id, record.phone, record.phone ? localUgandaPhone(record.phone) : "", statusLabels[record.status], record.network ?? "Network unknown",
    accessLabels[access as keyof typeof accessLabels], period?.planName, record.detail.ownerNote,
    ...record.detail.codes.flatMap(code => [code.reference, code.planName]),
    ...record.detail.submissions.map(payment => payment.reference)].join(" ").toLowerCase();
  const phoneQuery = search.replace(/[\s+().-]/gu, "");
  if (/^\d+$/u.test(phoneQuery) && (record.phone?.includes(phoneQuery) || record.phone && localUgandaPhone(record.phone).includes(phoneQuery))) return true;
  return search.trim().toLowerCase().split(/\s+/u).every(word => text.includes(word));
}

export function SubscriberReviewWorkbench({ variant, demo }: { variant: string; demo: Demo }) {
  const id = useId(), action = useCodeAction(undefined, { request: demo.request, localOnly: true });
  const [selectedId, setSelectedId] = useState(demo.subscribers[0]?.id ?? "");
  const [search, setSearch] = useState(""), [filters, setFilters] = useState<Filters>(emptyFilters);
  const [mobileDetail, setMobileDetail] = useState(false), [adding, setAdding] = useState(false);
  const listed = demo.subscribers.filter(record => matches(record, search, filters));
  const selected = listed.find(record => record.id === selectedId) ?? listed[0];
  const filtered = !!search || Object.values(filters).some(value => value !== "all");
  const formId = `${id}-add-subscriber`;
  function select(record: SubscriberReviewRecord) { action.clearFeedback(); setSelectedId(record.id); setMobileDetail(true); }

  return <ReviewWorkspace data-subscriber-review-workspace data-subscriber-design={variant} $selected={mobileDetail} data-analytics-ignore>
    <RecordHead><h1>Subscribers</h1><ActionButton type="button" onClick={() => { action.clearFeedback(); setAdding(true); }}><UserPlusIcon />Grant access / add subscriber</ActionButton></RecordHead>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <RecordList data-review-directory aria-label="Subscriber directory">
      <RecordListTools><SubscriberDirectoryFilters query={{ ...filters, search }} plans={samplePlans} onQueryChange={({ search: nextSearch, ...nextFilters }) => { setSearch(nextSearch); setFilters(nextFilters); }} /></RecordListTools>
      <RecordListScroll aria-label="Subscribers" data-review-subscriber-list tabIndex={0}>
        {listed.length ? listed.map(record => {
          const period = accessFor(record);
          const account: SubscriberDirectoryAccount = { ...record, access: period?.status === "active" ? "active" : period?.status === "queued" ? "queued" : "none", planNames: period ? [period.planName] : [] };
          return <li key={record.id}><SubscriberAccountRow account={account} selected={selected?.id === record.id} onSelect={() => select(record)} /></li>;
        }) : <li><RecordEmpty><h2>No matching subscribers</h2><p>Try another search or clear the filters.</p></RecordEmpty></li>}
      </RecordListScroll>
      <RecordListFooter><span role="status" aria-live="polite">{listed.length} of {demo.subscribers.length} subscribers</span>{filtered && <TextAction type="button" onClick={() => { setSearch(""); setFilters(emptyFilters); }}>Clear filters</TextAction>}</RecordListFooter>
    </RecordList>
    <RecordDetails data-review-account aria-label="Selected subscriber">
      {selected ? <SubscriberDetail key={selected.id} account={selected.detail} plans={samplePlans} action={action} presentation="compact-dialog" network={selected.network}
        onDeleted={() => setSelectedId(demo.subscribers.find(record => record.id !== selected.id)?.id ?? "")}
        back={<MobileBack type="button" onClick={() => setMobileDetail(false)}><ChevronLeftIcon />Subscribers</MobileBack>} />
        : <RecordCard><RecordEmpty><h2>Select a subscriber</h2><p>Choose an account to see details and actions.</p></RecordEmpty></RecordCard>}
    </RecordDetails>
    <SubscriberReviewDialog open={adding} title="Grant access / add subscriber" onClose={() => { if (!action.busy) setAdding(false); }} busy={action.busy}
      footer={<><ActionButton type="button" disabled={action.busy} onClick={() => setAdding(false)}>Cancel</ActionButton><ActionButton type="submit" form={formId} $variant="primary" disabled={action.busy}>Grant access</ActionButton></>}>
      {action.message && <ActionNotices action={action} />}<ManualCodeForm plans={samplePlans} action={action} formId={formId} externalActions compact onSaved={() => setAdding(false)} />
    </SubscriberReviewDialog>
  </ReviewWorkspace>;
}

const ReviewWorkspace = styled(RecordWorkspace)<{ $selected: boolean }>`
  ${RecordHead} > h1 { position: static; inline-size: auto; block-size: auto; margin: 0; padding: 0; overflow: visible; clip: auto; clip-path: none; white-space: normal; }
  ${RecordHead} > button { margin-inline-start: auto; }
  ${media.belowDesktop} {
    > [data-review-directory] { display: ${({ $selected }) => $selected ? "none" : "grid"}; }
    > [data-review-account] { display: ${({ $selected }) => $selected ? "grid" : "none"}; }
  }
`;
const MobileBack = styled(ActionButton)`justify-self: start; ${media.desktop} { display: none; }`;
