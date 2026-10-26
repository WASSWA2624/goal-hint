"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { TextInput } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { CardIcon, ChatIcon, CheckIcon, ChevronDownIcon, DocumentIcon, Icon, LockIcon, ShieldIcon, type IconProps } from "@/components/ui/icons";
import { formatPhone, normalizePhone } from "@/domain/phone";
import { publicPolicy } from "@/domain/public-policy";
import { editableSettingFields, isProtectedSettingField, paywallModes, settingLabels, settingsRules, type EditableSettingField,
  type ModeRequirement, type PaywallMode, type ProtectedSettingField, type SettingsPageData, type SubscriptionSettings } from "@/domain/subscription-settings";
import { ActionButton, FieldBlock, FieldError, Hint, postAdmin, replyErrors, replyMessage, Requirements, type AdminReply } from "./admin-form";
import { DeskColumn, DeskGrid, Drawer, FactList, PanelBody, ZoneLabel } from "./desk-styles";
import { useAdminRefresh } from "./use-admin-refresh";
import { ConfirmBox, DialField, DialRow, ManagedBadge, ManagedFact, ManagedNote, ModeTile, ModeTiles, NarrowField, NetworkGrid, NetworkTitle,
  RequirementBox, RequirementList, SaveButtons, SaveDock, SavePanel, SectionPanel, SectionTabs, SettingsHint, TwoUp } from "./settings-styles";

type Draft = Record<EditableSettingField, string>;
type Section = "payments" | "support" | "access" | "display";
type Status = Readonly<{ tone: "info" | "error" | "warning"; text: string; list?: readonly string[] }> | null;
/** A successful save may omit refreshed availability when that subsequent read fails. */
type SavedReply = Omit<SettingsPageData, "source" | "requirements"> & Partial<Pick<SettingsPageData, "source" | "requirements">> & { cleared?: string[] };
const UndoIcon = (props: IconProps) => <Icon {...props}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>;
const sections = [
  { key: "payments", label: "Payments", Icon: CardIcon }, { key: "support", label: "Support", Icon: ChatIcon },
  { key: "access", label: "Access", Icon: ShieldIcon }, { key: "display", label: "Display", Icon: DocumentIcon },
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
/** Short names for the password reason line under the field. */
const protectedNames: Record<ProtectedSettingField, string> = {
  mtnNumber: "MTN number", mtnName: "MTN registered name", mtnMenuShortcut: "MTN dial code", airtelNumber: "Airtel number",
  airtelName: "Airtel registered name", airtelMenuShortcut: "Airtel dial code", contactPhone: "support number", whatsappPhone: "WhatsApp number",
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

function passwordReason(fields: readonly ProtectedSettingField[]) {
  if (fields.length === 0) return "Needed to confirm this save.";
  if (fields.length > 2) return `Needed because ${fields.length} payment and support details changed.`;
  return `Needed because the ${fields.map(field => protectedNames[field]).join(" and ")} changed.`;
}

const savedTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone,
  dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Section tabs share one draft and save action; mode changes require a separate confirmation. */
export function SettingsEditor({ initial, username, sessionAuthorized = false }: { initial: SettingsPageData; username: string; sessionAuthorized?: boolean }) {
  const router = useRouter(), inFlight = useRef(false);
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.settings));
  const [section, setSection] = useState<Section>("payments");
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [askPassword, setAskPassword] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const { refreshing, refresh: refreshAdmin } = useAdminRefresh(message => setStatus({ tone: "warning", text: `The change was saved. ${message}` }));
  const busy = saving || refreshing;
  const [armed, setArmed] = useState<PaywallMode | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const settings = view.settings;
  const managed: readonly string[] = view.environmentFields ?? [];
  const changes = changesOf(draft, settings, managed);
  const changed = Object.keys(changes) as EditableSettingField[];
  const needsPassword = !sessionAuthorized && (askPassword || changed.some(isProtectedSettingField));
  const showPassword = needsPassword && changed.length > 0;
  const missing = [...new Map((["test", "on"] as const).filter(mode => mode !== settings.paywallMode)
    .flatMap(mode => view.requirements[mode]).map(item => [item.key, item])).values()];
  const summary = changed.length ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`
    : settings.updatedAt ? `Saved ${savedTime(settings.updatedAt)} EAT` : "No changes";

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
  function navigate(next: Section, focus?: string) {
    if (focus) pendingFocus.current = focus;
    setSection(next); setArmed(null);
  }
  /** A requirement link opens the section and puts the cursor in the field that resolves it. */
  function resolve(key: EditableSettingField) { navigate(sectionOf[key], managed.includes(key) ? "settings-section" : `setting-${key}`); }
  function cancelMode() { pendingFocus.current = `setting-mode-${settings.paywallMode}`; setArmed(null); }
  function undo() { setDraft(draftOf(settings)); setErrors({}); setStatus(null); setArmed(null); }

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
    refreshAdmin();
  }

  function refuse(reply: AdminReply) {
    if (reply.status === 401 || reply.status === 403 && reply.body.error === "forbidden") router.refresh();
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
    if (inFlight.current || busy || changed.length === 0) return;
    inFlight.current = true;
    setArmed(null); setSaving(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "save", changes, ...(needsPassword ? { password } : {}) });
    inFlight.current = false;
    setSaving(false);
    if (reply.ok) accept(reply, "Settings saved.", true);
    else refuse(reply);
  }

  async function confirmMode() {
    if (inFlight.current || busy || !armed || armed === settings.paywallMode || (armed !== "off" && view.requirements[armed].length)) return;
    inFlight.current = true;
    const mode = armed;
    pendingFocus.current = `setting-mode-${mode}`;
    setArmed(null); setSaving(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "mode", mode });
    inFlight.current = false;
    setSaving(false);
    if (reply.ok) accept(reply, `Paid access: ${modeLabels[mode]}. Applies within 30 seconds.`, false);
    else refuse(reply);
  }

  const field = (key: EditableSettingField, hinted = false) => {
    const described = [errors[key] && `setting-${key}-error`, hinted && `setting-${key}-hint`].filter(Boolean).join(" ");
    return { id: `setting-${key}`, value: draft[key], disabled: busy || managed.includes(key), "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": described || undefined, onChange: (event: { target: { value: string } }) => update(key, event.target.value) };
  };
  const error = (key: EditableSettingField) => errors[key] && <FieldError id={`setting-${key}-error`}>{errors[key]}</FieldError>;
  const shown = (key: EditableSettingField, value?: ReactNode) => value
    ?? (settings[key] ? phoneFields.has(key) ? `+${formatPhone(String(settings[key]))}` : String(settings[key]) : "Not set");
  const codeShown = (key: "mtnMenuShortcut" | "airtelMenuShortcut") => settings[key] ? "Configured" : "Not set";
  const badge = <ManagedBadge title="Managed outside this page"><LockIcon />Managed</ManagedBadge>;
  const fact = (key: EditableSettingField, label: string, value?: ReactNode) => <ManagedFact data-settings-managed="true"><div>
    <dt>{label}{badge}</dt><dd>{shown(key, value)}</dd>
  </div></ManagedFact>;
  /** A group whose every field is managed reads as one fact list under a single badge instead of a badge per field. */
  const facts = (rows: readonly (readonly [EditableSettingField, string, ReactNode?])[]) => <FactList data-settings-managed="true">
    {rows.map(([key, label, value]) => <div key={key}><dt>{label}</dt><dd>{shown(key, value)}</dd></div>)}
  </FactList>;
  const locked = (...keys: EditableSettingField[]) => keys.every(key => managed.includes(key));
  const phone = (key: EditableSettingField, label: string) => managed.includes(key) ? fact(key, label)
    : <PhoneInput id={`setting-${key}`} label={label} value={draft[key]} disabled={busy} error={errors[key]} onValueChange={value => update(key, value)} />;
  const text = (key: EditableSettingField, label: string, maximum: number, placeholder?: string) => managed.includes(key) ? fact(key, label)
    : <FieldBlock htmlFor={`setting-${key}`}>{label}<input {...field(key)} maxLength={maximum} autoComplete="off" placeholder={placeholder} />{error(key)}</FieldBlock>;
  const drawer = (key: string, label: string, children: ReactNode) =>
    <Drawer $plain open={!!advanced[key]} onToggle={event => { const open = event.currentTarget.open; setAdvanced(shown => shown[key] === open ? shown : { ...shown, [key]: open }); }}>
      <summary>{label}<ChevronDownIcon /></summary><div>{children}</div>
    </Drawer>;
  const shortcut = (key: "mtnMenuShortcut" | "airtelMenuShortcut", number: "mtnNumber" | "airtelNumber") => managed.includes(key)
    ? fact(key, "Dial code", codeShown(key))
    : drawer(key, "Dial code · optional", <DialField>
      <label htmlFor={`setting-${key}`}>Dial code</label>
      <DialRow><input {...field(key, true)} inputMode="tel" autoComplete="off" spellCheck={false} maxLength={settingsRules.shortcutMaxLength} />
        <ActionButton type="button" disabled={busy} onClick={() => update(key, `${draft[key]}{amount}`)}>Add amount</ActionButton></DialRow>
      {error(key)}
      <Hint id={`setting-${key}-hint`}>{changed.includes(number) && !changed.includes(key) && settings[key] ? "This code will clear when the number changes." : "Use a code tested on your phone. Android only."}</Hint>
    </DialField>);
  const range = (key: "maxUnlockedDevices" | "trialDays", label: string, hint?: string) => <FieldBlock htmlFor={`setting-${key}`}>{label}
    <select {...field(key, !!hint)}>{Array.from({ length: settingsRules[key].max - settingsRules[key].min + 1 }, (_, index) => settingsRules[key].min + index)
      .map(value => <option key={value} value={value}>{key === "trialDays" ? value === 0 ? "Off" : `${value} ${value === 1 ? "day" : "days"}` : value}</option>)}</select>
    {error(key)}{hint && <Hint id={`setting-${key}-hint`}>{hint}</Hint>}
  </FieldBlock>;
  const network = (id: "mtn" | "airtel", title: string, number: "mtnNumber" | "airtelNumber", name: "mtnName" | "airtelName", code: "mtnMenuShortcut" | "airtelMenuShortcut") => {
    const fixed = locked(number, name, code);
    return <section aria-labelledby={`settings-network-${id}`}><NetworkTitle id={`settings-network-${id}`}><MobileMoneyLogo network={id} />{title}{fixed && badge}</NetworkTitle>
      {fixed ? facts([[number, "Phone number"], [name, "Registered name"], [code, "Dial code", codeShown(code)]])
        : <>{phone(number, "Phone number")}{text(name, "Registered name", settingsRules.nameMaxLength)}{shortcut(code, number)}</>}
    </section>;
  };
  const saveButtons = <>
    <ActionButton type="button" disabled={busy || changed.length === 0} onClick={undo}><UndoIcon />Undo</ActionButton>
    <ActionButton type="submit" $variant="primary" disabled={busy || changed.length === 0 || (needsPassword && password === "")} data-settings-save>
      <CheckIcon />{busy ? "Saving…" : "Save changes"}</ActionButton>
  </>;

  return <form onSubmit={save} noValidate aria-busy={busy} data-analytics-ignore data-settings-editor>
    <DeskGrid>
      <DeskColumn>
        {status && <Notice as="div" $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>{status.text}
          {status.list && <Requirements>{status.list.map(item => <li key={item}>{item}</li>)}</Requirements>}
        </Notice>}
        <SectionTabs as="nav" aria-label="Settings sections" data-settings-nav>{sections.map(({ key, label, Icon: TabIcon }) => <button key={key} id={`settings-tab-${key}`}
          type="button" aria-current={section === key ? "page" : undefined} aria-controls="settings-section" onClick={() => navigate(key)}>
          <TabIcon />{label}
        </button>)}</SectionTabs>
        <SectionPanel id="settings-section" tabIndex={-1} aria-labelledby={`settings-tab-${section}`} data-settings-section={section}>
          {section === "payments" && <NetworkGrid>
            {network("mtn", "MTN MoMo", "mtnNumber", "mtnName", "mtnMenuShortcut")}
            {network("airtel", "Airtel Money", "airtelNumber", "airtelName", "airtelMenuShortcut")}
          </NetworkGrid>}
          {section === "support" && <PanelBody>{locked("contactPhone", "whatsappPhone")
            ? <><ManagedNote><LockIcon />Managed outside this page</ManagedNote>{facts([["contactPhone", "Phone support"], ["whatsappPhone", "WhatsApp"]])}</>
            : <TwoUp>{phone("contactPhone", "Phone support")}{phone("whatsappPhone", "WhatsApp")}</TwoUp>}</PanelBody>}
          {section === "access" && <>
            <PanelBody>
              <ModeTiles disabled={busy}><legend>Paid access</legend><div>{paywallModes.map(mode => {
                const unavailable = mode !== settings.paywallMode && mode !== "off" && view.requirements[mode].length > 0;
                return <ModeTile key={mode} data-mode-tile $unavailable={unavailable}>
                  <input id={`setting-mode-${mode}`} type="radio" name="paid-access-mode" value={mode} checked={(armed ?? settings.paywallMode) === mode}
                    disabled={busy || unavailable} aria-describedby={unavailable ? "settings-requirements" : undefined} data-settings-mode
                    onChange={() => { setArmed(mode === settings.paywallMode ? null : mode); setStatus(null); }} />
                  <span><strong>{modeLabels[mode]}</strong>{modeCaptions[mode]}{mode === settings.paywallMode && <em>Current</em>}</span>
                </ModeTile>;
              })}</div></ModeTiles>
              {armed ? <ConfirmBox role="status"><strong>Switch to {modeLabels[armed]}?</strong><p>{modeExplanations[armed]}</p>
                <div><ActionButton type="button" disabled={busy} onClick={cancelMode}>Cancel</ActionButton>
                  <ActionButton type="button" $variant="primary" disabled={busy} onClick={() => void confirmMode()}>Confirm switch</ActionButton></div>
              </ConfirmBox> : <SettingsHint>{modeExplanations[settings.paywallMode]}</SettingsHint>}
              {missing.length > 0 && <RequirementBox id="settings-requirements"><ZoneLabel>To enable Test or On</ZoneLabel>
                <RequirementList>{missing.map(({ key }) => <li key={key}><LockIcon />{key === "plan" ? <Link href="/admin/plans">{requirementLabels[key]}</Link>
                  : key === "payment-number" || key === "contact" ? <button type="button" onClick={() => resolve(key === "contact" ? "contactPhone" : "mtnNumber")}>{requirementLabels[key]}</button>
                    : <span>{requirementLabels[key]}</span>}</li>)}</RequirementList>
              </RequirementBox>}
              <TwoUp>{range("trialDays", "Free trial length")}
                <FieldBlock htmlFor="setting-screenshotRetentionDays">Keep payment proofs after approval · days
                  <input {...field("screenshotRetentionDays", true)} type="number" inputMode="numeric" min={settingsRules.screenshotRetentionDays.min} max={settingsRules.screenshotRetentionDays.max} />
                  {error("screenshotRetentionDays")}<Hint id="setting-screenshotRetentionDays-hint">{settingsRules.screenshotRetentionDays.min}–{settingsRules.screenshotRetentionDays.max} days</Hint>
                </FieldBlock>
              </TwoUp>
              {drawer("maxUnlockedDevices", "Advanced", <NarrowField>{range("maxUnlockedDevices", "Grant device limit", "For existing grants. Accounts always have one active login.")}</NarrowField>)}
            </PanelBody>
          </>}
          {section === "display" && <PanelBody>
            <TwoUp><FieldBlock htmlFor="setting-copyFormat">Copied number format<select {...field("copyFormat")}>
              <option value="international">International · 256 772 123 456</option><option value="local">Local · 0772 123 456</option>
            </select>{error("copyFormat")}</FieldBlock>
              {text("reviewTime", "Payment review time", settingsRules.reviewTimeMaxLength, "Usually within 30 minutes")}
            </TwoUp>
            <FieldBlock htmlFor="setting-paymentNote">Payment note · optional<textarea {...field("paymentNote", true)} maxLength={settingsRules.paymentNoteMaxLength} />
              {error("paymentNote")}<Hint id="setting-paymentNote-hint">{draft.paymentNote.length}/{settingsRules.paymentNoteMaxLength}</Hint>
            </FieldBlock>
          </PanelBody>}
        </SectionPanel>
      </DeskColumn>
      <SavePanel aria-label="Save settings" $phoneHidden={!showPassword}>
        <ZoneLabel data-save-wide aria-live="polite">{summary}</ZoneLabel>
        {showPassword && <>
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <TextInput label="Confirm your password" id="setting-password" name="password" type="password" autoComplete="current-password" value={password} disabled={busy} required
            hint={passwordReason(changed.filter(isProtectedSettingField))} error={errors.password} onChange={event => setPassword(event.target.value)} />
        </>}
        <SaveButtons data-save-wide>{saveButtons}</SaveButtons>
      </SavePanel>
    </DeskGrid>
    <SaveDock><span aria-live="polite">{summary}</span>{saveButtons}</SaveDock>
  </form>;
}
