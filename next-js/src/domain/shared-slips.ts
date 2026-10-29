import { z } from "zod";
import { publicPolicy } from "./public-policy.ts";
import { savedSlipSnapshotRules, savedSlipSnapshotSchema } from "./saved-slips.ts";
import type { BuiltSlip } from "./slip-builder.ts";

export const sharedSlipRules = Object.freeze({
  maximumRequestBytes: savedSlipSnapshotRules.maximumSaveRequestBytes,
  maximumSnapshotBytes: 8 * 1024 * 1024,
  maximumNewSharesPerHour: 30,
});
export const sharedSlipIdSchema = z.string().regex(/^[a-f0-9]{32}$/u);
const slipId = z.string().min(1).max(savedSlipSnapshotRules.maximumIdentityLength);
export const shareSlipSourceSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("builder"), criteria: z.string().min(1).max(2048), slipId }),
  z.strictObject({ source: z.literal("best"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), slipId }),
]);
export type ShareSlipSource = z.infer<typeof shareSlipSourceSchema>;
export type SharedSlip = Readonly<{ id: string; url: string; createdAt: string; slip: BuiltSlip }>;

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
  slip: savedSlipSnapshotSchema,
}).refine((value) => value.url === sharedSlipUrl(value.id), "The public slip URL must match its identity.")
  .transform((value): SharedSlip => ({ ...value, slip: value.slip as BuiltSlip }));
