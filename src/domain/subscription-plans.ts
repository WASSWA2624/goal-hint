/**
 * Subscription plans (prompts/monetization.md 5.1 and 5.6). The owner creates them on /admin/plans; nothing is seeded.
 * Every plan unlocks every feature, so a plan is only a name, a length and a price. `durationDays` counts 24-hour blocks
 * from payment confirmation, never calendar days. Plans are never deleted: submissions and codes keep their snapshots.
 */
export const planRules = Object.freeze({
  nameMaxLength: 40,
  durationDays: Object.freeze({ min: 1, max: 366 }),
  priceUgx: Object.freeze({ min: 100, max: 10_000_000 }),
});

export type SubscriptionPlanView = Readonly<{
  id: string;
  name: string;
  durationDays: number;
  priceUgx: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}>;

export type PlanFields = Readonly<{ name: string; durationDays: number; priceUgx: number }>;
type PlanErrors = Partial<Record<keyof PlanFields | "plan", string>>;
const controlCharacters = /[\u0000-\u001f\u007f]/u;

/**
 * Validate a new plan, or with `partial` the fields an edit sends. Names are trimmed, at most 40 characters; days and price
 * are whole numbers in range. Unknown fields are refused.
 */
export function parsePlanFields(input: unknown, { partial = false }: { partial?: boolean } = {}):
  Readonly<{ ok: true; fields: Partial<PlanFields> }> | Readonly<{ ok: false; errors: PlanErrors }> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { plan: "Send the plan's name, days and price." } };
  const errors: PlanErrors = {};
  const fields: { -readonly [Key in keyof PlanFields]?: PlanFields[Key] } = {};
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!["name", "durationDays", "priceUgx"].includes(key)) errors.plan = `Unknown plan field: ${key.slice(0, 40)}.`;
  if (record.name !== undefined || !partial) {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name === "") errors.name = "Enter a name, for example Weekly.";
    else if (name.length > planRules.nameMaxLength || controlCharacters.test(name)) errors.name = `Use at most ${planRules.nameMaxLength} plain characters.`;
    else fields.name = name;
  }
  for (const key of ["durationDays", "priceUgx"] as const) {
    if (record[key] === undefined && partial) continue;
    const value = record[key], { min, max } = planRules[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) fields[key] = value;
    else errors[key] = key === "durationDays" ? `Enter whole days from ${min} to ${max}.` : `Enter a whole UGX price from ${formatUgx(min)} to ${formatUgx(max)}.`;
  }
  if (partial && Object.keys(fields).length === 0 && Object.keys(errors).length === 0) errors.plan = "Change the name, days or price.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, fields };
}

/** Whole UGX with thousands separators, the same on the server and in the browser: `UGX 5,000`. */
export function formatUgx(amount: number): string {
  return `UGX ${String(amount).replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
}

/** "24 hours" for one day, otherwise "7 days": a day is 24 hours from payment confirmation. */
export function formatPlanLength(durationDays: number): string {
  return durationDays === 1 ? "24 hours" : `${durationDays} days`;
}
