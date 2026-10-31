"use client";

import { useEffect, useId, useRef, useState } from "react";
import styled from "styled-components";
import { Button, ButtonLink, SelectInput, TextInput, TextLink } from "@/components/ui/controls";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { desktopContentPadding } from "@/components/ui/layout";
import { slipConfigurationHref, slipConfigurationMutationSchema, slipConfigurationRules, slipConfigurationsSchema,
  type SlipConfiguration, type SlipConfigurationMutation } from "@/domain/slip-configurations";
import { slipsHref } from "@/domain/navigation";
import { startRequestDeadline } from "@/domain/request-deadline";
import { createMessages, type TextKey } from "@/i18n/messages";

const Panel = styled.section`
  display: grid; gap: 10px; min-inline-size: 0; padding: 12px;
  border-block: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface}; border-radius: ${({ theme }) => theme.radius.none};
  ${desktopContentPadding(true)}
  h2 { margin: 0; font-size: .9375rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  p { margin: 0; font-size: .8125rem; color: ${({ theme }) => theme.color.mutedText}; }
  [role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
const Row = styled.div`
  display: flex; flex-wrap: wrap; align-items: end; gap: 8px; min-inline-size: 0;
  > [data-field] { flex: 1 1 14rem; min-inline-size: 0; max-inline-size: 28rem; }
  button, a { font-size: .8125rem; }
  @media (pointer: coarse) { button, a { min-block-size: 44px; } }
`;
const Check = styled.label`
  display: inline-flex; align-items: center; gap: 8px; min-block-size: 44px; font-size: .8125rem;
  input { inline-size: 18px; block-size: 18px; accent-color: ${({ theme }) => theme.color.link}; }
`;
const DialogContent = styled.div`display: grid; gap: 12px; p { margin: 0; overflow-wrap: anywhere; }`;
type DialogAction = "create" | "rename" | "update" | "delete";
type Editor = { action: DialogAction; target: SlipConfiguration | null };
type Props = { locale: string; currentParameters?: string | null; selectedId?: string | null;
  applyDefault?: boolean; onLoad?: (configuration: SlipConfiguration) => void; pending?: boolean; formId?: string; canApplyDefault?: () => boolean };

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

/** The same account-owned controls serve the builder and the subscriber dashboard. */
export function SavedSlipConfigurations({ locale, currentParameters, selectedId, applyDefault = false, onLoad, pending = false, formId, canApplyDefault }: Props) {
  const m = createMessages(locale), id = useId(), builder = !!onLoad;
  const [configurations, setConfigurations] = useState<SlipConfiguration[]>([]), [selection, setSelection] = useState(selectedId ?? "");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [error, setError] = useState<TextKey | null>(null), [saved, setSaved] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null), [name, setName] = useState(""), [isDefault, setDefault] = useState(false);
  const latest = useRef({ currentParameters, onLoad, canApplyDefault }), defaultAttempted = useRef(false), requestVersion = useRef(0);
  useEffect(() => { latest.current = { currentParameters, onLoad, canApplyDefault }; }, [currentParameters, onLoad, canApplyDefault]);
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
      setSelection(previous => records.some(item => item.id === previous) ? previous
        : builder ? "" : records.find(item => item.isDefault)?.id ?? records[0]?.id ?? "");
      if (!defaultAttempted.current) {
        defaultAttempted.current = true;
        const configured = records.find(item => item.isDefault);
        // A slow read must never replace filters the member started editing, or a submitted build.
        if (applyDefault && configured && latest.current.currentParameters === initial && latest.current.canApplyDefault?.() !== false
          && !window.location.search) latest.current.onLoad?.(configured);
      }
    }).catch(failure => { if (!controller.signal.aborted && version === requestVersion.current) {
      setError(failure instanceof ConfigurationRequestError && failure.code === "forbidden" ? "slipConfigs.error.forbidden" : "slipConfigs.error.unavailable"); setLoading(false);
    } });
    return () => controller.abort();
  }, [reload, builder, applyDefault]);
  const selected = configurations.find(item => item.id === selection);
  const disabled = loading || busy || pending;
  const errorKey = (failure: unknown): TextKey => {
    const code = failure instanceof ConfigurationRequestError ? failure.code : "unavailable";
    return ["invalid", "limit", "name-taken", "conflict", "not-found", "forbidden"].includes(code)
      ? `slipConfigs.error.${code}` as TextKey : "slipConfigs.error.unavailable";
  };
  function open(action: DialogAction) {
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
      setSelection(previous => createdName !== null ? records.find(item => item.name === createdName)?.id ?? ""
        : records.some(item => item.id === previous) ? previous : "");
    } catch (failure) {
      setError(errorKey(failure));
      if (failure instanceof ConfigurationRequestError && ["conflict", "not-found"].includes(failure.code)) {
        setEditor(null);
        try { setConfigurations(await requestConfigurations()); } catch { /* Keep the actionable conflict notice. */ }
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
  const dates = selected && new URLSearchParams(selected.parameters);
  return <Panel aria-labelledby={`${id}-title`} data-saved-slip-configurations data-analytics-ignore aria-busy={loading || busy}>
    <Row><h2 id={`${id}-title`}>{m.text("slipConfigs.title")}</h2>
      {!loading && <p>{m.text("slipConfigs.count", { count: m.number(configurations.length), maximum: m.number(slipConfigurationRules.maximum) })}</p>}</Row>
    <Row>
      <SelectInput label={m.text(builder ? "slipConfigs.choose" : "slipConfigs.chooseManage")} name={builder ? "configuration" : undefined}
        form={formId} value={selection} disabled={disabled || !configurations.length}
        onChange={event => { const value = event.currentTarget.value; setSelection(value); setError(null); setSaved(false);
          const configuration = configurations.find(item => item.id === value); if (configuration) onLoad?.(configuration); }}>
        <option value="">{m.text("slipConfigs.placeholder")}</option>
        {configurations.map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ` · ${m.text("slipConfigs.default")}` : ""}</option>)}
      </SelectInput>
      {builder ? <><Button type="button" variant="secondary" disabled={disabled || !currentParameters || configurations.length >= slipConfigurationRules.maximum}
        onClick={() => open("create")}>{m.text("slipConfigs.save")}</Button>
        <Button type="button" variant="secondary" disabled={disabled || !selected || !currentParameters} onClick={() => open("update")}>{m.text("slipConfigs.update")}</Button></>
        : <ButtonLink href={selected ? slipConfigurationHref(selected, locale) : slipsHref(locale)} prefetch={false}>{m.text(selected ? "slipConfigs.edit" : "slipConfigs.openBuilder")}</ButtonLink>}
    </Row>
    {selected && <><Row>
      <Check><input type="checkbox" checked={selected.isDefault} disabled={disabled}
        onChange={event => { void mutate({ action: "default", id: selected.id, revision: selected.revision, isDefault: event.currentTarget.checked }); }} />{m.text("slipConfigs.useDefault")}</Check>
      <Button type="button" variant="quiet" disabled={disabled} onClick={() => open("rename")}>{m.text("slipConfigs.rename")}</Button>
      <Button type="button" variant="quiet" disabled={disabled} onClick={() => open("delete")}>{m.text("slipConfigs.delete")}</Button>
    </Row><p>{m.text("slipConfigs.dates", { from: dates!.get("dateFrom")!, to: dates!.get("dateTo")! })}</p></>}
    {loading ? <p role="status">{m.text("slipConfigs.loading")}</p> : !configurations.length && <p>{m.text("slipConfigs.empty")}</p>}
    <p>{m.text("slipConfigs.hint", { build: m.text("slips.build") })} {m.text("slipConfigs.defaultHint")}</p>
    {builder && <TextLink href={`/${locale}/account#saved-slip-configurations`} prefetch={false}>{m.text("slipConfigs.manage")}</TextLink>}
    {currentParameters === null && <p>{m.text("slipConfigs.invalidFilters")}</p>}
    {error && !editor && <p role="alert">{m.text(error)} <Button type="button" variant="quiet" disabled={busy} onClick={() => { setLoading(true); setReload(value => value + 1); }}>{m.text("slipConfigs.retry")}</Button></p>}
    {saved && <p role="status">{m.text("slipConfigs.saved")}</p>}
    {editor && <CriteriaDialog id={`${id}-dialog`} title={m.text(`slipConfigs.${editor.action}Title`)} open busy={busy}
      onCancel={() => { if (!busy) { setEditor(null); setError(null); } }} onApply={apply}
      applyLabel={m.text(editor.action === "create" ? "slipConfigs.save" : `slipConfigs.${editor.action}`)}
      cancelLabel={m.text("slipConfigs.cancel")} closeLabel={m.text("slipConfigs.close")}>
      <DialogContent>
        {editor.action === "create" || editor.action === "rename" ? <TextInput label={m.text("slipConfigs.name")} name="configurationName"
          value={name} required maxLength={slipConfigurationRules.nameLength} disabled={busy} onChange={event => setName(event.currentTarget.value)} />
          : <p>{m.text(editor.action === "update" ? "slipConfigs.updateHint" : "slipConfigs.deleteHint", { name: editor.target!.name })}</p>}
        {editor.action === "create" && <Check><input type="checkbox" checked={isDefault} disabled={busy} onChange={event => setDefault(event.currentTarget.checked)} />{m.text("slipConfigs.useDefault")}</Check>}
        {error && <p role="alert">{m.text(error)}</p>}
      </DialogContent>
    </CriteriaDialog>}
  </Panel>;
}
