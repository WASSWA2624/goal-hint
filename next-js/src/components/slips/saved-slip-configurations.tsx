"use client";

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Button, SelectInput, TextInput } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { slipConfigurationMutationSchema, slipConfigurationRules, slipConfigurationsSchema,
  type SlipConfiguration, type SlipConfigurationMutation } from "@/domain/slip-configurations";
import { startRequestDeadline } from "@/domain/request-deadline";
import { createMessages, type TextKey } from "@/i18n/messages";

const SavedDialog = styled(CriteriaDialog)`
  inline-size: min(34rem, calc(100vw - 24px));
  > footer { flex-wrap: wrap; }
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
const EditorPanel = styled.div`
  display: grid; gap: 10px; padding-block-start: 12px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  h3 { margin: 0; font-size: .9375rem; }
`;
const Hint = styled.p`color: ${({ theme }) => theme.color.mutedText};`;
type EditorAction = "create" | "rename" | "update" | "delete";
type Editor = { action: EditorAction; target: SlipConfiguration | null };
type Props = { id: string; locale: string; currentParameters: string | null; selectedId: string | null; open: boolean;
  onClose: () => void; onEdit: () => void; onSelectionChange: (id: string | null) => void; onLoad: (configuration: SlipConfiguration) => void;
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
export function SavedSlipConfigurations({ id, locale, currentParameters, selectedId, open, onClose, onEdit, onSelectionChange,
  onLoad, applyDefault = false, pending = false, canApplyDefault }: Props) {
  const m = createMessages(locale);
  const [configurations, setConfigurations] = useState<SlipConfiguration[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [error, setError] = useState<TextKey | null>(null), [saved, setSaved] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState(""), [isDefault, setDefault] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const latest = useRef({ currentParameters, selectedId, onLoad, onSelectionChange, canApplyDefault });
  const defaultAttempted = useRef(false), requestVersion = useRef(0);
  useEffect(() => { latest.current = { currentParameters, selectedId, onLoad, onSelectionChange, canApplyDefault }; },
    [currentParameters, selectedId, onLoad, onSelectionChange, canApplyDefault]);
  useEffect(() => { if (editor?.action === "create" || editor?.action === "rename") nameField.current?.focus(); }, [editor]);
  useEffect(() => {
    const refresh = () => { if (!busy && document.visibilityState === "visible") setReload(value => value + 1); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [busy]);
  useEffect(() => {
    const controller = new AbortController(), version = ++requestVersion.current, initial = latest.current.currentParameters;
    void requestConfigurations(undefined, controller.signal).then(records => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setConfigurations(records); setError(null); setLoading(false);
      if (latest.current.selectedId && !records.some(item => item.id === latest.current.selectedId)) latest.current.onSelectionChange(null);
      if (!defaultAttempted.current) {
        defaultAttempted.current = true;
        const configured = records.find(item => item.isDefault);
        if (applyDefault && configured && latest.current.currentParameters === initial && latest.current.canApplyDefault?.() !== false
          && !window.location.search) latest.current.onLoad(configured);
      }
    }).catch(failure => { if (!controller.signal.aborted && version === requestVersion.current) {
      setError(failure instanceof ConfigurationRequestError && failure.code === "forbidden" ? "slipConfigs.error.forbidden" : "slipConfigs.error.unavailable"); setLoading(false);
    } });
    return () => controller.abort();
  }, [reload, applyDefault]);
  const selected = configurations.find(item => item.id === selectedId);
  const disabled = loading || busy || pending;
  function close() { if (!busy) { setEditor(null); setError(null); setSaved(false); onClose(); } }
  function edit(action: EditorAction) {
    setError(null); setSaved(false); setName(action === "create" ? "" : selected?.name ?? ""); setDefault(false);
    setEditor({ action, target: action === "create" ? null : selected ?? null });
  }
  async function mutate(body: SlipConfigurationMutation) {
    if (busy) return;
    const parsed = slipConfigurationMutationSchema.safeParse(body);
    if (!parsed.success) { setError("slipConfigs.error.invalid"); return; }
    ++requestVersion.current; setBusy(true); setError(null); setSaved(false);
    try {
      const records = await requestConfigurations(parsed.data);
      setConfigurations(records); setEditor(null); setSaved(true);
      const createdName = parsed.data.action === "create" ? parsed.data.name : null;
      onSelectionChange(createdName !== null ? records.find(item => item.name === createdName)?.id ?? null
        : records.some(item => item.id === selectedId) ? selectedId : null);
    } catch (failure) {
      const code = failure instanceof ConfigurationRequestError ? failure.code : "unavailable";
      setError(["invalid", "limit", "name-taken", "conflict", "not-found", "forbidden"].includes(code)
        ? `slipConfigs.error.${code}` as TextKey : "slipConfigs.error.unavailable");
      if (["conflict", "not-found"].includes(code)) {
        setEditor(null);
        try {
          const records = await requestConfigurations(); setConfigurations(records);
          if (!records.some(item => item.id === selectedId)) onSelectionChange(null);
        } catch { /* Keep the actionable conflict notice. */ }
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
  const footer = editor ? <>
    <CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={() => { setEditor(null); setError(null); }}>{m.text("slipConfigs.cancel")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" disabled={disabled} onClick={apply}>{m.text(editor.action === "create" ? "slipConfigs.save" : `slipConfigs.${editor.action}`)}</CriteriaDialogButton>
  </> : <>
    <CriteriaDialogButton type="button" variant="secondary" disabled={disabled || !currentParameters || configurations.length >= slipConfigurationRules.maximum}
      onClick={() => edit("create")}>{m.text("slipConfigs.save")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" disabled={disabled || !selected || !currentParameters} onClick={() => edit("update")}>{m.text("slipConfigs.update")}</CriteriaDialogButton>
    <CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={close}>{m.text("slipConfigs.close")}</CriteriaDialogButton>
  </>;
  return <SavedDialog id={id} title={m.text("slipConfigs.title")} open onCancel={close} closeLabel={m.text("slipConfigs.close")}
    busy={busy} footer={footer} {...(editor ? { onApply: apply } : {})}>
    <Content data-saved-slip-configurations data-analytics-ignore aria-busy={loading || busy}>
      <SelectInput label={m.text("slipConfigs.choose")} value={selectedId ?? ""} disabled={disabled || !!editor || !configurations.length}
        hint={m.text("slipConfigs.count", { count: m.number(configurations.length), maximum: m.number(slipConfigurationRules.maximum) })}
        onChange={event => {
          setError(null); setSaved(false);
          const configuration = configurations.find(item => item.id === event.currentTarget.value);
          if (configuration) onLoad(configuration); else onSelectionChange(null);
        }}>
        <option value="">{m.text("slipConfigs.placeholder")}</option>
        {configurations.map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ` · ${m.text("slipConfigs.default")}` : ""}</option>)}
      </SelectInput>
      {selected && <Row>
        <Check><input type="checkbox" checked={selected.isDefault} disabled={disabled || !!editor}
          onChange={event => { void mutate({ action: "default", id: selected.id, revision: selected.revision, isDefault: event.currentTarget.checked }); }} />{m.text("slipConfigs.useDefault")}</Check>
        <Button type="button" variant="quiet" disabled={disabled || !!editor} onClick={onEdit}>{m.text("slipConfigs.edit")}</Button>
        <Button type="button" variant="quiet" disabled={disabled || !!editor} onClick={() => edit("rename")}>{m.text("slipConfigs.rename")}</Button>
        <Button type="button" variant="quiet" disabled={disabled || !!editor} onClick={() => edit("delete")}>{m.text("slipConfigs.delete")}</Button>
      </Row>}
      {editor && <EditorPanel data-configuration-editor={editor.action}>
        <h3>{m.text(`slipConfigs.${editor.action}Title`)}</h3>
        {editor.action === "create" || editor.action === "rename" ? <TextInput ref={nameField} label={m.text("slipConfigs.name")} name="configurationName"
          value={name} required maxLength={slipConfigurationRules.nameLength} disabled={busy} onChange={event => setName(event.currentTarget.value)} />
          : <p>{m.text(editor.action === "update" ? "slipConfigs.updateHint" : "slipConfigs.deleteHint", { name: editor.target!.name })}</p>}
        {editor.action === "create" && <Check><input type="checkbox" checked={isDefault} disabled={busy}
          onChange={event => setDefault(event.currentTarget.checked)} />{m.text("slipConfigs.useDefault")}</Check>}
      </EditorPanel>}
      {loading ? <p role="status">{m.text("slipConfigs.loading")}</p> : !configurations.length && <Hint>{m.text("slipConfigs.empty")}</Hint>}
      <Hint>{m.text("slipConfigs.hint", { build: m.text("slips.build") })}</Hint>
      {currentParameters === null && <p>{m.text("slipConfigs.invalidFilters")}</p>}
      {error && <p role="alert">{m.text(error)} {!editor && <Button type="button" variant="quiet" disabled={busy}
        onClick={() => { setLoading(true); setReload(value => value + 1); }}>{m.text("slipConfigs.retry")}</Button>}</p>}
      {saved && <p role="status">{m.text("slipConfigs.saved")}</p>}
    </Content>
  </SavedDialog>;
}
