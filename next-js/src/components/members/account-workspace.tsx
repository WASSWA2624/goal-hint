"use client";
import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from "react";
import styled from "styled-components";
import { ChevronDownIcon, ListIcon, SignOutIcon } from "@/components/ui/icons";
import { WorkspaceNavigationLink } from "@/components/ui/workspace-navigation";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { accountSections, accountSectionHref, type AccountSection } from "@/domain/account-navigation";
import { formatPhone } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { accountSectionIcons } from "./account-navigation";
import { NotificationUnread } from "./notification-unread";
import { MemberSignOut } from "./member-controls";
import { DeskHead, Panel, PanelBody, PanelHead, StatGrid } from "@/components/admin/desk-styles";

const Frame = styled.div`
  min-inline-size: 0;
  ${media.desktop} { display: grid; grid-template-columns: var(--gh-size-58) minmax(0, 1fr); align-items: stretch; }
`;
const Sidebar = styled.aside`
  display: none;
  ${media.desktop} {
    display: flex; flex-direction: column; gap: var(--gh-spacing-1_5); align-self: start; position: sticky;
    inset-block-start: var(--app-header-height, var(--gh-size-12)); min-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12)));
    max-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12))); overflow-y: auto;
    padding: var(--gh-spacing-2) var(--gh-spacing-2_5); background: ${({ theme }) => theme.color.surface}; border-inline-end: 0;
  }
  > h2 { display: flex; align-items: center; min-block-size: var(--gh-size-8); margin: 0; padding-inline: var(--gh-spacing-2_5);
    color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.caption};
    font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: var(--gh-tracking-uppercase); text-transform: uppercase; }
`;
const Links = styled.ul`
  display: grid; gap: var(--gh-spacing-0_5); margin: 0; padding: 0; list-style: none; min-inline-size: 0;
`;
const SidebarFoot = styled.div`
  display: grid; gap: var(--gh-spacing-2); margin-block-start: auto; padding: var(--gh-spacing-4) var(--gh-spacing-2_5) 0;
  border-block-start: 0;
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); overflow-wrap: anywhere; }
`;
const LogOut = styled(MemberSignOut)`
  && { display: inline-flex; align-items: center; justify-content: start; gap: var(--gh-spacing-2_5); min-block-size: var(--form-control-height);
    border: 0; padding: 0; background: none; color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-emphasis); }
`;
const SectionMenu = styled.details`
  position: relative; z-index: var(--gh-layer-toolbar); background: ${({ theme }) => theme.color.surface};
  border-block-end: 0;
  ${media.desktop} { display: none; }
  > summary { display: flex; align-items: center; gap: var(--gh-spacing-2_5); min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-4); list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg:last-child { margin-inline-start: auto; }
  }
  nav { position: absolute; inset: 100% 0 auto; padding: var(--gh-spacing-2_5); background: ${({ theme }) => theme.color.surface};
    max-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12)) - var(--gh-size-12) - var(--app-mobile-tab-height, var(--gh-size-12)) - var(--gh-size-4)); overflow-y: auto;
    border-block-end: 0; box-shadow: ${({ theme }) => theme.shadow.popover}; }
`;
const Content = styled.article`
  min-inline-size: 0; padding: ${({ theme }) => `${theme.space.md} ${theme.space.md} ${theme.space.lg}`}; display: grid; align-content: start; gap: ${({ theme }) => theme.space.md}; overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.typography.family}; font-size: ${({ theme }) => theme.typography.scale.body};
  line-height: ${({ theme }) => theme.typography.lineHeight.body};
  ${media.desktop} { padding: ${({ theme }) => `${theme.space.lg} 0 ${theme.space.xl}`}; min-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12))); }
  h1 { margin: 0; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  p { margin: 0; }
`;
export const AccountPageHead = styled(DeskHead)`
  justify-content: space-between;
`;
const Body = styled(PanelBody)`
  h2 { margin: 0; }
  form { max-inline-size: var(--gh-size-152); inline-size: 100%; }
  [data-account-notifications] { display: flex; border: 0; padding: 0; }
  [data-account-notifications] strong { font-size: ${({ theme }) => theme.typography.scale.body}; }
`;
export function AccountPanel({ title, actions, narrow = false, children, ...props }: Omit<ComponentProps<typeof Panel>, "title"> & { title: ReactNode; actions?: ReactNode; narrow?: boolean }) {
  return <Panel {...props} {...(narrow ? { style: { maxInlineSize: "var(--gh-size-168)", ...props.style } } : {})}><PanelHead><h2>{title}</h2>{actions}</PanelHead><Body>{children}</Body></Panel>;
}
export const AccountFacts = styled(StatGrid)`
  > div { padding: var(--gh-spacing-2) var(--gh-spacing-3); }
  ${media.belowDesktop} { > div:last-child:nth-child(odd) { grid-column: 1 / -1; } }
  dd { font-size: ${({ theme }) => theme.typography.scale.emphasis}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.desktop} { dd { font-size: ${({ theme }) => theme.typography.scale.emphasis}; } }
`;
export const AccountStatus = styled.span<{ $active: boolean }>`
  padding: var(--gh-spacing-0_5) var(--gh-spacing-1_75); border-radius: ${({ theme }) => theme.radius.small};
  font-size: ${({ theme }) => theme.typography.scale.secondary}; font-weight: ${({ theme }) => theme.typography.weight.bold};
  color: ${({ theme, $active }) => $active ? theme.color.outcome.correct.text : theme.color.mutedText};
  background: ${({ theme, $active }) => $active ? theme.color.outcome.correct.background : theme.color.surfaceMuted};
`;
export const AccountSectionActions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2) var(--gh-spacing-3);
  > button { width: auto; }
`;

export function AccountWorkspace({ locale, current, phone, returnTo, children }: {
  locale: string; current: AccountSection; phone: string; returnTo: string | null; children: ReactNode;
}) {
  const m = createMessages(locale), menu = useRef<HTMLDetailsElement>(null), [open, setOpen] = useState(false);
  const dismiss = useCallback(() => closeDetails(menu.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open, root: menu, onDismiss: dismiss });
  const links = (mobile = false) => <Links>{accountSections.map(section => {
    const Icon = accountSectionIcons[section];
    return <li key={section}><WorkspaceNavigationLink href={accountSectionHref(locale, section, returnTo)} prefetch={false}
      aria-current={current === section ? "page" : undefined} {...(mobile ? { onClick: dismiss } : {})}>
      <Icon /><span data-sidebar-label>{m.text(`account.section.${section}`)}</span>
      {section === "notifications" && <NotificationUnread locale={locale} />}
    </WorkspaceNavigationLink></li>;
  })}</Links>;
  return <Frame data-account-workspace>
    <Sidebar><h2>{m.text("account.title")}</h2><nav aria-label={m.text("account.sections")}>{links()}</nav>
      <SidebarFoot><small>+{formatPhone(phone)}</small><LogOut><SignOutIcon />{m.text("auth.signOut")}</LogOut></SidebarFoot>
    </Sidebar>
    <SectionMenu ref={menu} data-account-section-menu onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
      if (event.key === "Escape" && menu.current?.open) { event.preventDefault(); dismiss(); menu.current.querySelector("summary")?.focus(); }
    }}><summary aria-expanded={open}><ListIcon /><strong>{m.text(`account.section.${current}`)}</strong><ChevronDownIcon /></summary>
      <nav aria-label={m.text("account.sections")}>{links(true)}<SidebarFoot><LogOut><SignOutIcon />{m.text("auth.signOut")}</LogOut></SidebarFoot></nav>
    </SectionMenu>
    <Content data-account-details data-account-section={current} data-analytics-ignore>{children}</Content>
  </Frame>;
}
