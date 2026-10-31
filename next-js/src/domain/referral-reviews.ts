import { z } from "zod";

export const referralReviewRules = Object.freeze({ pageSize: 50, evidenceRetentionMs: 90 * 86_400_000, summaryLength: 300, evidenceLength: 160, appealLength: 500 });
export const referralReviewReasons = ["duplicate-award", "proven-self-referral", "verified-abuse"] as const;
export type ReferralReviewReason = typeof referralReviewReasons[number];
export const referralReviewStatuses = ["open", "no-action", "reversed", "appealed", "upheld", "restored"] as const;
export type ReferralReviewStatus = typeof referralReviewStatuses[number];
const id = z.uuid(), revision = z.number().int().positive();
const text = (maximum: number) => z.string().trim().min(3).max(maximum).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
export const referralReviewMutationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), requestId: id, grantId: id, reason: z.enum(referralReviewReasons),
    summary: text(referralReviewRules.summaryLength), evidenceRef: text(referralReviewRules.evidenceLength), evidenceConfirmed: z.literal(true) }),
  z.strictObject({ action: z.literal("decide"), id, revision, decision: z.enum(["confirm", "no-action"]), evidenceConfirmed: z.boolean() }),
  z.strictObject({ action: z.literal("appeal-decision"), id, revision, decision: z.enum(["restore", "uphold"]), evidenceConfirmed: z.boolean() }),
]);
export type ReferralReviewMutation = z.infer<typeof referralReviewMutationSchema>;
export const referralAppealSchema = z.strictObject({ id, revision, statement: text(referralReviewRules.appealLength) });
export type ReferralAppeal = z.infer<typeof referralAppealSchema>;
export type ReferralReviewEvent = Readonly<{ id: string; at: string; action: string; actor: string; beforeMs: number | null; afterMs: number | null }>;
export type ReferralReviewCase = Readonly<{
  id: string; grantId: string; referralId: string; accountId: string; phone: string | null; reference: string;
  holderAccountId: string; holderPhone: string | null;
  reason: ReferralReviewReason; status: ReferralReviewStatus; revision: number; openedAt: string; updatedAt: string;
  closedAt: string | null; reversedMs: number; restoredMs: number; summary: string | null; evidenceRef: string | null;
  appealStatement: string | null; evidencePurged: boolean; events: readonly ReferralReviewEvent[];
}>;
export type MemberReferralReview = Readonly<Pick<ReferralReviewCase, "id" | "reason" | "status" | "revision" | "openedAt" | "updatedAt" | "closedAt" | "reversedMs" | "restoredMs"> & {
  canAppeal: boolean;
}>;
export type ReferralReviewGrant = Readonly<{ id: string; referralId: string; accountId: string; phone: string | null; reference: string; startsAt: string; endsAt: string; unusedMs: number }>;
export type ReferralReviewOutcome = Readonly<{ status: "saved"; case: ReferralReviewCase }>
  | Readonly<{ status: "invalid" | "forbidden" | "not-found" | "conflict" }>;
export function referralReviewCursor(value: unknown): { at: Date; id: string } | null {
  if (typeof value !== "string" || value.length !== 61) return null;
  const stamp = value.slice(0, 24), key = value.slice(25), at = new Date(stamp);
  return value[24] === "_" && id.safeParse(key).success && Number.isFinite(+at) && at.toISOString() === stamp ? { at, id: key } : null;
}
