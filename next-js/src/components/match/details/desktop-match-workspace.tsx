"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { WorkspaceNavigationLink } from "@/components/ui/workspace-navigation";
import { media } from "@/styles/theme";

export const desktopMatchContentId = "desktop-match-section";

const Frame = styled.div<{ $mobileFallback: boolean }>`
  display: none;
  ${({ $mobileFallback }) => $mobileFallback && css`
    ${media.belowDesktop} {
      @media (scripting: none) {
        display: block;
        > [data-match-sidebar-frame], > [data-match-content] > :is(h1, footer) { display: none; }
        > [data-match-content] { display: block; overflow: visible; }
      }
    }
  `}
  ${media.desktop} {
    display: grid;
    grid-template-columns: var(--gh-size-56) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    min-inline-size: 0;
    block-size: calc(100dvh - var(--app-header-height, ${({ theme }) => theme.header.desktopHeight}));
    overflow: hidden;
  }
`;

const scrollPane = css`
  min-inline-size: 0;
  min-block-size: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.controlBorder} transparent;
`;

const Sidebar = styled.div`
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-inline-size: 0;
  background: ${({ theme }) => theme.color.section};
  border-inline-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
`;

const SidebarLabel = styled.p`
  padding: var(--gh-spacing-4) var(--gh-spacing-4) var(--gh-spacing-2_5);
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: var(--gh-weight-heavy);
`;

const Navigation = styled.nav`${scrollPane}`;

const Links = styled.ul`
  display: grid;
  gap: var(--gh-spacing-0_5);
  margin: 0;
  padding: 0 var(--gh-spacing-1_5) var(--gh-spacing-3) var(--gh-spacing-2_5);
  list-style: none;
  > li { min-inline-size: 0; }
`;

export const DesktopMatchNavigationLink = styled(WorkspaceNavigationLink)`
  min-inline-size: 0;
  border-inline-start: var(--gh-size-0_75) solid transparent;
  line-height: var(--gh-leading-heading);
  white-space: normal;
  > svg { font-size: var(--gh-font-section); }
  > svg[data-lock] { margin-inline-start: auto; font-size: var(--gh-font-secondary); }
  &[aria-current="page"] {
    color: ${({ theme }) => theme.color.brand};
    border-inline-start-color: currentColor;
  }
`;

const Content = styled.section`
  ${scrollPane}
  position: relative;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.page};
  > footer { margin-block-start: auto; }
  &:focus-visible { outline-offset: calc(-1 * var(--gh-stroke-strong)); }
`;

const ContentInner = styled.div`
  display: grid;
  align-content: start;
  gap: ${({ theme }) => theme.space.lg};
  flex: none;
  min-inline-size: 0;
  inline-size: 100%;
  max-inline-size: var(--gh-size-260);
  margin-inline: auto;
  padding: var(--gh-spacing-3);
  ${media.desktop} {
    padding-block: ${({ theme }) => `${theme.space.lg} ${theme.space.xl}`};
    padding-inline: clamp(${({ theme }) => theme.space.md}, 3vw, var(--gh-spacing-8));
  }
`;

/** Both panes retain their DOM when the match view changes. */
export function DesktopMatchWorkspace({ label, section, sectionLabel, title, navigation, children, footer, mobileFallback }: {
  label: string;
  section: string;
  sectionLabel: string;
  title: string;
  navigation: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  mobileFallback: boolean;
}) {
  const navigationId = useId();
  const sidebar = useRef<HTMLElement>(null), content = useRef<HTMLElement>(null), previous = useRef(section);
  const contentFocus = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = content.current;
    if (previous.current !== section && element) {
      element.scrollTop = 0;
      const document = element.ownerDocument;
      if (contentFocus.current && !contentFocus.current.isConnected && document.activeElement === document.body) {
        element.focus({ preventScroll: true });
      }
    }
    previous.current = section;

    const list = sidebar.current, current = list?.querySelector('[aria-current="page"]');
    if (!list || !current) return;
    const pane = list.getBoundingClientRect(), row = current.getBoundingClientRect();
    if (row.top < pane.top) list.scrollTop += row.top - pane.top;
    else if (row.bottom > pane.bottom) list.scrollTop += row.bottom - pane.bottom;
  }, [section]);

  return <Frame $mobileFallback={mobileFallback} data-match-workspace>
    <Sidebar data-match-sidebar-frame>
      <SidebarLabel id={navigationId}>{label}</SidebarLabel>
      <Navigation ref={sidebar} aria-labelledby={navigationId} data-match-sidebar><Links>{navigation}</Links></Navigation>
    </Sidebar>
    <Content ref={content} id={desktopMatchContentId} aria-label={sectionLabel} tabIndex={0} data-match-content data-active-match-tab={section}
      onFocusCapture={event => { contentFocus.current = event.target; }}
      onBlurCapture={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) contentFocus.current = null; }}>
      <VisuallyHidden as="h1">{title}</VisuallyHidden>
      <ContentInner>{children}</ContentInner>
      {footer}
    </Content>
  </Frame>;
}
