"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { InvitationActions } from "@/components/members/invitation-actions";
import { shareInvitation } from "@/components/members/invitation-share";
import { getAdminSessionSnapshot, getInvitationSessionSnapshot, getServerAdminSessionSnapshot, getServerInvitationSessionSnapshot, subscribeMemberSession } from "@/components/members/member-session";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { publicInvitation, referralInvitation } from "@/domain/referral-invitation";
import { createMessages } from "@/i18n/messages";
import { dashboardDestination } from "./navigation-destinations";
import { ResponsiveNavigation, type NavigationDestination } from "./responsive-navigation";

/** Both navigation layouts use the private session without changing the shared public HTML. */
export function SessionNavigation({ destinations, dashboardLabel, locale, ...props }:
  Omit<ComponentProps<typeof ResponsiveNavigation>, "onInviteFriends"> & { dashboardLabel: string; locale: string }) {
  const administrator = useSyncExternalStore(subscribeMemberSession, getAdminSessionSnapshot, getServerAdminSessionSnapshot);
  const code = useSyncExternalStore(subscribeMemberSession, getInvitationSessionSnapshot, getServerInvitationSessionSnapshot);
  const items = useMemo<readonly NavigationDestination[]>(() => administrator && !destinations.some(({ key }) => key === "dashboard")
    ? [...destinations, dashboardDestination(dashboardLabel)] : destinations, [administrator, destinations, dashboardLabel]);
  const links = useMemo(() => code === undefined ? null : code === null ? publicInvitation(locale) : referralInvitation(code, locale), [code, locale]);
  const dialogId = useId(), sharing = useRef(false);
  const [fallbackCode, setFallbackCode] = useState<string | null>();
  if (fallbackCode !== undefined && fallbackCode !== code) setFallbackCode(undefined);
  const m = createMessages(locale);

  async function inviteFriends() {
    if (!links || sharing.current || getInvitationSessionSnapshot() !== code) return;
    sharing.current = true;
    try {
      // The platform share call must begin in the activation that opened the menu action.
      if (await shareInvitation(links.invitation) === "failed" && getInvitationSessionSnapshot() === code) setFallbackCode(code);
    } finally { sharing.current = false; }
  }

  return <>
    <ResponsiveNavigation {...props} destinations={items} onInviteFriends={links ? inviteFriends : undefined} />
    {links && fallbackCode === code && createPortal(
      <CriteriaDialog id={dialogId} open title={m.text("referrals.invite")} closeLabel={m.text("referrals.close")}
        onCancel={() => setFallbackCode(undefined)} footer={null} hideFooter>
        <InvitationActions locale={locale} links={links} showDeviceShare={false} />
      </CriteriaDialog>, document.body)}
  </>;
}
