import "server-only";

import { privacyNotice } from "../../domain/privacy-notice.ts";
import { applySettingsChanges, copyFormats, defaultSubscriptionSettings, modeRequirements, paywallModes, parseSettingsChanges,
  type CopyFormat, type EditableSettingField, type ModeFacts, type ModeRequirement, type PaywallMode, type ProtectedSettingField,
  type ShortcutField, type SubscriptionSettings } from "../../domain/subscription-settings.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import { auditTextErrors, writeOwnerAudit } from "../admin/audit.ts";
import type { LoginRefusal, PasswordCheck } from "../analytics/analytics-auth.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma, SubscriptionSettings as SettingsRow } from "../generated/prisma/client.ts";

/**
 * The paid-access settings service (prompts/monetization.md 5.7): one typed row, id = 1. Public reads go through a
 * per-process cache that keeps a value for 30 s, so a mode change reaches every process within 30 s. A failed read serves
 * the last good value; with none, access resolves to free, so a settings outage never opens subscriber content.
 */
export const settingsCacheRules = Object.freeze({ freshMs: 30_000, failureRetryMs: 5_000 });
const settingsId = 1;
const transactionOptions = { isolationLevel: "ReadCommitted", timeout: 10_000 } as const;

export type SettingsSource = "stored" | "defaults" | "last-good";
export type SettingsState =
  | Readonly<{ settings: SubscriptionSettings; source: SettingsSource }>
  | Readonly<{ settings: null; source: "unavailable" }>;

/**
 * The mode access resolution (060) applies. `free` is the outage case: settings could not be read and no good value is
 * cached, so every viewer gets the free view (the owner's preview aside) until a read succeeds.
 */
export function accessMode(state: SettingsState): PaywallMode | "free" {
  return state.settings ? state.settings.paywallMode : "free";
}

/** A stored row as typed settings; a value outside the reviewed shape counts as a failed read. */
export function settingsFromRow(row: SettingsRow): SubscriptionSettings {
  if (!(paywallModes as readonly string[]).includes(row.paywallMode) || !(copyFormats as readonly string[]).includes(row.copyFormat)) {
    throw new RangeError("Stored subscription settings are outside the reviewed shape.");
  }
  const instant = (value: Date | null) => value?.toISOString() ?? null;
  return Object.freeze({
    paywallMode: row.paywallMode as PaywallMode,
    mtnNumber: row.mtnNumber, mtnName: row.mtnName, mtnMenuShortcut: row.mtnMenuShortcut,
    airtelNumber: row.airtelNumber, airtelName: row.airtelName, airtelMenuShortcut: row.airtelMenuShortcut,
    copyFormat: row.copyFormat as CopyFormat,
    contactPhone: row.contactPhone, whatsappPhone: row.whatsappPhone,
    paymentNote: row.paymentNote, reviewTime: row.reviewTime,
    maxUnlockedDevices: row.maxUnlockedDevices, trialDays: row.trialDays, screenshotRetentionDays: row.screenshotRetentionDays,
    paymentNumbersChangedAt: instant(row.paymentNumbersChangedAt), lastMembersPurgeAt: instant(row.lastMembersPurgeAt),
    updatedAt: instant(row.updatedAt), updatedBy: row.updatedBy,
  });
}

/**
 * Locks the settings row for the rest of the transaction, creating it with the defaults first when it is missing, and
 * returns it. Mode switches, saves and plan deactivation all take this lock first, so they never decide on a stale mode or
 * plan count.
 */
export async function lockSettings(tx: Prisma.TransactionClient, actor: string, at: Date): Promise<SubscriptionSettings> {
  await tx.$executeRaw`INSERT INTO SubscriptionSettings (id, updatedAt, updatedBy) VALUES (${settingsId}, ${at}, ${actor})
    ON DUPLICATE KEY UPDATE id = id`;
  await tx.$queryRaw`SELECT id FROM SubscriptionSettings WHERE id = ${settingsId} FOR UPDATE`;
  return settingsFromRow(await tx.subscriptionSettings.findUniqueOrThrow({ where: { id: settingsId } }));
}

/**
 * Runs one decision in one transaction. `rollback` ends it without committing and returns its outcome, so a refused or
 * empty change writes nothing, not even the defaults row the lock created. The database runtime replaces thrown errors
 * with its own, so the outcome travels beside the error.
 */
export async function decide<Outcome>(database: DatabaseRuntime,
  run: (tx: Prisma.TransactionClient, rollback: (outcome: Outcome) => never) => Promise<Outcome>): Promise<Outcome> {
  let ended: Readonly<{ outcome: Outcome }> | null = null;
  const rollback = (outcome: Outcome): never => { ended = { outcome }; throw new Error("Rolled back without a change."); };
  try { return await database.transaction((tx) => run(tx, rollback), transactionOptions); }
  catch (error) {
    const result = ended as Readonly<{ outcome: Outcome }> | null;
    if (result) return result.outcome;
    throw error;
  }
}

export type ReleaseReadiness = () => Readonly<{ privacy: boolean; terms: boolean }>;
/** `on` waits for both notices (`src/domain/privacy-notice.ts`, `terms-notice.ts`); tests inject their own answer. */
export const noticeReadiness: ReleaseReadiness = () => ({ privacy: privacyNotice.releaseReady, terms: termsNotice.releaseReady });

export async function modeFacts(client: Pick<Prisma.TransactionClient, "subscriptionPlan">, readiness: ReleaseReadiness): Promise<ModeFacts> {
  const { privacy, terms } = readiness();
  return { activePlans: await client.subscriptionPlan.count({ where: { active: true } }), privacyReleaseReady: privacy, termsReleaseReady: terms };
}

export type SettingsErrors = Readonly<Partial<Record<string, string>>>;
export type SettingsOutcome =
  | Readonly<{ status: "saved"; settings: SubscriptionSettings; changed: readonly EditableSettingField[]; cleared: readonly ShortcutField[] }>
  | Readonly<{ status: "invalid"; errors: SettingsErrors }>
  | Readonly<{ status: "password-required"; fields: readonly ProtectedSettingField[] }>
  | Readonly<{ status: "password-refused"; check: LoginRefusal }>
  | Readonly<{ status: "requirements"; mode: PaywallMode; missing: readonly ModeRequirement[] }>;
export type SettingsOverview = Readonly<{
  settings: SubscriptionSettings;
  source: "stored" | "defaults";
  /** What still stops each mode; empty when it can be switched on now. */
  requirements: Readonly<Record<Exclude<PaywallMode, "off">, readonly ModeRequirement[]>>;
}>;

/** A save of the eight protected fields: the password typed again, checked by the owner login (its check and throttle). */
export type PasswordReentry = Readonly<{ password: string | null; confirm: (password: string) => Promise<PasswordCheck> }>;

export function createSettingsService(database: DatabaseRuntime,
  { now = Date.now, readiness = noticeReadiness }: { now?: () => number; readiness?: ReleaseReadiness } = {}) {
  let cached: Readonly<{ state: SettingsState; until: number }> | null = null;
  let lastGood: SubscriptionSettings | null = null;
  let loading: Promise<SettingsState> | null = null;
  /** Bumped by every save here, so a read that started before it never replaces the saved value. */
  let generation = 0;

  async function stored(): Promise<Readonly<{ settings: SubscriptionSettings; source: "stored" | "defaults" }>> {
    const row = await database.query((client) => client.subscriptionSettings.findUnique({ where: { id: settingsId } }));
    return row ? { settings: settingsFromRow(row), source: "stored" } : { settings: defaultSubscriptionSettings, source: "defaults" };
  }

  async function refresh(): Promise<SettingsState> {
    const started = generation;
    let state: SettingsState;
    try {
      state = await stored();
      if (started !== generation) return cached!.state;
      lastGood = state.settings;
      cached = { state, until: now() + settingsCacheRules.freshMs };
    } catch {
      if (started !== generation) return cached!.state;
      // Retried sooner than a fresh value expires, so a brief outage ends quickly.
      state = lastGood ? { settings: lastGood, source: "last-good" } : { settings: null, source: "unavailable" };
      cached = { state, until: now() + settingsCacheRules.failureRetryMs };
    }
    return state;
  }

  /** A saved change shows at once in this process; other processes see it when their cached value expires. */
  function remember(settings: SubscriptionSettings) {
    generation++;
    lastGood = settings;
    cached = { state: { settings, source: "stored" }, until: now() + settingsCacheRules.freshMs };
  }

  async function refusedReentry(actor: string, check: LoginRefusal) {
    // Only counted attempts are written, as for sign-in refusals, so the throttle bounds these rows.
    if (!(check.status === "invalid" || (check.status === "locked" && check.newlyLocked))) return;
    try {
      await database.query((client) => writeOwnerAudit(client, { at: new Date(now()), actor, action: "settings_password_refused",
        targetType: "settings", targetId: String(settingsId), details: { reason: check.status } }));
    } catch { /* Best effort: the refusal stands either way. */ }
  }

  return Object.freeze({
    /** Settings for access decisions and member pages: cached for 30 s, the last good value on failure, else unavailable. */
    current(): Promise<SettingsState> {
      if (cached && now() < cached.until) return Promise.resolve(cached.state);
      if (!loading) {
        const pending = refresh();
        loading = pending;
        void pending.finally(() => { if (loading === pending) loading = null; });
      }
      return loading;
    },

    /** The owner's Settings page: the stored row, uncached, with what still stops `test` and `on`. Throws when unreadable. */
    async overview(): Promise<SettingsOverview> {
      const { settings, source } = await stored();
      const facts = await database.query((client) => modeFacts(client, readiness));
      return { settings, source, requirements: { test: modeRequirements(settings, "test", facts), on: modeRequirements(settings, "on", facts) } };
    },

    /**
     * Saves the fields the form changed. Phones are stored as canonical digits. A protected field needs the password,
     * checked before any row is locked because the hash is slow; the change and its audit row (old and new values) commit
     * together. While the mode is `test` or `on`, a save that would break one of its requirements is refused.
     */
    async save(actor: string, input: unknown, reentry: PasswordReentry): Promise<SettingsOutcome> {
      const parsed = parseSettingsChanges(input);
      if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
      const unsafe = auditTextErrors(parsed.changes, { ownerSetting: true });
      if (unsafe) return { status: "invalid", errors: unsafe };
      const preview = applySettingsChanges((await stored()).settings, parsed.changes);
      if (!preview.ok) return { status: "invalid", errors: preview.errors };
      if (preview.change.changed.length === 0) return { status: "saved", settings: preview.change.next, changed: [], cleared: [] };
      let confirmed = false;
      if (preview.change.protectedChanged.length > 0) {
        if (!reentry.password) return { status: "password-required", fields: preview.change.protectedChanged };
        const check = await reentry.confirm(reentry.password);
        if (check.status !== "confirmed") {
          await refusedReentry(actor, check);
          return { status: "password-refused", check };
        }
        confirmed = true;
      }
      const at = new Date(now());
      const outcome = await decide<SettingsOutcome>(database, async (tx, rollback) => {
        const current = await lockSettings(tx, actor, at);
        // Applied again to the locked row, so a concurrent save is never overwritten with values read before it.
        const applied = applySettingsChanges(current, parsed.changes);
        if (!applied.ok) return rollback({ status: "invalid", errors: applied.errors });
        const { change } = applied;
        if (change.changed.length === 0) return rollback({ status: "saved", settings: current, changed: [], cleared: [] });
        if (change.protectedChanged.length > 0 && !confirmed) return rollback({ status: "password-required", fields: change.protectedChanged });
        if (current.paywallMode !== "off") {
          // Only what this save breaks: a requirement already unmet (a notice withdrawn after switch-on) blocks nothing here.
          const facts = await modeFacts(tx, readiness);
          const before = new Set(modeRequirements(current, current.paywallMode, facts).map(({ key }) => key));
          const missing = modeRequirements(change.next, current.paywallMode, facts).filter(({ key }) => !before.has(key));
          if (missing.length > 0) return rollback({ status: "requirements", mode: current.paywallMode, missing });
        }
        const row = await tx.subscriptionSettings.update({ where: { id: settingsId }, data: {
          ...Object.fromEntries(change.changed.map((field) => [field, change.next[field]])),
          ...(change.paymentNumbersChanged ? { paymentNumbersChangedAt: at } : {}),
          updatedAt: at, updatedBy: actor,
        } });
        await writeOwnerAudit(tx, { at, actor, action: "settings_changed", targetType: "settings", targetId: String(settingsId), details: {
          changes: Object.fromEntries(change.changed.map((field) => [field, { from: current[field], to: change.next[field] }])),
          cleared: change.cleared, passwordConfirmed: confirmed,
        } });
        return { status: "saved", settings: settingsFromRow(row), changed: change.changed, cleared: change.cleared };
      });
      if (outcome.status === "saved" && outcome.changed.length > 0) remember(outcome.settings);
      return outcome;
    },

    /** Switches the mode (the form asks for a second tap first). `test` and `on` are refused until their requirements hold. */
    async setMode(actor: string, mode: unknown): Promise<SettingsOutcome> {
      if (typeof mode !== "string" || !(paywallModes as readonly string[]).includes(mode)) {
        return { status: "invalid", errors: { mode: "Choose off, test or on." } };
      }
      const next = mode as PaywallMode;
      const at = new Date(now());
      const outcome = await decide<SettingsOutcome>(database, async (tx, rollback) => {
        const current = await lockSettings(tx, actor, at);
        if (current.paywallMode === next) return rollback({ status: "saved", settings: current, changed: [], cleared: [] });
        const missing = modeRequirements(current, next, await modeFacts(tx, readiness));
        if (missing.length > 0) return rollback({ status: "requirements", mode: next, missing });
        const row = await tx.subscriptionSettings.update({ where: { id: settingsId }, data: { paywallMode: next, updatedAt: at, updatedBy: actor } });
        await writeOwnerAudit(tx, { at, actor, action: "paywall_mode_changed", targetType: "settings", targetId: String(settingsId),
          details: { from: current.paywallMode, to: next } });
        return { status: "saved", settings: settingsFromRow(row), changed: [], cleared: [] };
      });
      if (outcome.status === "saved") remember(outcome.settings);
      return outcome;
    },
  });
}
export type SettingsService = ReturnType<typeof createSettingsService>;

const processState = globalThis as typeof globalThis & { goalHintSubscriptionSettings?: WeakMap<DatabaseRuntime, SettingsService> };

/** One service, and so one 30 s cache, per database runtime in this process (kept across development reloads). */
export function settingsServiceFor(database: DatabaseRuntime): SettingsService {
  const services = processState.goalHintSubscriptionSettings ??= new WeakMap();
  let service = services.get(database);
  if (!service) { service = createSettingsService(database); services.set(database, service); }
  return service;
}
