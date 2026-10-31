import { randomUUID } from "node:crypto";
import { referralAppealSchema, referralReviewMutationSchema, type MemberReferralReview, type ReferralReviewCase, type ReferralReviewGrant } from "@/domain/referral-reviews";

// UI-only acceptance state. Financial/ownership behavior is verified separately against the production service and MySQL.
const at = "2026-10-31T10:00:00.000Z", accountId = "10000000-0000-4000-8000-000000000010", grantId = "10000000-0000-4000-8000-000000000020";
type MutableCase = { -readonly [Key in keyof ReferralReviewCase]: ReferralReviewCase[Key] };
export const grants: ReferralReviewGrant[] = [{ id: grantId, referralId: "10000000-0000-4000-8000-000000000030", accountId, phone: "256700000001",
  reference: "C-DEMO", startsAt: at, endsAt: "2026-11-01T10:00:00.000Z", unusedMs: 86_400_000 }];
const seed = (index: number, status: ReferralReviewCase["status"]): MutableCase => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, grantId, referralId: grants[0]!.referralId, accountId, phone: "256700000001", holderAccountId: accountId, holderPhone: "256700000001", reference: `C-DEMO${index}`,
  reason: "duplicate-award", status, revision: 1, openedAt: at, updatedAt: at, closedAt: status === "open" ? null : at, reversedMs: status === "open" || status === "no-action" ? 0 : 7_200_001,
  restoredMs: status === "restored" ? 7_200_001 : 0, summary: "Technical duplicate confirmed in the original request records.", evidenceRef: "support:DEMO-7", appealStatement: status === "appealed" ? "Please review the supporting records." : null,
  evidencePurged: false, events: [{ id: randomUUID(), at, action: "requested", actor: "synthetic reviewer", beforeMs: null, afterMs: null }],
});
const state = globalThis as typeof globalThis & { reviewFixtureCases?: MutableCase[] };
export const cases = () => state.reviewFixtureCases ??= [seed(1, "open"), seed(2, "reversed"), seed(3, "appealed"), seed(4, "restored"), seed(5, "no-action")];
export function memberCases(): MemberReferralReview[] {
  return cases().map(({ id, reason, status, revision, openedAt, updatedAt, closedAt, reversedMs, restoredMs }) => ({
    id, reason, status, revision, openedAt, updatedAt, closedAt, reversedMs, restoredMs, canAppeal: status === "reversed" && reversedMs > 0,
  }));
}
export async function adminWrite(request: Request) {
  const body = await request.json();
  if (body.action === "grants") return Response.json({ grants });
  const parsed = referralReviewMutationSchema.safeParse(body); if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const input = parsed.data;
  let item: MutableCase | undefined;
  if (input.action === "create") {
    item = { ...seed(9, "open"), id: input.requestId, summary: input.summary, evidenceRef: input.evidenceRef, reason: input.reason };
    cases().unshift(item);
  } else {
    item = cases().find(value => value.id === input.id);
    if (!item || item.revision !== input.revision) return Response.json({ error: "conflict" }, { status: 409 });
    item.status = input.decision === "confirm" ? "reversed" : input.decision === "no-action" ? "no-action" : input.decision === "restore" ? "restored" : "upheld";
    item.reversedMs = input.decision === "confirm" ? 7_200_001 : item.reversedMs;
    item.restoredMs = input.decision === "restore" ? item.reversedMs : item.restoredMs;
    item.revision++; item.events = [...item.events, { id: randomUUID(), at, action: item.status, actor: "synthetic reviewer", beforeMs: item.reversedMs, afterMs: item.restoredMs }];
  }
  return Response.json({ status: "saved", case: item });
}
export async function memberWrite(request: Request) {
  const input = referralAppealSchema.safeParse(await request.json()); if (!input.success) return Response.json({ error: "invalid" }, { status: 400 });
  const item = cases().find(value => value.id === input.data.id); if (!item) return Response.json({ error: "not-found" }, { status: 404 });
  item.status = "appealed"; item.revision++; item.appealStatement = input.data.statement;
  return Response.json({ status: "saved", case: memberCases().find(value => value.id === item.id) });
}
