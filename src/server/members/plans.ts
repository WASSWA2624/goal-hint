import "server-only";

import { randomUUID } from "node:crypto";
import { parsePlanFields, type PlanFields, type SubscriptionPlanView } from "../../domain/subscription-plans.ts";
import type { ModeRequirement, PaywallMode } from "../../domain/subscription-settings.ts";
import { auditTextErrors, writeOwnerAudit } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma, SubscriptionPlan as PlanRow } from "../generated/prisma/client.ts";
import { decide, lockSettings } from "./settings.ts";

/**
 * Subscription plans (prompts/monetization.md 5.1 and 5.6): create, edit, deactivate, reactivate and reorder. There is no
 * delete, here or in the application grants: submissions and codes reference plans and keep their own snapshots, so an
 * edit never rewrites history. Every change commits with its audit row.
 */
const transactionOptions = { isolationLevel: "ReadCommitted", timeout: 10_000 } as const;
type PlanErrors = Readonly<Partial<Record<string, string>>>;

export type PlanOutcome =
  | Readonly<{ status: "saved"; plans: readonly SubscriptionPlanView[] }>
  | Readonly<{ status: "invalid"; errors: PlanErrors }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "requirements"; mode: PaywallMode; missing: readonly ModeRequirement[] }>;

export function planView(row: PlanRow): SubscriptionPlanView {
  return Object.freeze({ id: row.id, name: row.name, durationDays: row.durationDays, priceUgx: row.priceUgx, active: row.active,
    sortOrder: row.sortOrder, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}

/** The owner's order; equal positions (two plans added at once) fall back to creation time, then id. */
const listOrder = [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] as const satisfies Prisma.SubscriptionPlanOrderByWithRelationInput[];
const isPlanId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/u.test(value);

export function createPlansService(database: DatabaseRuntime, { now = Date.now }: { now?: () => number } = {}) {
  const all = async (client: Pick<Prisma.TransactionClient, "subscriptionPlan">) =>
    (await client.subscriptionPlan.findMany({ orderBy: [...listOrder] })).map(planView);
  /** Locks one plan for the rest of the transaction; null when it does not exist. */
  const lockPlan = async (tx: Prisma.TransactionClient, id: string) => {
    const [found] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM SubscriptionPlan WHERE id = ${id} FOR UPDATE`;
    return found ? tx.subscriptionPlan.findUniqueOrThrow({ where: { id } }) : null;
  };

  return Object.freeze({
    /** Every plan, active or not, in the owner's order. */
    list(): Promise<readonly SubscriptionPlanView[]> {
      return database.query(all);
    },

    /** A new active plan at the end of the order. */
    async create(actor: string, input: unknown): Promise<PlanOutcome> {
      const parsed = parsePlanFields(input);
      if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
      const fields = parsed.fields as PlanFields;
      const unsafe = auditTextErrors(fields);
      if (unsafe) return { status: "invalid", errors: unsafe };
      const at = new Date(now());
      return database.transaction(async (tx) => {
        const { _max } = await tx.subscriptionPlan.aggregate({ _max: { sortOrder: true } });
        const plan = await tx.subscriptionPlan.create({ data: { id: randomUUID(), ...fields, active: true,
          sortOrder: (_max.sortOrder ?? -1) + 1, createdAt: at, updatedAt: at } });
        await writeOwnerAudit(tx, { at, actor, action: "plan_created", targetType: "plan", targetId: plan.id,
          details: { name: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx } });
        return { status: "saved", plans: await all(tx) };
      }, transactionOptions);
    },

    /** Changes a plan's name, days or price. Codes and submissions keep the values they were created with. */
    async edit(actor: string, id: unknown, input: unknown): Promise<PlanOutcome> {
      if (!isPlanId(id)) return { status: "not-found" };
      const parsed = parsePlanFields(input, { partial: true });
      if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
      const unsafe = auditTextErrors(parsed.fields);
      if (unsafe) return { status: "invalid", errors: unsafe };
      const at = new Date(now());
      return database.transaction(async (tx): Promise<PlanOutcome> => {
        const plan = await lockPlan(tx, id);
        if (!plan) return { status: "not-found" };
        const changed = (Object.keys(parsed.fields) as (keyof PlanFields)[]).filter((key) => parsed.fields[key] !== plan[key]);
        if (changed.length === 0) return { status: "saved", plans: await all(tx) };
        await tx.subscriptionPlan.update({ where: { id }, data: { ...parsed.fields, updatedAt: at } });
        await writeOwnerAudit(tx, { at, actor, action: "plan_updated", targetType: "plan", targetId: id,
          details: { changes: Object.fromEntries(changed.map((key) => [key, { from: plan[key], to: parsed.fields[key] }])) } });
        return { status: "saved", plans: await all(tx) };
      }, transactionOptions);
    },

    /**
     * Deactivates (hidden from Get access, kept for history) or reactivates a plan. While paid access is `test` or `on`, the
     * last active plan cannot be deactivated: those modes need one. The settings row is locked first, as a mode switch does.
     */
    async setActive(actor: string, id: unknown, active: boolean): Promise<PlanOutcome> {
      if (!isPlanId(id)) return { status: "not-found" };
      const at = new Date(now());
      return decide<PlanOutcome>(database, async (tx, rollback) => {
        // Serialized with mode switches by the settings lock; the defaults row it may create commits only with a change.
        const settings = await lockSettings(tx, actor, at);
        const plan = await lockPlan(tx, id);
        if (!plan) return rollback({ status: "not-found" });
        if (plan.active === active) return rollback({ status: "saved", plans: await all(tx) });
        if (!active && settings.paywallMode !== "off" && await tx.subscriptionPlan.count({ where: { active: true, id: { not: id } } }) === 0) {
          return rollback({ status: "requirements", mode: settings.paywallMode, missing: [{ key: "plan",
            message: `Paid access is ${settings.paywallMode === "on" ? "on" : "in test mode"} and needs an active plan. Add or activate another plan first, or switch paid access off.` }] });
        }
        await tx.subscriptionPlan.update({ where: { id }, data: { active, updatedAt: at } });
        await writeOwnerAudit(tx, { at, actor, action: active ? "plan_activated" : "plan_deactivated", targetType: "plan", targetId: id,
          details: { name: plan.name } });
        return { status: "saved", plans: await all(tx) };
      });
    },

    /** Sets the order shown on Get access (the first active plan is preselected). `ids` must name every plan exactly once. */
    async reorder(actor: string, ids: unknown): Promise<PlanOutcome> {
      if (!Array.isArray(ids) || !ids.every(isPlanId) || new Set(ids).size !== ids.length) {
        return { status: "invalid", errors: { order: "Send every plan once, in the new order." } };
      }
      const at = new Date(now());
      return database.transaction(async (tx): Promise<PlanOutcome> => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM SubscriptionPlan ORDER BY id FOR UPDATE`;
        const known = new Set(locked.map(({ id }) => id));
        if (known.size !== ids.length || !ids.every((id) => known.has(id))) {
          return { status: "invalid", errors: { order: "The plans changed meanwhile. Reload the page and try again." } };
        }
        const before = (await all(tx)).map(({ id }) => id);
        if (before.every((id, index) => id === ids[index])) return { status: "saved", plans: await all(tx) };
        for (const [index, id] of ids.entries()) await tx.subscriptionPlan.update({ where: { id }, data: { sortOrder: index, updatedAt: at } });
        await writeOwnerAudit(tx, { at, actor, action: "plans_reordered", targetType: "plan", targetId: "order", details: { from: before, to: ids } });
        return { status: "saved", plans: await all(tx) };
      }, transactionOptions);
    },
  });
}
export type PlansService = ReturnType<typeof createPlansService>;

const processState = globalThis as typeof globalThis & { goalHintSubscriptionPlans?: WeakMap<DatabaseRuntime, PlansService> };

export function plansServiceFor(database: DatabaseRuntime): PlansService {
  const services = processState.goalHintSubscriptionPlans ??= new WeakMap();
  let service = services.get(database);
  if (!service) { service = createPlansService(database); services.set(database, service); }
  return service;
}
