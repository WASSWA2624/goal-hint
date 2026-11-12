"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import styled from "styled-components";
import { inlineControlRow } from "@/components/ui/control-layout";
import { Button, ButtonLink, TextInput } from "@/components/ui/controls";
import { CopyIcon, ShareIcon } from "@/components/ui/icons";
import type { InvitationLinks } from "@/domain/referral-invitation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { invitationShareAvailable, serverInvitationShareAvailable, shareInvitation, subscribeInvitationShare } from "./invitation-share";

const LinkRow = styled.div`
  display: flex; align-items: end; gap: var(--gh-spacing-2); max-inline-size: var(--gh-size-192);
  > :first-child { flex: 1; min-inline-size: 0; }
  input { min-inline-size: 0; }
  > button { flex: none; inline-size: auto; }
  ${inlineControlRow}
`;
const ShareActions = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2); max-inline-size: var(--gh-size-192);
  > button { grid-column: 1 / -1; }
  > a, > button { min-block-size: var(--form-control-height); }
  ${media.tablet} { display: flex; flex-wrap: wrap; > a, > button { inline-size: auto; } }
`;
const InviteContent = styled.div`
  display: grid; gap: var(--gh-spacing-4);
  > p { color: ${({ theme }) => theme.color.text}; }
`;
const Notice = styled.p`
  font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: var(--gh-leading-normal);
`;

export function InvitationActions({ locale, links: { invitation, whatsApp, telegram }, showDeviceShare = true, children }: {
  locale: string; links: InvitationLinks; showDeviceShare?: boolean; children?: ReactNode;
}) {
  const m = createMessages(locale), field = useRef<HTMLInputElement>(null), sharing = useRef(false);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const nativeShare = useSyncExternalStore(subscribeInvitationShare, invitationShareAvailable, serverInvitationShareAvailable);
  async function copy() {
    try { await navigator.clipboard.writeText(invitation.url); setNotice(m.text("referrals.copied")); }
    catch { field.current?.focus(); field.current?.select(); setNotice(m.text("referrals.copyFallback")); }
  }
  async function share() {
    if (sharing.current) return;
    sharing.current = true; setBusy(true); setNotice("");
    try {
      if (await shareInvitation(invitation) === "failed") setNotice(m.text("referrals.shareFailed"));
    } finally { sharing.current = false; setBusy(false); }
  }
  return <InviteContent aria-busy={busy}>
    {children}
    <ShareActions aria-label={m.text("referrals.invite")} role="group" data-invitation-actions>
      {showDeviceShare && nativeShare && <Button type="button" disabled={busy} onClick={share}><ShareIcon />{m.text("referrals.shareInvitation")}</Button>}
      <ButtonLink href={whatsApp} target="_blank" rel="noopener noreferrer" prefetch={false} variant="secondary">WhatsApp</ButtonLink>
      <ButtonLink href={telegram} target="_blank" rel="noopener noreferrer" prefetch={false} variant="secondary">Telegram</ButtonLink>
    </ShareActions>
    <LinkRow data-invite-friends><TextInput ref={field} label={m.text("referrals.link")} value={invitation.url} readOnly name="referralLink" spellCheck={false} />
      <Button type="button" variant="secondary" onClick={copy}><CopyIcon />{m.text("referrals.copy")}</Button>
    </LinkRow>
    {notice && <Notice role="status">{notice}</Notice>}
  </InviteContent>;
}
