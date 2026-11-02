"use client";
import { useSyncExternalStore } from "react";
import styled, { css } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { getNotificationUnread, getServerNotificationUnread, subscribeNotificationUnread } from "./notification-state";

const Badge = styled.span<{ $dot: boolean }>`
  display: inline-flex; flex: none; align-items: center; justify-content: center; margin-inline-start: auto;
  min-inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); padding-inline: var(--gh-spacing-1); font-size: var(--gh-font-caption); line-height: var(--gh-leading-solid);
  background: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.onBrand}; border-radius: ${({ theme }) => theme.radius.control};
  ${({ $dot }) => $dot && css`
    position: absolute; inset-block-start: var(--gh-spacing-1); inset-inline-end: var(--gh-spacing-0_75); min-inline-size: var(--gh-size-1_5); inline-size: var(--gh-size-1_5); block-size: var(--gh-size-1_5); padding: 0;
    background: ${({ theme }) => theme.header.accent};
  `}
  > .notification-sr { position: absolute; inline-size: var(--gh-size-0_25); block-size: var(--gh-size-0_25); overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
export function NotificationUnread({ locale, dot = false, id }: { locale: string; dot?: boolean; id?: string }) {
  const count = useSyncExternalStore(subscribeNotificationUnread, getNotificationUnread, getServerNotificationUnread);
  if (!count) return null;
  return <Badge id={id} $dot={dot} data-notification-unread><span className="notification-sr">{createMessages(locale).plural("notifications.unread", count)}</span>
    {!dot && <span aria-hidden="true">{count > 99 ? "99+" : count}</span>}</Badge>;
}
