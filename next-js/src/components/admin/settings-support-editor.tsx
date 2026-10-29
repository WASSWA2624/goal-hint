"use client";

import { supportContactRules, type SupportContact } from "@/domain/support-contacts";
import { PhoneInput } from "@/components/ui/phone-input";
import { ActionButton, FieldBlock, FieldError, Hint } from "./admin-form";
import { ContactFields, ContactList, ContactOptions, ContactRow, FeatureBody, FeatureHeading } from "./settings-feature-styles";

export function SettingsSupportEditor({ contacts, disabled, error, onChange }: {
  contacts: readonly SupportContact[]; disabled: boolean; error?: string | undefined; onChange: (contacts: readonly SupportContact[]) => void;
}) {
  function update(id: string, changes: Partial<SupportContact>) {
    onChange(contacts.map(contact => contact.id === id ? { ...contact, ...changes } : changes.primary ? { ...contact, primary: false } : contact));
  }
  function move(index: number, offset: number) {
    const next = [...contacts];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    onChange(next);
  }
  return <FeatureBody id="setting-supportContacts" tabIndex={-1} aria-describedby={error ? "setting-supportContacts-error" : undefined}>
    <FeatureHeading><div><h2>Support numbers</h2><p>Let customers choose the network and contact method that suits them.</p></div>
      <ActionButton type="button" disabled={disabled || contacts.length >= supportContactRules.max} onClick={() => onChange([...contacts, {
        id: crypto.randomUUID(), label: "", network: "other", phone: "256", calls: true, whatsapp: false, enabled: true, primary: contacts.length === 0,
      }])}>+ Add support number</ActionButton>
    </FeatureHeading>
    {error && <FieldError id="setting-supportContacts-error" role="alert">{error}</FieldError>}
    {contacts.length === 0 && <Hint>No support numbers added. Add a number to offer calls or WhatsApp support.</Hint>}
    <ContactList>{contacts.map((contact, index) => <ContactRow key={contact.id} aria-label={`Support contact ${index + 1}`}>
      <ContactFields>
        <FieldBlock htmlFor={`support-${contact.id}-label`}>Contact label<input id={`support-${contact.id}-label`} value={contact.label} disabled={disabled} maxLength={supportContactRules.labelMaxLength}
          placeholder="e.g. MTN support" onChange={event => update(contact.id, { label: event.target.value })} /></FieldBlock>
        <FieldBlock htmlFor={`support-${contact.id}-network`}>Network<select id={`support-${contact.id}-network`} value={contact.network} disabled={disabled}
          onChange={event => update(contact.id, { network: event.target.value as SupportContact["network"] })}>
          <option value="mtn">MTN</option><option value="airtel">Airtel</option><option value="other">Other</option>
        </select></FieldBlock>
        <PhoneInput id={`support-${contact.id}-phone`} label="Phone number" value={contact.phone} disabled={disabled}
          onValueChange={phone => update(contact.id, { phone })} />
      </ContactFields>
      <ContactOptions>
        <label><input type="checkbox" checked={contact.calls} disabled={disabled} onChange={event => update(contact.id, { calls: event.target.checked })} />Calls</label>
        <label><input type="checkbox" checked={contact.whatsapp} disabled={disabled} onChange={event => update(contact.id, { whatsapp: event.target.checked })} />WhatsApp</label>
        <label><input type="checkbox" checked={contact.enabled} disabled={disabled} onChange={event => update(contact.id, { enabled: event.target.checked, ...(!event.target.checked ? { primary: false } : {}) })} />Visible to customers</label>
        <label><input type="radio" name="support-primary" checked={contact.primary} disabled={disabled || !contact.enabled}
          onChange={() => update(contact.id, { primary: true })} />Primary</label>
        <div>
          <ActionButton type="button" aria-label={`Move ${contact.label || "contact"} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</ActionButton>
          <ActionButton type="button" aria-label={`Move ${contact.label || "contact"} down`} disabled={disabled || index === contacts.length - 1} onClick={() => move(index, 1)}>↓</ActionButton>
          <ActionButton type="button" aria-label={`Remove ${contact.label || `support contact ${index + 1}`}`} disabled={disabled} onClick={() => onChange(contacts.filter(item => item.id !== contact.id))}>Remove</ActionButton>
        </div>
      </ContactOptions>
    </ContactRow>)}</ContactList>
    <Hint>The primary number is used in messages and compact support links. Additional numbers appear as labelled desktop contact options.</Hint>
  </FeatureBody>;
}
