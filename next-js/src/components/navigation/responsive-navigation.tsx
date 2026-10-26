"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { DashboardIcon, DocumentIcon, HelpIcon, HomeIcon, LiveIcon, MailIcon, MoreIcon, ResultsIcon, ShieldIcon, SlipIcon } from "@/components/ui/icons";
import type { NavigationLocation } from "@/domain/navigation";
import type { AccentName } from "@/styles/theme";
import { fitNavigationItems, minimumPrimaryDestinations } from "./navigation-fit";
import { MoreList, MoreMenu, TabLink, TabList, TabMeasure, TopNavLink, TopNavList, TopNavMeasure } from "./shell-styles";

const icons = { matches: HomeIcon, live: LiveIcon, results: ResultsIcon, slips: SlipIcon,
  help: HelpIcon, privacy: ShieldIcon, terms: DocumentIcon, contact: MailIcon, dashboard: DashboardIcon };
export type NavigationDestination = Readonly<{
  key: NavigationLocation; href: string; label: string; tab: string; icon: keyof typeof icons; tone: AccentName;
}>;
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
export function ResponsiveNavigation({ destinations, current, moreLabel, mobile = false }: {
  destinations: readonly NavigationDestination[]; current?: NavigationLocation; moreLabel: string; mobile?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), measurements = useRef<HTMLDivElement>(null), list = useRef<HTMLUListElement>(null);
  const [count, setCount] = useState(Math.min(mobile ? 1 : minimumPrimaryDestinations, destinations.length));
  const pendingFocus = useRef<{ target: FocusTarget; previous: Element | null } | null>(null);
  const lastFocus = useRef<FocusTarget | null>(null);
  const visible = destinations.slice(0, count), overflow = destinations.slice(count);
  const overflowCurrent = overflow.some(({ key }) => key === current);
  useLayoutEffect(() => {
    const pending = pendingFocus.current, container = root.current;
    pendingFocus.current = null;
    if (!pending || !container) return;
    const active = container.ownerDocument.activeElement;
    if (active !== pending.previous && active !== container.ownerDocument.body) return;
    restoreTarget(container, pending.target);
  }, [count]);
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
          if (other && other.getBoundingClientRect().width > 0) restoreTarget(other, lastFocus.current);
          lastFocus.current = null;
        }
        return;
      }
      const items = Array.from(pool.querySelectorAll<HTMLElement>("[data-nav-measure]"));
      const widths = items.map((item) => item.getBoundingClientRect().width);
      const moreWidth = pool.querySelector<HTMLElement>('[data-more-measure="default"]')?.getBoundingClientRect().width ?? 0;
      const activeMoreWidth = pool.querySelector<HTMLElement>('[data-more-measure="active"]')?.getBoundingClientRect().width ?? moreWidth;
      const gap = Number.parseFloat(getComputedStyle(navigation).columnGap) || 0;
      const next = fitNavigationItems({ widths, moreWidth, activeMoreWidth, currentIndex: destinations.findIndex(({ key }) => key === current),
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
  }, [destinations, current, mobile]);

  const List = mobile ? TabList : TopNavList, Primary = mobile ? TabLink : TopNavLink, Measure = mobile ? TabMeasure : TopNavMeasure;
  return <Layout ref={root} data-responsive-navigation={mobile ? "mobile" : "desktop"}
    onFocusCapture={(event) => { lastFocus.current = focusTarget(event.target); }}
    onBlurCapture={(event) => {
      if (event.relatedTarget ? !event.currentTarget.contains(event.relatedTarget) : event.currentTarget.getBoundingClientRect().width > 0) lastFocus.current = null;
    }}>
    <List ref={list}>
      {visible.map(({ key, href, label, tab, icon, tone }) => {
        const Icon = icons[icon];
        return <li key={key}><Primary href={href} prefetch={false} $tone={tone} data-nav-key={key}
          aria-current={current === key ? "page" : undefined}><Icon /><span>{mobile ? tab : label}</span></Primary></li>;
      })}
      {overflow.length > 0 && <li data-nav-more>
        <MoreMenu $mobile={mobile} current={overflowCurrent} label={<><MoreIcon /><span>{moreLabel}</span></>}>
          <MoreList $mobile={mobile}>{overflow.map(({ key, href, label, icon }) => {
            const Icon = icons[icon];
            return <li key={key}><TextLink href={href} prefetch={false} data-nav-key={key}
              aria-current={current === key ? "page" : undefined}><Icon /><span>{label}</span></TextLink></li>;
          })}</MoreList>
        </MoreMenu>
      </li>}
    </List>
    <Measurements ref={measurements} aria-hidden="true" inert><div>
      {destinations.map(({ key, label, tab, icon, tone }) => {
        const Icon = icons[icon];
        return <Measure key={key} $tone={tone} data-nav-measure aria-current={current === key ? "page" : undefined}>
          <Icon /><span>{mobile ? tab : label}</span>
        </Measure>;
      })}
      <Measure $tone="blue" data-more-measure="default"><MoreIcon /><span>{moreLabel}</span></Measure>
      <Measure $tone="blue" data-more-measure="active" aria-current="page"><MoreIcon /><span>{moreLabel}</span></Measure>
    </div></Measurements>
  </Layout>;
}
