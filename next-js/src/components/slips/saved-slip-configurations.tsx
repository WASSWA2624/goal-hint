"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { TextInput } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton, CriteriaDialogTitle } from "@/components/ui/criteria-dialog";
import { ChartIcon, SlidersIcon } from "@/components/ui/icons";
import { SelectMenu } from "@/components/ui/select-menu";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import type { ReportingDate } from "@/domain/calendar";
import { dateTimeIntervalRange, localDateTimeValue } from "@/domain/date-time";
import { defaultSlipCriteria, SlipCriteriaError, slipInputFields, type SlipCriteria, type SlipInputs } from "@/domain/slip-builder";
import { canonicalSlipConfigurationParameters, datedSlipConfiguration, slipConfigurationCriteria, slipConfigurationMutationSchema, slipConfigurationRules, slipConfigurationsSchema,
  type SlipConfiguration, type SlipConfigurationMutation } from "@/domain/slip-configurations";
import { startRequestDeadline } from "@/domain/request-deadline";
import { createMessages, type TextKey } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { commitNumericParameters, criteriaDraft, isDateTimeField, isNumericRange, renderSlipCriteriaFields, type BuilderIssue } from "./slip-criteria-fields";
import { slipNumberErrorMessage } from "./slip-numeric-input";
import { BuilderCriteriaDialog, CriteriaTrigger, FieldGroup } from "./slip-styles";

const SavedDialog = styled(CriteriaDialog)`
  inline-size: min(var(--gh-size-136), calc(100vw - var(--gh-size-6)));
  ${media.desktop} {
    inline-size: min(var(--gh-size-192), calc(100vw - var(--gh-size-6)));
  }
`;
const EditorDialog = styled(CriteriaDialog)`
  inline-size: min(var(--gh-size-104), calc(100vw - var(--gh-size-6)));
  > header > h2 { min-inline-size: 0; overflow-wrap: anywhere; }
`;
const Content = styled.div`
  display: grid; gap: var(--gh-spacing-3_5); min-inline-size: 0;
  p { margin: 0; font-size: var(--gh-font-body); line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  [role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
const Row = styled.div`
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--gh-spacing-2);
`;
const Check = styled.label`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-body);
  input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); accent-color: ${({ theme }) => theme.color.link}; }
`;
const Picker = styled.div`
  display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0;
`;
const FilterFields = styled(FieldGroup)`
  display: grid; gap: var(--gh-spacing-3);
  [data-slip-builder-essentials] { grid-template-columns: var(--gh-size-20) minmax(0, 1fr); }
  [data-slip-target-groups] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const DraftHint = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
`;
const FooterHint = styled(DraftHint)`
  flex: 1 0 100%; margin: 0; font-size: var(--gh-font-body); line-height: var(--gh-leading-reading);
`;
type EditorAction = "create" | "rename" | "update" | "delete";
type Editor = { action: EditorAction; target: SlipConfiguration | undefined; parameters: string | undefined };
type MarketDraft = { markets: SlipCriteria["markets"]; outcomes: NonNullable<SlipCriteria["outcomes"]> };
type DraftValues = MarketDraft & { fields: SlipInputs; reuse: boolean };
type FilterDraft = { sourceId: string | undefined; revision: number | undefined; values: DraftValues };
type Props = { id: string; locale: string; today: ReportingDate; timeZone: string; currentParameters: string | null; appliedId: string | null; open: boolean;
  onClose: () => void; onAppliedConfigurationRemoved: () => void; onLoad: (configuration: SlipConfiguration) => void;
  applyDefault?: boolean; pending?: boolean; canApplyDefault?: () => boolean; jointEstimates?: boolean };

class ConfigurationRequestError extends Error {
  constructor(readonly code: string) { super(code); }
}
async function requestConfigurations(body?: SlipConfigurationMutation, signal?: AbortSignal): Promise<SlipConfiguration[]> {
  const controller = new AbortController(), clearDeadline = startRequestDeadline(controller);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch("/api/account/slip-configurations", { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
    const value = await response.json();
    if (!response.ok) throw new ConfigurationRequestError(typeof value?.error === "string" ? value.error : "unavailable");
    return slipConfigurationsSchema.parse(value).configurations;
  } finally { clearDeadline(); signal?.removeEventListener("abort", abort); }
}

function filterValues(criteria: SlipCriteria, zone: string): DraftValues {
  const fields = criteriaDraft(criteria);
  const interval = criteria.interval;
  if (interval && interval.zone !== zone) {
    const { window } = dateTimeIntervalRange(interval, interval.zone);
    const from = localDateTimeValue(window.startInclusive, zone), to = localDateTimeValue(window.endExclusive - 60_000, zone);
    fields.dateFrom = from.slice(0, 10); fields.timeFrom = from.slice(11);
    fields.dateTo = to.slice(0, 10); fields.timeTo = to.slice(11);
  }
  return { fields, markets: criteria.markets, outcomes: criteria.outcomes ?? {}, reuse: criteria.reuse };
}

function saveParameters(values: DraftValues, original: DraftValues, interval: SlipCriteria["interval"], today: ReportingDate,
  zone: string, messages: ReturnType<typeof createMessages>):
  { parameters: string; issue?: never } | { parameters?: never; issue: BuilderIssue } {
  const parameters = new URLSearchParams();
  let kickoffEdited = false;
  for (const field of slipInputFields) {
    const value = values.fields[field] ?? "";
    if (!isDateTimeField(field)) { parameters.set(field, value); continue; }
    if (!value) return { issue: { field, code: field.startsWith("date") ? "invalid-date-range" : "invalid-time-range" } };
    kickoffEdited ||= value !== original.fields[field];
  }
  const range = interval && !kickoffEdited ? interval : {
    from: `${values.fields.dateFrom}T${values.fields.timeFrom}`, to: `${values.fields.dateTo}T${values.fields.timeTo}`, zone,
  };
  parameters.set("start", range.from); parameters.set("end", range.to); parameters.set("tz", range.zone);
  const numeric = commitNumericParameters(parameters);
  if (numeric) return { issue: { field: numeric.field, message: slipNumberErrorMessage(messages, numeric.result) } };
  parameters.set("markets", values.markets.join(","));
  parameters.set("reuse", values.reuse ? "1" : "0");
  for (const market of values.markets) {
    const outcomes = values.outcomes[market];
    if (outcomes?.length) parameters.set(`picks.${market}`, outcomes.join(","));
  }
  try {
    return { parameters: canonicalSlipConfigurationParameters(parameters.toString(), today) };
  } catch (error) {
    if (!(error instanceof SlipCriteriaError)) throw error;
    return { issue: isNumericRange(error.field) ? { field: error.field, message: messages.text("slips.guard.range") }
      : { field: error.field, code: error.code } };
  }
}

/** The dialog edits its own draft. Only Apply loads a saved filter into Builder. */
export function SavedSlipConfigurations({ id, locale, today, timeZone, currentParameters, appliedId, open, onClose, onAppliedConfigurationRemoved,
  onLoad, applyDefault = false, pending = false, canApplyDefault, jointEstimates = false }: Props) {
  const m = createMessages(locale), desktop = useDesktopLayout();
  const [configurations, setConfigurations] = useState<SlipConfiguration[]>([]);
  const [selection, setSelection] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<FilterDraft | null>(null);
  const [draftIssue, setDraftIssue] = useState<BuilderIssue | null>(null);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [marketDraft, setMarketDraft] = useState<MarketDraft | null>(null);
  const [marketInvalid, setMarketInvalid] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [error, setError] = useState<TextKey | null>(null), [notice, setNotice] = useState<TextKey | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState(""), [isDefault, setDefault] = useState(false);
  const chooseField = useRef<HTMLButtonElement>(null), cancelEditorButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null), closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false), mutating = useRef(false);
  const latest = useRef({ currentParameters, appliedId, onLoad, onAppliedConfigurationRemoved, canApplyDefault });
  const defaultAttempted = useRef(false), requestVersion = useRef(0);
  useEffect(() => { latest.current = { currentParameters, appliedId, onLoad, onAppliedConfigurationRemoved, canApplyDefault }; },
    [currentParameters, appliedId, onLoad, onAppliedConfigurationRemoved, canApplyDefault]);

  const receiveConfigurations = useCallback((records: SlipConfiguration[]) => {
    setConfigurations(records);
    setSelection(previous => previous && !records.some(item => item.id === previous) ? undefined : previous);
    const applied = latest.current.appliedId;
    if (applied && !records.some(item => item.id === applied)) latest.current.onAppliedConfigurationRemoved();
  }, [setSelection]);

  useEffect(() => {
    if (editor?.action === "update" || editor?.action === "delete") cancelEditorButton.current?.focus();
  }, [editor]);
  useEffect(() => {
    if (editor || busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const trigger = editorTrigger.current, chooser = chooseField.current;
    (trigger && !trigger.disabled ? trigger : chooser && !chooser.disabled ? chooser : closeButton.current)?.focus();
  }, [editor, busy]);
  useEffect(() => {
    const refresh = () => {
      if (!mutating.current && !editor && !marketDraft && document.visibilityState === "visible") setReload(value => value + 1);
    };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [editor, marketDraft]);
  useEffect(() => {
    const controller = new AbortController(), version = ++requestVersion.current, initial = latest.current.currentParameters;
    void requestConfigurations(undefined, controller.signal).then(records => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      receiveConfigurations(records); setLoading(false);
      setError(previous => previous === "slipConfigs.error.unavailable" || previous === "slipConfigs.error.forbidden" ? null : previous);
      if (!defaultAttempted.current) {
        defaultAttempted.current = true;
        const configured = records.find(item => item.isDefault);
        if (applyDefault && configured && latest.current.currentParameters === initial && latest.current.canApplyDefault?.() !== false
          && !window.location.search) latest.current.onLoad(configured);
      }
    }).catch(failure => { if (!controller.signal.aborted && version === requestVersion.current) {
      setError(failure instanceof ConfigurationRequestError && failure.code === "forbidden" ? "slipConfigs.error.forbidden" : "slipConfigs.error.unavailable");
      setLoading(false);
    } });
    return () => controller.abort();
  }, [reload, applyDefault, receiveConfigurations]);
  if (!open) return null;

  const selected = selection === undefined
    ? configurations.find(item => item.isDefault) ?? configurations.find(item => item.id === appliedId)
    : configurations.find(item => item.id === selection);
  const source = selected?.parameters ?? currentParameters;
  const resetCriteria = defaultSlipCriteria(today);
  const resetDraft = criteriaDraft(resetCriteria);
  const sourceCriteria = source ? slipConfigurationCriteria(source, today) : resetCriteria;
  const original = filterValues(sourceCriteria, timeZone);
  const activeDraft = draft?.sourceId === selected?.id ? draft : null;
  const values = activeDraft?.values ?? original;
  const checkedDraft = activeDraft && selected ? checkValues(values) : null;
  const hasUnsavedEdits = checkedDraft && (checkedDraft.issue || checkedDraft.parameters !== checkValues(original).parameters);
  const disabled = loading || busy || pending;
  const errorId = `${id}-draft-error`, marketsId = `${id}-markets`;
  const atCapacity = configurations.length >= slipConfigurationRules.maximum;

  function checkValues(values: DraftValues) {
    return saveParameters(values, original, sourceCriteria.interval, today, timeZone, m);
  }

  function replaceDraft(change: (previous: DraftValues) => DraftValues) {
    if (selected && selection === undefined) setSelection(selected.id);
    setDraft(previous => {
      const current = previous?.sourceId === selected?.id ? previous : null;
      return { sourceId: selected?.id, revision: current?.revision ?? selected?.revision, values: change(current?.values ?? values) };
    });
    setDraftIssue(null); setNotice(null);
  }
  function clearDraft() {
    setDraft(null); setDraftIssue(null); setFeedbackKey(version => version + 1);
  }
  function close() {
    if (busy || editor || marketDraft) return;
    setSelection(undefined); clearDraft(); setError(null); setNotice(null); onClose();
  }
  function cancelEditor() {
    if (busy) return;
    restoreFocus.current = true; setEditor(null); setError(null);
  }
  function applySelected() {
    if (!selected) return;
    try {
      onLoad(datedSlipConfiguration(selected, today, timeZone));
      close();
    } catch (error) {
      if (!(error instanceof SlipCriteriaError)) throw error;
      setDraftIssue({ field: error.field, code: error.code });
      requestAnimationFrame(() => document.getElementById(errorId)?.focus());
    }
  }
  function edit(action: EditorAction, trigger: HTMLButtonElement) {
    let parameters: string | undefined;
    if (action === "create" || action === "update") {
      const checked = checkValues(values);
      if (checked.issue) {
        setDraftIssue(checked.issue);
        const focusId = "message" in checked.issue ? `${id}-${checked.issue.field}` : errorId;
        requestAnimationFrame(() => document.getElementById(focusId)?.focus());
        return;
      }
      parameters = checked.parameters;
    }
    editorTrigger.current = trigger;
    setError(null); setNotice(null); setName(action === "create" ? "" : selected?.name ?? ""); setDefault(false);
    const target = action !== "create" && selected ? { ...selected, revision: action === "update" ? activeDraft?.revision ?? selected.revision : selected.revision } : undefined;
    setEditor({ action, target, parameters });
  }
  async function mutate(body: SlipConfigurationMutation) {
    if (mutating.current) return;
    const parsed = slipConfigurationMutationSchema.safeParse(body);
    if (!parsed.success) { setError("slipConfigs.error.invalid"); return; }
    const mutation = parsed.data;
    ++requestVersion.current; mutating.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const records = await requestConfigurations(mutation);
      receiveConfigurations(records);
      if (mutation.action === "create") {
        const created = records.find(item => item.name === mutation.name);
        setSelection(created?.id); clearDraft();
      } else if (mutation.action === "update" || mutation.action === "delete") {
        clearDraft();
      } else {
        const { id, revision } = mutation;
        const updated = records.find(item => item.id === id);
        setDraft(previous => previous && updated && previous.sourceId === id && previous.revision === revision
          ? { ...previous, revision: updated.revision } : previous);
      }
      setEditor(null); setNotice(`slipConfigs.done.${mutation.action}`);
      if (editor) restoreFocus.current = true;
    } catch (failure) {
      const code = failure instanceof ConfigurationRequestError ? failure.code : "unavailable";
      setError(["invalid", "limit", "name-taken", "conflict", "not-found", "forbidden"].includes(code)
        ? `slipConfigs.error.${code}` as TextKey : "slipConfigs.error.unavailable");
      if (code === "conflict" || code === "not-found") {
        setEditor(null); clearDraft();
        try {
          receiveConfigurations(await requestConfigurations());
        } catch { /* Keep the actionable conflict notice. */ }
        restoreFocus.current = true;
      }
    } finally { mutating.current = false; setBusy(false); }
  }
  function confirmEditor() {
    if (!editor || disabled) return;
    const { action, target, parameters } = editor;
    if (action === "create" && parameters) void mutate({ action, name, parameters, isDefault });
    else if (target) {
      const identity = { id: target.id, revision: target.revision };
      if (action === "update" && parameters) void mutate({ action, ...identity, parameters });
      if (action === "rename") void mutate({ action, ...identity, name });
      if (action === "delete") void mutate({ action, ...identity });
    }
  }
  function reviseMarkets(change: (current: MarketDraft) => MarketDraft) {
    setMarketDraft(current => current && change(current));
    setMarketInvalid(false);
  }
  function applyMarkets() {
    if (!marketDraft?.markets.length) { setMarketInvalid(true); return; }
    replaceDraft(previous => ({ ...previous, ...marketDraft }));
    setMarketDraft(null); setMarketInvalid(false);
  }
  const markets = marketDraft ?? values, defaultMarkets = resetCriteria.markets;
  const marketIssue: BuilderIssue | null = marketInvalid ? { field: "markets", code: "invalid-market" } : null;
  const fields = renderSlipCriteriaFields({
    locale, prefix: id, draft: values.fields, resetDraft, error: marketIssue ?? draftIssue, errorId: marketIssue ? `${marketsId}-error` : errorId, feedbackKey,
    desktop, enhanced: true, showJoint: jointEstimates || Boolean(values.fields.totalProbMin || values.fields.totalProbMax),
    selectedMarkets: markets.markets, outcomes: markets.outcomes, reuse: values.reuse, timeZone, interval: true, resetKickoffOnFeedback: true,
    onFieldChange: (field, value) => replaceDraft(previous => ({ ...previous, fields: { ...previous.fields, [field]: value } })),
    onKickoffChange: (endpoint, day, minute) => replaceDraft(previous => ({ ...previous,
      fields: { ...previous.fields, [`date${endpoint}`]: day, [`time${endpoint}`]: minute },
    })),
    onReuseChange: reuse => replaceDraft(previous => ({ ...previous, reuse })),
    onMarketToggle: family => reviseMarkets(current => {
      const outcomes = { ...current.outcomes };
      delete outcomes[family];
      return { markets: current.markets.includes(family) ? current.markets.filter(value => value !== family) : [...current.markets, family], outcomes };
    }),
    onOutcomesChange: (family, choices) => reviseMarkets(current => ({ ...current, outcomes: { ...current.outcomes, [family]: choices } })),
    onAutomaticMarkets: () => reviseMarkets(() => ({ markets: defaultMarkets, outcomes: {} })),
  });
  const editorTitle = editor && m.text(`slipConfigs.${editor.action}Title`, { name: editor.target?.name ?? "" });
  const editorFields = editor && <>
    {(editor.action === "create" || editor.action === "rename") && <TextInput label={m.text("slipConfigs.name")} name="configurationName"
      value={name} required maxLength={slipConfigurationRules.nameLength} disabled={busy} onChange={event => { setName(event.currentTarget.value); setError(null); }} />}
    {editor.action === "create" && <Check><input type="checkbox" checked={isDefault} disabled={busy}
      onChange={event => setDefault(event.currentTarget.checked)} />{m.text("slipConfigs.useDefault")}</Check>}
    {editor.action === "update" && <p>{m.text("slipConfigs.updateHint")}</p>}
    {editor.action === "delete" && <p>{m.text("slipConfigs.deleteHint")}</p>}
    {error && <p role="alert">{m.text(error)}</p>}
  </>;
  const editorActions = editor && <>
    <CriteriaDialogButton ref={cancelEditorButton} type="button" variant="secondary" disabled={busy} onClick={cancelEditor}>{m.text("slipConfigs.cancel")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" disabled={disabled} onClick={confirmEditor}>{m.text(`slipConfigs.confirm.${editor.action}`)}</CriteriaDialogButton>
  </>;
  const blocked = disabled || !!editor || !!marketDraft;
  const footer = <>
    {hasUnsavedEdits && <FooterHint id={`${id}-unsaved`}>{m.text("slipConfigs.unsaved")}</FooterHint>}
    <CriteriaDialogButton type="button" variant="secondary" disabled={blocked || atCapacity}
      onClick={event => edit("create", event.currentTarget)}>{m.text("slipConfigs.create")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={blocked || !selected}
      onClick={event => edit("rename", event.currentTarget)}>{m.text("slipConfigs.rename")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={blocked || !selected}
      onClick={event => edit("update", event.currentTarget)}>{m.text("slipConfigs.update")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={blocked || !selected}
      onClick={event => edit("delete", event.currentTarget)}>{m.text("slipConfigs.delete")}</CriteriaDialogButton>
    {error && !editor && (error === "slipConfigs.error.forbidden" || error === "slipConfigs.error.unavailable") &&
      <CriteriaDialogButton type="button" variant="secondary" disabled={blocked}
        onClick={() => { setLoading(true); setReload(value => value + 1); }}>{m.text("slipConfigs.retry")}</CriteriaDialogButton>}
    <CriteriaDialogButton type="button" disabled={blocked || !selected} aria-describedby={hasUnsavedEdits ? `${id}-unsaved` : undefined}
      onClick={applySelected}>{m.text("slipConfigs.use")}</CriteriaDialogButton>
  </>;
  return <>
    <SavedDialog id={id} title={<CriteriaDialogTitle><SlidersIcon />{m.text("slipConfigs.title")}</CriteriaDialogTitle>} open onCancel={close} closeLabel={m.text("slipConfigs.close")}
      closeButtonRef={closeButton} busy={busy} footer={footer}>
      <Content data-saved-slip-configurations data-analytics-ignore aria-busy={loading || busy}>
        <Picker>
          <p id={`${id}-count`}>{m.text("slipConfigs.count", { count: m.number(configurations.length), maximum: m.number(slipConfigurationRules.maximum) })}</p>
          <SelectMenu ref={chooseField} label={m.text("slipConfigs.choose")} value={selected?.id ?? ""} disabled={blocked || !configurations.length}
            matchTriggerWidth aria-describedby={`${id}-count`} options={[
              { value: "", label: m.text("slipConfigs.placeholder") },
              ...configurations.map(item => ({ value: item.id, label: item.isDefault ? `${item.name} · ${m.text("slipConfigs.default")}` : item.name })),
            ]} onValueChange={value => { setError(null); setNotice(null); setSelection(value); clearDraft(); }} />
          {selected && <Check><input type="checkbox" checked={selected.isDefault} disabled={blocked}
            onChange={event => {
              setSelection(selected.id);
              void mutate({ action: "default", id: selected.id, revision: selected.revision, isDefault: event.currentTarget.checked });
            }} />{m.text("slipConfigs.useDefault")}</Check>}
        </Picker>
        {loading && <p role="status">{m.text("slipConfigs.loading")}</p>}
        {draftIssue && "code" in draftIssue && <p id={errorId} role="alert" tabIndex={-1}>{m.text(`slips.error.${draftIssue.code}`)}</p>}
        {error && !editor && <p role="alert">{m.text(error)}</p>}
        {notice && <p role="status">{m.text(notice)}</p>}
        <FilterFields disabled={disabled} data-configuration-fields>
          {fields.targets}
          {fields.limits}
          <FieldGroup>{fields.kickoff}<DraftHint>{m.text("slipConfigs.timeZone", { zone: timeZone.replaceAll("_", " ") })}</DraftHint></FieldGroup>
          <Row>
            <CriteriaTrigger type="button" variant="secondary" data-configuration-markets aria-haspopup="dialog" aria-expanded={!!marketDraft}
              aria-controls={marketsId} onClick={() => setMarketDraft({ markets: values.markets, outcomes: values.outcomes })}>
              <ChartIcon />{m.text("slips.dialog.markets")}
            </CriteriaTrigger>
            <DraftHint>{m.plural("slips.marketCount", values.markets.length)}</DraftHint>
          </Row>
          {fields.reuse}
        </FilterFields>
        {atCapacity && <DraftHint>{m.text("slipConfigs.error.limit")}</DraftHint>}
      </Content>
    </SavedDialog>
    {marketDraft && <BuilderCriteriaDialog id={marketsId} group="markets" title={m.text("slips.dialog.markets")} open
      onCancel={() => { setMarketDraft(null); setMarketInvalid(false); }}
      onReset={() => reviseMarkets(() => ({ markets: defaultMarkets, outcomes: {} }))}
      onApply={applyMarkets} resetLabel={m.text("slips.reset")} applyLabel={m.text("slips.dialog.apply")}
      cancelLabel={m.text("slips.dialog.cancel")} closeLabel={m.text("slips.dialog.close", { section: m.text("slips.dialog.markets") })}>
      {marketIssue && <Content><p id={`${marketsId}-error`} role="alert">{m.text("slips.error.invalid-market")}</p></Content>}
      {fields.markets}
    </BuilderCriteriaDialog>}
    {editor && <EditorDialog id={`${id}-editor`} title={editorTitle} open busy={busy}
      onCancel={cancelEditor} closeLabel={m.text("slipConfigs.cancel")} footer={editorActions} onApply={confirmEditor}>
      <Content data-configuration-editor={editor.action} data-analytics-ignore>{editorFields}</Content>
    </EditorDialog>}
  </>;
}
