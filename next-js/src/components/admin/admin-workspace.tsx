"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { usePathname } from "next/navigation";
import { ShellFrame } from "@/components/navigation/shell-styles";
import { contentGutter, joinedDesktopSections } from "@/components/ui/layout";
import {
  CardIcon, ChartIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, GiftIcon, GridIcon, LayersIcon, ListIcon, SlidersIcon, TicketIcon, UserIcon, type IconProps,
} from "@/components/ui/icons";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { adminSections, isRecordAdminSection, type AdminSection } from "@/domain/admin-navigation";
import { media } from "@/styles/theme";
import { WorkspaceNavigationLink } from "@/components/ui/workspace-navigation";
import { getPendingPaymentsSnapshot, seedPendingPayments, subscribePendingPayments } from "./pending-payments";
import { watchPendingPaymentTitle } from "./pending-title";
import { adminSidebarSize, getServerSidebarSnapshot, getSidebarSnapshot, saveSidebarPreference, setSidebarPreference, subscribeSidebarPreference } from "./admin-sidebar-state";
import { useHorizontalResize, workspaceResizeRail } from "./workspace-resize";

const sectionIcons: Record<AdminSection, ComponentType<IconProps>> = {
  overview: GridIcon, payments: CardIcon, codes: TicketIcon, subscribers: UserIcon, referrals: GiftIcon,
  plans: LayersIcon, settings: SlidersIcon, audit: ListIcon, analytics: ChartIcon,
};

function SectionLinks({ current, onNavigate, collapsed = false }: { current: AdminSection; onNavigate?: () => void; collapsed?: boolean }) {
  return <ul>
    {adminSections.map(({ key, href, label }) => {
      const Icon = sectionIcons[key];
      return <li key={key} data-separated={key === "settings" || key === "analytics" || undefined}>
        <SectionLink href={href} prefetch={false} title={label} aria-label={collapsed ? label : undefined}
          aria-current={key === current ? "page" : undefined} {...(onNavigate ? { onClick: onNavigate } : {})}>
          <Icon /><span data-sidebar-label>{label}</span>
        </SectionLink>
      </li>;
    })}
  </ul>;
}

function useAdminSection(initialSection?: AdminSection) {
  const pathname = usePathname();
  return { pathname, current: adminSections.find(section => section.href === pathname)?.key ?? initialSection ?? "overview" };
}

/** Phones and tablets: the current section names the menu; the list opens below it and closes on a choice, Escape or a tap outside. */
export function AdminSectionMenu({ initialSection }: { initialSection?: AdminSection }) {
  const { current } = useAdminSection(initialSection);
  const root = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: dismiss });
  const label = adminSections.find(({ key }) => key === current)?.label ?? "Admin";
  return <MenuBar data-admin-section-menu ref={root} onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
    if (event.key !== "Escape" || !root.current?.open) return;
    event.preventDefault();
    dismiss();
    root.current.querySelector("summary")?.focus({ preventScroll: true });
  }}>
    <summary aria-expanded={open}>
      <ListIcon /><span><small>Section</small><strong>{label}</strong></span><ChevronDownIcon />
    </summary>
    <MenuPopup aria-label="Admin sections">
      <SectionLinks current={current} onNavigate={dismiss} />
    </MenuPopup>
  </MenuBar>;
}

/**
 * The owner workspace: a section sidebar from desktop up, one section menu on phones, and the page column. Every page
 * keeps the live pending-payments count in its tab title.
 */
export function AdminWorkspace({ current: initialSection, children, pendingCount }: {
  current?: AdminSection; children: ReactNode; pendingCount?: number;
}) {
  const { pathname, current } = useAdminSection(initialSection);
  const recordWorkspace = isRecordAdminSection(current);
  const count = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, () => pendingCount ?? null);
  const sidebarSnapshot = useSyncExternalStore(subscribeSidebarPreference, getSidebarSnapshot, getServerSidebarSnapshot);
  const [collapsedValue, widthValue, maximumValue] = sidebarSnapshot.split(":").map(Number);
  const collapsed = collapsedValue === 1, sidebarWidth = widthValue!, sidebarMaximum = maximumValue!;
  const { handle, resizing } = useHorizontalResize({ width: sidebarWidth, min: adminSidebarSize.min, max: sidebarMaximum,
    defaultWidth: adminSidebarSize.default, onChange: (width, persist) => setSidebarPreference({ width }, persist),
    onDragEnd: saveSidebarPreference });
  const sidebarStyle = { "--admin-sidebar-width": `${collapsed ? adminSidebarSize.collapsed : sidebarWidth}px`, "--admin-sidebar-handle-width": `${adminSidebarSize.handle}px` } as CSSProperties;
  useEffect(() => {
    if (pendingCount !== undefined) seedPendingPayments(pendingCount);
  }, [pendingCount]);
  useEffect(() => {
    return watchPendingPaymentTitle(document, count ?? 0, current === "payments", () => window.location.pathname === pathname);
  }, [current, count, pathname]);
  return (
    <Frame data-analytics-ignore data-sidebar-resizing={resizing || undefined} $fixed={recordWorkspace} style={sidebarStyle}>
      <Sidebar id="admin-sidebar" data-admin-sidebar data-collapsed={collapsed} aria-label="Admin sections" $fixed={recordWorkspace}>
        <SidebarHead>
          <Caption data-sidebar-caption><SidebarAvatar aria-hidden="true"><UserIcon /></SidebarAvatar>Admin</Caption>
          <SidebarButton type="button" data-sidebar-toggle aria-controls="admin-sidebar" aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarPreference({ collapsed: !collapsed })}><SidebarToggleIcon aria-hidden="true">{collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}</SidebarToggleIcon></SidebarButton>
        </SidebarHead>
        <SectionLinks current={current} collapsed={collapsed} />
      </Sidebar>
      <SidebarResize aria-hidden={collapsed || undefined} $fixed={recordWorkspace} data-sidebar-resize role="separator" tabIndex={collapsed ? -1 : 0}
        aria-label="Resize admin sidebar" aria-controls="admin-sidebar" aria-valuetext={`${sidebarWidth} pixels wide`}
        title="Drag to resize or use arrow keys. Double-click to restore the default width." {...handle} />
      <Main id="main-content" tabIndex={-1} $fixed={recordWorkspace} $joined={current === "analytics"}>
        <Column $wide={current === "analytics" || recordWorkspace} $fixed={recordWorkspace} $joined={current === "analytics"}>{children}</Column>
      </Main>
    </Frame>
  );
}

export const AdminShellFrame = styled(ShellFrame)`
  ${media.belowDesktop} {
    --app-header-height: calc(${({ theme }) => theme.header.phoneHeight} + var(--form-control-height) + var(--gh-stroke-thin));
  }
`;
export { WorkspaceHeaderContent as AdminHeaderContent } from "@/components/navigation/shell-styles";
export const AdminMark = styled.span`
  display: none;
  ${media.desktop} { display: inline; }
  flex: none;
  white-space: nowrap;
  color: ${({ theme }) => theme.header.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: var(--gh-tracking-uppercase);
  text-transform: uppercase;
`;

const Frame = styled.div<{ $fixed: boolean }>`
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  min-inline-size: 0;
  ${media.desktop} {
    grid-template-columns: var(--admin-sidebar-width, var(--gh-size-58)) var(--admin-sidebar-handle-width, var(--gh-size-1_5)) minmax(0, 1fr);
    align-content: stretch;
    &[data-sidebar-resizing="true"], &[data-sidebar-resizing="true"] * { cursor: col-resize !important; user-select: none; }
  }
  ${({ $fixed }) => $fixed && css`${media.desktop} { block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12))); flex: none; min-block-size: 0; overflow: hidden; }`}
`;
const Sidebar = styled.nav<{ $fixed: boolean }>`
  display: none;
  ${media.desktop} {
    display: block;
    position: sticky;
    inset-block-start: var(--app-header-height, var(--gh-size-16));
    align-self: start;
    max-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-16)));
    overflow-y: auto;
    padding: var(--gh-spacing-2) var(--gh-spacing-2_5);
    background: ${({ theme }) => theme.color.surface};
    min-block-size: calc(100dvh - var(--app-header-height, var(--gh-size-16)));
  }
  ul { display: grid; gap: var(--gh-spacing-0_5); margin: 0; padding: 0; list-style: none; }
  li[data-separated] { margin-block-start: var(--gh-spacing-2_5); padding-block-start: var(--gh-spacing-2_5); border-block-start: 0; }
  ${({ $fixed }) => $fixed && css`${media.desktop} { position: static; block-size: 100%; max-block-size: 100%; min-block-size: 0; overflow-x: hidden; }`}
  ${media.desktop} {
    overflow-x: hidden;
    &[data-collapsed="true"] {
      padding-inline: var(--gh-spacing-1_5);
      [data-sidebar-label], [data-sidebar-caption] { display: none; }
      a { position: relative; justify-content: center; padding-inline: 0; }
    }
  }
`;
const adminMenuDivider = css`
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder};
`;
const SidebarHead = styled.div`
  ${adminMenuDivider}
  display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1);
  min-block-size: var(--form-control-height);
  margin: calc(-1 * var(--gh-spacing-2)) calc(-1 * var(--gh-spacing-2_5)) var(--gh-spacing-1_5);
  padding-inline: var(--gh-spacing-2_5);
  background: ${({ theme }) => theme.header.background};
  [data-collapsed="true"] & {
    justify-content: center;
    margin-inline: calc(-1 * var(--gh-spacing-1_5));
    padding-inline: 0;
  }
`;
const SidebarButton = styled.button`
  display: grid; place-items: center; flex: none;
  inline-size: var(--form-control-height); block-size: var(--form-control-height); padding: 0;
  border: 0; border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.header.text}; background: none; cursor: pointer;
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.header.accent}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
`;
const SidebarToggleIcon = styled.span`
  display: grid; place-items: center; inline-size: var(--gh-size-6); block-size: var(--gh-size-6);
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.action.headerBackground};
  > svg { font-size: var(--gh-font-body); }
  ${media.hover} { ${SidebarButton}:hover & { background: ${({ theme }) => theme.header.controlHover}; } }
`;
const SidebarAvatar = styled.span`
  display: grid; place-items: center; flex: none;
  inline-size: var(--gh-size-6); block-size: var(--gh-size-6);
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.header.accent};
  background: ${({ theme }) => theme.action.headerBackground};
  > svg { font-size: var(--gh-font-section); }
`;
const SidebarResize = styled.div<{ $fixed: boolean }>`
  display: none;
  ${media.desktop} {
    display: block; position: sticky; inset-block-start: var(--app-header-height, var(--gh-size-12)); align-self: start;
    block-size: calc(100dvh - var(--app-header-height, var(--gh-size-12))); min-inline-size: 0;
    ${workspaceResizeRail}
    &[aria-hidden="true"] { pointer-events: none; cursor: default; }
  }
  ${({ $fixed }) => $fixed && css`${media.desktop} { position: static; block-size: 100%; }`}
`;
const Caption = styled.p`
  display: flex; align-items: center; gap: var(--gh-spacing-2);
  color: ${({ theme }) => theme.header.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: var(--gh-tracking-uppercase);
  text-transform: uppercase;
`;
const SectionLink = WorkspaceNavigationLink;
const MenuBar = styled.details`
  position: relative;
  ${adminMenuDivider}
  ${media.desktop} { display: none; }
  > summary {
    display: flex;
    align-items: center;
    gap: var(--gh-spacing-2);
    min-block-size: var(--form-control-height);
    padding-block: var(--gh-spacing-1);
    padding-inline: ${contentGutter};
    padding-inline-start: calc(${contentGutter} + ${({ theme }) => theme.space.sm});
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; font-size: var(--gh-font-title); color: ${({ theme }) => theme.header.accent}; }
    > svg:last-child { margin-inline-start: auto; transition: transform ${({ theme }) => theme.motion.disclosure} ${({ theme }) => theme.motion.easing}; }
    > span { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--gh-spacing-2); }
    small {
      color: ${({ theme }) => theme.header.mutedText};
      font-size: ${({ theme }) => theme.typography.scale.caption};
      font-weight: ${({ theme }) => theme.typography.weight.heavy};
      letter-spacing: var(--gh-tracking-uppercase);
      text-transform: uppercase;
    }
    strong { font-size: var(--gh-font-reading); }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  @media (prefers-reduced-motion: reduce) { > summary > svg:last-child { transition: none; } }
`;
const MenuPopup = styled.nav`
  position: absolute;
  inset-inline: 0;
  inset-block-start: 100%;
  max-block-size: calc(100dvh - var(--app-header-height) - var(--app-mobile-tab-height) - env(safe-area-inset-bottom));
  overflow-y: auto;
  padding: var(--gh-spacing-1_5) var(--gh-spacing-2) var(--gh-spacing-2_5);
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  ul { display: grid; gap: var(--gh-spacing-0_5); margin: 0; padding: 0; list-style: none; }
  li[data-separated] { margin-block-start: var(--gh-spacing-1_5); padding-block-start: var(--gh-spacing-1_5); border-block-start: 0; }
`;
const Main = styled.main<{ $fixed: boolean; $joined: boolean }>`
  min-inline-size: 0;
  padding-block: var(--gh-spacing-3) calc(var(--app-mobile-tab-height) + var(--gh-spacing-5) + env(safe-area-inset-bottom));
  padding-inline: ${contentGutter};
  scroll-margin-block-start: var(--app-header-height);
  &:focus { outline: none; }
  ${media.desktop} { grid-column: 3; padding: ${({ theme }) => `${theme.space.lg} 0 calc(${theme.space.lg} * 2)`}; }
  ${({ $joined }) => $joined && css`${media.desktop} { padding-block-start: 0; }`}
  ${({ $fixed }) => $fixed && css`${media.desktop} { display: grid; min-block-size: 0; padding: 0; overflow: hidden; }`}
`;
const Column = styled.div<{ $wide: boolean; $fixed: boolean; $joined: boolean }>`
  display: grid;
  gap: var(--gh-spacing-4);
  align-content: start;
  min-inline-size: 0;
  inline-size: 100%;
  ${({ $wide }) => !$wide && css`${media.desktop} { gap: var(--gh-spacing-5); }`}
  ${({ $joined }) => $joined && joinedDesktopSections}
  ${({ $fixed }) => $fixed && css`${media.desktop} {
    inline-size: 100%; min-block-size: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; gap: 0;
    &:not(:has(> [data-record-workspace])) { display: block; padding-block: var(--gh-spacing-5); overflow-y: auto; }
  }`}
`;
