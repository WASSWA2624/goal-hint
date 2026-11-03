import { z } from "zod";
import { publicPolicy } from "./public-policy.ts";
import { slipSnapshotRules, slipSnapshotSchema } from "./slip-snapshot.ts";
import { modelIndependentSlip, type BuiltSlip } from "./slip-builder.ts";
import type { SlipStatus } from "./slip-status.ts";

export type SlipSharePresentation = Readonly<{
  status?: SlipStatus;
  selectionOutcomes?: Readonly<Record<string, "correct" | "incorrect" | "pending" | "void">>;
  selectionScores?: Readonly<Record<string, Readonly<{ home: number; away: number }>>>;
  capturedAt?: string;
}>;

export const sharedSlipRules = Object.freeze({
  maximumRequestBytes: slipSnapshotRules.maximumRequestBytes,
});
export const sharedSlipIdSchema = z.string().regex(/^[a-f0-9]{32}$/u);
const slipId = z.string().min(1).max(slipSnapshotRules.maximumIdentityLength);
export const shareSlipSourceSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("best"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), slipId }),
]);
export type ShareSlipSource = z.infer<typeof shareSlipSourceSchema> | Readonly<{ source: "builder"; criteria: string; slipId: string }>;
export type SharedSlip = Readonly<{ id: string; url: string | null; createdAt: string; slip: BuiltSlip;
  number?: string; contacts?: readonly string[] }> & SlipSharePresentation;

export function sharedSlipPath(id: string): string {
  return `/s/${sharedSlipIdSchema.parse(id)}`;
}
export function sharedSlipUrl(id: string): string {
  return new URL(sharedSlipPath(id), publicPolicy.origin).toString();
}
export const sharedSlipSchema = z.strictObject({
  id: sharedSlipIdSchema,
  url: z.url(),
  createdAt: z.iso.datetime(),
  slip: slipSnapshotSchema,
  number: z.string().regex(/^[0-9]{8}$/u).optional(),
  status: z.enum(["not-started", "in-progress", "pending", "won", "lost", "void", "cancelled"]).optional(),
  selectionOutcomes: z.record(z.string(), z.enum(["correct", "incorrect", "pending", "void"])).optional(),
  selectionScores: z.record(z.string(), z.strictObject({ home: z.number().int().min(0).max(1000), away: z.number().int().min(0).max(1000) })).optional(),
  contacts: z.array(z.string().max(100)).max(2).optional(),
}).refine((value) => {
  if (value.url === sharedSlipUrl(value.id)) return true;
  const url = new URL(value.url);
  return url.origin === publicPolicy.origin && !url.username && !url.password && !url.search && !url.hash
    && /^\/en\/best-slips\/\d{4}-\d{2}-\d{2}\/[1-9]\d{0,2}$/u.test(url.pathname);
}, "The public slip URL must identify a publication.")
  .transform((value): SharedSlip => ({ id: value.id, url: value.url, createdAt: value.createdAt, slip: value.slip as BuiltSlip,
    ...(value.number !== undefined ? { number: value.number } : {}), ...(value.status !== undefined ? { status: value.status } : {}),
    ...(value.selectionOutcomes !== undefined ? { selectionOutcomes: value.selectionOutcomes } : {}),
    ...(value.selectionScores !== undefined ? { selectionScores: value.selectionScores } : {}),
    ...(value.contacts !== undefined ? { contacts: value.contacts } : {}) }));

/** Personal exports live only in browser memory; no share token or snapshot is stored. */
export function createLocalSlipShare(slip: BuiltSlip, createdAt = new Date().toISOString()): SharedSlip {
  return { id: crypto.randomUUID().replaceAll("-", ""), url: null,
    createdAt, slip: modelIndependentSlip(slip) };
}
