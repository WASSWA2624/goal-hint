import "server-only";

import { cookies, headers } from "next/headers";
import { MemberForm, MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { AccountCodeForm, AccountCodeRoot } from "@/components/members/account-code-form";
import { Button, ButtonLink } from "@/components/ui/controls";
import { PageHeading, Stack } from "@/components/ui/layout";
import { formatPhone } from "@/domain/phone";
import { memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { codeStatus, formatPeriodEnd, remainingDays } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName, type MemberIdentity } from "@/server/members/member-sessions";
import { TrialRequest, PaymentStatusPanel } from "@/components/members/subscribe-controls";
import { PublicShell } from "./public-shell";

export function createAccountRoute({ services = getMemberServices }: { services?: MemberServicesSource } = {}) {
  return async function AccountRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const messages = createMessages(locale), parameters = await searchParams;
    const resolved = await services();
    const mode = resolved.settings.settings?.paywallMode;
    let member: MemberIdentity | null = null, unavailable = mode === undefined || !resolved.sessions;
    if (mode && resolved.sessions) {
      try { member = await resolved.sessions.verify((await cookies()).get(memberCookieName(resolved.config.production))?.value); }
      catch { unavailable = true; }
    }
    const inApp = /FBAN|FBAV|Instagram/iu.test((await headers()).get("user-agent") ?? "");
    const returnTo = memberReturnPath(parameters.return);
    const now = new Date();
    const view = member?.codeEnteredAt && !member.blocked ? await resolved.codes?.accountView(member).catch(() => null) : null;
    const paymentView = member && !member.blocked && resolved.settings.settings ? await resolved.payments?.view(member, resolved.settings.settings).catch(() => null) : null;
    const active = view?.codes.find((code) => codeStatus(code, now) === "active");
    const queued = view?.codes.filter((code) => codeStatus(code, now) === "queued") ?? [];
    const last = view?.codes.at(-1);
    const ended = typeof parameters.ended === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(parameters.ended) ? new Date(parameters.ended) : null;
    const codeError = parameters.status === "code-not-recognized" ? messages.text("account.codeNotRecognized")
      : parameters.status === "code-ended" && ended && Number.isFinite(+ended) ? messages.text("account.codeEnded", { end: formatPeriodEnd(ended) })
      : parameters.status === "code-busy" ? messages.text("account.tryLater") : undefined;
    return <PublicShell locale={locale} showAccount><AccountCodeRoot><Stack $gap="md">
      <PageHeading>{messages.text("account.title")}</PageHeading>
      <MemberNavigationRecovery />
      <MemberPanel><Stack $gap="md">
        {mode === "off" && <p>{messages.text("account.closed")}</p>}
        {unavailable ? <p role="status">{messages.text("account.unavailable")}</p> : <>
          {inApp && <p>{messages.text("account.inAppBrowser")}</p>}
          {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
          {member?.blocked ? <><p role="status">{messages.text("account.refused")}</p><MemberSignOut>{messages.text("account.signOut")}</MemberSignOut></> : member ? <>
            <p>{messages.text("account.signedInAs", { phone: formatPhone(member.phone) })}</p>
            {parameters.status === "code-accepted" && <><p role="status">{messages.text("account.unlocked")}</p>
              <ButtonLink href="/en" prefetch={false}>{messages.text("account.seePicks")}</ButtonLink></>}
            {view && <>
              {active ? <><p>{messages.text("account.accessUntil", { end: formatPeriodEnd(queued.at(-1)?.endsAt ?? active.endsAt) })}</p>
                <p>{messages.text("account.daysLeft", { days: String(remainingDays(view.codes, now)) })}</p></>
                : last && <p>{messages.text("account.accessEnded", { end: formatPeriodEnd(last.endsAt) })}</p>}
              {queued.map((code) => <p key={code.id}>{messages.text("account.queued", { plan: code.planName, start: formatPeriodEnd(code.startsAt), end: formatPeriodEnd(code.endsAt) })}</p>)}
            </>}
            {mode !== "off" && paymentView?.trialEligible && <TrialRequest locale={locale} phone={member.phone} days={resolved.settings.settings!.trialDays} />}
            <PaymentStatusPanel locale={locale} status={paymentView?.status ?? null} phone={member.phone} unlocked={!!member.codeEnteredAt} />
            <ButtonLink size="large" href={`${memberNextPath("subscribe", returnTo)}#plans`} prefetch={false}>{messages.text(view ? "account.renew" : "account.getAccess")}</ButtonLink>
            {mode !== "off" && <AccountCodeForm locale={locale} signedIn inApp={inApp} returnTo={returnTo} initialError={codeError} />}
            {!member.codeEnteredAt && <p>{messages.text("account.notYourNumber")}</p>}
            {view && <><h2>{messages.text("account.devices")}</h2>
              {view.devices.map((device, index) => <p key={index}>{messages.text("account.deviceLastUsed", { number: String(index + 1), at: formatPeriodEnd(device.lastSeenAt) })}</p>)}
              <MemberForm method="post" action="/api/account/devices" data-analytics-ignore><Button type="submit" variant="secondary">{messages.text("account.signOutOthers")}</Button></MemberForm>
            </>}
            <MemberSignOut>{messages.text("account.signOut")}</MemberSignOut>
          </> : <AccountCodeForm locale={locale} signedIn={false} inApp={inApp} returnTo={returnTo} initialError={codeError}
            invalidPhone={parameters.status === "invalid-phone"} allowCode={mode !== "off"} />}
        </>}
      </Stack></MemberPanel>
    </Stack></AccountCodeRoot></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
