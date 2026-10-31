"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { usePathname } from "next/navigation";
import { joinedDesktopSections } from "@/components/ui/layout";
import {
  CardIcon, ChartIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, GiftIcon, GridIcon, LayersIcon, ListIcon, ResetIcon, SlidersIcon, TicketIcon, UserIcon, type IconProps,
} from "@/components/ui/icons";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { adminSections, isRecordAdminSection, type AdminSection } from "@/domain/admin-navigation";
import { media } from "@/styles/theme";
import { WorkspaceNavigationLink } from "@/components/ui/workspace-navigation";
import { getPendingPaymentsSnapshot, seedPendingPayments, subscribePendingPayments } from "./pending-payments";
import { watchPendingPaymentTitle } from "./pending-title";
import { adminSidebarSize, clampSidebarWidth, getServerSidebarSnapshot, getSidebarSnapshot, saveSidebarPreference, setSidebarPreference, subscribeSidebarPreference } from "./admin-sidebar-state";

const sectionIcons: Record<AdminSection, ComponentType<IconProps>> = {
  overview: GridIcon, payments: CardIcon, codes: TicketIcon, subscribers: UserIcon, referrals: GiftIcon,
  plans: LayersIcon, settings: SlidersIcon, audit: ListIcon, forecasts: ChartIcon, analytics: ChartIcon,
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

/** Phones and tablets: the current section names the menu; the list opens below it and closes on a choice, Escape or a tap outside. */
function SectionMenu({ current }: { current: AdminSection }) {
  const root = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: dismiss });
  const label = adminSections.find(({ key }) => key === current)?.label ?? "Admin";
  return <MenuBar ref={root} onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => {
    if (event.key !== "Escape" || !root.current?.open) return;
    event.preventDefault();
    dismiss();
    root.current.querySelector("summary")?.focus({ preventScroll: true });
  }}>
    <summary aria-expanded={open}>
      <ListIcon /><small>Section</small><strong>{label}</strong><ChevronDownIcon />
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
  const pathname = usePathname();
  const current = adminSections.find(section => section.href === pathname)?.key ?? initialSection ?? "overview";
  const recordWorkspace = isRecordAdminSection(current);
  const count = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, () => pendingCount ?? null);
  const sidebarSnapshot = useSyncExternalStore(subscribeSidebarPreference, getSidebarSnapshot, getServerSidebarSnapshot);
  const [collapsedValue, widthValue, maximumValue] = sidebarSnapshot.split(":").map(Number);
  const collapsed = collapsedValue === 1, sidebarWidth = widthValue!, sidebarMaximum = maximumValue!;
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const sidebarStyle = { "--admin-sidebar-width": `${collapsed ? adminSidebarSize.collapsed : sidebarWidth}px`, "--admin-sidebar-handle-width": `${collapsed ? 0 : adminSidebarSize.handle}px` } as CSSProperties;
  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    saveSidebarPreference();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
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
          <Caption data-sidebar-caption>Admin</Caption>
          <SidebarControls>
            {!collapsed && <SidebarButton type="button" aria-label="Reset sidebar width" title="Reset sidebar width" onClick={() => setSidebarPreference({ width: adminSidebarSize.default })}><ResetIcon /></SidebarButton>}
            <SidebarButton type="button" data-sidebar-toggle aria-controls="admin-sidebar" aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarPreference({ collapsed: !collapsed })}>{collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}</SidebarButton>
          </SidebarControls>
        </SidebarHead>
        <SectionLinks current={current} collapsed={collapsed} />
      </Sidebar>
      <SidebarResize hidden={collapsed} $fixed={recordWorkspace} data-sidebar-resize role="separator" tabIndex={collapsed ? -1 : 0}
        aria-label="Resize admin sidebar" aria-orientation="vertical" aria-controls="admin-sidebar"
        aria-valuemin={adminSidebarSize.min} aria-valuemax={sidebarMaximum} aria-valuenow={sidebarWidth} aria-valuetext={`${sidebarWidth} pixels wide`}
        title="Drag to resize; use arrow keys or double-click to reset"
        onDoubleClick={() => setSidebarPreference({ width: adminSidebarSize.default })}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, x: event.clientX, width: sidebarWidth };
          setResizing(true);
        }}
        onPointerMove={event => {
          const active = drag.current;
          if (active?.pointerId === event.pointerId) setSidebarPreference({ width: clampSidebarWidth(active.width + event.clientX - active.x, sidebarMaximum) }, false);
        }}
        onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={finishResize}
        onKeyDown={event => {
          const increment = event.shiftKey ? 32 : 8;
          const width = event.key === "ArrowLeft" ? sidebarWidth - increment : event.key === "ArrowRight" ? sidebarWidth + increment
            : event.key === "Home" ? adminSidebarSize.min : event.key === "End" ? sidebarMaximum : event.key === "Enter" ? adminSidebarSize.default : null;
          if (width === null) return;
          event.preventDefault(); setSidebarPreference({ width: clampSidebarWidth(width, sidebarMaximum) });
        }} />
      <SectionMenu current={current} />
      <Main id="main-content" tabIndex={-1} $fixed={recordWorkspace} $joined={current === "analytics"}>
        <Column $wide={current === "analytics" || recordWorkspace} $fixed={recordWorkspace} $joined={current === "analytics"}>{children}</Column>
      </Main>
    </Frame>
  );
}

export { WorkspaceHeaderContent as AdminHeaderContent } from "@/components/navigation/shell-styles";
export const AdminMark = styled.span`
  display: none;
  ${media.desktop} { display: inline; }
  flex: none;
  white-space: nowrap;
  color: ${({ theme }) => theme.header.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Frame = styled.div<{ $fixed: boolean }>`
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  min-inline-size: 0;
  ${media.desktop} {
    grid-template-columns: var(--admin-sidebar-width, 232px) var(--admin-sidebar-handle-width, 6px) minmax(0, 1fr);
    align-content: stretch;
    &[data-sidebar-resizing="true"], &[data-sidebar-resizing="true"] * { cursor: col-resize !important; user-select: none; }
  }
  ${({ $fixed }) => $fixed && css`${media.desktop} { block-size: calc(100dvh - var(--app-header-height, 3rem)); flex: none; min-block-size: 0; overflow: hidden; }`}
`;
const Sidebar = styled.nav<{ $fixed: boolean }>`
  display: none;
  ${media.desktop} {
    display: block;
    position: sticky;
    inset-block-start: var(--app-header-height, 4rem);
    align-self: start;
    max-block-size: calc(100dvh - var(--app-header-height, 4rem));
    overflow-y: auto;
    padding: 8px 10px;
    background: ${({ theme }) => theme.color.surface};
    min-block-size: calc(100dvh - var(--app-header-height, 4rem));
  }
  ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  li[data-separated] { margin-block-start: 10px; padding-block-start: 10px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  ${({ $fixed }) => $fixed && css`${media.desktop} { position: static; block-size: 100%; max-block-size: 100%; min-block-size: 0; overflow-x: hidden; }`}
  ${media.desktop} {
    overflow-x: hidden;
    &[data-collapsed="true"] {
      padding-inline: 6px;
      [data-sidebar-label], [data-sidebar-caption] { display: none; }
      a { position: relative; justify-content: center; padding-inline: 0; }
    }
  }
`;
const SidebarHead = styled.div`
  display: flex; align-items: center; justify-content: space-between; min-block-size: 32px; gap: 4px; margin-block-end: 6px;
`;
const SidebarControls = styled.div`
  display: flex; align-items: center; gap: 2px; margin-inline-start: auto;
`;
const SidebarButton = styled.button`
  display: grid; place-items: center; inline-size: 28px; block-size: 28px; padding: 0;
  border: 0; border-radius: ${({ theme }) => theme.radius.control}; color: ${({ theme }) => theme.color.mutedText}; background: none; cursor: pointer;
  > svg { font-size: 1rem; }
  ${media.hover} { &:hover { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;
const SidebarResize = styled.div<{ $fixed: boolean }>`
  display: none;
  ${media.desktop} {
    display: block; position: sticky; inset-block-start: var(--app-header-height, 3rem); align-self: start;
    block-size: calc(100dvh - var(--app-header-height, 3rem)); min-inline-size: 0;
    background: ${({ theme }) => theme.color.surface}; border-inline: 1px solid ${({ theme }) => theme.color.border};
    cursor: col-resize; touch-action: none;
    &:hover, &:focus-visible { background: ${({ theme }) => theme.color.brandSoft}; border-color: ${({ theme }) => theme.color.link}; }
    &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
    &[hidden] { display: none; }
  }
  ${({ $fixed }) => $fixed && css`${media.desktop} { position: static; block-size: 100%; }`}
`;
const Caption = styled.p`
  padding-inline-start: 10px;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;
const SectionLink = WorkspaceNavigationLink;
const MenuBar = styled.details`
  position: relative;
  z-index: 15;
  background: ${({ theme }) => theme.color.surface};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${media.desktop} { display: none; }
  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: 48px;
    padding: 0 16px;
    list-style: none;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { flex: none; font-size: 1.125rem; color: ${({ theme }) => theme.color.mutedText}; }
    > svg:last-child { margin-inline-start: auto; transition: transform 0.15s ease; }
    small {
      color: ${({ theme }) => theme.color.mutedText};
      font-size: ${({ theme }) => theme.typography.scale.caption};
      font-weight: ${({ theme }) => theme.typography.weight.heavy};
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    strong { font-size: 0.9375rem; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  }
  &[open] > summary > svg:last-child { transform: rotate(180deg); }
  @media (prefers-reduced-motion: reduce) { > summary > svg:last-child { transition: none; } }
`;
const MenuPopup = styled.nav`
  position: absolute;
  inset-inline: 0;
  inset-block-start: 100%;
  max-block-size: calc(100dvh - 7rem);
  overflow-y: auto;
  padding: 6px 8px 10px;
  background: ${({ theme }) => theme.color.surface};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  li[data-separated] { margin-block-start: 6px; padding-block-start: 6px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
`;
const Main = styled.main<{ $fixed: boolean; $joined: boolean }>`
  min-inline-size: 0;
  padding: 20px 16px calc(40px + 3.5rem + 1px + env(safe-area-inset-bottom));
  &:focus { outline: none; }
  ${media.desktop} { grid-column: 3; padding: 24px 0 48px; }
  ${({ $joined }) => $joined && css`${media.desktop} { padding-block-start: 0; }`}
  ${({ $fixed }) => $fixed && css`${media.desktop} { display: grid; min-block-size: 0; padding: 0; overflow: hidden; }`}
`;
const Column = styled.div<{ $wide: boolean; $fixed: boolean; $joined: boolean }>`
  display: grid;
  gap: 16px;
  align-content: start;
  min-inline-size: 0;
  max-inline-size: ${({ $wide }) => $wide ? "100%" : "76rem"};
  margin-inline: auto;
  ${media.desktop} { inline-size: 100%; max-inline-size: none; }
  ${({ $wide }) => !$wide && css`${media.desktop} { gap: 20px; }`}
  ${({ $joined }) => $joined && joinedDesktopSections}
  ${({ $fixed }) => $fixed && css`${media.desktop} {
    inline-size: 100%; min-block-size: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; gap: 0;
    &:not(:has(> [data-record-workspace])) { display: block; padding: 20px; overflow-y: auto; }
  }`}
`;
