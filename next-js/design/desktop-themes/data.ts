import "server-only";
import { createHash } from "node:crypto";
import type { AccountDashboard } from "@/domain/account-dashboard";
import type { BestSlipsResult } from "@/domain/best-slips";
import type { BestSlipsQuery } from "@/domain/best-slips-query";
import type { ReferralSummary } from "@/domain/referrals";
import type { MemberServices } from "@/server/members/member-http";
import type { ViewerAccess } from "@/server/members/viewer-access";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { SlipSelection } from "@/domain/slip-builder";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { fixtureBrowseBestSlips } from "../../tests/helpers/rendering/slips/app/best-slips-filter-data";
import { criteria, now, syntheticBuild as sourceBuild, today } from "../../tests/helpers/rendering/slips/app/stored";
import { fixtureSubscriptionStatus, fixtureSubscriptionPeriods } from "../../tests/helpers/rendering/members/app/fixture-subscription";
import { previewFeed } from "../light-theme-samples/app/fixture-data";

export { criteria, now, today, previewFeed };
export const viewer: ViewerAccess = { tier: "full", signedIn: true, mode: "off" };
const clubs = [["Northbridge FC", "Riverside United"], ["Westhaven City", "Kingsport Athletic"], ["Eastfield Rovers", "Brookside Town"]];

/** Stable UUIDs let the real observation transport validate these synthetic records. */
function identity(value: string) {
  const hex = createHash("sha256").update(`desktop-preview:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function reference<T extends { fixtureId: string; forecast?: SlipSelection["forecast"] }>(value: T): T {
  return { ...value, fixtureId: identity(value.fixtureId), ...(value.forecast ? { forecast: { ...value.forecast,
    cycleId: identity(value.forecast.cycleId), revisionId: identity(value.forecast.revisionId) } } : {}) };
}
function selection(value: SlipSelection, index: number): SlipSelection {
  return { ...reference(value), homeTeam: { ...value.homeTeam, name: clubs[index % clubs.length]![0]! },
    awayTeam: { ...value.awayTeam, name: clubs[index % clubs.length]![1]! },
    competition: { ...value.competition, name: "Premier Division", country: "England" } };
}
export function syntheticBuild(...args: Parameters<typeof sourceBuild>): ReturnType<typeof sourceBuild> {
  const result = sourceBuild(...args);
  return !result.data ? result : { ...result, data: { ...result.data,
    slips: result.data.slips.map(slip => ({ ...slip, selections: slip.selections.map(selection) })) } };
}

export async function previewBestSlips(access: ViewerAccess, query: BestSlipsQuery): Promise<BestSlipsResult> {
  const result = await fixtureBrowseBestSlips(access, query);
  return { ...result, slips: result.slips.map(view => !view.slip ? view : ({ ...view,
    slip: { ...view.slip, selections: view.slip.selections.map(selection) },
    ...(view.matchStates ? { matchStates: view.matchStates.map(reference) } : {}),
  })) };
}

let observations: Promise<ReadonlyMap<string, SlipMatchState>> | undefined;
export function previewSlipObservations() {
  return observations ??= (async () => {
    const states = new Map<string, SlipMatchState>();
    let cursor: string | undefined;
    do {
      const result = await previewBestSlips(viewer, { period: "all", status: "all", page: 1, ...(cursor ? { cursor } : {}) });
      for (const view of result.slips) for (const state of view.matchStates ?? []) states.set(state.fixtureId, state);
      cursor = result.browse?.nextCursor ?? undefined;
    } while (cursor);
    return states;
  })();
}

const stamp = "2026-10-31T10:00:00.000Z";
export const referrals: ReferralSummary = { code: "a".repeat(32), verified: 8, earnedDays: 8,
  remainingMs: 3 * 86_400_000 + 5 * 3_600_000,
  history: Array.from({ length: 5 }, (_, index) => ({ id: `preview-invite-${index}`,
    registeredAt: new Date(Date.parse(stamp) - index * 86_400_000).toISOString(),
    rewardedAt: index === 0 ? null : new Date(Date.parse(stamp) - index * 86_400_000).toISOString(), status: index === 0 ? "pending" : "rewarded" })),
};
const dashboard: AccountDashboard = { activePlanName: "Weekly", activity: [
  { id: "preview-payment", kind: "payment", status: "approved", reference: "P-DEMO-1042", purpose: "plan", planName: "Weekly", at: stamp },
  { id: "preview-access", kind: "access", status: "added", planName: "Weekly", at: stamp,
    startsAt: stamp, endsAt: "2026-11-07T10:00:00.000Z" },
] };

/** In-memory read services for the real account route. No store or message transport. */
export async function previewMemberServices(): Promise<MemberServices> {
  return {
    config: { production: false }, settings: { settings: { ...defaultSubscriptionSettings, paywallMode: "test" } },
    sessions: { async verify() { return { accountId: "00000000-0000-4000-8000-000000000101", tokenHash: "preview",
      phone: "256700000101", administrator: false, blocked: false, codeEnteredAt: new Date(stamp), whatsappNotificationsAt: null }; } },
    auth: { async passwordResetSession() { return null; }, async verificationSession() { return null; } },
    codes: { async subscriptionStatus() { return fixtureSubscriptionStatus("active"); },
      async accountView() { return { codes: fixtureSubscriptionPeriods("active"), devices: [{ tokenHash: "preview", lastSeenAt: new Date(stamp) }] }; } },
    dashboard: { async read() { return dashboard; } }, referrals: { async read() { return referrals; } },
    payments: { async view() { return { acceptedTerms: true, status: null }; } },
  } as unknown as MemberServices;
}
