"use client";

import { useSyncExternalStore } from "react";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { ButtonLink } from "@/components/ui/controls";
import { LockIcon } from "@/components/ui/icons";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { createMessages } from "@/i18n/messages";
import { getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";

const Action = styled(Link)<{ $stretch: boolean; $overlay: boolean }>`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5);
  min-block-size: var(--form-control-height);
  color: ${({ theme }) => theme.color.link}; text-decoration: none;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  > svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); flex: none; }
  &::after { content: ${({ $stretch }) => $stretch ? '""' : "none"}; position: absolute; inset: 0; z-index: var(--gh-layer-raised); cursor: pointer; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: ${({ theme }) => theme.border.focusWidth}; }
  ${({ $overlay }) => $overlay && `position: absolute; inset: 0; z-index: var(--gh-layer-raised);`}
  ${({ $stretch, theme }) => $stretch && `&:focus-visible { outline: none; } &:focus-visible::after { outline: ${theme.border.focusWidth} solid ${theme.color.focus}; outline-offset: calc(-1 * ${theme.border.focusWidth}); }`}
`;

/** A true link keeps pointer, keyboard and modified-click navigation consistent. */
export function UnlockLink({ locale = "en", signedIn = false, returnTo = "/en", guestView = "register", stretch = false, overlay = false }: {
  locale?: string; signedIn?: boolean; returnTo?: string; guestView?: "login" | "register"; stretch?: boolean; overlay?: boolean;
}) {
  return <Action href={subscriberHref(signedIn, returnTo, guestView)} prefetch={false} $stretch={stretch} $overlay={overlay} data-unlock-link>
    {overlay ? <VisuallyHidden>{createMessages(locale).text("paywall.unlock")}</VisuallyHidden> : <UnlockLabel locale={locale} />}
  </Action>;
}

const Label = styled.span`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.link};
  svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); flex: none; }
`;
export function UnlockLabel({ locale = "en" }: { locale?: string }) {
  return <Label><LockIcon aria-hidden="true" />{createMessages(locale).text("paywall.unlock")}</Label>;
}

export const LockedSurface = styled.div`
  position: relative; isolation: isolate; min-inline-size: 0;
`;

/** Used inside an existing protected content area, never as an extra feed banner. */
export function UnlockPanel(props: Parameters<typeof UnlockLink>[0]) {
  return <LockedSurface data-match-access-required><UnlockLink {...props} stretch /></LockedSurface>;
}

const AccessButton = styled(ButtonLink)<{ $embedded: boolean }>`
  position: relative; z-index: var(--gh-layer-raised); min-inline-size: 0;
  white-space: normal; text-align: start; line-height: var(--gh-leading-normal);
  > svg { flex: none; inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); }
  ${({ $embedded }) => $embedded && `&& { min-block-size: var(--slip-header-action-size); padding: var(--gh-spacing-0_75) var(--gh-spacing-1_5); font-size: var(--gh-font-secondary); }`}
`;

const getExpiredSnapshot = () => getSubscriptionSnapshot()?.expired === true;
const getServerExpiredSnapshot = () => false;

/** Expiry stays in the shared private session store, outside cacheable page data. */
function UnlockActionLabel({ locale, signedIn }: { locale: string; signedIn: boolean }) {
  const expired = useSyncExternalStore(subscribeMemberSession, getExpiredSnapshot, getServerExpiredSnapshot);
  return <span>{createMessages(locale).text(!signedIn ? "paywall.loginRegisterUnlock"
    : expired ? "paywall.renewUnlock" : "paywall.subscribeUnlock")}</span>;
}

/** Context-aware access actions reuse the shared button surface and control metric. */
export function UnlockButton({ locale = "en", signedIn = false, returnTo = "/en", guestView = "register", compact = false, actionSpecific = false }: {
  locale?: string; signedIn?: boolean; returnTo?: string; guestView?: "login" | "register"; compact?: boolean; actionSpecific?: boolean;
}) {
  const m = createMessages(locale);
  return <AccessButton href={subscriberHref(signedIn, returnTo, guestView)} prefetch={false} variant="secondary" $embedded={compact} data-unlock-button>
    <LockIcon aria-hidden="true" />{actionSpecific ? <UnlockActionLabel locale={locale} signedIn={signedIn} />
      : <span>{m.text(compact ? "paywall.unlock" : signedIn ? "paywall.subscribeUnlock" : "paywall.registerUnlock")}</span>}
  </AccessButton>;
}
