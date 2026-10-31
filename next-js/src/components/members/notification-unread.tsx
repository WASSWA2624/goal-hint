"use client";
import { useSyncExternalStore } from "react";
import styled, { css } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { getNotificationUnread, getServerNotificationUnread, subscribeNotificationUnread } from "./notification-state";

const Badge = styled.span<{ $dot: boolean }>`
  display: inline-flex; flex: none; align-items: center; justify-content: center; margin-inline-start: auto;
  min-inline-size: 18px; block-size: 18px; padding-inline: 4px; font-size: .6875rem; line-height: 1;
  background: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.onBrand}; border-radius: ${({ theme }) => theme.radius.control};
  ${({ $dot }) => $dot && css`
    position: absolute; inset-block-start: 4px; inset-inline-end: 3px; min-inline-size: 6px; inline-size: 6px; block-size: 6px; padding: 0;
    background: ${({ theme }) => theme.header.accent};
  `}
  > .notification-sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
export function NotificationUnread({ locale, dot = false, id }: { locale: string; dot?: boolean; id?: string }) {
  const count = useSyncExternalStore(subscribeNotificationUnread, getNotificationUnread, getServerNotificationUnread);
  if (!count) return null;
  return <Badge id={id} $dot={dot} data-notification-unread><span className="notification-sr">{createMessages(locale).plural("notifications.unread", count)}</span>
    {!dot && <span aria-hidden="true">{count > 99 ? "99+" : count}</span>}</Badge>;
}
