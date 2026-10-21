"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import styled from "styled-components";
import { Definitions, Muted, Notice, Panel, PanelHeader, SegmentButton, Segmented } from "@/components/analytics/dashboard/dashboard-styles";
import { formatPhone, normalizePhone } from "@/domain/phone";
import { PhoneInput, TextInput } from "@/components/ui/controls";
import { publicPolicy } from "@/domain/public-policy";
import { editableSettingFields, isProtectedSettingField, paywallModes, settingLabels, settingsRules, type EditableSettingField,
  subscriptionIdentityVariables, type ModeRequirement, type PaywallMode, type SettingsPageData, type SubscriptionSettings } from "@/domain/subscription-settings";
import { ActionButton, ButtonRow, FieldBlock, FieldError, FieldRow, FormStack, Hint, postAdmin, replyErrors, replyMessage,
  Requirements, type AdminReply } from "./admin-form";

type Draft = Record<EditableSettingField, string>;
type Status = Readonly<{ tone: "info" | "error" | "warning"; text: string; list?: readonly string[] }> | null;
/** A stored save or mode switch; `source` and `requirements` are missing when the page data could not be read again. */
type SavedReply = Omit<SettingsPageData, "source" | "requirements"> & Partial<Pick<SettingsPageData, "source" | "requirements">> & { cleared?: string[] };
const phoneFields = new Set<EditableSettingField>(["mtnNumber", "airtelNumber", "contactPhone", "whatsappPhone"]);
const shortcutFields = new Set<EditableSettingField>(["mtnMenuShortcut", "airtelMenuShortcut"]);
const numberFields = new Set<EditableSettingField>(["maxUnlockedDevices", "trialDays", "screenshotRetentionDays"]);
const modeLabels: Record<PaywallMode, string> = { off: "Off", test: "Test", on: "On" };
const modeDone: Record<PaywallMode, string> = { off: "Paid access is now off.", test: "Paid access is now in test mode.", on: "Paid access is now on." };
const modeExplanations: Record<PaywallMode, string> = {
  off: "Phone sign-in stays open. Payments and trials are closed; predictions and odds still require current access.",
  test: "All account and payment flows are open for testing. Predictions and odds require current access for every viewer.",
  on: "Everyone who has not unlocked a paid period sees the free view.",
};
/** A second tap must follow within this time, so a stray tap never switches paid access. */
const armedMs = 8_000;

function draftOf(settings: SubscriptionSettings): Draft {
  return Object.fromEntries(editableSettingFields.map((field) => {
    const value = settings[field];
    return [field, value === null ? "" : phoneFields.has(field) ? formatPhone(String(value)) : String(value)];
  })) as Draft;
}

/** The value a field would save, normalized as the server does; text it cannot read is sent as typed, so the server names the problem. */
function valueOf(field: EditableSettingField, text: string): SubscriptionSettings[EditableSettingField] | string {
  if (phoneFields.has(field)) return text.trim() === "" ? null : normalizePhone(text) ?? text;
  if (shortcutFields.has(field)) return text.replace(/\s+/gu, "") || null;
  if (numberFields.has(field)) return /^\d+$/u.test(text.trim()) ? Number(text.trim()) : text;
  if (field === "copyFormat") return text;
  return text.replace(/\r\n?/gu, "\n").trim() || null;
}

function changesOf(draft: Draft, settings: SubscriptionSettings): Partial<Record<EditableSettingField, unknown>> {
  return Object.fromEntries(editableSettingFields.flatMap((field) => {
    const value = valueOf(field, draft[field]);
    return value === settings[field] ? [] : [[field, value]];
  }));
}

const eat = (iso: string | null) => iso === null ? null : `${new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone,
  dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))} EAT`;

/**
 * The Settings page (prompts/monetization.md 5.7). The paywall mode switches only after a second tap. The other settings
 * save together; environment-managed identity fields are read-only. Historical fixture edits retain password re-entry.
 */
export function SettingsEditor({ initial, username, sessionAuthorized = false }: { initial: SettingsPageData; username: string; sessionAuthorized?: boolean }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [askPassword, setAskPassword] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<PaywallMode | null>(null);
  const settings = view.settings;
  const environmentFields: readonly string[] = view.environmentFields ?? [];
  const changes = changesOf(draft, settings);
  const changed = Object.keys(changes) as EditableSettingField[];
  const needsPassword = !sessionAuthorized && (askPassword || changed.some(isProtectedSettingField));

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), armedMs);
    return () => clearTimeout(timer);
  }, [armed]);

  /**
   * Shows what the server stored. A save also resets the form; a mode switch keeps any edits not saved yet. A reply
   * without requirements saved but could not read the page data again, so what each mode needs is kept until a reload.
   */
  function accept(reply: AdminReply, text: string, { resetForm }: { resetForm: boolean }) {
    const next = reply.body as unknown as SavedReply;
    setView((shown) => ({ ...shown, settings: next.settings, protectedFields: next.protectedFields, diagnostics: next.diagnostics,
      ...(next.environmentFields ? { environmentFields: next.environmentFields } : {}),
      ...(next.requirements ? { source: next.source ?? shown.source, requirements: next.requirements } : {}) }));
    if (resetForm) { setDraft(draftOf(next.settings)); setErrors({}); setPassword(""); setAskPassword(false); }
    const cleared = (next.cleared ?? []).map((field) => settingLabels[field as EditableSettingField] ?? field);
    const notes = [text,
      ...(cleared.length > 0 ? [`Cleared because its number changed: ${cleared.join(" and ")}. Test the menu on your phone with the new number, then enter it again.`] : []),
      ...(next.requirements ? [] : ["Reload the page to see what each mode still needs."])];
    setStatus({ tone: notes.length > 1 ? "warning" : "info", text: notes.join(" ") });
  }

  function refuse(reply: AdminReply) {
    const body = reply.body;
    if (body.error === "password-required") setAskPassword(true);
    if (body.error === "password-invalid") { setPassword(""); setErrors({ password: String(body.message) }); }
    else setErrors(replyErrors(reply));
    const missing = Array.isArray(body.missing) ? (body.missing as ModeRequirement[]).map(({ message }) => message) : undefined;
    setStatus({ tone: "error", text: replyMessage(reply, "The settings were not saved."), ...(missing ? { list: missing } : {}) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (changed.length === 0) return;
    setBusy(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "save", changes, ...(needsPassword ? { password } : {}) });
    setBusy(false);
    if (reply.ok) accept(reply, "Settings saved.", { resetForm: true });
    else refuse(reply);
  }

  async function chooseMode(mode: PaywallMode) {
    if (mode === settings.paywallMode) return;
    if (armed !== mode) { setArmed(mode); setStatus(null); return; }
    setArmed(null); setBusy(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "mode", mode });
    setBusy(false);
    if (reply.ok) accept(reply, `${modeDone[mode]} Every server picks it up within 30 seconds.`, { resetForm: false });
    else refuse(reply);
  }

  const field = (key: EditableSettingField) => ({
    id: `setting-${key}`, value: draft[key], disabled: busy || environmentFields.includes(key),
    "aria-invalid": errors[key] ? true : undefined, "aria-describedby": `setting-${key}-note`,
    onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: event.target.value }),
  });
  const note = (key: EditableSettingField, children: ReactNode) => (
    <span id={`setting-${key}-note`}>{errors[key] ? <FieldError>{errors[key]}</FieldError> : environmentFields.includes(key)
      ? <Hint>Set {subscriptionIdentityVariables[key as keyof typeof subscriptionIdentityVariables]} in the environment and restart.</Hint> : children}</span>
  );
  const phone = (key: EditableSettingField) => {
    return <PhoneInput id={`setting-${key}`} label={settingLabels[key]} value={draft[key]} disabled={busy || environmentFields.includes(key)}
      error={errors[key]} onValueChange={(value) => setDraft({ ...draft, [key]: value })}
      {...(environmentFields.includes(key) ? { hint: `Set ${subscriptionIdentityVariables[key as keyof typeof subscriptionIdentityVariables]} in the environment and restart.` } : {})} />;
  };
  const shortcut = (key: "mtnMenuShortcut" | "airtelMenuShortcut", number: "mtnNumber" | "airtelNumber") => {
    const willClear = changed.includes(number) && !changed.includes(key) && settings[key] !== null;
    return (
      <FormStack>
        <FieldBlock>{settingLabels[key]} (optional)
          <input {...field(key)} inputMode="tel" autoComplete="off" spellCheck={false} maxLength={settingsRules.shortcutMaxLength} />
          {note(key, <Hint>{willClear ? "Saving clears this shortcut, because its number changed."
            : "Digits, * and #. {amount} becomes the plan price. Shown on Android only; test it on your phone first."}</Hint>)}
        </FieldBlock>
        <ButtonRow>
          <ActionButton type="button" disabled={busy || environmentFields.includes(key)} onClick={() => setDraft({ ...draft, [key]: `${draft[key]}{amount}` })}>Insert {"{amount}"}</ActionButton>
        </ButtonRow>
      </FormStack>
    );
  };
  const text = (key: EditableSettingField, maximum: number, hint: string) => (
    <FieldBlock>{settingLabels[key]}<input {...field(key)} maxLength={maximum} autoComplete="off" />{note(key, <Hint>{hint}</Hint>)}</FieldBlock>
  );
  const range = (key: "maxUnlockedDevices" | "trialDays", hint: string) => {
    const { min, max } = settingsRules[key];
    return (
      <FieldBlock>{settingLabels[key]}
        <select {...field(key)}>{Array.from({ length: max - min + 1 }, (_, index) => min + index).map((value) => <option key={value} value={value}>{value}</option>)}</select>
        {note(key, <Hint>{hint}</Hint>)}
      </FieldBlock>
    );
  };

  return (
    <>
      <Panel aria-labelledby="mode-title">
        <PanelHeader><h2 id="mode-title">Paid access</h2><p>Now: <strong>{modeLabels[settings.paywallMode]}</strong></p></PanelHeader>
        <Muted>{modeExplanations[settings.paywallMode]}</Muted>
        <ModeButtons role="group" aria-label="Paid access mode">
          {paywallModes.map((mode) => {
            const missing = mode === "off" ? [] : view.requirements[mode];
            return (
              <SegmentButton key={mode} type="button" $selected={mode === settings.paywallMode} aria-pressed={mode === settings.paywallMode}
                disabled={busy || (mode !== settings.paywallMode && missing.length > 0)} onClick={() => void chooseMode(mode)}>
                {armed === mode ? `Tap again: switch to ${modeLabels[mode]}` : modeLabels[mode]}
              </SegmentButton>
            );
          })}
        </ModeButtons>
        {armed && <Notice $tone="warning" role="status">{modeExplanations[armed]} Tap the button again within {armedMs / 1000} seconds to switch.</Notice>}
        {(["test", "on"] as const).filter((mode) => view.requirements[mode].length > 0 && mode !== settings.paywallMode).map((mode) => (
          <div key={mode}>
            <Muted>{modeLabels[mode]} needs:</Muted>
            <Requirements>{view.requirements[mode].map(({ key, message }) => <li key={key}>{message}</li>)}</Requirements>
          </div>
        ))}
      </Panel>

      <form onSubmit={save} noValidate data-analytics-ignore>
        <FormStack>
          <Panel aria-labelledby="payment-title">
            <PanelHeader><h2 id="payment-title">Payment numbers</h2><p>{environmentFields.length ? "Managed through environment variables" : "Password needed to change"}</p></PanelHeader>
            <Muted>Subscribers pay these numbers. A network without a number is hidden on Get access.</Muted>
            <FieldRow>{phone("mtnNumber")}{text("mtnName", settingsRules.nameMaxLength, "The name MoMo shows when paying this number")}</FieldRow>
            {shortcut("mtnMenuShortcut", "mtnNumber")}
            <FieldRow>{phone("airtelNumber")}{text("airtelName", settingsRules.nameMaxLength, "The name Airtel Money shows when paying this number")}</FieldRow>
            {shortcut("airtelMenuShortcut", "airtelNumber")}
          </Panel>

          <Panel aria-labelledby="contact-title">
            <PanelHeader><h2 id="contact-title">Contact</h2><p>{environmentFields.length ? "Managed through environment variables" : "Password needed to change"}</p></PanelHeader>
            <Muted>Call admin and WhatsApp admin links, and the number Safety tips tell subscribers to trust.</Muted>
            <FieldRow>{phone("contactPhone")}{phone("whatsappPhone")}</FieldRow>
          </Panel>

          <Panel aria-labelledby="page-title">
            <PanelHeader><h2 id="page-title">Get access page</h2></PanelHeader>
            <FieldBlock>{settingLabels.copyFormat}
              <select {...field("copyFormat")}>
                <option value="international">International (256 7…)</option>
                <option value="local">Local (07…)</option>
              </select>
              {note("copyFormat", <Hint>What the Copy number button copies; numbers always show as 256 772 123 456.</Hint>)}
            </FieldBlock>
            <FieldBlock>{settingLabels.paymentNote}
              <textarea {...field("paymentNote")} maxLength={settingsRules.paymentNoteMaxLength} />
              {note("paymentNote", <Hint>Optional, shown beside the numbers. {draft.paymentNote.length}/{settingsRules.paymentNoteMaxLength}</Hint>)}
            </FieldBlock>
            {text("reviewTime", settingsRules.reviewTimeMaxLength, "Optional, for example: usually within 30 minutes, 8:00–22:00 EAT")}
          </Panel>

          <Panel aria-labelledby="access-title">
            <PanelHeader><h2 id="access-title">Access</h2></PanelHeader>
            <FieldRow>
              {range("maxUnlockedDevices", "Paid access unlocks this many signed-in devices; a new sign-in takes the slot of the device unlocked longest ago.")}
              {range("trialDays", "0 hides the free-trial offer.")}
            </FieldRow>
            <FieldBlock>{settingLabels.screenshotRetentionDays}
              <input {...field("screenshotRetentionDays")} inputMode="numeric" autoComplete="off" />
              {note("screenshotRetentionDays", <Hint>{settingsRules.screenshotRetentionDays.min}–{settingsRules.screenshotRetentionDays.max} days</Hint>)}
            </FieldBlock>
          </Panel>

          <Panel aria-labelledby="save-title">
            <PanelHeader><h2 id="save-title">Save</h2><p>{changed.length === 0 ? "No changes" : `${changed.length} changed`}</p></PanelHeader>
            {needsPassword && changed.length > 0 && <>
              <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
              <TextInput label="Owner password" id="setting-password" name="password" type="password" autoComplete="current-password" value={password} disabled={busy} required
                error={errors.password} hint={errors.password ? undefined : "Needed for payment and contact numbers, registered names and menu shortcuts. Wrong passwords count towards the sign-in limit."}
                onChange={(event) => setPassword(event.target.value)} />
            </>}
            <ButtonRow>
              <ActionButton type="submit" $variant="primary" disabled={busy || changed.length === 0 || (needsPassword && password === "")}>Save changes</ActionButton>
              <ActionButton type="button" disabled={busy || changed.length === 0} onClick={() => { setDraft(draftOf(settings)); setErrors({}); setStatus(null); }}>Undo changes</ActionButton>
            </ButtonRow>
            <Muted>
              {settings.updatedAt ? `Last saved ${eat(settings.updatedAt)} by ${settings.updatedBy}.` : "Not saved yet: these are the defaults."}
              {" "}Payment numbers last changed: {eat(settings.paymentNumbersChangedAt) ?? "never"}.
            </Muted>
          </Panel>
        </FormStack>
      </form>

      {status && <Notice $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>
        {status.text}
        {status.list && <Requirements>{status.list.map((item) => <li key={item}>{item}</li>)}</Requirements>}
      </Notice>}

      <Panel aria-labelledby="diagnostics-title">
        <PanelHeader><h2 id="diagnostics-title">Client address diagnostics</h2></PanelHeader>
        <Muted>
          Sign-in and member limits key on <strong>{view.diagnostics.address}</strong>: the last X-Forwarded-For entry, else X-Real-IP. On the
          host, send a request with a made-up X-Forwarded-For; the proxy should add the real address after it.
        </Muted>
        <HeaderList>
          {view.diagnostics.headers.map(({ name, value }) => (
            <div key={name}><dt>{name}</dt><dd>{value ?? "not sent"}</dd></div>
          ))}
        </HeaderList>
      </Panel>
    </>
  );
}

const HeaderList = styled(Definitions)`
  dd { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
const ModeButtons = styled(Segmented)`
  ${SegmentButton} {
    flex: 1 1 6rem;
    min-block-size: ${({ theme }) => theme.control.minHeight};
    font-size: ${({ theme }) => theme.typography.scale.body};
  }
`;
