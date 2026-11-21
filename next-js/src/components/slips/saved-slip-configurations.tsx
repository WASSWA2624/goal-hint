"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FilterDialogSurface } from "@/components/ui/advanced-filter-dialog";
import { controlRow } from "@/components/ui/control-layout";
import { TextInput } from "@/components/ui/controls";
import { CriteriaDialogButton, CriteriaDialogTitle } from "@/components/ui/criteria-dialog";
import { ClipboardIcon, PencilIcon, PlusIcon, ResetIcon, TrashIcon, WrenchIcon } from "@/components/ui/icons";
import { SelectMenu } from "@/components/ui/select-menu";
import { slipConfigurationMutationSchema, slipConfigurationRules, slipConfigurationsSchema,
  type SlipConfiguration, type SlipConfigurationMutation } from "@/domain/slip-configurations";
import { startRequestDeadline } from "@/domain/request-deadline";
import { createMessages, type TextKey } from "@/i18n/messages";

const SavedDialog = styled(FilterDialogSurface)`
  &&[data-enhanced="true"] {
    inline-size: min(var(--gh-size-104), calc(100vw - var(--gh-size-4)));
  }
  > header > h2 { min-inline-size: 0; overflow-wrap: anywhere; }
`;
const Content = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0;
  p { margin: 0; font-size: var(--gh-font-body); line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  [role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
const PresetRow = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--gh-spacing-1_5); min-inline-size: 0;
  ${controlRow}
  > button { white-space: nowrap; }
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) {
    > button > svg { display: none; }
  }
`;
const Summary = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
`;
const Check = styled.label`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-body);
  input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); accent-color: ${({ theme }) => theme.color.link}; }
  &:has(input:disabled) { color: ${({ theme }) => theme.color.disabledText}; }
`;

type EditorAction = "create" | "rename" | "update" | "delete";
type Editor = { action: EditorAction; target: Pick<SlipConfiguration, "id" | "revision" | "name"> | null; parameters: string | null };
export type ConfigurationChoice = Readonly<{ id: string; revision?: number }>;
type Props = {
  id: string; locale: string; currentParameters: string | null; appliedId: string | undefined; choice: ConfigurationChoice | null;
  onLoad: (configuration: SlipConfiguration | null, applyImmediately?: boolean) => boolean; onRemoved: (id: string) => void;
  onRevisionChanged: (id: string, previousRevision: number, revision: number) => void;
  applyDefault?: boolean; pending?: boolean; canApplyDefault: () => boolean;
};

const actionIcons = { create: PlusIcon, update: ResetIcon, rename: PencilIcon, delete: TrashIcon } as const;
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

/** The Builder selection supplies the sole target for saved-filter management. */
export function SavedSlipConfigurations({ id, locale, currentParameters, appliedId, choice, onLoad, onRemoved, onRevisionChanged,
  applyDefault = false, pending = false, canApplyDefault }: Props) {
  const m = createMessages(locale);
  const [configurations, setConfigurations] = useState<SlipConfiguration[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<TextKey | null>(null), [selectionError, setSelectionError] = useState(false);
  const [error, setError] = useState<TextKey | null>(null), [notice, setNotice] = useState<TextKey | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState(""), [isDefault, setDefault] = useState(false);
  const [reviewRequiredId, setReviewRequiredId] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null), cancelEditorButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null), closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false), mutating = useRef(false);
  const latest = useRef({ currentParameters, appliedId, choice, onLoad, onRemoved, canApplyDefault });
  const defaultAttempted = useRef(false), requestVersion = useRef(0);
  useEffect(() => { latest.current = { currentParameters, appliedId, choice, onLoad, onRemoved, canApplyDefault }; },
    [currentParameters, appliedId, choice, onLoad, onRemoved, canApplyDefault]);

  const receiveConfigurations = useCallback((records: SlipConfiguration[]) => {
    setConfigurations(records);
    for (const id of new Set([latest.current.appliedId, latest.current.choice?.id])) {
      if (id && !records.some(item => item.id === id)) latest.current.onRemoved(id);
    }
  }, []);

  useEffect(() => {
    if (editor) (nameInput.current ?? cancelEditorButton.current)?.focus();
  }, [editor]);
  useEffect(() => {
    if (editor || busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const trigger = editorTrigger.current;
    (trigger && !trigger.disabled ? trigger : closeButton.current)?.focus({ preventScroll: true });
  }, [editor, busy]);
  useEffect(() => {
    const refresh = () => {
      if (!mutating.current && !loading && !editor && document.visibilityState === "visible") setReload(value => value + 1);
    };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [editor, loading]);
  useEffect(() => {
    if (mutating.current) return;
    const controller = new AbortController(), version = ++requestVersion.current, initial = latest.current.currentParameters;
    void requestConfigurations(undefined, controller.signal).then(records => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      receiveConfigurations(records); setLoadError(null);
      if (!defaultAttempted.current) {
        defaultAttempted.current = true;
        const configured = records.find(item => item.isDefault);
        if (applyDefault && configured && latest.current.currentParameters === initial && latest.current.canApplyDefault()
          && !window.location.search && !latest.current.onLoad(configured, true)) setSelectionError(true);
      }
    }).catch(failure => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setLoadError(failure instanceof ConfigurationRequestError && failure.code === "forbidden" ? "slipConfigs.error.forbidden" : "slipConfigs.error.unavailable");
    }).finally(() => {
      if (!controller.signal.aborted && version === requestVersion.current) { setLoading(false); setRetrying(false); }
    });
    return () => controller.abort();
  }, [reload, applyDefault, receiveConfigurations]);

  const options = configurations.map(item => ({
    value: item.id, label: item.isDefault ? `${item.name} · ${m.text("slipConfigs.default")}` : item.name,
  }));
  const selectedPreset = configurations.find(item => item.id === choice?.id);
  const reviewRequired = !!selectedPreset && (reviewRequiredId === selectedPreset.id ||
    choice?.revision !== undefined && choice.revision !== selectedPreset.revision);
  const disabled = loading || busy || pending;
  const blocked = disabled || !!editor;
  const atCapacity = configurations.length >= slipConfigurationRules.maximum;
  const manageTitle = m.text("slipConfigs.manage");
  const editorId = `${id}-editor`;

  function choosePreset(value: string) {
    const preset = value ? configurations.find(item => item.id === value) : null;
    if (preset === undefined) return;
    const loaded = onLoad(preset);
    setSelectionError(!loaded);
    if (loaded) setReviewRequiredId(null);
  }
  function closeManagement() {
    if (busy || editor) return;
    setManageOpen(false); setError(null); setNotice(null);
  }
  function cancelEditor() {
    if (busy) return;
    restoreFocus.current = true; setEditor(null); setError(null);
  }
  function edit(action: EditorAction, trigger: HTMLButtonElement) {
    if ((action === "create" || action === "update") && !currentParameters) {
      setError("slipConfigs.error.criteria"); setNotice(null); return;
    }
    editorTrigger.current = trigger;
    setError(null); setNotice(null); setName(action === "create" ? "" : selectedPreset?.name ?? ""); setDefault(false);
    setEditor({ action, target: action === "create" ? null : selectedPreset ?? null, parameters: currentParameters });
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
      setLoadError(null);
      if (mutation.action !== "create") {
        const updated = records.find(item => item.id === mutation.id);
        if (updated) onRevisionChanged(updated.id, mutation.revision, updated.revision);
      }
      if ((mutation.action === "create" || mutation.action === "default") && mutation.isDefault) {
        const previous = configurations.find(item => item.isDefault);
        const demoted = records.find(item => item.id === previous?.id);
        if (previous && demoted && !demoted.isDefault && demoted.revision === previous.revision + 1
          && demoted.parameters === previous.parameters && demoted.name === previous.name) {
          onRevisionChanged(demoted.id, previous.revision, demoted.revision);
        }
      }
      setEditor(null); setNotice(`slipConfigs.done.${mutation.action}`);
      if (editor) restoreFocus.current = true;
    } catch (failure) {
      const code = failure instanceof ConfigurationRequestError ? failure.code : "unavailable";
      setError(["invalid", "limit", "name-taken", "conflict", "not-found", "forbidden"].includes(code)
        ? `slipConfigs.error.${code}` as TextKey : "slipConfigs.error.unavailable");
      if (code === "conflict" || code === "not-found") {
        if (mutation.action !== "create") setReviewRequiredId(mutation.id);
        setEditor(null);
        try { receiveConfigurations(await requestConfigurations()); }
        catch { /* Keep the conflict notice visible. */ }
        restoreFocus.current = !!editor;
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

  const editorTitle = editor && m.text(`slipConfigs.${editor.action}Title`, { name: editor.target?.name ?? "" });
  const maximum = m.number(slipConfigurationRules.maximum);
  const collectionSummary = loading ? m.text("slipConfigs.loading") : loadError ? null
    : configurations.length ? m.text("slipConfigs.count", { count: m.number(configurations.length), maximum })
      : m.text("slipConfigs.empty", { maximum });
  const defaultDisabled = blocked || !selectedPreset || reviewRequired;
  return <>
    <Content>
      <PresetRow data-saved-filters-row data-analytics-ignore aria-busy={loading || busy} data-navigation-passive={loading && !retrying ? "" : undefined}>
        <SelectMenu data-saved-filter-select label={m.text("slipConfigs.saved")} value={selectedPreset?.id ?? ""} disabled={disabled || !options.length}
          title={selectedPreset?.name}
          matchTriggerWidth options={[{ value: "", label: m.text("slipConfigs.none") }, ...options]}
          onValueChange={choosePreset} onOptionSelect={value => { if (value && value === selectedPreset?.id) choosePreset(value); }} />
        <CriteriaDialogButton type="button" variant="secondary" data-saved-filters-trigger
          aria-haspopup="dialog" aria-controls={id} aria-expanded={manageOpen} disabled={pending} onClick={() => setManageOpen(true)}>
          <WrenchIcon />{manageTitle}
        </CriteriaDialogButton>
      </PresetRow>
      {collectionSummary && <Summary role="status">{collectionSummary}</Summary>}
      {loadError && <p role="alert">{m.text(loadError)}</p>}
      {selectionError && <p role="alert">{m.text("slipConfigs.error.load")}</p>}
    </Content>
    {manageOpen && <SavedDialog id={id} title={<CriteriaDialogTitle><ClipboardIcon />{manageTitle}</CriteriaDialogTitle>} open
      onCancel={closeManagement} closeLabel={m.text("slipConfigs.close")} closeButtonRef={closeButton} busy={busy || retrying}
      footer={<>
        {(["create", "update", "rename", "delete"] as const).map(action => {
          const Icon = actionIcons[action];
          return <CriteriaDialogButton key={action} type="button" variant="secondary" data-saved-filter-action={action}
            aria-haspopup="dialog" aria-controls={editor?.action === action ? editorId : undefined}
            disabled={blocked || (action === "create" ? atCapacity : !selectedPreset || reviewRequired)}
            onClick={event => edit(action, event.currentTarget)}><Icon />{m.text(`slipConfigs.${action}`)}</CriteriaDialogButton>;
        })}
        {loadError && <CriteriaDialogButton type="button" variant="secondary" disabled={blocked}
          onClick={() => { setRetrying(true); setLoading(true); setReload(value => value + 1); }}>{m.text("slipConfigs.retry")}</CriteriaDialogButton>}
      </>}>
      <Content data-saved-slip-configurations data-analytics-ignore aria-busy={loading || busy} data-navigation-passive={loading && !retrying ? "" : undefined}>
        {collectionSummary && <Summary role="status">{collectionSummary}</Summary>}
        {selectedPreset ? <p><strong>{selectedPreset.name}</strong></p> : !loading && <p>{m.text("slipConfigs.choose")}</p>}
        <Check><input type="checkbox" checked={selectedPreset?.isDefault ?? false} disabled={defaultDisabled}
          onChange={event => {
            if (selectedPreset) void mutate({ action: "default", id: selectedPreset.id, revision: selectedPreset.revision,
              isDefault: event.currentTarget.checked });
          }} />{m.text("slipConfigs.useDefault")}</Check>
        {atCapacity && <p>{m.text("slipConfigs.error.limit")}</p>}
        {!editor && (error || reviewRequired) && <p role="alert">{m.text(error ?? "slipConfigs.error.conflict")}</p>}
        {loadError && <p role="alert">{m.text(loadError)}</p>}
        {notice && <p role="status">{m.text(notice)}</p>}
      </Content>
    </SavedDialog>}
    {editor && <SavedDialog id={editorId} title={<CriteriaDialogTitle><ClipboardIcon />{editorTitle}</CriteriaDialogTitle>} open busy={busy}
      onCancel={cancelEditor} closeLabel={m.text("slipConfigs.cancel")} onApply={confirmEditor}
      footer={<>
        <CriteriaDialogButton ref={cancelEditorButton} type="button" variant="secondary" disabled={busy} onClick={cancelEditor}>{m.text("slipConfigs.cancel")}</CriteriaDialogButton>
        <CriteriaDialogButton type="button" disabled={disabled} onClick={confirmEditor}>{m.text(`slipConfigs.confirm.${editor.action}`)}</CriteriaDialogButton>
      </>}>
      <Content data-configuration-editor={editor.action} data-analytics-ignore>
        {(editor.action === "create" || editor.action === "rename") && <TextInput ref={nameInput} label={m.text("slipConfigs.name")}
          value={name} required maxLength={slipConfigurationRules.nameLength} disabled={busy} onChange={event => { setName(event.currentTarget.value); setError(null); }} />}
        {editor.action === "create" && <Check><input type="checkbox" checked={isDefault} disabled={busy}
          onChange={event => setDefault(event.currentTarget.checked)} />{m.text("slipConfigs.useDefault")}</Check>}
        {editor.action === "update" && <p>{m.text("slipConfigs.updateHint")}</p>}
        {editor.action === "delete" && <p>{m.text("slipConfigs.deleteHint")}</p>}
        {error && <p role="alert">{m.text(error)}</p>}
      </Content>
    </SavedDialog>}
  </>;
}
