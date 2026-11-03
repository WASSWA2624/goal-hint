import { z } from "zod";
import { publicPolicy } from "./public-policy.ts";
import { slipSnapshotRules, slipSnapshotSchema } from "./slip-snapshot.ts";
import { modelIndependentSlip, type BuiltSlip } from "./slip-builder.ts";

export const sharedSlipRules = Object.freeze({
  maximumRequestBytes: slipSnapshotRules.maximumRequestBytes,
});
export const sharedSlipIdSchema = z.string().regex(/^[a-f0-9]{32}$/u);
const slipId = z.string().min(1).max(slipSnapshotRules.maximumIdentityLength);
export const shareSlipSourceSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("best"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), slipId }),
]);
export type ShareSlipSource = z.infer<typeof shareSlipSourceSchema> | Readonly<{ source: "builder"; criteria: string; slipId: string }>;
export type SharedSlip = Readonly<{ id: string; url: string | null; createdAt: string; slip: BuiltSlip }>;

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
}).refine((value) => value.url === sharedSlipUrl(value.id) || new URL(value.url).origin === publicPolicy.origin
  && /^\/en\/best-slips\/\d{4}-\d{2}-\d{2}\/[1-9]\d{0,2}$/.test(new URL(value.url).pathname), "The public slip URL must identify a publication.")
  .transform((value): SharedSlip => ({ ...value, slip: value.slip as BuiltSlip }));

/** Personal exports live only in browser memory; no share token or snapshot is stored. */
export function createLocalSlipShare(slip: BuiltSlip): SharedSlip {
  return { id: crypto.randomUUID().replaceAll("-", ""), url: null,
    createdAt: new Date().toISOString(), slip: modelIndependentSlip(slip) };
}
