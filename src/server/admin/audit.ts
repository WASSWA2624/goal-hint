import "server-only";

import { editableSettingFields } from "../../domain/subscription-settings.ts";
import type { SignInAuditEvent } from "../analytics/analytics-http.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/**
 * The owner audit trail (OwnerAuditEvent): owner sign-ins and every owner change. Operational, not tamper-proof: the
 * application role writes it. Details never hold a subscriber phone, a full access code or an image; phone numbers may
 * appear only under an owner settings field name (the owner's own numbers, shortcuts and notes). The Audit page comes in 065.
 * `code_reissued` is no longer written (068 removed reissue); it stays so earlier rows remain filterable.
 */
export const ownerAuditActions = Object.freeze([
  "owner_signed_in", "owner_signed_out", "owner_sign_in_refused",
  "settings_changed", "settings_password_refused", "paywall_mode_changed",
  "plan_created", "plan_updated", "plan_activated", "plan_deactivated", "plans_reordered",
  "code_created", "code_revoked", "code_extended", "code_reissued", "number_changed", "payment_approved", "payment_reversed",
  "device_unlocked", "device_evicted", "access_granted", "trial_sent", "trial_dismissed",
  "member_note_changed", "member_signed_out_all", "member_blocked", "member_unblocked", "member_erased", "members_purged", "password_reset",
  "payment_submitted", "payment_rejected", "payment_sms_attempted", "trial_requested", "uploads_busy",
] as const);
export type OwnerAuditAction = (typeof ownerAuditActions)[number];

/** Where the shared owner login was used: the owner dashboard or the analytics dashboard. */
export type SignInSurface = "admin" | "analytics";

export type OwnerAuditEntry = Readonly<{
  at: Date;
  /** The owner's username, or `unverified` for a refused sign-in. */
  actor: string;
  action: OwnerAuditAction;
  /** A member account the action concerns (no foreign key, so the row outlives a purge); none in 058. */
  accountId?: string | null;
  targetType: "owner-session" | "settings" | "plan" | "access-code" | "member" | "member-session" | "payment";
  targetId: string;
  details: Readonly<Record<string, unknown>>;
}>;
type AuditClient = Readonly<{ ownerAuditEvent: Pick<Prisma.TransactionClient["ownerAuditEvent"], "create"> }>;

const ownerSettingKeys: ReadonlySet<string> = new Set(editableSettingFields);
// A formatted access code, and a whole run of 10-15 digits, neither part of a longer token: a letter of either case or a dash
// next to it means a UUID (about 1 random plan id in 120 has three all-digit groups) or another identifier, never a code.
const accessCodeShape = /(?<![0-9A-Za-z-])[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}(?![0-9A-Za-z-])/u;
const phoneShape = /(?<![0-9A-Za-z-])\+?\d{10,15}(?![0-9A-Za-z-])/u;

export class UnsafeAuditDetailsError extends Error {
  constructor(path: string) { super(`Audit details may not hold ${path}.`); this.name = "UnsafeAuditDetailsError"; }
}

/** What a string would leak into the trail, if anything. Owner settings may hold the owner's own numbers. */
function unsafeText(value: string, ownerSetting: boolean): "an access code" | "a phone number" | null {
  if (accessCodeShape.test(value)) return "an access code";
  return !ownerSetting && phoneShape.test(value) ? "a phone number" : null;
}

/**
 * Owner-typed text the trail would refuse, by field, so a plan or settings save answers "invalid" before its transaction
 * instead of failing inside it as unavailable storage. Null when every field may be audited.
 */
export function auditTextErrors(fields: Readonly<Record<string, unknown>>, { ownerSetting = false }: { ownerSetting?: boolean } = {}):
  Readonly<Record<string, string>> | null {
  const errors = Object.entries(fields).flatMap(([key, value]) => {
    const unsafe = typeof value === "string" ? unsafeText(value, ownerSetting) : null;
    return unsafe ? [[key, `Remove what reads as ${unsafe}: the owner audit never stores one.`] as const] : [];
  });
  return errors.length > 0 ? Object.fromEntries(errors) : null;
}

/**
 * Plain JSON for the details column, refusing what the trail must never store: binary data (an image), a formatted access
 * code, and phone-shaped digits anywhere except under an owner settings field (the owner's own numbers, shortcuts and copy).
 */
export function auditDetails(value: unknown, path = "details", ownerSetting = false): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const unsafe = unsafeText(value, ownerSetting);
    if (unsafe) throw new UnsafeAuditDetailsError(`${unsafe} at ${path}`);
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) throw new UnsafeAuditDetailsError(`binary data at ${path}`);
  if (Array.isArray(value)) return value.map((item, index) => auditDetails(item, `${path}[${index}]`, ownerSetting));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
      [key, auditDetails(item, `${path}.${key}`, ownerSetting || ownerSettingKeys.has(key))]));
  }
  throw new UnsafeAuditDetailsError(`a ${typeof value} at ${path}`);
}

/** Writes one row, inside the caller's transaction when the change it records is written there. */
export async function writeOwnerAudit(client: AuditClient, entry: OwnerAuditEntry): Promise<void> {
  await client.ownerAuditEvent.create({ data: {
    at: entry.at, actor: entry.actor.slice(0, 64), action: entry.action, accountId: entry.accountId ?? null,
    targetType: entry.targetType, targetId: entry.targetId.slice(0, 64), details: auditDetails(entry.details) as Prisma.InputJsonObject,
  } });
}

/**
 * The sign-in audit callback of the shared owner login (057). Sign-in and sign-out name the owner; a refusal carries only
 * its reason, never the typed username or password. The login reports a refusal without awaiting it, so this callback
 * resolves its own services and lets the login's best-effort wrapper swallow any failure.
 */
export function ownerSignInAudit(services: () => Promise<Readonly<{ database: DatabaseRuntime | null }>>, surface: SignInSurface,
  { now = Date.now }: { now?: () => number } = {}) {
  return async (event: SignInAuditEvent): Promise<void> => {
    const { database } = await services();
    if (!database) return;
    const at = new Date(now());
    const entry: OwnerAuditEntry = event.action === "sign-in-refused"
      ? { at, actor: "unverified", action: "owner_sign_in_refused", targetType: "owner-session", targetId: surface, details: { surface, reason: event.reason } }
      : { at, actor: event.username, action: event.action === "sign-in" ? "owner_signed_in" : "owner_signed_out", targetType: "owner-session",
        targetId: surface, details: { surface } };
    await database.query((client) => writeOwnerAudit(client, entry));
  };
}
