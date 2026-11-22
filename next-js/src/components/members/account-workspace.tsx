"use client";
import { useCallback, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import styled from "styled-components";
import { ChevronDownIcon, ListIcon, SignOutIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { WorkspaceNavigationLink } from "@/components/ui/workspace-navigation";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { accountSections, accountSectionHref, type AccountSection } from "@/domain/account-navigation";
import { formatPhone } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { accountSectionIcons } from "./account-navigation";
import { NotificationUnread } from "./notification-unread";
import { MemberSignOut } from "./member-controls";
import { Panel, PanelBody, PanelHead, StatGrid } from "@/components/admin/desk-styles";

const Frame = styled.div`
  min-inline-size: 0;
  ${media.desktop} {
    --account-workspace-height: calc(100dvh - var(--app-header-height, var(--gh-size-12)) - var(--app-workspace-bottom-band, 0px));
    display: grid; grid-template-columns: var(--gh-size-58) minmax(0, 1fr); align-items: stretch;
    column-gap: ${({ theme }) => theme.layout.gutter};
  }
`;
const Sidebar = styled.aside`
  display: none;
  ${media.desktop} {
    display: flex; flex-direction: column; gap: var(--gh-spacing-1_5); align-self: start; position: sticky;
    inset-block-start: var(--app-header-height, var(--gh-size-12)); min-block-size: var(--account-workspace-height);
    max-block-size: var(--account-workspace-height); overflow-y: auto;
    padding: var(--gh-spacing-2) 0; background: ${({ theme }) => theme.color.surface};
    border-inline-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  }
`;
const SidebarIdentity = styled.p`
  display: flex; align-items: center; min-inline-size: 0; min-block-size: var(--form-control-height);
  margin: 0; padding-inline: var(--gh-spacing-3);
  font-weight: var(--gh-weight-semibold); font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
`;
const Links = styled.ul`
  display: grid; gap: var(--gh-spacing-0_5); margin: 0; padding: 0; list-style: none; min-inline-size: 0;
`;
const LogOut = styled(MemberSignOut)`
  && {
    display: flex; align-items: center; justify-content: center; gap: var(--gh-spacing-2);
    inline-size: 100%; min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-3);
    border: 0; border-radius: ${({ theme }) => theme.radius.none};
    background: transparent; color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-body);
    > svg { flex: none; }
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  }
`;
const SectionMenu = styled.details`
  position: relative; z-index: var(--gh-layer-toolbar); background: ${({ theme }) => theme.color.surface};
  border-block-end: 0;
  ${media.desktop} { display: none; }
  > summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--gh-spacing-2);
    min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-4); list-style: none; cursor: pointer;
    &::-webkit-details-marker { display: none; }
    &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
    > span { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 var(--gh-spacing-3); min-inline-size: 0; }
    small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  }
  nav { position: absolute; inset: 100% 0 auto; padding: var(--gh-spacing-2_5); background: ${({ theme }) => theme.color.surface};
    max-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12)) - var(--form-control-height) - var(--app-mobile-tab-height, var(--gh-size-12)) - env(safe-area-inset-bottom) - var(--gh-size-4));
    overflow-y: auto; overscroll-behavior-y: contain;
    border-block-end: 0; box-shadow: ${({ theme }) => theme.shadow.popover}; }
`;
const Content = styled.article`
  min-inline-size: 0; padding: ${({ theme }) => `${theme.space.md} 0 ${theme.space.lg}`}; display: grid; align-content: start; gap: ${({ theme }) => theme.space.md}; overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.typography.family}; font-size: ${({ theme }) => theme.typography.scale.body};
  line-height: ${({ theme }) => theme.typography.lineHeight.body};
  ${media.desktop} { padding: ${({ theme }) => `${theme.space.lg} 0 ${theme.space.xl}`}; min-block-size: var(--account-workspace-height); }
  h1 { margin: 0; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  p { margin: 0; }
`;
const Body = styled(PanelBody)`
  h2 { margin: 0; }
  form { max-inline-size: var(--gh-size-152); inline-size: 100%; }
`;
export function AccountPanel({ title, actions, narrow = false, children, ...props }: Omit<ComponentProps<typeof Panel>, "title"> & { title?: ReactNode; actions?: ReactNode; narrow?: boolean }) {
  return <Panel {...props} {...(narrow ? { style: { maxInlineSize: "var(--gh-layout-formMaxWidth)", ...props.style } } : {})}>
    {(title || actions) && <PanelHead>{title && <h2>{title}</h2>}{actions}</PanelHead>}<Body>{children}</Body>
  </Panel>;
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
export const AccountFormPanel = styled(AccountPanel)`
  inline-size: 100%;
  max-inline-size: ${({ theme }) => theme.layout.formMaxWidth};
  margin-inline: auto;
`;
export const AccountDeviceList = styled.ul`
  display: grid; list-style: none; margin: 0; padding: 0;
  > li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-3);
    min-block-size: var(--form-control-height); padding-block: var(--gh-spacing-1_5); }
  > li + li { border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  time { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
`;

export function AccountWorkspace({ locale, current, phone, returnTo, children }: {
  locale: string; current: AccountSection; phone: string; returnTo: string | null; children: ReactNode;
}) {
  const m = createMessages(locale), menu = useRef<HTMLDetailsElement>(null), [open, setOpen] = useState(false);
  const heading = useId(), section = m.text(`account.section.${current}`), identity = `+${formatPhone(phone)}`;
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
    <Sidebar><SidebarIdentity data-account-sidebar-identity data-analytics-ignore>{identity}</SidebarIdentity>
      <nav aria-label={m.text("account.sections")}>{links()}</nav>
      <LogOut><SignOutIcon />{m.text("auth.signOut")}</LogOut>
    </Sidebar>
    <SectionMenu ref={menu} data-account-section-menu onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
      if (event.key === "Escape" && menu.current?.open) { event.preventDefault(); dismiss(); menu.current.querySelector("summary")?.focus(); }
    }}><summary aria-expanded={open} data-analytics-ignore><ListIcon /><span><strong>{section}</strong><small data-account-mobile-identity>{identity}</small></span><ChevronDownIcon /></summary>
      <nav aria-label={m.text("account.sections")}>{links(true)}<LogOut><SignOutIcon />{m.text("auth.signOut")}</LogOut></nav>
    </SectionMenu>
    <Content aria-labelledby={heading} data-account-details data-account-section={current} data-analytics-ignore>
      <VisuallyHidden as="h1" id={heading} data-account-page-heading>{section}</VisuallyHidden>{children}
    </Content>
  </Frame>;
}
