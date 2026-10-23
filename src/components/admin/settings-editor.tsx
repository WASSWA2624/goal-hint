"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { PhoneInput, TextInput } from "@/components/ui/controls";
import { ChatIcon, CheckIcon, ChevronDownIcon, DialpadIcon, DocumentIcon, GiftIcon, LockIcon, PhoneIcon, ResetIcon, ShieldIcon, SlidersIcon } from "@/components/ui/icons";
import { formatPhone, normalizePhone } from "@/domain/phone";
import { publicPolicy } from "@/domain/public-policy";
import { editableSettingFields, isProtectedSettingField, paywallModes, settingLabels, settingsRules, type EditableSettingField,
  type ModeRequirement, type PaywallMode, type SettingsPageData, type SubscriptionSettings } from "@/domain/subscription-settings";
import { ActionButton, ButtonRow, FieldBlock, FieldError, FormStack, Hint, postAdmin, replyErrors, replyMessage, Requirements, type AdminReply } from "./admin-form";
import { AdvancedDetails, CardTitle, ManagedBadge, ModeOption, ModeOptions, NavButton, NetworkCard, RequirementList, SaveBar, SaveSummary,
  SettingsCard, SettingsCardHeader, SettingsConfirmation, SettingsContent, SettingsFacts, SettingsGrid, SettingsHint, SettingsLayout, SettingsNav } from "./settings-styles";

type Draft = Record<EditableSettingField, string>;
type Section = "payments" | "support" | "access" | "display";
type Status = Readonly<{ tone: "info" | "error" | "warning"; text: string; list?: readonly string[] }> | null;
/** A successful save may omit refreshed availability when that subsequent read fails. */
type SavedReply = Omit<SettingsPageData, "source" | "requirements"> & Partial<Pick<SettingsPageData, "source" | "requirements">> & { cleared?: string[] };
const sections = [
  { key: "payments", label: "Payments", Icon: DialpadIcon }, { key: "support", label: "Support", Icon: ChatIcon },
  { key: "access", label: "Access", Icon: ShieldIcon }, { key: "display", label: "Display", Icon: SlidersIcon },
] as const;
const sectionOf: Record<EditableSettingField, Section> = {
  mtnNumber: "payments", mtnName: "payments", mtnMenuShortcut: "payments", airtelNumber: "payments", airtelName: "payments", airtelMenuShortcut: "payments",
  contactPhone: "support", whatsappPhone: "support", trialDays: "access", screenshotRetentionDays: "access", maxUnlockedDevices: "access",
  copyFormat: "display", paymentNote: "display", reviewTime: "display",
};
const phoneFields = new Set<EditableSettingField>(["mtnNumber", "airtelNumber", "contactPhone", "whatsappPhone"]);
const shortcutFields = new Set<EditableSettingField>(["mtnMenuShortcut", "airtelMenuShortcut"]);
const numberFields = new Set<EditableSettingField>(["maxUnlockedDevices", "trialDays", "screenshotRetentionDays"]);
const modeLabels: Record<PaywallMode, string> = { off: "Off", test: "Test", on: "On" };
const modeCaptions: Record<PaywallMode, string> = { off: "Payments closed", test: "Testing enabled", on: "Subscriptions open" };
const modeExplanations: Record<PaywallMode, string> = {
  off: "Payments and trials are closed. Predictions still require current access.",
  test: "Account and payment flows are open for testing. Predictions require current access.",
  on: "Subscriptions are open. Visitors without access see the free view.",
};
const requirementLabels: Record<ModeRequirement["key"], string> = {
  plan: "Add an active plan", "payment-number": "Add a payment number and name", contact: "Add a support number",
  privacy: "Publish the privacy notice", terms: "Publish the terms",
};

function draftOf(settings: SubscriptionSettings): Draft {
  return Object.fromEntries(editableSettingFields.map((field) => {
    const value = settings[field];
    return [field, value === null ? "" : phoneFields.has(field) ? formatPhone(String(value)) : String(value)];
  })) as Draft;
}

/** Normalize before comparison; invalid values still reach the server's field validation. */
function valueOf(field: EditableSettingField, text: string): SubscriptionSettings[EditableSettingField] | string {
  if (phoneFields.has(field)) return text.trim() === "" ? null : normalizePhone(text) ?? text;
  if (shortcutFields.has(field)) return text.replace(/\s+/gu, "") || null;
  if (numberFields.has(field)) return /^\d+$/u.test(text.trim()) ? Number(text.trim()) : text;
  if (field === "copyFormat") return text;
  return text.replace(/\r\n?/gu, "\n").trim() || null;
}

function changesOf(draft: Draft, settings: SubscriptionSettings, managed: readonly string[]) {
  return Object.fromEntries(editableSettingFields.flatMap((field) => {
    const value = valueOf(field, draft[field]);
    return managed.includes(field) || value === settings[field] ? [] : [[field, value]];
  }));
}

const savedTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone,
  dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Section navigation shares one draft and save action; mode changes require a separate confirmation. */
export function SettingsEditor({ initial, username, sessionAuthorized = false }: { initial: SettingsPageData; username: string; sessionAuthorized?: boolean }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.settings));
  const [section, setSection] = useState<Section>("payments");
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [askPassword, setAskPassword] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<PaywallMode | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const settings = view.settings;
  const managed: readonly string[] = view.environmentFields ?? [];
  const changes = changesOf(draft, settings, managed);
  const changed = Object.keys(changes) as EditableSettingField[];
  const needsPassword = !sessionAuthorized && (askPassword || changed.some(isProtectedSettingField));
  const activeSection = sections.find(item => item.key === section)!;
  const SectionIcon = activeSection.Icon;
  const missing = [...new Map((["test", "on"] as const).filter(mode => mode !== settings.paywallMode)
    .flatMap(mode => view.requirements[mode]).map(item => [item.key, item])).values()];

  useEffect(() => {
    const key = editableSettingFields.find(field => errors[field]);
    const target = key ? `setting-${key}` : errors.password ? "setting-password" : null;
    if (!target) return;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [errors]);

  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    document.getElementById(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [section, armed, busy]);

  function update(key: EditableSettingField, value: string) { setDraft(shown => ({ ...shown, [key]: value })); }
  function navigate(next: Section, focus = false) {
    if (focus) pendingFocus.current = "settings-section-title";
    setSection(next); setArmed(null);
  }
  function cancelMode() { pendingFocus.current = `setting-mode-${settings.paywallMode}`; setArmed(null); }

  function accept(reply: AdminReply, message: string, resetForm: boolean) {
    const next = reply.body as unknown as SavedReply;
    setView(shown => ({ ...shown, settings: next.settings, protectedFields: next.protectedFields, diagnostics: next.diagnostics,
      ...(next.environmentFields ? { environmentFields: next.environmentFields } : {}),
      ...(next.requirements ? { source: next.source ?? shown.source, requirements: next.requirements } : {}) }));
    if (resetForm) { setDraft(draftOf(next.settings)); setErrors({}); setPassword(""); setAskPassword(false); }
    const cleared = (next.cleared ?? []).map(field => settingLabels[field as EditableSettingField] ?? field);
    const notes = [message, ...(cleared.length ? [`${cleared.join(" and ")} cleared after the number changed.`] : []),
      ...(next.requirements ? [] : ["Reload to update availability."])];
    setStatus({ tone: notes.length > 1 ? "warning" : "info", text: notes.join(" ") });
  }

  function refuse(reply: AdminReply) {
    const body = reply.body;
    if (body.error === "password-required") setAskPassword(true);
    if (body.error === "password-invalid") setPassword("");
    const nextErrors = body.error === "password-invalid" ? { password: String(body.message) } : replyErrors(reply);
    const first = editableSettingFields.find(key => nextErrors[key]);
    if (first) {
      setSection(sectionOf[first]);
      if (shortcutFields.has(first) || first === "maxUnlockedDevices") setAdvanced(shown => ({ ...shown, [first]: true }));
    }
    setErrors(nextErrors);
    const list = Array.isArray(body.missing) ? (body.missing as ModeRequirement[]).map(item => requirementLabels[item.key] ?? item.message) : undefined;
    setStatus({ tone: "error", text: replyMessage(reply, "Changes were not saved."), ...(list ? { list } : {}) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || changed.length === 0) return;
    setArmed(null); setBusy(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "save", changes, ...(needsPassword ? { password } : {}) });
    setBusy(false);
    if (reply.ok) accept(reply, "Settings saved.", true);
    else refuse(reply);
  }

  async function confirmMode() {
    if (busy || !armed || armed === settings.paywallMode || (armed !== "off" && view.requirements[armed].length)) return;
    const mode = armed;
    pendingFocus.current = `setting-mode-${mode}`;
    setArmed(null); setBusy(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "mode", mode });
    setBusy(false);
    if (reply.ok) accept(reply, `Paid access: ${modeLabels[mode]}. Applies within 30 seconds.`, false);
    else refuse(reply);
  }

  const field = (key: EditableSettingField) => ({
    id: `setting-${key}`, value: draft[key], disabled: busy || managed.includes(key),
    "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `setting-${key}-error` : undefined,
    onChange: (event: { target: { value: string } }) => update(key, event.target.value),
  });
  const error = (key: EditableSettingField) => errors[key] && <FieldError id={`setting-${key}-error`}>{errors[key]}</FieldError>;
  const badge = <ManagedBadge title="Managed outside this page"><LockIcon />Managed</ManagedBadge>;
  const fact = (key: EditableSettingField, label: string, value?: ReactNode) => <SettingsFacts data-settings-managed="true"><div>
    <dt>{label}{badge}</dt><dd>{value ?? (settings[key] ? phoneFields.has(key) ? `+${formatPhone(String(settings[key]))}` : String(settings[key]) : "Not set")}</dd>
  </div></SettingsFacts>;
  const phone = (key: EditableSettingField, label: string) => managed.includes(key) ? fact(key, label)
    : <PhoneInput id={`setting-${key}`} label={label} value={draft[key]} disabled={busy} error={errors[key]} onValueChange={value => update(key, value)} />;
  const text = (key: EditableSettingField, label: string, maximum: number, placeholder?: string) => managed.includes(key) ? fact(key, label)
    : <FieldBlock htmlFor={`setting-${key}`}>{label}<input {...field(key)} maxLength={maximum} autoComplete="off" placeholder={placeholder} />{error(key)}</FieldBlock>;
  const details = (key: string, label: string, children: ReactNode) => <AdvancedDetails open={!!advanced[key]}
    onToggle={event => { const open = event.currentTarget.open; setAdvanced(shown => shown[key] === open ? shown : { ...shown, [key]: open }); }}>
    <summary><DialpadIcon />{label}<ChevronDownIcon /></summary><div>{children}</div>
  </AdvancedDetails>;
  const shortcut = (key: "mtnMenuShortcut" | "airtelMenuShortcut", number: "mtnNumber" | "airtelNumber") => managed.includes(key)
    ? fact(key, "Dial code", settings[key] ? "Configured" : "Not set")
    : details(key, "Dial code · optional", <>
      <FieldBlock htmlFor={`setting-${key}`}>Dial code<input {...field(key)} inputMode="tel" autoComplete="off" spellCheck={false} maxLength={settingsRules.shortcutMaxLength} />{error(key)}</FieldBlock>
      <ButtonRow><ActionButton type="button" disabled={busy} onClick={() => update(key, `${draft[key]}{amount}`)}>Add amount</ActionButton></ButtonRow>
      <SettingsHint>{changed.includes(number) && !changed.includes(key) && settings[key] ? "This code will clear when the number changes." : "Use a code tested on your phone. Android only."}</SettingsHint>
    </>);
  const range = (key: "maxUnlockedDevices" | "trialDays", label: string) => <FieldBlock htmlFor={`setting-${key}`}>{label}
    <select {...field(key)}>{Array.from({ length: settingsRules[key].max - settingsRules[key].min + 1 }, (_, index) => settingsRules[key].min + index)
      .map(value => <option key={value} value={value}>{key === "trialDays" ? value === 0 ? "Off" : `${value} ${value === 1 ? "day" : "days"}` : value}</option>)}</select>{error(key)}
  </FieldBlock>;

  return <SettingsLayout data-settings-editor>
    <SettingsNav aria-label="Settings sections" data-settings-nav>{sections.map(({ key, label, Icon }) => <NavButton key={key} type="button"
      $active={section === key} aria-current={section === key ? "page" : undefined} aria-controls="settings-section" onClick={() => navigate(key)}>
      <Icon /><span>{label}</span>
    </NavButton>)}</SettingsNav>
    <form onSubmit={save} noValidate aria-busy={busy} data-analytics-ignore>
      <SettingsContent>
        {status && <Notice as="div" $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>{status.text}
          {status.list && <Requirements>{status.list.map(item => <li key={item}>{item}</li>)}</Requirements>}
        </Notice>}
        <SettingsCard id="settings-section" aria-labelledby="settings-section-title" data-settings-section={section}>
          <SettingsCardHeader><h2 id="settings-section-title" tabIndex={-1}><SectionIcon />{activeSection.label}</h2></SettingsCardHeader>
          {section === "payments" && <SettingsGrid>
            <NetworkCard $network="mtn" aria-label="MTN MoMo"><CardTitle>MTN MoMo</CardTitle>
              {phone("mtnNumber", "Phone number")}{text("mtnName", "Registered name", settingsRules.nameMaxLength)}{shortcut("mtnMenuShortcut", "mtnNumber")}
            </NetworkCard>
            <NetworkCard $network="airtel" aria-label="Airtel Money"><CardTitle>Airtel Money</CardTitle>
              {phone("airtelNumber", "Phone number")}{text("airtelName", "Registered name", settingsRules.nameMaxLength)}{shortcut("airtelMenuShortcut", "airtelNumber")}
            </NetworkCard>
          </SettingsGrid>}
          {section === "support" && <SettingsGrid>
            <NetworkCard><CardTitle><PhoneIcon />Phone support</CardTitle>{phone("contactPhone", "Phone number")}</NetworkCard>
            <NetworkCard><CardTitle><ChatIcon />WhatsApp</CardTitle>{phone("whatsappPhone", "Phone number")}</NetworkCard>
          </SettingsGrid>}
          {section === "access" && <>
            <ModeOptions disabled={busy}><legend>Paid access</legend>{paywallModes.map(mode => {
              const unavailable = mode !== settings.paywallMode && mode !== "off" && view.requirements[mode].length > 0;
              return <ModeOption key={mode} $selected={(armed ?? settings.paywallMode) === mode} $unavailable={unavailable}>
                <input id={`setting-mode-${mode}`} type="radio" name="paid-access-mode" value={mode} checked={(armed ?? settings.paywallMode) === mode} disabled={busy || unavailable}
                  data-settings-mode onChange={() => { setArmed(mode === settings.paywallMode ? null : mode); setStatus(null); }} />
                <span><strong>{modeLabels[mode]}</strong><small>{modeCaptions[mode]}</small></span>
              </ModeOption>;
            })}</ModeOptions>
            {armed ? <SettingsConfirmation role="status"><strong>Switch to {modeLabels[armed]}?</strong><SettingsHint>{modeExplanations[armed]}</SettingsHint>
              <ButtonRow><ActionButton type="button" disabled={busy} onClick={cancelMode}>Cancel</ActionButton>
                <ActionButton type="button" $variant="primary" disabled={busy} onClick={() => void confirmMode()}>Confirm switch</ActionButton></ButtonRow>
            </SettingsConfirmation> : <SettingsHint>{modeExplanations[settings.paywallMode]}</SettingsHint>}
            {missing.length > 0 && <FormStack><SettingsHint>To enable Test or On</SettingsHint><RequirementList>{missing.map(({ key }) => <li key={key}>
              <LockIcon />{key === "plan" ? <Link href="/admin/plans">{requirementLabels[key]}</Link>
                : key === "payment-number" || key === "contact" ? <ActionButton type="button" onClick={() => navigate(key === "contact" ? "support" : "payments", true)}>{requirementLabels[key]}</ActionButton>
                  : <span>{requirementLabels[key]}</span>}
            </li>)}</RequirementList></FormStack>}
            <SettingsGrid>
              <FormStack><CardTitle><GiftIcon />Free trial</CardTitle>{range("trialDays", "Trial length")}</FormStack>
              <FormStack><CardTitle><DocumentIcon />Payment proofs</CardTitle><FieldBlock htmlFor="setting-screenshotRetentionDays">Keep after approval · days
                <input {...field("screenshotRetentionDays")} type="number" inputMode="numeric" min={settingsRules.screenshotRetentionDays.min} max={settingsRules.screenshotRetentionDays.max} />
                {error("screenshotRetentionDays")}<Hint>{settingsRules.screenshotRetentionDays.min}–{settingsRules.screenshotRetentionDays.max} days</Hint>
              </FieldBlock></FormStack>
            </SettingsGrid>
            {details("maxUnlockedDevices", "Advanced", <>{range("maxUnlockedDevices", "Grant device limit")}<SettingsHint>For existing grants. Accounts always have one active login.</SettingsHint></>)}
          </>}
          {section === "display" && <>
            <SettingsGrid><FieldBlock htmlFor="setting-copyFormat">Copied number format<select {...field("copyFormat")}>
              <option value="international">International · 256 772 123 456</option><option value="local">Local · 0772 123 456</option>
            </select>{error("copyFormat")}</FieldBlock>
              {text("reviewTime", "Payment review time", settingsRules.reviewTimeMaxLength, "Usually within 30 minutes")}
            </SettingsGrid>
            <FieldBlock htmlFor="setting-paymentNote">Payment note · optional<textarea {...field("paymentNote")} maxLength={settingsRules.paymentNoteMaxLength} />
              {error("paymentNote")}<Hint>{draft.paymentNote.length}/{settingsRules.paymentNoteMaxLength}</Hint>
            </FieldBlock>
          </>}
        </SettingsCard>
        {needsPassword && changed.length > 0 && <SettingsCard>
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <TextInput label="Confirm your password" id="setting-password" name="password" type="password" autoComplete="current-password" value={password} disabled={busy} required
            error={errors.password} onChange={event => setPassword(event.target.value)} />
        </SettingsCard>}
        <SaveBar><div><SaveSummary aria-live="polite">{changed.length ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`
          : settings.updatedAt ? `Saved ${savedTime(settings.updatedAt)} EAT` : "No changes"}</SaveSummary></div>
          <div><ActionButton type="button" disabled={busy || changed.length === 0} onClick={() => { setDraft(draftOf(settings)); setErrors({}); setStatus(null); setArmed(null); }}>
            <ResetIcon />Undo</ActionButton>
          <ActionButton type="submit" $variant="primary" disabled={busy || changed.length === 0 || (needsPassword && password === "")} data-settings-save>
            <CheckIcon />{busy ? "Saving…" : "Save changes"}</ActionButton></div>
        </SaveBar>
      </SettingsContent>
    </form>
  </SettingsLayout>;
}
