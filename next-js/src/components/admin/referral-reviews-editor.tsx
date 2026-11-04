"use client";

import { SearchBar } from "@/components/ui/search-bar";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { randomId } from "@/components/ui/random-id";

import { useId, useRef, useState, type FormEvent } from "react";
import type { ReferralReviewCase, ReferralReviewGrant, ReferralReviewMutation } from "@/domain/referral-reviews";
import { referralReviewReasons, referralReviewRules, referralReviewStatuses } from "@/domain/referral-reviews";
import { referralReviewReasonLabel, referralReviewStatusLabel, referralReviewTime } from "@/domain/referral-review-labels";
import { formatPhone } from "@/domain/phone";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { ChevronDownIcon, GiftIcon, PlusIcon } from "@/components/ui/icons";
import { CheckField, FieldError, Hint, postAdmin, replyMessage, ActionButton, Badge } from "./admin-form";
import { Drawer, Panel, PanelBody, PanelHead, MetaLine } from "./desk-styles";
import { RecordWorkspace, RecordFeedback, RecordList, RecordListScroll, RecordListFooter, RecordBack, RecordEmpty, RecordItem,
  RecordItemTitle, RecordRowContent, RecordDetails, RecordCard, RecordScroll, RecordBody, RecordDetailHead, useRecordView } from "./record-workspace";
import { RecordFormDialog, RecordPrimaryAction, RecordToolbar } from "./record-toolbar";
import { ReviewFacts, ReviewField, ReviewForm, ReviewHistory, ReviewFooter } from "./referral-review-styles";

const endpoint = "/api/admin/referral-reviews";
const at = (value: string) => formatSubscriptionExpiry(new Date(value));
const policy = "Shared IPs, households, devices or low/no payments alone are insufficient. Uncertain cases retain their rewards.";
type Decision = "confirm" | "no-action" | "restore" | "uphold";
const decisionLabel: Record<Decision, string> = { confirm: "Remove unused reward", "no-action": "Retain reward", restore: "Restore reversed time", uphold: "Uphold decision" };

export function ReferralReviewsEditor({ initial }: { initial: readonly ReferralReviewCase[] | null }) {
  const id = useId(), lock = useRef(false), request = useRef(0);
  const { detailOpen, openDetail, closeDetail } = useRecordView();
  const list = useRef<HTMLOListElement>(null), details = useRef<HTMLDivElement>(null), createTrigger = useRef<HTMLElement>(null);
  const [source, setSource] = useState(initial), [cases, setCases] = useState(initial ?? []), [available, setAvailable] = useState(initial !== null);
  const [selectedId, setSelectedId] = useState(initial?.[0]?.id ?? ""), [status, setStatus] = useState("all");
  const [savedCase, setSavedCase] = useState<ReferralReviewCase | null>(null);
  const [before, setBefore] = useState(""), [caseSearch, setCaseSearch] = useState(""), [appliedSearch, setAppliedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false), [draftStatus, setDraftStatus] = useState("all");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [create, setCreate] = useState(false), [decision, setDecision] = useState<Decision | null>(null), [confirmed, setConfirmed] = useState(false);
  const [grants, setGrants] = useState<readonly ReferralReviewGrant[]>([]), [search, setSearch] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [draft, setDraft] = useState({ requestId: "", grantId: "", reason: referralReviewReasons[0], summary: "", evidenceRef: "" });
  if (source !== initial) {
    setSource(initial); setAvailable(initial !== null);
    if (!initial) { setCases([]); setSavedCase(null); }
    else if (status === "all" && !before && !appliedSearch) setCases(initial);
  }
  const selected = cases.find(item => item.id === selectedId) ?? (savedCase?.id === selectedId ? savedCase : undefined);
  const decisions: readonly Decision[] = selected?.status === "open" ? ["no-action", "confirm"]
    : selected?.status === "appealed" ? ["uphold", "restore"] : [];
  const older = cases.length === referralReviewRules.pageSize ? cases.at(-1) : undefined;
  async function readCases(nextStatus: string, cursor: string, search: string) {
    const reply = await postAdmin(endpoint, { action: "search-cases", status: nextStatus, before: cursor || undefined, search });
    if (!reply.ok || !Array.isArray(reply.body.cases)) throw new Error("Unable to load cases.");
    return reply.body.cases as ReferralReviewCase[];
  }
  async function reload(nextStatus = status, cursor = before, nextSearch = appliedSearch) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const results = await readCases(nextStatus, cursor, nextSearch);
      setCases(results); setAvailable(true); setNotice(""); setStatus(nextStatus); setBefore(cursor); setAppliedSearch(nextSearch);
      setSavedCase(null);
      if (!results.some(item => item.id === selectedId)) setSelectedId(results[0]?.id ?? "");
      list.current?.scrollTo({ top: 0 });
      details.current?.scrollTo({ top: 0 });
    } catch { setError("Unable to load cases. Try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function findGrants(value = search) {
    const version = ++request.current;
    setGrantLoading(true); setError("");
    const reply = await postAdmin(endpoint, { action: "grants", search: value });
    if (version !== request.current) return;
    setGrantLoading(false);
    if (!reply.ok) { setError(replyMessage(reply, "Unable to load earned grants.")); return; }
    setGrants(reply.body.grants as ReferralReviewGrant[]);
  }
  function openCreate(trigger: HTMLElement) {
    createTrigger.current = trigger;
    setError(""); setConfirmed(false); setGrants([]); setSearch("");
    setDraft({ requestId: randomId(), grantId: "", reason: referralReviewReasons[0], summary: "", evidenceRef: "" });
    setCreate(true); void findGrants("");
  }
  function close() { if (!busy) { request.current++; setGrantLoading(false); setCreate(false); setDecision(null); setError(""); } }
  async function mutate(input: ReferralReviewMutation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const reply = await postAdmin(endpoint, input);
      if (!reply.ok) { setError(replyMessage(reply, "Unable to save. Try again.")); return; }
      const updated = reply.body.case as ReferralReviewCase;
      setSavedCase(updated); setSelectedId(updated.id);
      // A changed status or newer timestamp can move this case out of the current results.
      // Keep the saved case available in the detail view while refreshing the original query.
      setCases(previous => {
        const remaining = previous.filter(item => item.id !== updated.id);
        const belongs = !before && (status === "all" || status === updated.status)
          && (previous.length !== remaining.length || !appliedSearch);
        return belongs ? [updated, ...remaining].slice(0, referralReviewRules.pageSize) : remaining;
      });
      setCreate(false); setDecision(null); setConfirmed(false); setAvailable(true); setNotice("Case saved.");
      try { setCases(await readCases(status, before, appliedSearch)); }
      catch { setNotice("Case saved. Search again to refresh the list."); }
      details.current?.scrollTo({ top: 0 });
      if (input.action === "create") openDetail(createTrigger.current);
      else requestAnimationFrame(() => details.current?.focus({ preventScroll: true }));
    } catch { setError("Unable to save. Retry this action."); }
    finally { lock.current = false; setBusy(false); }
  }
  function saveCreate(event: FormEvent) {
    event.preventDefault(); if (grantLoading || !confirmed || !draft.grantId) return;
    void mutate({ action: "create", ...draft, evidenceConfirmed: true });
  }
  function decide() {
    if (!selected || !decision) return;
    void mutate(decision === "confirm" || decision === "no-action"
      ? { action: "decide", id: selected.id, revision: selected.revision, decision, evidenceConfirmed: confirmed }
      : { action: "appeal-decision", id: selected.id, revision: selected.revision, decision, evidenceConfirmed: confirmed });
  }
  const needsEvidence = decision !== "no-action";
  return <RecordWorkspace $compact $detailOpen={detailOpen && !!selected} data-referral-reviews aria-busy={busy || grantLoading || undefined}>
    <RecordToolbar><h1>Referral review</h1>
      <form method="post" action={endpoint} role="search" aria-label="Find referral cases" onSubmit={event => { event.preventDefault(); void reload(status, "", caseSearch.trim()); }}>
        <SearchBar label="Find a case" value={caseSearch} maxLength={60} autoComplete="off" disabled={busy} submitLabel="Search"
          onChange={event => setCaseSearch(event.currentTarget.value)}
          filters={{ label: "Advanced filters", dialogId: `${id}-filters`, open: filtersOpen, count: Number(status !== "all"),
            onOpen: () => { setDraftStatus(status); setFiltersOpen(true); } }}
          trailingAction={<RecordPrimaryAction label="Add new case" icon={<PlusIcon />} disabled={busy} aria-haspopup="dialog" onClick={event => openCreate(event.currentTarget)} />} />
      </form>
      {filtersOpen && <AdvancedFilterDialog id={`${id}-filters`} open closeLabel="Close referral filters" onCancel={() => setFiltersOpen(false)}
        onReset={() => setDraftStatus("all")} onApply={() => { setFiltersOpen(false); void reload(draftStatus, ""); }}>
        <ReviewField label="Status"><select value={draftStatus} onChange={event => setDraftStatus(event.currentTarget.value)}>
          <option value="all">All cases</option>{referralReviewStatuses.map(value => <option key={value} value={value}>{referralReviewStatusLabel[value]}</option>)}
        </select></ReviewField>
      </AdvancedFilterDialog>}
    </RecordToolbar>
    {(notice || error && !create && !decision || !available) && <RecordFeedback>{notice && <p role="status">{notice}</p>}
      {error && !create && !decision && <FieldError role="alert">{error}</FieldError>}
      {!available && <FieldError role="status">Referral review is temporarily unavailable.</FieldError>}</RecordFeedback>}
    <RecordList aria-label="Referral case directory">
      <RecordListScroll ref={list} aria-label="Cases" tabIndex={0}>{cases.length ? cases.map(item => <li key={item.id}>
        <RecordItem type="button" disabled={busy} aria-current={selected?.id === item.id ? "true" : undefined} aria-controls={`${id}-detail`} data-referral-case={item.id}
          onClick={event => { setSavedCase(null); setSelectedId(item.id); openDetail(event.currentTarget); details.current?.scrollTo({ top: 0 }); }}>
          <RecordRowContent icon={<GiftIcon />} primary={<><RecordItemTitle>{item.reference}</RecordItemTitle><Badge $tone={caseTone(item.status)}>{referralReviewStatusLabel[item.status]}</Badge></>}
            secondary={<>{item.holderPhone ? `+${formatPhone(item.holderPhone)}` : "Erased account"} · <time dateTime={item.updatedAt}>{at(item.updatedAt)}</time></>} />
        </RecordItem></li>) : available && <li><RecordEmpty>{appliedSearch || status !== "all" ? "No matching cases" : "No cases"}</RecordEmpty></li>}
      </RecordListScroll>
      {(before || older) && <RecordListFooter>
        {before && <ActionButton type="button" disabled={busy} onClick={() => void reload(status, "")}>Latest</ActionButton>}
        {older && <ActionButton type="button" disabled={busy} onClick={() => void reload(status, `${older.updatedAt}_${older.id}`)}>Older</ActionButton>}
      </RecordListFooter>}</RecordList>
    <RecordDetails id={`${id}-detail`} aria-label="Selected case">
      <RecordBack onClick={closeDetail} disabled={busy}>Back to cases</RecordBack>
      <RecordCard>
        <RecordScroll ref={details} tabIndex={0} aria-label="Case details">{selected ? <>
          <RecordDetailHead>
            <h2>{selected.reference}</h2><Badge $tone={caseTone(selected.status)}>{referralReviewStatusLabel[selected.status]}</Badge>
          </RecordDetailHead>
          <RecordBody>
            <ReviewFacts>
              <div><dt>Affected account</dt><dd>{selected.holderPhone ? `+${formatPhone(selected.holderPhone)}` : "Erased account"}</dd></div>
              {selected.holderAccountId !== selected.accountId && <div><dt>Original account</dt><dd>{selected.phone ? `+${formatPhone(selected.phone)}` : "Erased account"}</dd></div>}
              <div><dt>Reason</dt><dd>{referralReviewReasonLabel[selected.reason]}</dd></div>
              <div><dt>Opened</dt><dd><time dateTime={selected.openedAt}>{at(selected.openedAt)}</time></dd></div>
              {selected.reversedMs > 0 && <div><dt>Unused time reversed</dt><dd>{referralReviewTime(selected.reversedMs)}</dd></div>}
              {selected.restoredMs > 0 && <div><dt>Time restored</dt><dd>{referralReviewTime(selected.restoredMs)}</dd></div>}
              <div><dt>Case ID</dt><dd>{selected.id.slice(0, 8)}</dd></div>
            </ReviewFacts>
            <Panel><PanelHead><h3>Evidence</h3></PanelHead><PanelBody>{selected.evidencePurged ? <p>Evidence removed under the retention policy.</p> : <>
              <p>{selected.summary ?? "No supplementary evidence."}</p>{selected.evidenceRef && <MetaLine>Reference {selected.evidenceRef}</MetaLine>}
              {selected.appealStatement && <p>Appeal: {selected.appealStatement}</p>}
            </>}</PanelBody></Panel>
            {!!selected.events.length && <Drawer $plain>
              <summary>History <ChevronDownIcon /></summary>
              <div><ReviewHistory>{selected.events.map(item => <li key={item.id}>
                <strong>{item.action.replaceAll("-", " ")}</strong> · <time dateTime={item.at}>{at(item.at)}</time><MetaLine>{item.actor}</MetaLine>
                {item.beforeMs !== null && <p>{referralReviewTime(item.beforeMs)} → {referralReviewTime(item.afterMs ?? 0)}</p>}
              </li>)}</ReviewHistory></div>
            </Drawer>}
          </RecordBody>
        </> : <RecordEmpty><h2>No case selected</h2></RecordEmpty>}</RecordScroll>
        {!!decisions.length && <ReviewFooter>{decisions.map(value => <ActionButton key={value} type="button" disabled={busy} aria-haspopup="dialog"
          onClick={() => { setConfirmed(false); setDecision(value); }}>{decisionLabel[value]}</ActionButton>)}</ReviewFooter>}
      </RecordCard>
    </RecordDetails>
    {create && <RecordFormDialog id={`${id}-create`} title="New referral case" onClose={close} busy={busy}
      formId={`${id}-form`} submitLabel="Create case" submitDisabled={grantLoading || !confirmed || !draft.grantId}>
      <ReviewForm id={`${id}-form`} method="post" action={endpoint} onSubmit={saveCreate}>
        <SearchBar label="Find earned grant" submitLabel="Search" onSearch={() => void findGrants()} disabled={busy} value={search} maxLength={60} onChange={event => setSearch(event.target.value)} placeholder="Phone or grant reference" />
        <ReviewField label={"Earned grant"}><select required value={draft.grantId} onChange={event => setDraft(previous => ({ ...previous, grantId: event.target.value }))}>
          <option value="">Choose grant</option>{grants.map(item => <option key={item.id} value={item.id}>{item.phone ? `+${formatPhone(item.phone)}` : "Erased account"} · {item.reference} · {referralReviewTime(item.unusedMs)} unused</option>)}</select></ReviewField>
        <ReviewField label={"Reason"}><select value={draft.reason} onChange={event => setDraft(previous => ({ ...previous, reason: event.target.value as typeof previous.reason }))}>
          {referralReviewReasons.map(value => <option key={value} value={value}>{referralReviewReasonLabel[value]}</option>)}</select></ReviewField>
        <ReviewField label={"Evidence summary"}><textarea required minLength={3} maxLength={referralReviewRules.summaryLength} value={draft.summary} onChange={event => setDraft(previous => ({ ...previous, summary: event.target.value }))} /></ReviewField>
        <ReviewField label={"Evidence reference"}><input required minLength={3} maxLength={referralReviewRules.evidenceLength} value={draft.evidenceRef} onChange={event => setDraft(previous => ({ ...previous, evidenceRef: event.target.value }))} /></ReviewField>
        <Hint>Use support/case references. Omit phone numbers, passwords and verification codes.</Hint>
        <CheckField><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Corroborated evidence is recorded.</CheckField><Hint>{policy}</Hint>
        {error && <FieldError role="alert">{error}</FieldError>}
      </ReviewForm></RecordFormDialog>}
    {decision && selected && <CriteriaDialog id={`${id}-decision`} title={decisionLabel[decision]} open onCancel={close} closeLabel="Close decision" busy={busy}
      footer={<><CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</CriteriaDialogButton>
        <CriteriaDialogButton type="button" disabled={busy || needsEvidence && !confirmed} onClick={decide}>{decisionLabel[decision]}</CriteriaDialogButton></>}>
      <ReviewForm as="div"><p>{decision === "confirm" ? "Only the unused part of this exact earned grant will be removed. Consumed time, paid access and other rewards stay intact."
        : decision === "restore" ? `Restore only the ${referralReviewTime(selected.reversedMs)} actually reversed, once.`
          : decision === "no-action" ? "Retain the reward and close this case." : "Close the appeal and retain the existing decision."}</p>
        {needsEvidence && <><Hint>{policy}</Hint><CheckField><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I have reviewed the evidence supporting this decision.</CheckField></>}
        {error && <FieldError role="alert">{error}</FieldError>}</ReviewForm></CriteriaDialog>}
  </RecordWorkspace>;
}

function caseTone(status: ReferralReviewCase["status"]) {
  return status === "open" || status === "appealed" ? "warning" : status === "restored" || status === "no-action" ? "good" : "muted";
}
