"use client";

import { media } from "@/styles/theme";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { MobileMoneyLogo } from "@/components/members/mobile-money-logo";
import { TextInput } from "@/components/ui/controls";
import { refreshCommunitySettings } from "@/components/navigation/community";
import { refreshContactPageSettings } from "@/components/members/contact-page";
import { PhoneInput } from "@/components/ui/phone-input";
import { authCopy } from "@/i18n/messages/auth";
import { CardIcon, ChatIcon, CheckIcon, ChevronDownIcon, DocumentIcon, Icon, LockIcon, ShieldIcon, type IconProps } from "@/components/ui/icons";
import { formatPhone, normalizePhone } from "@/domain/phone";
import { publicPolicy } from "@/domain/public-policy";
import { contactPageRules } from "@/domain/contact-page";
import { supportContactsOf, type SupportContact } from "@/domain/support-contacts";
import { defaultMessageTemplates, type MessageTemplateSettings } from "@/domain/message-templates";
import { editableSettingFields, isProtectedSettingField, paywallModes, settingLabels, settingsRules, type EditableSettingField,
  type PaywallMode, type ProtectedSettingField, type SettingsPageData, type SubscriptionSettings } from "@/domain/subscription-settings";
import { ActionButton, FieldBlock, FieldError, Hint, postAdmin, replyErrors, replyMessage, type AdminReply } from "./admin-form";
import { Drawer, PanelBody } from "./desk-styles";
import { RecordBack, RecordCard, RecordDetailHead, RecordDetails, RecordFeedback, RecordItem, RecordList, RecordListScroll, RecordRowContent, RecordScroll, useRecordView } from "./record-workspace";
import { SettingsSupportEditor } from "./settings-support-editor";
import { SettingsMessageEditor } from "./settings-message-editor";
import { SettingsCommunityEditor } from "./settings-community-editor";
import { PaymentAlertControls } from "./payment-alert-controls";
import { communityLinksWithDefaults, type CommunityLink } from "@/domain/community";
import { useAdminRefresh } from "./use-admin-refresh";
import { CheckoutReadinessBox, CheckoutReadinessList, ConfirmBox, DialField, DialRow, ManagedBadge, ManagedFact, ModeTile, ModeTiles,
  NarrowField, NetworkGrid, NetworkTitle, SectionPanel, SettingsHint, TwoUp,
  DesktopOnly, DesktopSettingItem, SettingsFooter, SettingsForm, SettingsWorkspace } from "./settings-styles";

type ScalarSettingField = Exclude<EditableSettingField, "supportContacts" | "messageTemplates" | "communityLinks">;
type Draft = Record<ScalarSettingField, string>;
const scalarFields = editableSettingFields.filter((field): field is ScalarSettingField => field !== "supportContacts" && field !== "messageTemplates" && field !== "communityLinks");
type Section = "payments" | "support" | "community" | "access" | "display" | "messages";
type Status = Readonly<{ tone: "info" | "error" | "warning"; text: string }> | null;
/** A successful save may omit refreshed availability when that subsequent read fails. */
type SavedReply = Omit<SettingsPageData, "source" | "checkoutReadiness"> & Partial<Pick<SettingsPageData, "source" | "checkoutReadiness">> & { cleared?: string[] };
const UndoIcon = (props: IconProps) => <Icon {...props}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>;
const sections = [
  { key: "payments", label: "Payments", Icon: CardIcon }, { key: "support", label: "Support", Icon: ChatIcon },
  { key: "community", label: "Community", Icon: ChatIcon },
  { key: "access", label: "Access", Icon: ShieldIcon }, { key: "display", label: "Display", Icon: DocumentIcon },
  { key: "messages", label: "Messages", Icon: ChatIcon },
] as const;
const sectionOf: Record<EditableSettingField, Section> = {
  mtnEnabled: "payments", mtnNumber: "payments", mtnName: "payments", mtnMenuShortcut: "payments",
  airtelEnabled: "payments", airtelNumber: "payments", airtelName: "payments", airtelMenuShortcut: "payments",
  contactPhone: "support", whatsappPhone: "support", contactPageEmail: "support", contactPageEmailVisible: "support",
  trialDays: "access", screenshotRetentionDays: "access", allowUnsubscribedMembers: "access",
  copyFormat: "display", paymentNote: "display", reviewTime: "display",
  supportContacts: "support", messageTemplates: "messages",
  communityLinks: "community", communityVisible: "community", paymentAlertsEnabled: "payments", paymentAlertRepeats: "payments",
};
const phoneFields = new Set<EditableSettingField>(["mtnNumber", "airtelNumber", "contactPhone", "whatsappPhone"]);
const shortcutFields = new Set<EditableSettingField>(["mtnMenuShortcut", "airtelMenuShortcut"]);
const numberFields = new Set<EditableSettingField>(["trialDays", "screenshotRetentionDays", "paymentAlertRepeats"]);
const modeLabels: Record<PaywallMode, string> = { off: "Off", on: "On" };
const modeExplanations: Record<PaywallMode, string> = {
  off: authCopy.paidAccessOffHelp,
  on: authCopy.paidAccessOnHelp,
};
/** Short names for the password reason line under the field. */
const protectedNames: Record<ProtectedSettingField, string> = {
  mtnEnabled: "MTN payment availability", mtnNumber: "MTN number", mtnName: "MTN registered name", mtnMenuShortcut: "MTN dial code",
  airtelEnabled: "Airtel payment availability", airtelNumber: "Airtel number", airtelName: "Airtel registered name", airtelMenuShortcut: "Airtel dial code",
  contactPhone: "support number", whatsappPhone: "WhatsApp number", contactPageEmail: "public email", contactPageEmailVisible: "public email visibility",
  supportContacts: "support contacts", messageTemplates: "message templates",
  communityLinks: "community links", communityVisible: "community visibility", paymentAlertsEnabled: "payment alerts",
};

function draftOf(settings: SubscriptionSettings): Draft {
  return Object.fromEntries(scalarFields.map((field) => {
    const value = settings[field];
    return [field, value === null ? "" : phoneFields.has(field) ? formatPhone(String(value)) : String(value)];
  })) as Draft;
}

/** Normalize before comparison; invalid values still reach the server's field validation. */
function valueOf(field: ScalarSettingField, text: string): SubscriptionSettings[ScalarSettingField] | string {
  if (field === "communityVisible" || field === "contactPageEmailVisible" || field === "paymentAlertsEnabled" || field === "mtnEnabled"
    || field === "airtelEnabled" || field === "allowUnsubscribedMembers") return text === "true";
  if (phoneFields.has(field)) return text.trim() === "" ? null : normalizePhone(text) ?? text;
  if (shortcutFields.has(field)) return text.replace(/\s+/gu, "") || null;
  if (numberFields.has(field)) return /^\d+$/u.test(text.trim()) ? Number(text.trim()) : text;
  if (field === "copyFormat") return text;
  return text.replace(/\r\n?/gu, "\n").trim() || null;
}

function changesOf(draft: Draft, settings: SubscriptionSettings, managed: readonly string[]) {
  return Object.fromEntries(scalarFields.flatMap((field) => {
    const value = valueOf(field, draft[field]);
    return managed.includes(field) || value === settings[field] ? [] : [[field, value]];
  }));
}

function passwordReason(fields: readonly ProtectedSettingField[]) {
  if (fields.length === 0) return "Needed to confirm this save.";
  if (fields.length > 2) return `Needed because ${fields.length} protected settings changed.`;
  return `Needed because the ${fields.map(field => protectedNames[field]).join(" and ")} changed.`;
}

const savedTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: publicPolicy.reportingTimeZone,
  dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Section navigation shares one draft. Paid-access switches have a separate confirmation. */
export function SettingsEditor({ initial, username, sessionAuthorized = false }: { initial: SettingsPageData; username: string; sessionAuthorized?: boolean }) {
  const router = useRouter(), inFlight = useRef(false);
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.settings));
  const [contacts, setContacts] = useState<readonly SupportContact[]>(() => initial.settings.supportContacts ?? supportContactsOf(initial.settings));
  const [messages, setMessages] = useState<MessageTemplateSettings>(() => initial.settings.messageTemplates ?? structuredClone(defaultMessageTemplates));
  const [community, setCommunity] = useState<readonly CommunityLink[]>(() => communityLinksWithDefaults(initial.settings.communityLinks ?? []));
  const [section, setSection] = useState<Section>("payments");
  const { detailOpen, openDetail, closeDetail } = useRecordView();
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
  const savedContacts = settings.supportContacts ?? supportContactsOf(settings);
  const changes = { ...changesOf(draft, settings, managed),
    ...(JSON.stringify(contacts) === JSON.stringify(savedContacts) ? {} : { supportContacts: contacts }),
    ...(JSON.stringify(messages) === JSON.stringify(settings.messageTemplates ?? defaultMessageTemplates) ? {} : { messageTemplates: messages }),
    ...(JSON.stringify(community) === JSON.stringify(communityLinksWithDefaults(settings.communityLinks ?? [])) ? {} : { communityLinks: community }),
  };
  const changed = Object.keys(changes) as EditableSettingField[];
  const needsPassword = !sessionAuthorized && (askPassword || changed.some(isProtectedSettingField));
  const showPassword = needsPassword && changed.length > 0;
  const summary = changed.length ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`
    : settings.updatedAt ? `Saved ${savedTime(settings.updatedAt)} EAT` : "No changes";
  const selectedMode = armed ?? settings.paywallMode;
  const sectionTitle = sections.find(item => item.key === section)?.label ?? "Settings";

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
  }, [section, armed, busy, detailOpen]);

  useEffect(() => {
    const desktop = window.matchMedia(media.desktop.replace("@media ", ""));
    const updateViewport = (event: MediaQueryListEvent) => {
      if (!event.matches) setSection(current => current === "messages" ? "payments" : current);
    };
    desktop.addEventListener("change", updateViewport);
    return () => desktop.removeEventListener("change", updateViewport);
  }, []);

  function update(key: ScalarSettingField, value: string) { setDraft(shown => ({ ...shown, [key]: value })); }
  function navigate(next: Section, focus?: string, trigger?: HTMLElement) {
    if (focus) pendingFocus.current = focus;
    openDetail(trigger);
    setSection(next); setArmed(null);
  }
  function cancelMode() { pendingFocus.current = `setting-mode-${settings.paywallMode}`; setArmed(null); }
  function undo() { setDraft(draftOf(settings)); setContacts(settings.supportContacts ?? supportContactsOf(settings));
    setCommunity(communityLinksWithDefaults(settings.communityLinks ?? []));
    setMessages(settings.messageTemplates ?? structuredClone(defaultMessageTemplates)); setErrors({}); setStatus(null); setArmed(null);
    setPassword(""); setAskPassword(false); }

  function accept(reply: AdminReply, message: string, resetForm: boolean) {
    const next = reply.body as unknown as SavedReply;
    setView(shown => ({ ...shown, settings: next.settings, protectedFields: next.protectedFields, diagnostics: next.diagnostics,
      ...(next.environmentFields ? { environmentFields: next.environmentFields } : {}),
      ...(next.checkoutReadiness ? { source: next.source ?? shown.source, checkoutReadiness: next.checkoutReadiness } : {}) }));
    if (resetForm) { setDraft(draftOf(next.settings)); setContacts(next.settings.supportContacts ?? supportContactsOf(next.settings));
      setCommunity(communityLinksWithDefaults(next.settings.communityLinks ?? []));
      setMessages(next.settings.messageTemplates ?? structuredClone(defaultMessageTemplates)); setErrors({}); setPassword(""); setAskPassword(false); }
    const cleared = (next.cleared ?? []).map(field => settingLabels[field as EditableSettingField] ?? field);
    const notes = [message, ...(cleared.length ? [`${cleared.join(" and ")} cleared after the number changed.`] : []),
      ...(next.checkoutReadiness ? [] : ["Reload to update checkout setup."])];
    setStatus({ tone: notes.length > 1 ? "warning" : "info", text: notes.join(" ") });
    if (resetForm && (changed.includes("communityLinks") || changed.includes("communityVisible"))) refreshCommunitySettings();
    if (resetForm && changed.some(key => sectionOf[key] === "support")) refreshContactPageSettings();
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
      navigate(sectionOf[first]);
      if (shortcutFields.has(first) || first === "screenshotRetentionDays") {
        setAdvanced(shown => ({ ...shown, [shortcutFields.has(first) ? first : "access"]: true }));
      }
    }
    setErrors(nextErrors);
    setStatus({ tone: "error", text: replyMessage(reply, "Changes were not saved.") });
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
    if (inFlight.current || busy || !armed || armed === settings.paywallMode) return;
    inFlight.current = true;
    const mode = armed;
    setSaving(true); setStatus(null);
    const reply = await postAdmin("/api/admin/settings", { action: "mode", mode });
    inFlight.current = false;
    setSaving(false);
    if (reply.ok) {
      pendingFocus.current = `setting-mode-${mode}`;
      setArmed(null);
      accept(reply, `Paid access is ${mode}. Applies within 30 seconds.`, false);
    } else refuse(reply);
  }

  const field = (key: ScalarSettingField, hinted = false) => {
    const described = [errors[key] && `setting-${key}-error`, hinted && `setting-${key}-hint`].filter(Boolean).join(" ");
    return { id: `setting-${key}`, value: draft[key], disabled: busy || managed.includes(key), "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": described || undefined, onChange: (event: { target: { value: string } }) => update(key, event.target.value) };
  };
  const error = (key: EditableSettingField) => errors[key] && <FieldError id={`setting-${key}-error`}>{errors[key]}</FieldError>;
  const shown = (key: EditableSettingField, value?: ReactNode) => value
    ?? (settings[key] ? phoneFields.has(key) ? `+${formatPhone(String(settings[key]))}` : String(settings[key]) : "Not set");
  const badge = <ManagedBadge title="Managed outside this page"><LockIcon />Managed</ManagedBadge>;
  const fact = (key: EditableSettingField, label: string, value?: ReactNode) => <ManagedFact data-settings-managed="true"><div>
    <dt>{label}{badge}</dt><dd>{shown(key, value)}</dd>
  </div></ManagedFact>;
  const phone = (key: ScalarSettingField, label: string) => managed.includes(key) ? fact(key, label)
    : <PhoneInput id={`setting-${key}`} label={label} value={draft[key]} disabled={busy} error={errors[key]} onValueChange={value => update(key, value)} />;
  const text = (key: ScalarSettingField, label: string, maximum: number, placeholder?: string) => managed.includes(key) ? fact(key, label)
    : <FieldBlock label={label} description={<>{error(key)}</>}><input {...field(key)} maxLength={maximum} autoComplete="off" placeholder={placeholder} /></FieldBlock>;
  const drawer = (key: string, label: string, children: ReactNode) =>
    <Drawer $plain open={!!advanced[key]} onToggle={event => { const open = event.currentTarget.open; setAdvanced(shown => shown[key] === open ? shown : { ...shown, [key]: open }); }}>
      <summary>{label}<ChevronDownIcon /></summary><div>{children}</div>
    </Drawer>;
  const shortcut = (key: "mtnMenuShortcut" | "airtelMenuShortcut", number: "mtnNumber" | "airtelNumber") =>
    drawer(key, "Dial code · optional", <DialField>
      <DialRow><FieldBlock label="Dial code"><input {...field(key, true)} inputMode="tel" autoComplete="off" spellCheck={false} maxLength={settingsRules.shortcutMaxLength} /></FieldBlock>
        <ActionButton type="button" disabled={busy} onClick={() => update(key, `${draft[key]}{amount}`)}>Add amount</ActionButton></DialRow>
      {error(key)}
      <Hint id={`setting-${key}-hint`}>{changed.includes(number) && !changed.includes(key) && settings[key] ? "This code will clear when the number changes." : "Use a code tested on your phone. Android only."}</Hint>
    </DialField>);
  const network = (id: "mtn" | "airtel", title: string) => {
    const enabled = `${id}Enabled` as const, number = `${id}Number` as const;
    const name = `${id}Name` as const, code = `${id}MenuShortcut` as const;
    return <section aria-labelledby={`settings-network-${id}`}><NetworkTitle id={`settings-network-${id}`}><MobileMoneyLogo network={id} />{title}</NetworkTitle>
      <FieldBlock label={`Accept ${title} payments`} description={error(enabled)}><select {...field(enabled)}>
        <option value="false">Disabled</option><option value="true">Enabled</option>
      </select></FieldBlock>
      {phone(number, "Receiving number")}{text(name, "Registered account name", settingsRules.nameMaxLength)}
      <SettingsHint>Customers send payments to this number and verify the recipient name in {title}.</SettingsHint>{shortcut(code, number)}
    </section>;
  };
  return <SettingsForm onSubmit={save} noValidate aria-busy={busy} data-analytics-ignore data-record-form data-settings-editor>
    <h1>Settings</h1>
    <SettingsWorkspace $compact $detailOpen={detailOpen}>
        {status && <RecordFeedback><Notice as="div" $tone={status.tone} role={status.tone === "error" ? "alert" : "status"}>{status.text}</Notice></RecordFeedback>}
      <RecordList aria-label="Settings sections">
        <RecordListScroll data-settings-nav tabIndex={0}>{sections.map(({ key, label, Icon: SectionIcon }) => {
          const Item = key === "messages" ? DesktopSettingItem : "li";
          return <Item key={key}><RecordItem type="button" id={`settings-tab-${key}`} aria-current={section === key ? "true" : undefined}
            aria-controls="settings-section" disabled={busy} onClick={event => navigate(key, undefined, event.currentTarget)}>
            <RecordRowContent icon={<SectionIcon />} primary={label} />
          </RecordItem></Item>;
        })}</RecordListScroll>
      </RecordList>
      <RecordDetails>
        <RecordBack disabled={busy} onClick={event => { setArmed(null); closeDetail(event); }}>Back to settings</RecordBack>
        <RecordCard><RecordScroll key={section} tabIndex={0}>
        <RecordDetailHead><h2 id="settings-section-heading">{sectionTitle}</h2></RecordDetailHead>
        <SectionPanel id="settings-section" tabIndex={-1} aria-labelledby="settings-section-heading" data-settings-section={section}>
          {section === "payments" && <><NetworkGrid>
            {network("mtn", "MTN MoMo")}
            {network("airtel", "Airtel Money")}
          </NetworkGrid><PanelBody><h2>Payment alerts</h2><TwoUp>
            <FieldBlock label="Outbound payment alerts" description={error("paymentAlertsEnabled")}><select {...field("paymentAlertsEnabled")}>
              <option value="false">Disabled</option><option value="true">Enabled</option></select></FieldBlock>
            <FieldBlock label="Foreground sound repeats" description={error("paymentAlertRepeats")}><select {...field("paymentAlertRepeats")}>
              {[1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select></FieldBlock>
          </TwoUp><PaymentAlertControls /></PanelBody></>}
          {section === "support" && <><PanelBody><h2>Contact page</h2><TwoUp>
            <FieldBlock label="Public email" description={error("contactPageEmail")}><input {...field("contactPageEmail")} type="email" inputMode="email"
              autoComplete="off" spellCheck={false} maxLength={contactPageRules.emailMaxLength} /></FieldBlock>
            <FieldBlock label="Show email on Contact page" description={error("contactPageEmailVisible")}><select {...field("contactPageEmailVisible")}>
              <option value="true">Visible</option><option value="false">Hidden</option></select></FieldBlock>
          </TwoUp><SettingsHint>Saved details update the Contact page automatically.</SettingsHint></PanelBody>
            <SettingsSupportEditor contacts={contacts} disabled={busy} error={errors.supportContacts} onChange={setContacts} /></>}
          {section === "community" && <SettingsCommunityEditor value={community} visible={draft.communityVisible === "true"}
            disabled={busy} error={errors.communityLinks} visibilityError={errors.communityVisible} onChange={setCommunity}
            onVisibleChange={visible => update("communityVisible", String(visible))} />}
          {section === "access" && <PanelBody>
            <ModeTiles disabled={busy}><legend>Paid access</legend><div>{paywallModes.map(mode => <ModeTile key={mode} data-mode-tile>
              <input id={`setting-mode-${mode}`} type="radio" name="paid-access-mode" value={mode} checked={selectedMode === mode} disabled={busy}
                aria-describedby={selectedMode === mode ? "settings-mode-hint" : undefined}
                data-settings-mode onChange={() => { setArmed(mode === settings.paywallMode ? null : mode); setStatus(null); }} />
              <span><strong>{modeLabels[mode]}</strong>{mode === settings.paywallMode && <em>Current</em>}</span>
            </ModeTile>)}</div></ModeTiles>
            <SettingsHint id="settings-mode-hint">{modeExplanations[selectedMode]}</SettingsHint>
            {armed && <ConfirmBox><strong>Switch to {modeLabels[armed]}?</strong><div>
              <ActionButton type="button" disabled={busy} onClick={cancelMode}>Cancel</ActionButton>
              <ActionButton type="button" $variant="primary" disabled={busy} onClick={() => void confirmMode()}>Confirm switch</ActionButton>
            </div></ConfirmBox>}
            <TwoUp>
              <FieldBlock label="Verified members without a subscription" description={<>{error("allowUnsubscribedMembers")}
                <Hint id="setting-allowUnsubscribedMembers-hint">{authCopy.freeMemberAccessHelp}</Hint></>}>
                <select {...field("allowUnsubscribedMembers", true)}>
                  <option value="false">Require an active access period</option><option value="true">Allow free access</option>
                </select>
              </FieldBlock>
              <FieldBlock label="New account free trial (days)" description={<>{error("trialDays")}
                <Hint id="setting-trialDays-hint">Use 0 to disable trials. Applies when paid access is on and free member access is disabled.</Hint></>}>
                <input {...field("trialDays", true)} type="number" inputMode="numeric" min={settingsRules.trialDays.min} max={settingsRules.trialDays.max} step={1} />
              </FieldBlock>
            </TwoUp>
            {drawer("access", "Advanced access settings", <NarrowField>
              <FieldBlock label="Keep approved payment proofs · days" description={error("screenshotRetentionDays")}><input {...field("screenshotRetentionDays")} type="number" inputMode="numeric"
                min={settingsRules.screenshotRetentionDays.min} max={settingsRules.screenshotRetentionDays.max} /></FieldBlock>
            </NarrowField>)}
            {view.checkoutReadiness.length > 0 && <CheckoutReadinessBox aria-labelledby="settings-checkout-setup">
              <strong id="settings-checkout-setup">Checkout setup</strong>
              <SettingsHint>You can switch paid access now. Complete this setup before offering new purchases in production.</SettingsHint>
              <CheckoutReadinessList>{view.checkoutReadiness.map(({ key, message }) => <li key={key}>
                {key === "plan" ? <Link href="/admin/plans">{message}</Link>
                  : key === "payment-number" ? <button type="button" onClick={() => navigate("payments", "setting-mtnEnabled")}>{message}</button>
                  : key === "contact" ? <button type="button" onClick={() => navigate("support", "setting-supportContacts")}>{message}</button>
                  : <span>{message}</span>}
              </li>)}</CheckoutReadinessList>
            </CheckoutReadinessBox>}
          </PanelBody>}
          {section === "display" && <PanelBody>
            <TwoUp><FieldBlock label={"Copied number format"} description={<>{error("copyFormat")}</>}><select {...field("copyFormat")}>
              <option value="international">International · 256 772 123 456</option><option value="local">Local · 0772 123 456</option>
            </select></FieldBlock>
              {text("reviewTime", "Payment review time", settingsRules.reviewTimeMaxLength, "Usually within 30 minutes")}
            </TwoUp>
            <SettingsHint>Review time is the estimate shown to customers.</SettingsHint>
            <FieldBlock label={"Payment note · optional"} description={<>{error("paymentNote")}<Hint id="setting-paymentNote-hint">{draft.paymentNote.length}/{settingsRules.paymentNoteMaxLength}</Hint></>}><textarea {...field("paymentNote", true)} maxLength={settingsRules.paymentNoteMaxLength} /></FieldBlock>
          </PanelBody>}
          {section === "messages" && <DesktopOnly><SettingsMessageEditor value={messages} disabled={busy} error={errors.messageTemplates} onChange={setMessages} /></DesktopOnly>}
        </SectionPanel>
        </RecordScroll></RecordCard>
      </RecordDetails>
      <SettingsFooter aria-label="Save settings" data-settings-footer>
        {showPassword && <>
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <div data-setting-password><TextInput label="Confirm your password" id="setting-password" name="password" type="password" autoComplete="current-password" value={password} disabled={busy} required
            hint={passwordReason(changed.filter(isProtectedSettingField))} error={errors.password} onChange={event => setPassword(event.target.value)} /></div>
        </>}
        <span aria-live="polite">{summary}</span>
        <div data-record-actions>
          <ActionButton type="button" disabled={busy || changed.length === 0} onClick={undo}><UndoIcon />Undo</ActionButton>
          <ActionButton type="submit" $variant="primary" disabled={busy || changed.length === 0 || (needsPassword && password === "")} data-settings-save>
            <CheckIcon />Save changes</ActionButton>
        </div>
      </SettingsFooter>
    </SettingsWorkspace>
  </SettingsForm>;
}
