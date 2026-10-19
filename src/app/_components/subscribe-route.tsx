import "server-only";

import { cookies, headers } from "next/headers";
import { AccountCodeRoot } from "@/components/members/account-code-form";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { SubscribeIdentity, SubscribePayment, SubscribeSignIn, SubscribeStep } from "@/components/members/subscribe-controls";
import { PageHeading, Stack } from "@/components/ui/layout";
import { memberReturnPath } from "@/domain/member-navigation";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { createMessages } from "@/i18n/messages";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName } from "@/server/members/member-sessions";
import { createPlansService } from "@/server/members/plans";
import { PublicShell } from "./public-shell";

async function readPlans() {
  const { database } = await getAnalyticsServices();
  return database ? (await createPlansService(database).list()).filter((plan) => plan.active) : [];
}
export function createSubscribeRoute({ services = getMemberServices, plans = readPlans }: {
  services?: MemberServicesSource; plans?: () => Promise<readonly SubscriptionPlanView[]>;
} = {}) {
  return async function SubscribeRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const m = createMessages(locale), resolved = await services(), settings = resolved.settings.settings;
    const parameters = await searchParams, returnTo = memberReturnPath(parameters.return);
    const userAgent = (await headers()).get("user-agent") ?? "";
    let member = null, view = null, activeUntil = null, offers: readonly SubscriptionPlanView[] = [], unavailable = !settings || !resolved.sessions;
    if (settings && settings.paywallMode !== "off" && resolved.sessions) {
      try {
        member = await resolved.sessions.verify((await cookies()).get(memberCookieName(resolved.config.production))?.value);
        offers = (await plans()).filter((plan) => plan.active);
        if (member && !member.blocked) {
          view = await resolved.payments?.view(member, settings) ?? null;
          const periods = member.codeEnteredAt ? await resolved.codes?.accountView(member) : null;
          activeUntil = periods?.codes.filter((code) => code.endsAt > new Date()).at(-1)?.endsAt.toISOString() ?? null;
        }
      } catch { unavailable = true; }
    }
    return <PublicShell locale={locale} showAccount={settings?.paywallMode === "on"}><AccountCodeRoot><Stack $gap="md">
      <PageHeading>{m.text("subscribe.title")}</PageHeading><MemberNavigationRecovery />
      {settings?.paywallMode === "off" ? <p>{m.text("account.closed")}</p> : unavailable ? <p role="status">{m.text("account.unavailable")}</p>
        : member?.blocked ? <p role="status">{m.text("account.refused")}</p> : <>
          <SubscribeStep number={1} title={m.text("subscribe.yourNumber")}>
            {member ? <SubscribeIdentity locale={locale} phone={member.phone} /> : <SubscribeSignIn locale={locale} returnTo={returnTo} />}
          </SubscribeStep>
          <SubscribePayment key={member?.tokenHash ?? "signed-out"} locale={locale} settings={settings!} plans={offers}
            account={member ? { id: member.accountId, phone: member.phone, unlocked: !!member.codeEnteredAt } : null}
            view={view} returnTo={returnTo} userAgent={userAgent} activeUntil={activeUntil} />
        </>}
    </Stack></AccountCodeRoot></PublicShell>;
  };
}
export const SubscribeRoute = createSubscribeRoute();
