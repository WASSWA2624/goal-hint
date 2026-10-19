import "server-only";

import { cookies, headers } from "next/headers";
import { MemberForm, MemberNavigationRecovery, MemberPanel, MemberSignOut } from "@/components/members/member-controls";
import { Button, ButtonLink, PhoneInput } from "@/components/ui/controls";
import { PageHeading, Stack } from "@/components/ui/layout";
import { formatPhone } from "@/domain/phone";
import { memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { createMessages } from "@/i18n/messages";
import { getMemberServices, type MemberServicesSource } from "@/server/members/member-http";
import { memberCookieName, type MemberIdentity } from "@/server/members/member-sessions";
import { PublicShell } from "./public-shell";

export function createAccountRoute({ services = getMemberServices }: { services?: MemberServicesSource } = {}) {
  return async function AccountRoute({ locale, searchParams }: {
    locale: string; searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const messages = createMessages(locale), parameters = await searchParams;
    const resolved = await services();
    const mode = resolved.settings.settings?.paywallMode;
    let member: MemberIdentity | null = null, unavailable = mode === undefined || !resolved.sessions;
    if (mode && mode !== "off" && resolved.sessions) {
      try { member = await resolved.sessions.verify((await cookies()).get(memberCookieName(resolved.config.production))?.value); }
      catch { unavailable = true; }
    }
    const inApp = /FBAN|FBAV|Instagram/iu.test((await headers()).get("user-agent") ?? "");
    const returnTo = memberReturnPath(parameters.return);
    return <PublicShell locale={locale}><Stack $gap="md">
      <PageHeading>{messages.text("account.title")}</PageHeading>
      <MemberNavigationRecovery />
      <MemberPanel><Stack $gap="md">
        {mode === "off" ? <p>{messages.text("account.closed")}</p> : unavailable ? <p role="status">{messages.text("account.unavailable")}</p> : <>
          {inApp && <p>{messages.text("account.inAppBrowser")}</p>}
          {parameters.status === "signed-out" && <p role="status">{messages.text("account.signedOut")}</p>}
          {member ? <>
            <p>{messages.text("account.signedInAs", { phone: formatPhone(member.phone) })}</p>
            <ButtonLink href={memberNextPath("subscribe", returnTo)} prefetch={false}>{messages.text("account.getAccess")}</ButtonLink>
            <MemberSignOut>{messages.text("account.signOut")}</MemberSignOut>
          </> : <MemberForm method="post" action="/api/account/sign-in" data-analytics-ignore>
            <PhoneInput name="phone" label={messages.text("account.phone")} required hint={messages.text("account.phoneHint")}
              error={parameters.status === "invalid-phone" ? messages.text("account.invalidPhone") : undefined} />
            {returnTo && <input type="hidden" name="return" value={returnTo} />}
            <Button type="submit">{messages.text("account.continue")}</Button>
          </MemberForm>}
        </>}
      </Stack></MemberPanel>
    </Stack></PublicShell>;
  };
}

export const AccountRoute = createAccountRoute();
