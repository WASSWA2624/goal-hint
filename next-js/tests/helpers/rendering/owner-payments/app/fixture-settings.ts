import "server-only";
import { defaultSubscriptionSettings, type SubscriptionSettings } from "@/domain/subscription-settings";
import { createSettingsService, type SettingsService } from "@/server/members/settings";
import type { DatabaseRuntime } from "@/server/database/client";
import { seed } from "./fixture";

export const settingsScenarios = ["writable", "managed", "missing", "requirements-race", "save-failed", "saved-without-requirements"] as const;
export type SettingsScenario = typeof settingsScenarios[number];
type Row = Omit<SubscriptionSettings, "updatedAt" | "paymentNumbersChangedAt" | "lastMembersPurgeAt"> & {
  id: number; updatedAt: Date | null; paymentNumbersChangedAt: Date | null; lastMembersPurgeAt: Date | null;
};
type State = { row: Row; audits: unknown[]; service: SettingsService; queue: Promise<unknown> };
const shared = globalThis as typeof globalThis & { goalHintSettingsFixture?: Map<SettingsScenario, State>;
  goalHintSubscriptionSettings?: WeakMap<DatabaseRuntime, SettingsService> };

export function settingsScenario(value: unknown): SettingsScenario {
  return settingsScenarios.find(scenario => scenario === value) ?? "writable";
}
export function requestSettingsScenario(request: Request): SettingsScenario {
  return settingsScenario(request.headers.get("x-settings-fixture-scenario")
    ?? request.headers.get("cookie")?.match(/(?:^|;\s*)owner-settings-scenario=([^;]+)/u)?.[1]);
}
function stateFor(scenario: SettingsScenario): State {
  const states = shared.goalHintSettingsFixture ??= new Map();
  const existing = states.get(scenario); if (existing) return existing;
  const row: Row = { ...defaultSubscriptionSettings, id: 1, mtnNumber: "256700000901", mtnName: "SYNTHETIC MTN PAYEE", mtnMenuShortcut: "*000*{amount}#",
    airtelNumber: "256700000902", airtelName: "SYNTHETIC AIRTEL PAYEE", airtelMenuShortcut: "*001*{amount}#",
    contactPhone: "256700000903", whatsappPhone: "256700000904", reviewTime: "Usually within 30 minutes", paymentNote: "Keep your payment receipt.",
    updatedAt: new Date("2026-10-23T09:00:00Z"), updatedBy: "synthetic-administrator", paymentNumbersChangedAt: null, lastMembersPurgeAt: null };
  if (scenario === "missing") Object.assign(row, { mtnNumber: null, mtnName: null, mtnMenuShortcut: null,
    airtelNumber: null, airtelName: null, airtelMenuShortcut: null, contactPhone: null, whatsappPhone: null });
  const state = { row, audits: [], queue: Promise.resolve() } as unknown as State;
  let transaction = false, failOverview = false;
  const client = { $executeRaw: async () => 0, $queryRaw: async () => [{ id: 1 }],
    subscriptionSettings: { findUnique: async () => state.row, findUniqueOrThrow: async () => state.row,
      update: async ({ data }: { data: Partial<Row> }) => { Object.assign(state.row, data); return state.row; } },
    subscriptionPlan: { count: async () => scenario === "missing" || scenario === "requirements-race" && transaction ? 0 : 1 },
    ownerAuditEvent: { create: async ({ data }: { data: unknown }) => { state.audits.push(data); return data; } } };
  const database = { query: async (run: (tx: typeof client) => unknown) => run(client),
    transaction(run: (tx: typeof client) => unknown) {
      const result = state.queue.then(async () => {
        if (scenario === "save-failed") throw new Error("Synthetic settings storage failure.");
        const before = structuredClone(state.row), auditLength = state.audits.length;
        transaction = true;
        try { return await run(client); } catch (error) { state.row = before; state.audits.length = auditLength; throw error; }
        finally { transaction = false; }
      });
      state.queue = result.catch(() => {}); return result;
    } } as unknown as DatabaseRuntime;
  const service = createSettingsService(database, { environment: scenario === "managed" ? {
    mtnNumber: row.mtnNumber, mtnName: row.mtnName, mtnMenuShortcut: row.mtnMenuShortcut, airtelNumber: row.airtelNumber,
    airtelName: row.airtelName, airtelMenuShortcut: row.airtelMenuShortcut, contactPhone: row.contactPhone, whatsappPhone: row.whatsappPhone,
  } : null, readiness: () => ({ privacy: scenario !== "missing", terms: scenario !== "missing" }) });
  state.service = { ...service,
    async overview() { if (failOverview) { failOverview = false; throw new Error("Synthetic post-commit read failure."); } return service.overview(); },
    async save(...args: Parameters<SettingsService["save"]>) { const result = await service.save(...args); if (scenario === "saved-without-requirements" && result.status === "saved") failOverview = true; return result; },
    async setMode(...args: Parameters<SettingsService["setMode"]>) { const result = await service.setMode(...args); if (scenario === "saved-without-requirements" && result.status === "saved") failOverview = true; return result; },
  };
  states.set(scenario, state); return state;
}
export const fixtureSettingsService = (scenario: SettingsScenario) => stateFor(scenario).service;
export function seedSettings(scenario: SettingsScenario) {
  const services = seed();
  const registered = shared.goalHintSubscriptionSettings ??= new WeakMap();
  registered.set(services.database!, fixtureSettingsService(scenario));
}
export function resetSettings(scenario: SettingsScenario) { shared.goalHintSettingsFixture?.delete(scenario); }
export function settingsSnapshot(scenario: SettingsScenario) {
  const state = stateFor(scenario);
  return { scenario, settings: state.row, auditCount: state.audits.length };
}
