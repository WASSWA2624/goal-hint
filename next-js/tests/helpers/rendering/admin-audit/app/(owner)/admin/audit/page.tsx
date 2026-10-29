import RealPage from "@/app/(owner)/admin/audit/page";
import { fixtureState, paymentId, seed } from "../../../fixture";

/** Audit-only acceptance data includes more than one loaded window and an older reporting day. */
function loadAuditFixture() {
  seed();
  const state = fixtureState();
  if (state.audits.some(row => row.id === 10_000n)) return;
  const now = Date.now();
  const entry = (id: number, at: Date) => ({ id: BigInt(id), at, actor: "synthetic-owner",
    action: "payment_approved", accountId: "00000000-0000-4000-8000-000000000100",
    targetType: "payment", targetId: paymentId, details: {} });
  state.audits.push(...Array.from({ length: 125 }, (_, index) => entry(10_000 + index, new Date(now - index * 60_000))),
    entry(20_000, new Date("2025-01-14T21:00:00.000Z")),
    entry(20_001, new Date("2025-01-15T20:59:59.999Z")),
    entry(20_002, new Date("2025-01-14T20:59:59.999Z")),
    entry(20_003, new Date("2025-01-15T21:00:00.000Z")));
}

loadAuditFixture();
export const dynamic = "force-dynamic";
export { metadata } from "@/app/(owner)/admin/audit/page";
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  loadAuditFixture();
  return RealPage(props);
}
