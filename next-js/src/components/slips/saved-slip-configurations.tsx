"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Button, SelectInput, TextInput } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { slipConfigurationMutationSchema, slipConfigurationRules, slipConfigurationsSchema,
  type SlipConfiguration, type SlipConfigurationMutation } from "@/domain/slip-configurations";
import { startRequestDeadline } from "@/domain/request-deadline";
import { createMessages, type TextKey } from "@/i18n/messages";
import { media } from "@/styles/theme";

const SavedDialog = styled(CriteriaDialog)`
  inline-size: min(34rem, calc(100vw - 24px));
  > footer { flex-wrap: wrap; }
  ${media.desktop} {
    inline-size: min(48rem, calc(100vw - 24px));
    > footer { flex-wrap: nowrap; }
  }
`;
const EditorDialog = styled(CriteriaDialog)`
  inline-size: min(26rem, calc(100vw - 24px));
  > header > h2 { min-inline-size: 0; overflow-wrap: anywhere; }
`;
const Content = styled.div`
  display: grid; gap: 14px; min-inline-size: 0;
  p { margin: 0; font-size: .8125rem; line-height: 1.45; overflow-wrap: anywhere; }
  [role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
const Row = styled.div`
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  button { font-size: .8125rem; }
`;
const Check = styled.label`
  display: inline-flex; align-items: center; gap: 8px; min-block-size: 44px; font-size: .8125rem;
  input { inline-size: 18px; block-size: 18px; accent-color: ${({ theme }) => theme.color.link}; }
`;
const EditorPanel = styled.section`
  display: grid; gap: 10px; min-inline-size: 0; padding-block-start: 12px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  h3 { margin: 0; font-size: .9375rem; overflow-wrap: anywhere; }
`;
type EditorAction = "create" | "rename" | "update" | "delete";
type Editor = { action: EditorAction; target: SlipConfiguration | null };
type Props = { id: string; locale: string; currentParameters: string | null; appliedId: string | null; open: boolean;
  onClose: () => void; onAppliedConfigurationRemoved: () => void; onLoad: (configuration: SlipConfiguration) => void;
  applyDefault?: boolean; pending?: boolean; canApplyDefault?: () => boolean };

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

/** One builder-only dialog manages saves; editable filter values live in the main builder. */
export function SavedSlipConfigurations({ id, locale, currentParameters, appliedId, open, onClose, onAppliedConfigurationRemoved,
  onLoad, applyDefault = false, pending = false, canApplyDefault }: Props) {
  const m = createMessages(locale);
  const desktop = useDesktopLayout();
  const [configurations, setConfigurations] = useState<SlipConfiguration[]>([]);
  const [selection, setSelection] = useState(appliedId);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [error, setError] = useState<TextKey | null>(null), [notice, setNotice] = useState<TextKey | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState(""), [isDefault, setDefault] = useState(false);
  const nestedEditor = desktop && editor !== null;
  const nameField = useRef<HTMLInputElement>(null);
  const chooseField = useRef<HTMLSelectElement>(null), cancelEditorButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null), closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const latest = useRef({ currentParameters, appliedId, onLoad, onAppliedConfigurationRemoved, canApplyDefault });
  const defaultAttempted = useRef(false), requestVersion = useRef(0);
  useEffect(() => { latest.current = { currentParameters, appliedId, onLoad, onAppliedConfigurationRemoved, canApplyDefault }; },
    [currentParameters, appliedId, onLoad, onAppliedConfigurationRemoved, canApplyDefault]);
  const receiveConfigurations = useCallback((records: SlipConfiguration[], createdName?: string) => {
    setConfigurations(records);
    setSelection(previous => createdName !== undefined ? records.find(item => item.name === createdName)?.id ?? null
      : records.some(item => item.id === previous) ? previous : null);
    const applied = latest.current.appliedId;
    if (applied && !records.some(item => item.id === applied)) latest.current.onAppliedConfigurationRemoved();
  }, []);
  useEffect(() => {
    if (editor) (editor.action === "create" || editor.action === "rename" ? nameField.current : cancelEditorButton.current)?.focus();
  }, [editor, desktop]);
  useEffect(() => {
    if (editor || busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const trigger = editorTrigger.current, chooser = chooseField.current;
    (trigger && !trigger.disabled ? trigger : chooser && !chooser.disabled ? chooser : closeButton.current)?.focus();
  }, [editor, busy]);
  useEffect(() => {
    const refresh = () => { if (!busy && document.visibilityState === "visible") setReload(value => value + 1); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [busy]);
  useEffect(() => {
    const controller = new AbortController(), version = ++requestVersion.current, initial = latest.current.currentParameters;
    void requestConfigurations(undefined, controller.signal).then(records => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      receiveConfigurations(records); setError(null); setLoading(false);
      if (!defaultAttempted.current) {
        defaultAttempted.current = true;
        const configured = records.find(item => item.isDefault);
        if (applyDefault && configured && latest.current.currentParameters === initial && latest.current.canApplyDefault?.() !== false
          && !window.location.search) { setSelection(configured.id); latest.current.onLoad(configured); }
      }
    }).catch(failure => { if (!controller.signal.aborted && version === requestVersion.current) {
      setError(failure instanceof ConfigurationRequestError && failure.code === "forbidden" ? "slipConfigs.error.forbidden" : "slipConfigs.error.unavailable"); setLoading(false);
    } });
    return () => controller.abort();
  }, [reload, applyDefault, receiveConfigurations]);
  const selected = configurations.find(item => item.id === selection);
  const disabled = loading || busy || pending;
  function close() { if (!busy && !nestedEditor) { setEditor(null); setError(null); setNotice(null); onClose(); } }
  function restoreEditorFocus() {
    restoreFocus.current = true;
  }
  function cancelEditor() { if (!busy) { setEditor(null); setError(null); restoreEditorFocus(); } }
  function edit(action: EditorAction, trigger: HTMLButtonElement) {
    editorTrigger.current = trigger;
    setError(null); setNotice(null); setName(action === "create" ? "" : selected?.name ?? ""); setDefault(false);
    setEditor({ action, target: action === "create" ? null : selected ?? null });
  }
  async function mutate(body: SlipConfigurationMutation) {
    if (busy) return;
    const parsed = slipConfigurationMutationSchema.safeParse(body);
    if (!parsed.success) { setError("slipConfigs.error.invalid"); return; }
    ++requestVersion.current; setBusy(true); setError(null); setNotice(null);
    try {
      const records = await requestConfigurations(parsed.data);
      receiveConfigurations(records, parsed.data.action === "create" ? parsed.data.name : undefined);
      setEditor(null); setNotice(`slipConfigs.done.${parsed.data.action}`);
      if (editor) restoreEditorFocus();
    } catch (failure) {
      const code = failure instanceof ConfigurationRequestError ? failure.code : "unavailable";
      setError(["invalid", "limit", "name-taken", "conflict", "not-found", "forbidden"].includes(code)
        ? `slipConfigs.error.${code}` as TextKey : "slipConfigs.error.unavailable");
      if (["conflict", "not-found"].includes(code)) {
        setEditor(null);
        try {
          receiveConfigurations(await requestConfigurations());
        } catch { /* Keep the actionable conflict notice. */ }
        restoreEditorFocus();
      }
    } finally { setBusy(false); }
  }
  function apply() {
    if (!editor || busy) return;
    const { action, target } = editor;
    if (action === "create" || action === "update") {
      if (!currentParameters) { setError("slipConfigs.invalidFilters"); return; }
      if (action === "create") void mutate({ action, name, parameters: currentParameters, isDefault });
      else if (target) void mutate({ action, id: target.id, revision: target.revision, parameters: currentParameters });
    } else if (target) void mutate(action === "rename" ? { action, id: target.id, revision: target.revision, name }
      : { action, id: target.id, revision: target.revision });
  }
  if (!open) return null;
  const editorTitle = editor && m.text(`slipConfigs.${editor.action}Title`, { name: editor.target?.name ?? "" });
  const editorFields = editor && <>
    {editor.action === "create" || editor.action === "rename" ? <TextInput ref={nameField} label={m.text("slipConfigs.name")} name="configurationName"
      value={name} required maxLength={slipConfigurationRules.nameLength} disabled={busy} onChange={event => setName(event.currentTarget.value)} />
      : editor.action === "update" && <p>{m.text("slipConfigs.updateHint")}</p>}
    {editor.action === "create" && <Check><input type="checkbox" checked={isDefault} disabled={busy}
      onChange={event => setDefault(event.currentTarget.checked)} />{m.text("slipConfigs.useDefault")}</Check>}
    {error && <p role="alert">{m.text(error)}</p>}
  </>;
  const editorActions = editor && <>
    <CriteriaDialogButton ref={cancelEditorButton} type="button" variant="secondary" disabled={busy} onClick={cancelEditor}>{m.text("slipConfigs.cancel")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" disabled={disabled} onClick={apply}>{m.text(`slipConfigs.confirm.${editor.action}`)}</CriteriaDialogButton>
  </>;
  const footer = <>
    <CriteriaDialogButton type="button" variant="secondary" disabled={disabled || !!editor || !currentParameters || configurations.length >= slipConfigurationRules.maximum}
      onClick={event => edit("create", event.currentTarget)}>{m.text("slipConfigs.create")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={disabled || !!editor || !selected}
      onClick={event => edit("rename", event.currentTarget)}>{m.text("slipConfigs.rename")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={disabled || !!editor || !selected || !currentParameters}
      onClick={event => edit("update", event.currentTarget)}>{m.text("slipConfigs.update")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={disabled || !!editor || !selected}
      onClick={event => edit("delete", event.currentTarget)}>{m.text("slipConfigs.delete")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" disabled={disabled || !!editor || !selected}
      onClick={() => { if (selected) { onLoad(selected); close(); } }}>{m.text("slipConfigs.use")}</CriteriaDialogButton>
  </>;
  return <><SavedDialog id={id} title={m.text("slipConfigs.title")} open onCancel={close} closeLabel={m.text("slipConfigs.close")}
    dismissOnBackdrop={false} closeButtonRef={closeButton} busy={busy} footer={footer} {...(editor && !desktop ? { onApply: apply } : {})}>
    <Content data-saved-slip-configurations data-analytics-ignore aria-busy={loading || busy}>
      <SelectInput ref={chooseField} label={m.text("slipConfigs.choose")} value={selection ?? ""} disabled={disabled || !!editor || !configurations.length}
        hint={m.text("slipConfigs.count", { count: m.number(configurations.length), maximum: m.number(slipConfigurationRules.maximum) })}
        onChange={event => {
          setError(null); setNotice(null);
          setSelection(event.currentTarget.value || null);
        }}>
        <option value="">{m.text("slipConfigs.placeholder")}</option>
        {configurations.map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ` · ${m.text("slipConfigs.default")}` : ""}</option>)}
      </SelectInput>
      {selected && (nestedEditor || editor?.action !== "create") && <Row>
        <Check><input type="checkbox" checked={selected.isDefault} disabled={disabled || !!editor}
          onChange={event => { void mutate({ action: "default", id: selected.id, revision: selected.revision, isDefault: event.currentTarget.checked }); }} />{m.text("slipConfigs.useDefault")}</Check>
      </Row>}
      {editor && !desktop && <EditorPanel data-configuration-editor={editor.action} aria-labelledby={`${id}-editor-title`}>
        <h3 id={`${id}-editor-title`}>{editorTitle}</h3>
        {editorFields}
        <Row>{editorActions}</Row>
      </EditorPanel>}
      {loading && <p role="status">{m.text("slipConfigs.loading")}</p>}
      {currentParameters === null && <p>{m.text("slipConfigs.invalidFilters")}</p>}
      {error && !editor && <p role="alert">{m.text(error)} <Button type="button" variant="quiet" disabled={busy}
        onClick={() => { setLoading(true); setReload(value => value + 1); }}>{m.text("slipConfigs.retry")}</Button></p>}
      {notice && <p role="status">{m.text(notice)}</p>}
    </Content>
  </SavedDialog>
  {nestedEditor && <EditorDialog id={`${id}-editor`} title={editorTitle} open busy={busy}
    dismissOnBackdrop={false} onCancel={cancelEditor} closeLabel={m.text("slipConfigs.cancel")} footer={editorActions} onApply={apply}>
    <Content data-configuration-editor={editor.action} data-analytics-ignore>{editorFields}</Content>
  </EditorDialog>}
  </>;
}
