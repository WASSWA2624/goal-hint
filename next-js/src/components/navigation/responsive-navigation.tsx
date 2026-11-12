"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { CommunityDialog, useCommunitySettings } from "./community";
import { DashboardIcon, DocumentIcon, DownloadIcon, GiftIcon, GroupIcon, HelpIcon, HomeIcon, LiveIcon, MailIcon, MoreIcon, ResultsIcon, ShieldIcon, SlipIcon, WrenchIcon } from "@/components/ui/icons";
import type { NavigationLocation } from "@/domain/navigation";
import { normalizeNavigationLocation } from "@/domain/navigation-paths";
import type { AccentName } from "@/styles/theme";
import { fitNavigationItems, minimumPrimaryDestinations } from "./navigation-fit";
import { MoreList, MoreMenu, TabButton, TabLink, TabList, TabMeasure, TopNavButton, TopNavLink, TopNavList, TopNavMeasure } from "./shell-styles";

const icons = { matches: HomeIcon, live: LiveIcon, results: ResultsIcon, slips: SlipIcon, builder: WrenchIcon,
  help: HelpIcon, privacy: ShieldIcon, terms: DocumentIcon, contact: MailIcon, dashboard: DashboardIcon, invite: GiftIcon, download: DownloadIcon, community: GroupIcon };
export type NavigationDestination = Readonly<{
  label: string; tab: string; icon: keyof typeof icons; tone: AccentName;
} & ({ key: NavigationLocation; href: string } | { key: "community"; href?: never })>;
const Layout = styled.div`position: relative; min-inline-size: 0; inline-size: 100%; block-size: 100%;`;
const Measurements = styled.div`
  position: absolute; inline-size: 0; block-size: 0; overflow: hidden; visibility: hidden; pointer-events: none;
  > div { display: flex; inline-size: max-content; }
`;
type FocusTarget = { key: string | null; more: boolean };
function focusTarget(element: Element | null): FocusTarget | null {
  if (!element) return null;
  const link = element.closest<HTMLElement>("[data-nav-key]");
  if (link) return { key: link.dataset.navKey ?? null, more: false };
  return element.closest("[data-nav-more] summary") ? { key: null, more: true } : null;
}
function restoreTarget(container: HTMLElement, target: FocusTarget) {
  const link = target.key ? container.querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(target.key)}"]`) : null;
  const next = link ?? container.querySelector<HTMLElement>("[data-nav-more] summary") ?? container.querySelector<HTMLElement>("a[data-nav-key]");
  if (!next) return;
  const disclosure = next.closest("details");
  if (disclosure && next.tagName !== "SUMMARY") disclosure.open = true;
  next.focus({ preventScroll: true });
}

/** The server leaves phone room for More; hydration fills the measured space. */
export function ResponsiveNavigation({ destinations, current: selected, moreLabel, mobile = false, onInviteFriends }: {
  destinations: readonly NavigationDestination[]; current?: NavigationLocation; moreLabel: string; mobile?: boolean;
  onInviteFriends?: (() => void) | undefined;
}) {
  const current = normalizeNavigationLocation(selected);
  const community = useCommunitySettings(), [communityOpen, setCommunityOpen] = useState(false);
  const items = useMemo(() => destinations.filter(({ key }) => key !== "community" || community.visible), [destinations, community.visible]);
  if (communityOpen && !community.visible) setCommunityOpen(false);
  const root = useRef<HTMLDivElement>(null), measurements = useRef<HTMLDivElement>(null), list = useRef<HTMLUListElement>(null);
  const [count, setCount] = useState(Math.min(mobile ? 1 : minimumPrimaryDestinations, destinations.length));
  const pendingFocus = useRef<{ target: FocusTarget; previous: Element | null } | null>(null);
  const lastFocus = useRef<{ target: FocusTarget; element: Element } | null>(null);
  const visible = items.slice(0, count), overflow = items.slice(count);
  const overflowCurrent = overflow.some(({ key }) => key === current);
  useEffect(() => {
    const container = root.current;
    if (!communityOpen || !container) return;
    return () => { requestAnimationFrame(() => {
      if (!container.isConnected || container.ownerDocument.activeElement !== container.ownerDocument.body) return;
      // The original dialog opener may have moved into More or into the hidden navigation copy.
      const navigation = container.getBoundingClientRect().width > 0 ? container
        : container.ownerDocument.querySelector<HTMLElement>(`[data-responsive-navigation="${mobile ? "desktop" : "mobile"}"]`);
      const action = navigation?.querySelector<HTMLElement>("[data-community-entry]");
      const target = action?.getClientRects().length ? action
        : navigation?.querySelector<HTMLElement>("[data-nav-more] summary") ?? navigation?.querySelector<HTMLElement>("a[data-nav-key]");
      target?.focus({ preventScroll: true });
    }); };
  }, [communityOpen, mobile]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current, container = root.current;
    pendingFocus.current = null;
    if (!container) return;
    const active = container.ownerDocument.activeElement;
    if (pending) {
      if (active === pending.previous || active === container.ownerDocument.body) restoreTarget(container, pending.target);
    } else {
      const previous = lastFocus.current;
      // A visibility update can move a focused action across the More boundary before remeasurement.
      if (previous && !previous.element.isConnected && active === container.ownerDocument.body) restoreTarget(container, previous.target);
    }
  }, [items, count]);
  useEffect(() => {
    const container = root.current, pool = measurements.current, navigation = list.current;
    if (!container || !pool || !navigation) return;
    let cancelled = false, frame = 0;
    const measure = () => {
      frame = 0;
      const width = container.getBoundingClientRect().width;
      const active = container.ownerDocument.activeElement;
      if (width <= 0) {
        if (lastFocus.current && (container.contains(active) || active === container.ownerDocument.body)) {
          const other = container.ownerDocument.querySelector<HTMLElement>(`[data-responsive-navigation="${mobile ? "desktop" : "mobile"}"]`);
          if (other && other.getBoundingClientRect().width > 0) restoreTarget(other, lastFocus.current.target);
          lastFocus.current = null;
        }
        return;
      }
      const widths = Array.from(pool.querySelectorAll<HTMLElement>("[data-nav-measure]"), item => item.getBoundingClientRect().width);
      const moreWidth = pool.querySelector<HTMLElement>('[data-more-measure="default"]')?.getBoundingClientRect().width ?? 0;
      const activeMoreWidth = pool.querySelector<HTMLElement>('[data-more-measure="active"]')?.getBoundingClientRect().width ?? moreWidth;
      const gap = Number.parseFloat(getComputedStyle(navigation).columnGap) || 0;
      const next = fitNavigationItems({ widths, moreWidth, activeMoreWidth, currentIndex: items.findIndex(({ key }) => key === current),
        availableWidth: width, gap, equalColumns: mobile });
      setCount((previous) => {
        if (previous === next) return previous;
        const target = container.contains(active) ? focusTarget(active) : null;
        if (target) pendingFocus.current = { target, previous: active };
        return next;
      });
    };
    const schedule = () => { if (!cancelled && !frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    for (const element of pool.querySelectorAll<HTMLElement>("span[data-nav-measure], span[data-more-measure]")) observer.observe(element);
    const fonts = container.ownerDocument.fonts;
    void fonts.ready.then(schedule);
    fonts.addEventListener("loadingdone", schedule);
    schedule();
    return () => { cancelled = true; observer.disconnect(); cancelAnimationFrame(frame); fonts.removeEventListener("loadingdone", schedule); };
  }, [items, current, mobile]);

  const List = mobile ? TabList : TopNavList, Primary = mobile ? TabLink : TopNavLink, Action = mobile ? TabButton : TopNavButton, Measure = mobile ? TabMeasure : TopNavMeasure;
  const openAction = (event: MouseEvent<HTMLButtonElement>, open: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) { menu.open = false; menu.querySelector("summary")?.focus({ preventScroll: true }); }
    open();
  };
  const actions = { community: () => setCommunityOpen(true), "invite-friends": onInviteFriends };
  const actionFor = (key: NavigationDestination["key"]) => key === "community" || key === "invite-friends" ? actions[key] : undefined;
  return <Layout ref={root} data-responsive-navigation={mobile ? "mobile" : "desktop"}
    onFocusCapture={(event) => {
      const target = focusTarget(event.target);
      lastFocus.current = target ? { target, element: event.target } : null;
    }}
    onBlurCapture={(event) => {
      if (event.relatedTarget ? !event.currentTarget.contains(event.relatedTarget) : event.currentTarget.getBoundingClientRect().width > 0) lastFocus.current = null;
    }}>
    <List ref={list}>
      {visible.map(({ key, href, label, tab, icon, tone }) => {
        const Icon = icons[icon], action = actionFor(key);
        if (action) return <li key={key}><Action type="button" $tone={tone} data-nav-key={key}
          data-community-entry={key === "community" ? "" : undefined} aria-haspopup="dialog"
          onClick={event => openAction(event, action)}><Icon /><span>{mobile ? tab : label}</span></Action></li>;
        return href && <li key={key}><Primary href={href} prefetch={false} $tone={tone} data-nav-key={key}
          aria-current={current === key ? "page" : undefined}><Icon /><span>{mobile ? tab : label}</span></Primary></li>;
      })}
      {overflow.length > 0 && <li data-nav-more>
        <MoreMenu $mobile={mobile} current={overflowCurrent} label={<><MoreIcon /><span>{moreLabel}</span></>}>
          <MoreList $mobile={mobile}>
            {overflow.map(({ key, href, label, icon }) => {
            const Icon = icons[icon], action = actionFor(key);
            if (action) return <li key={key}><button type="button" data-nav-key={key} data-community-entry={key === "community" ? "" : undefined}
              aria-haspopup="dialog" onClick={event => openAction(event, action)}><Icon /><span>{label}</span></button></li>;
            return href && <li key={key}><TextLink href={href} prefetch={false} data-nav-key={key}
              aria-current={current === key ? "page" : undefined}><Icon /><span>{label}</span></TextLink></li>;
          })}</MoreList>
        </MoreMenu>
      </li>}
    </List>
    <Measurements ref={measurements} aria-hidden="true" inert><div>
      {items.map(({ key, label, tab, icon, tone }) => {
        const Icon = icons[icon];
        return <Measure key={key} $tone={tone} data-nav-measure aria-current={current === key ? "page" : undefined}>
          <Icon /><span>{mobile ? tab : label}</span>
        </Measure>;
      })}
      <Measure $tone="blue" data-more-measure="default"><MoreIcon /><span>{moreLabel}</span></Measure>
      <Measure $tone="blue" data-more-measure="active" aria-current="page"><MoreIcon /><span>{moreLabel}</span></Measure>
    </div></Measurements>
    {communityOpen && community.visible && createPortal(
      <CommunityDialog open links={community.links} onClose={() => setCommunityOpen(false)} />, document.body)}
  </Layout>;
}
