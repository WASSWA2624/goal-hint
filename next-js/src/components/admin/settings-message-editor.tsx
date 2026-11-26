"use client";

import { Fragment, useRef, useState } from "react";
import { messageEvents, messagePlaceholders, previewMessageValues, renderMessageTemplate, type MessageTemplateSettings } from "@/domain/message-templates";
import { ActionButton, FieldBlock, FieldError, Hint } from "./admin-form";
import { FeatureBody, FeatureHeading, MessagePreview, MessageTabs, SourceList, VariableBar } from "./settings-feature-styles";

const eventKey = "password-reset";
const event = messageEvents.find(item => item.key === eventKey)!;
const channels = [{ key: "sms", label: "SMS" }, { key: "whatsapp", label: "WhatsApp" }] as const;
type Channel = (typeof channels)[number]["key"];

export function SettingsMessageEditor({ value, disabled, error, onChange }: {
  value: MessageTemplateSettings; disabled: boolean; error?: string | undefined; onChange: (value: MessageTemplateSettings) => void;
}) {
  const [channel, setChannel] = useState<Channel>("sms");
  const [variable, setVariable] = useState("");
  const smsInput = useRef<HTMLTextAreaElement>(null);
  const current = value.events[eventKey];

  function updateSource(sms: string) {
    onChange({ ...value, events: { ...value.events, [eventKey]: { ...current, sms } } });
  }

  function insert() {
    if (!variable) return;
    const control = smsInput.current;
    const start = control?.selectionStart ?? current.sms.length, end = control?.selectionEnd ?? start;
    const token = `{{${variable}}}`;
    updateSource(`${current.sms.slice(0, start)}${token}${current.sms.slice(end)}`);
    requestAnimationFrame(() => { control?.focus(); control?.setSelectionRange(start + token.length, start + token.length); });
  }

  let preview = "";
  try {
    const values = previewMessageValues(eventKey);
    preview = channel === "whatsapp" ? current.whatsapp.parameters.map(parameter => renderMessageTemplate(eventKey, parameter, values)).join("\n")
      : renderMessageTemplate(eventKey, current.sms, values);
  }
  catch (failure) { preview = failure instanceof Error ? failure.message : "Check the variables in this template."; }

  return <FeatureBody id="setting-messageTemplates" tabIndex={-1} aria-describedby={error ? "setting-messageTemplates-error" : undefined}>
    <FeatureHeading><div><h2>{event.label}</h2><p>{event.description}</p></div></FeatureHeading>
    {error && <FieldError id="setting-messageTemplates-error" role="alert">{error}</FieldError>}
    <Hint>This template is kept for reference. Use Password Requests to prepare and share a reset link.</Hint>
    <MessageTabs role="group" aria-label="Password reset delivery channel">{channels.map(({ key, label }) => <button type="button" key={key} aria-pressed={channel === key}
      onClick={() => setChannel(key)}>{label}</button>)}</MessageTabs>
    {channel === "sms" ? <>
      <FieldBlock label="Message text" description={<Hint id="message-sms-hint">{current.sms.length}/1600 characters · SMS length can affect delivery cost.</Hint>}>
        <textarea ref={smsInput} id="message-sms-body" aria-label="Message text" aria-describedby="message-sms-hint" rows={5} spellCheck={false} value={current.sms}
          disabled={disabled} maxLength={1600} onChange={change => updateSource(change.target.value)} />
      </FieldBlock>
      <VariableBar>
        <FieldBlock label="Variable to insert"><select aria-label="Variable to insert" value={variable} disabled={disabled} onChange={change => setVariable(change.target.value)}>
          <option value="">Choose a variable…</option>{event.placeholders.map(name => <option key={name} value={name}>{messagePlaceholders[name].label} · {`{{${name}}}`}</option>)}
        </select></FieldBlock>
        <ActionButton type="button" disabled={disabled || !variable} onClick={insert}>Insert variable</ActionButton>
      </VariableBar>
      <details><summary>Variable sources</summary><SourceList>{event.placeholders.map(name => <Fragment key={name}><dt>{`{{${name}}}`}</dt><dd>{messagePlaceholders[name].source}</dd></Fragment>)}</SourceList></details>
    </> : <>
      <FieldBlock label="Approved WhatsApp template"><input id="message-whatsapp-template" value={current.whatsapp.templateName} readOnly /></FieldBlock>
      <FieldBlock label="Template parameters" description={<Hint id="message-whatsapp-parameters-hint">The approved template takes the verification code as its single parameter.</Hint>}>
        <textarea id="message-whatsapp-parameters" aria-label="Template parameters" aria-describedby="message-whatsapp-parameters-hint" rows={3}
          readOnly value={current.whatsapp.parameters.join("\n")} />
      </FieldBlock>
    </>}
    <MessagePreview aria-live="polite"><strong>{channel === "whatsapp" ? "Parameter preview · sample data" : "Message preview · sample data"}</strong>
      <pre>{preview || "Your message preview will appear here."}</pre></MessagePreview>
  </FeatureBody>;
}
