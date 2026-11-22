"use client";

import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { ButtonLink } from "@/components/ui/controls";
import { LockIcon } from "@/components/ui/icons";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { createMessages } from "@/i18n/messages";

type UnlockLabelKey = "paywall.unlockPredictions" | "paywall.unlockSlip" | "paywall.unlockSlipBuilder";

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
export function UnlockLink({ locale = "en", signedIn = false, returnTo = "/en", guestView = "register", stretch = false, overlay = false,
  label = "paywall.unlockPredictions" }: {
  locale?: string; signedIn?: boolean; returnTo?: string; guestView?: "login" | "register"; stretch?: boolean; overlay?: boolean; label?: UnlockLabelKey;
}) {
  const text = createMessages(locale).text(label);
  return <Action href={subscriberHref(signedIn, returnTo, guestView)} prefetch={false} $stretch={stretch} $overlay={overlay} data-unlock-link>
    {overlay ? <VisuallyHidden>{text}</VisuallyHidden> : <Label><LockIcon aria-hidden="true" />{text}</Label>}
  </Action>;
}

const Label = styled.span`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.link};
  svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); flex: none; }
`;

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
  &&[data-unlock-card] {
    position: static;
    &::after { content: ""; position: absolute; inset: 0; z-index: var(--gh-layer-content); border-radius: inherit; }
    &:focus-visible::after {
      outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
      outline-offset: calc(-1 * ${({ theme }) => theme.border.focusWidth});
    }
  }
`;

/** Access actions reuse the shared button surface and control metric. */
export function UnlockButton({ locale = "en", signedIn = false, returnTo = "/en", guestView = "register", compact = false,
  label = "paywall.unlockPredictions", cardTitle }: {
  locale?: string; signedIn?: boolean; returnTo?: string; guestView?: "login" | "register"; compact?: boolean; label?: UnlockLabelKey; cardTitle?: string;
}) {
  const text = createMessages(locale).text(label);
  return <AccessButton href={subscriberHref(signedIn, returnTo, guestView)} prefetch={false} variant="secondary" $embedded={compact}
    data-unlock-button data-unlock-card={cardTitle ? "" : undefined} aria-label={cardTitle ? `${text}: ${cardTitle}` : undefined}>
    <LockIcon aria-hidden="true" /><span>{text}</span>
  </AccessButton>;
}
