import type { AccountDashboard, AccountActivity } from "@/domain/account-dashboard";
import { fixtureSubscriptionPeriods, fixtureSubscriptionStatus } from "./fixture-subscription";

/** Synthetic member-visible records only; never connects to application storage. */
export function fixtureDashboard(scenario: string): AccountDashboard {
  const periods = fixtureSubscriptionPeriods(scenario), now = Date.now();
  const activity: AccountActivity[] = periods.map(period => ({ id: `access:${period.id}`, kind: "access", status: "added",
    planName: period.planName, startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), at: period.startsAt.toISOString() }));
  if (fixtureSubscriptionStatus(scenario).paymentPending) activity.unshift({ id: "payment:pending", kind: "payment", status: "pending",
    reference: "PFAKE", purpose: "plan", planName: "Weekly", at: new Date(now - 60_000).toISOString() });
  if (scenario === "history") {
    const statuses = ["reversed", "approved", "rejected", "superseded", "pending"] as const;
    for (let index = 0; index < 10; index++) activity.push({ id: `payment:${index}`, kind: "payment", status: statuses[index % statuses.length]!,
      planName: index === 0 ? "International championship extended package" : "Weekly", purpose: index === 1 ? "topup" : "plan",
      reference: `PDE${index}O`, at: new Date(now - index * 86_400_000).toISOString() });
  }
  return { activePlanName: fixtureSubscriptionStatus(scenario).activeUntil ? periods[0]?.planName ?? null : null,
    activity: activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10) };
}
