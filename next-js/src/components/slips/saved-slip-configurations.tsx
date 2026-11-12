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
  display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0;
  p { margin: 0; font-size: var(--gh-font-body); line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  [role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
const PresetRow = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--gh-spacing-1_5); min-inline-size: 0;
  ${controlRow}
  > button { white-space: nowrap; }
`;
const Check = styled.label`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--form-control-height); font-size: var(--gh-font-body);
  input { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); accent-color: ${({ theme }) => theme.color.link}; }
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

const actionIcons = { create: PlusIcon, rename: PencilIcon, update: ResetIcon, delete: TrashIcon } as const;
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

/** Preset selection edits the Builder draft. Management only edits saved records. */
export function SavedSlipConfigurations({ id, locale, currentParameters, appliedId, choice, onLoad, onRemoved, onRevisionChanged,
  applyDefault = false, pending = false, canApplyDefault }: Props) {
  const m = createMessages(locale);
  const [configurations, setConfigurations] = useState<SlipConfiguration[]>([]);
  const [manageOpen, setManageOpen] = useState(false), [target, setTarget] = useState<ConfigurationChoice | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<TextKey | null>(null), [error, setError] = useState<TextKey | null>(null), [notice, setNotice] = useState<TextKey | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState(""), [isDefault, setDefault] = useState(false);
  const chooseTarget = useRef<HTMLButtonElement>(null), cancelEditorButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null), closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false), mutating = useRef(false);
  const latest = useRef({ currentParameters, appliedId, choice, onLoad, onRemoved, canApplyDefault });
  const defaultAttempted = useRef(false), requestVersion = useRef(0);
  useEffect(() => { latest.current = { currentParameters, appliedId, choice, onLoad, onRemoved, canApplyDefault }; },
    [currentParameters, appliedId, choice, onLoad, onRemoved, canApplyDefault]);

  const receiveConfigurations = useCallback((records: SlipConfiguration[]) => {
    setConfigurations(records);
    const exists = (id: string) => records.some(item => item.id === id);
    setTarget(current => current && !exists(current.id) ? null : current);
    for (const id of new Set([latest.current.appliedId, latest.current.choice?.id])) {
      if (id && !exists(id)) latest.current.onRemoved(id);
    }
  }, []);

  useEffect(() => {
    if (editor?.action === "update" || editor?.action === "delete") cancelEditorButton.current?.focus();
  }, [editor]);
  useEffect(() => {
    if (editor || busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const trigger = editorTrigger.current, chooser = chooseTarget.current;
    (trigger && !trigger.disabled ? trigger : chooser && !chooser.disabled ? chooser : closeButton.current)?.focus();
  }, [editor, busy]);
  useEffect(() => {
    const refresh = () => {
      if (!mutating.current && !editor && document.visibilityState === "visible") setReload(value => value + 1);
    };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [editor]);
  useEffect(() => {
    const controller = new AbortController(), version = ++requestVersion.current, initial = latest.current.currentParameters;
    void requestConfigurations(undefined, controller.signal).then(records => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      receiveConfigurations(records); setLoading(false); setLoadError(null);
      if (!defaultAttempted.current) {
        defaultAttempted.current = true;
        const configured = records.find(item => item.isDefault);
        if (applyDefault && configured && latest.current.currentParameters === initial && latest.current.canApplyDefault()
          && !window.location.search && !latest.current.onLoad(configured, true)) setLoadError("slipConfigs.error.load");
      }
    }).catch(failure => { if (!controller.signal.aborted && version === requestVersion.current) {
      setLoadError(failure instanceof ConfigurationRequestError && failure.code === "forbidden" ? "slipConfigs.error.forbidden" : "slipConfigs.error.unavailable");
      setLoading(false);
    } });
    return () => controller.abort();
  }, [reload, applyDefault, receiveConfigurations]);

  const options = configurations.map(item => ({
    value: item.id, label: item.isDefault ? `${item.name} · ${m.text("slipConfigs.default")}` : item.name,
  }));
  const selectedTarget = configurations.find(item => item.id === target?.id);
  const selectedPreset = configurations.find(item => item.id === choice?.id);
  const disabled = loading || busy || pending;
  const blocked = disabled || !!editor;
  const atCapacity = configurations.length >= slipConfigurationRules.maximum;
  const manageTitle = m.text("slipConfigs.title");

  function choosePreset(value: string) {
    const preset = value ? configurations.find(item => item.id === value) : null;
    if (preset !== undefined) setLoadError(onLoad(preset) ? null : "slipConfigs.error.load");
  }
  function chooseManagementTarget(value: string) {
    const item = configurations.find(record => record.id === value);
    setTarget(item ? { id: item.id, revision: item.revision } : null); setError(null); setNotice(null);
  }
  function openManagement() {
    setTarget(selectedPreset && choice ? { id: selectedPreset.id, revision: choice.revision ?? selectedPreset.revision } : null);
    setError(null); setNotice(null); setManageOpen(true);
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
    setError(null); setNotice(null); setName(action === "create" ? "" : selectedTarget?.name ?? ""); setDefault(false);
    setEditor({ action, target: action !== "create" && target && selectedTarget
      ? { id: target.id, revision: target.revision ?? selectedTarget.revision, name: selectedTarget.name } : null, parameters: currentParameters });
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
      const updated = mutation.action === "create" ? records.find(item => item.name === mutation.name) : records.find(item => item.id === mutation.id);
      setTarget(updated ? { id: updated.id, revision: updated.revision } : null);
      if (updated && mutation.action !== "create") onRevisionChanged(updated.id, mutation.revision, updated.revision);
      setEditor(null); setNotice(`slipConfigs.done.${mutation.action}`);
      if (editor) restoreFocus.current = true;
    } catch (failure) {
      const code = failure instanceof ConfigurationRequestError ? failure.code : "unavailable";
      setError(["invalid", "limit", "name-taken", "conflict", "not-found", "forbidden"].includes(code)
        ? `slipConfigs.error.${code}` as TextKey : "slipConfigs.error.unavailable");
      if (code === "conflict" || code === "not-found") {
        setEditor(null); setTarget(null);
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
  const editorFields = editor && <>
    {(editor.action === "create" || editor.action === "rename") && <TextInput label={m.text("slipConfigs.name")}
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
  const footer = <>
    {(["create", "rename", "update", "delete"] as const).map(action => {
      const Icon = actionIcons[action];
      return <CriteriaDialogButton key={action} type="button" variant="secondary"
        disabled={blocked || (action === "create" ? atCapacity : !selectedTarget)}
        onClick={event => edit(action, event.currentTarget)}><Icon />{m.text(`slipConfigs.${action}`)}</CriteriaDialogButton>;
    })}
    {loadError && <CriteriaDialogButton type="button" variant="secondary" disabled={blocked}
      onClick={() => { setLoading(true); setReload(value => value + 1); }}>{m.text("slipConfigs.retry")}</CriteriaDialogButton>}
  </>;
  return <>
    <Content>
      <PresetRow data-saved-filters-row data-analytics-ignore aria-busy={loading}>
        <SelectMenu data-saved-filter-select label={m.text("slipConfigs.saved")} value={selectedPreset?.id ?? ""} disabled={disabled || !options.length}
          title={selectedPreset?.name}
          matchTriggerWidth options={[{ value: "", label: m.text("slipConfigs.none") }, ...options]}
          onValueChange={choosePreset} onOptionSelect={value => { if (value && value === selectedPreset?.id) choosePreset(value); }} />
        <CriteriaDialogButton type="button" variant="secondary" data-saved-filters-trigger
          aria-haspopup="dialog" aria-controls={id} aria-expanded={manageOpen} disabled={pending} onClick={openManagement}>
          <WrenchIcon />{m.text("slipConfigs.manage")}
        </CriteriaDialogButton>
      </PresetRow>
      {loadError && <p role="alert">{m.text(loadError)}</p>}
    </Content>
    {manageOpen && <SavedDialog id={id} title={<CriteriaDialogTitle><ClipboardIcon />{manageTitle}</CriteriaDialogTitle>} open
      onCancel={closeManagement} closeLabel={m.text("slipConfigs.close")} closeButtonRef={closeButton} busy={busy} footer={footer}>
      <Content data-saved-slip-configurations data-analytics-ignore aria-busy={loading || busy}>
        <SelectMenu ref={chooseTarget} label={m.text("slipConfigs.choose")} value={selectedTarget?.id ?? ""} disabled={blocked || !options.length}
          matchTriggerWidth options={[{ value: "", label: m.text("slipConfigs.placeholder") }, ...options]} onValueChange={chooseManagementTarget} />
        {selectedTarget && <Check><input type="checkbox" checked={selectedTarget.isDefault} disabled={blocked}
          onChange={event => {
            void mutate({ action: "default", id: selectedTarget.id, revision: target?.revision ?? selectedTarget.revision, isDefault: event.currentTarget.checked });
          }} />{m.text("slipConfigs.useDefault")}</Check>}
        <p>{m.text("slipConfigs.count", { count: m.number(configurations.length), maximum: m.number(slipConfigurationRules.maximum) })}</p>
        {loading && <p role="status">{m.text("slipConfigs.loading")}</p>}
        {atCapacity && <p>{m.text("slipConfigs.error.limit")}</p>}
        {error && !editor && <p role="alert">{m.text(error)}</p>}
        {loadError && loadError !== "slipConfigs.error.load" && <p role="alert">{m.text(loadError)}</p>}
        {notice && <p role="status">{m.text(notice)}</p>}
      </Content>
    </SavedDialog>}
    {editor && <SavedDialog id={`${id}-editor`} title={<CriteriaDialogTitle><ClipboardIcon />{editorTitle}</CriteriaDialogTitle>} open busy={busy}
      onCancel={cancelEditor} closeLabel={m.text("slipConfigs.cancel")} footer={editorActions} onApply={confirmEditor}>
      <Content data-configuration-editor={editor.action} data-analytics-ignore>{editorFields}</Content>
    </SavedDialog>}
  </>;
}
