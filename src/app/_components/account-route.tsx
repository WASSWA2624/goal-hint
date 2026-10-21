import "server-only";

import { cookies } from "next/headers";
import { MemberForm, MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { AccountAuthForm, type AccountAuthView } from "@/components/members/account-auth-form";
import { AccountSettings } from "@/components/members/account-security";
import { AccountCard, AccountCardBody, AccountCardHeading, AccountSection } from "@/components/members/account-styles";
import { ApprovalRefresh, PaymentStatusCard, TrialStatusCard } from "@/components/members/payment-status";
import { TrialRequest } from "@/components/members/subscribe-controls";
import { Button, ButtonLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { ChevronDownIcon, SignOutIcon, UserIcon } from "@/components/ui/icons";
import { memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { codeStatus, formatPeriodEnd, remainingDays } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName, type MemberIdentity } from "@/server/members/member-sessions";
import { isMemberAdminPhone } from "@/server/members/member-admin";
import { PublicShell } from "./public-shell";

export function createAccountRoute({ services = getMemberServices }: { services?: MemberServicesSource } = {}) {
  return async function AccountRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const messages = createMessages(locale), parameters = await searchParams;
    const resolved = await services(), settings = resolved.settings.settings;
    const mode = settings?.paywallMode;
    let member: MemberIdentity | null = null, unavailable = mode === undefined || !resolved.sessions;
    if (mode && resolved.sessions) {
      try { member = await resolved.sessions.verify((await cookies()).get(memberCookieName(resolved.config.production))?.value); }
      catch { unavailable = true; }
    }
    const returnTo = memberReturnPath(parameters.return);
    // `reset` is the pre-068 name of the forgot-password view; it now only shows how to reach the admin.
    const authView: AccountAuthView = parameters.view === "register" ? "register" : parameters.view === "forgot" || parameters.view === "reset" ? "forgot" : "login";
    const administrator = !!member && !member.blocked && isMemberAdminPhone(member.phone);
    const contact = { contactPhone: settings?.contactPhone ?? null, whatsappPhone: settings?.whatsappPhone ?? null, reviewTime: settings?.reviewTime ?? null };
    const now = new Date();
    const view = member?.codeEnteredAt && !member.blocked && !administrator ? await resolved.codes?.accountView(member).catch(() => null) : null;
    const paymentView = member && !member.blocked && !administrator && settings ? await resolved.payments?.view(member, settings).catch(() => null) : null;
    const active = view?.codes.find((code) => codeStatus(code, now) === "active");
    const queued = view?.codes.filter((code) => codeStatus(code, now) === "queued") ?? [];
    const last = view?.codes.at(-1);
    const status = paymentView?.status ?? null;
    const activeUntil = (queued.at(-1) ?? active)?.endsAt.toISOString()
      ?? (status?.status === "approved" && status.endsAt && new Date(status.endsAt) > now ? status.endsAt : null);
    const waiting = !!status && ["pending", "superseded"].includes(status.status);
    // A granted trial unlocks the account's devices; a dismissed one stops waiting.
    const trialPending = !!paymentView?.trialPending && !activeUntil;
    return <PublicShell locale={locale} showAccount><Stack $gap="md">
      <MemberNavigationRecovery />
      {unavailable && <p role="status">{messages.text("account.unavailable")}</p>}
      {!member ? <>
        {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
        <AccountAuthForm key={authView} locale={locale} view={authView} returnTo={returnTo} contact={contact} />
      </> : member.blocked ? <MemberPanel><p role="status">{messages.text("account.refused")}</p><MemberSignOut><SignOutIcon />{messages.text("account.logOut")}</MemberSignOut></MemberPanel> : <AccountCard data-account-details>
        <AccountCardHeading><UserIcon /><h1>{messages.text("account.title")}</h1></AccountCardHeading>
        <AccountCardBody>
          {parameters.status === "phone-changed" && <p role="status">{messages.text("account.phoneChanged")}</p>}
          {parameters.status === "password-changed" && <p role="status">{messages.text("account.passwordChanged")}</p>}
          {mode !== "off" && !administrator && <>
            <ApprovalRefresh waiting={waiting || trialPending} />
            {trialPending && <TrialStatusCard locale={locale} settings={contact} phone={member.phone} heading="h2" />}
            <PaymentStatusCard locale={locale} status={status} settings={contact} phone={member.phone} activeUntil={activeUntil} returnTo={returnTo} heading="h2" />
          </>}
          <AccountSettings locale={locale} phone={member.phone} contact={contact} />
          {administrator && <><p>{messages.text("account.administratorAccess")}</p>
            <ButtonLink href="/admin" prefetch={false}>{messages.text("account.dashboard")}</ButtonLink></>}
          {mode !== "off" && !administrator && <AccountSection open={status?.status === "rejected" || status?.status === "reversed"}>
            <summary>{messages.text("account.accessSettings")}<ChevronDownIcon /></summary><div>
            {view && <>
              {active ? <><p>{messages.text("account.accessUntil", { end: formatPeriodEnd(queued.at(-1)?.endsAt ?? active.endsAt) })}</p>
                <p>{messages.text("account.daysLeft", { days: String(remainingDays(view.codes, now)) })}</p></>
                : last && <p>{messages.text("account.accessEnded", { end: formatPeriodEnd(last.endsAt) })}</p>}
              {queued.map((code) => <p key={code.id}>{messages.text("account.queued", { plan: code.planName, start: formatPeriodEnd(code.startsAt), end: formatPeriodEnd(code.endsAt) })}</p>)}
            </>}
            {paymentView?.trialEligible && <TrialRequest locale={locale} days={settings!.trialDays} />}
            <ButtonLink size="large" href={`${memberNextPath("subscribe", returnTo)}#plans`} prefetch={false}>{messages.text(view ? "account.renew" : "account.getAccess")}</ButtonLink>
            {view && <><h2>{messages.text("account.devices")}</h2>
              {view.devices.map((device, index) => <p key={index}>{messages.text("account.deviceLastUsed", { number: String(index + 1), at: formatPeriodEnd(device.lastSeenAt) })}</p>)}
              <MemberForm method="post" action="/api/account/devices" data-analytics-ignore><Button type="submit" variant="secondary">{messages.text("account.signOutOthers")}</Button></MemberForm>
            </>}
          </div></AccountSection>}
          <MemberSignOut><SignOutIcon />{messages.text("account.logOut")}</MemberSignOut>
        </AccountCardBody>
      </AccountCard>}
    </Stack></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
