"use client";

import { Fragment, useRef, useState } from "react";
import { messageEvents, messagePlaceholders, previewMessageValues, renderMessageTemplate, type MessageTemplateSettings } from "@/domain/message-templates";
import { ActionButton, FieldBlock, FieldError, Hint } from "./admin-form";
import { EventList, FeatureBody, FeatureHeading, MessageLayout, MessageOptions, MessagePreview, MessageTabs, SourceList, VariableBar } from "./settings-feature-styles";

type EventKey = keyof MessageTemplateSettings["events"];
type Channel = "sms" | "whatsapp" | "email";

export function SettingsMessageEditor({ value, disabled, error, onChange }: {
  value: MessageTemplateSettings; disabled: boolean; error?: string | undefined; onChange: (value: MessageTemplateSettings) => void;
}) {
  const [eventKey, setEventKey] = useState<EventKey>("account-verification");
  const [channel, setChannel] = useState<Channel>("sms");
  const [variable, setVariable] = useState("");
  const smsInput = useRef<HTMLTextAreaElement>(null), parameterInput = useRef<HTMLTextAreaElement>(null);
  const event = messageEvents.find(item => item.key === eventKey)!;
  const current = value.events[eventKey];
  const source = channel === "whatsapp" ? current.whatsapp.parameters.join("\n") : current.sms;
  function update(changes: Partial<typeof current>) {
    onChange({ ...value, events: { ...value.events, [eventKey]: { ...current, ...changes } } });
  }
  function updateSource(next: string) {
    if (channel === "whatsapp") update({ whatsapp: { ...current.whatsapp, parameters: next === "" ? [] : next.split("\n") } });
    else update({ sms: next });
  }
  function insert() {
    if (!variable) return;
    const control = channel === "whatsapp" ? parameterInput.current : smsInput.current;
    const start = control?.selectionStart ?? source.length, end = control?.selectionEnd ?? start;
    const token = `{{${variable}}}`;
    updateSource(`${source.slice(0, start)}${token}${source.slice(end)}`);
    requestAnimationFrame(() => { control?.focus(); control?.setSelectionRange(start + token.length, start + token.length); });
  }
  let preview = "";
  try {
    const values = previewMessageValues(eventKey);
    preview = channel === "whatsapp" ? current.whatsapp.parameters.length === 0 ? "No parameters required."
      : current.whatsapp.parameters.map(parameter => renderMessageTemplate(eventKey, parameter, values)).join("\n")
      : renderMessageTemplate(eventKey, source, values);
  }
  catch (failure) { preview = failure instanceof Error ? failure.message : "Check the variables in this template."; }
  const fixedWhatsApp = event.verification && channel === "whatsapp";
  return <MessageLayout id="setting-messageTemplates" tabIndex={-1} aria-describedby={error ? "setting-messageTemplates-error" : undefined}>
    <EventList aria-label="Message events">{messageEvents.map(item => <button type="button" key={item.key} aria-current={eventKey === item.key ? "true" : undefined}
      onClick={() => { setEventKey(item.key); setVariable(""); }}><strong>{item.label}</strong><span>{item.verification ? "Member chooses channel" : value.events[item.key].enabled ? "Enabled" : "Disabled"}</span></button>)}</EventList>
    <FeatureBody>
      <FeatureHeading><div><h2>{event.label}</h2><p>{event.description}</p></div></FeatureHeading>
      {error && <FieldError id="setting-messageTemplates-error" role="alert">{error}</FieldError>}
      {event.verification ? <Hint>Verification is required. The member explicitly chooses SMS or WhatsApp; code expiry and request limits stay the same.</Hint>
        : <MessageOptions><label><input type="checkbox" checked={current.enabled} disabled={disabled} onChange={change => update({ enabled: change.target.checked })} />Send this message automatically</label></MessageOptions>}
      {!event.verification && <>
        <MessageOptions aria-label="Delivery channels">
          <label><input type="checkbox" checked={current.channels.includes("sms")} disabled={disabled} onChange={change => update({ channels: change.target.checked
            ? [...current.channels.filter(item => item !== "sms"), "sms"] : current.channels.filter(item => item !== "sms") })} />SMS</label>
          <label><input type="checkbox" checked={current.channels.includes("whatsapp")} disabled={disabled} onChange={change => update({ channels: change.target.checked
            ? [...current.channels.filter(item => item !== "whatsapp"), "whatsapp"] : current.channels.filter(item => item !== "whatsapp") })} />WhatsApp</label>
          <label><input type="checkbox" disabled checked={false} />Email · not configured</label>
        </MessageOptions>
        <Hint>Select one channel, or both to send separately through each. WhatsApp sends only to members who opted into account updates and requires a provider-approved template.</Hint>
      </>}
      <MessageTabs aria-label="Message channel editor">{(["sms", "whatsapp", "email"] as const).map(item => <button type="button" key={item} aria-pressed={channel === item}
        onClick={() => { setChannel(item); setVariable(""); }}>{item === "sms" ? "SMS" : item === "whatsapp" ? "WhatsApp" : "Email"}</button>)}</MessageTabs>
      {channel === "email" ? <MessagePreview><strong>Email is not configured</strong><p>Email delivery requires a verified email address on the account and a configured email provider.</p></MessagePreview> : <>
        {channel === "sms" ? <FieldBlock htmlFor="message-sms-body">Message text<textarea ref={smsInput} id="message-sms-body" aria-label="Message text" aria-describedby="message-sms-hint" rows={5} spellCheck={false} value={current.sms}
          disabled={disabled} maxLength={1600} onChange={change => update({ sms: change.target.value })} /><Hint id="message-sms-hint">{current.sms.length}/1600 characters · SMS length can affect delivery cost.</Hint></FieldBlock>
          : <>
            <FieldBlock htmlFor="message-whatsapp-template">Approved WhatsApp template<input id="message-whatsapp-template" value={current.whatsapp.templateName}
              disabled={disabled || fixedWhatsApp} placeholder="Provider-approved template name" maxLength={128}
              onChange={change => update({ whatsapp: { ...current.whatsapp, templateName: change.target.value } })} /></FieldBlock>
            <FieldBlock htmlFor="message-whatsapp-parameters">Template parameters · one per line<textarea ref={parameterInput} id="message-whatsapp-parameters" aria-label="Template parameters" aria-describedby="message-whatsapp-parameters-hint" rows={3}
              disabled={disabled || fixedWhatsApp} spellCheck={false} value={current.whatsapp.parameters.join("\n")} onChange={change => updateSource(change.target.value)} />
              <Hint id="message-whatsapp-parameters-hint">{fixedWhatsApp ? "The provider authentication template receives the verification code as its single parameter." : "Keep the parameter order identical to your approved provider template. The message wording is managed by the provider."}</Hint>
            </FieldBlock>
          </>}
        {!fixedWhatsApp && <VariableBar>
          <select aria-label="Variable to insert" value={variable} disabled={disabled} onChange={change => setVariable(change.target.value)}>
            <option value="">Choose a variable…</option>{event.placeholders.map(name => <option key={name} value={name}>{messagePlaceholders[name].label} · {`{{${name}}}`}</option>)}
          </select>
          <ActionButton type="button" disabled={disabled || !variable} onClick={insert}>Insert variable</ActionButton>
        </VariableBar>}
        <MessagePreview aria-live="polite"><strong>{channel === "whatsapp" ? "Parameter preview · sample data" : "Message preview · sample data"}</strong><pre>{preview || "Your message preview will appear here."}</pre></MessagePreview>
        <details><summary>Variable sources</summary><SourceList>{event.placeholders.map(name => <Fragment key={name}><dt>{`{{${name}}}`}</dt><dd>{messagePlaceholders[name].source}</dd></Fragment>)}</SourceList></details>
        <Hint>Templates take effect after saving. Saving or previewing does not send a message.</Hint>
      </>}
    </FeatureBody>
  </MessageLayout>;
}
