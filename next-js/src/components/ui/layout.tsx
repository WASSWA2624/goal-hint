"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { controlRow } from "./control-layout";

/** The app shell owns its outer gutter; standalone containers retain their own inset. */
export const contentGutter = css`var(--app-content-gutter, ${({ theme }) => theme.layout.gutter})`;

/** `$wide` suits dense tables such as the desktop match feed. */
export const Container = styled.div<{ $wide?: boolean }>`
  inline-size: 100%;
  max-inline-size: ${({ theme, $wide }) => $wide ? theme.layout.wideMaxWidth : theme.layout.maxWidth};
  margin-inline: auto;
  padding-inline: ${contentGutter};
  min-inline-size: 0;
  ${media.desktop} { max-inline-size: none; }
`;

/** Phones and tablets step each gap down; desktop keeps the full space tokens. */
const compactGap = { sm: "var(--gh-spacing-2)", md: "var(--gh-spacing-3)", lg: "var(--gh-spacing-4)", xl: "var(--gh-spacing-6)" } as const;

/** Adjacent desktop sections meet at their edges; spacing inside each section stays local. */
export const joinedDesktopSections = css`
  ${media.desktop} { row-gap: 0; }
`;

/** Viewport-aligned desktop sections have straight edges; inset controls keep their own corners. */
export const desktopSectionFrame = css`
  ${media.desktop} { border-radius: ${({ theme }) => theme.radius.none}; }
`;

/** Section rails use the shell's single outer gutter instead of adding nested insets. */
export const desktopContentPadding = (bordered = false) => css`
  ${media.desktop} {
    padding-inline: ${bordered
      ? css`max(0px, calc(${contentGutter} - ${({ theme }) => theme.border.width}))` : contentGutter};
  }
`;

/** Insets a card collection without narrowing its section background or changing mobile spacing. */
export const DesktopContent = styled.div`
  min-inline-size: 0;
  ${desktopContentPadding()}
`;

/** Text-only desktop sections retain content padding inside the full-width page frame. */
export const DesktopInset = styled.div`
  min-inline-size: 0;
  ${media.desktop} { padding: ${({ theme }) => theme.space.md}; }
  ${desktopContentPadding()}
`;

export const Stack = styled.div<{ $gap?: "sm" | "md" | "lg" | "xl" }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap = "md" }) => compactGap[$gap]};
  min-inline-size: 0;
  ${media.desktop} { gap: ${({ theme, $gap = "md" }) => theme.space[$gap]}; }
`;

export const Inline = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1_5) var(--gh-spacing-3);
  min-inline-size: 0;
  ${media.desktop} { gap: ${({ theme }) => theme.space.md}; }

  > * { min-inline-size: 0; }
  ${controlRow}
`;

export const Surface = styled.section`
  min-inline-size: 0;
  padding: var(--gh-spacing-3);
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  ${media.tablet} { padding: ${({ theme }) => theme.space.md}; }
  ${media.desktop} { padding: ${({ theme }) => theme.space.lg}; }
  ${desktopSectionFrame}
  ${desktopContentPadding(true)}
`;

/** Section anchors land below the sticky header (3.5rem on phones, about 4rem on desktop). */
const anchorClearance = css`
  :where(section[id]) { scroll-margin-block-start: var(--gh-size-17); }
  ${media.desktop} { :where(section[id]) { scroll-margin-block-start: var(--gh-size-20); } }
`;

/** App screens (feeds) start close to the header; content pages keep generous spacing. */
export const PageMain = styled.main<{ $app?: boolean; $compact?: boolean; $compactTop?: boolean; $dashboard?: boolean; $workspace?: boolean }>`
  padding-block: ${({ theme, $app }) => $app ? `${theme.spacing[2.5]} ${theme.space.lg}` : `${theme.space.md} ${theme.space.lg}`};
  min-inline-size: 0;
  ${({ $compact }) => $compact && css`
    ${media.belowDesktop} {
      padding-block: var(--gh-spacing-2) var(--gh-spacing-3);
      background: ${({ theme }) => theme.color.page};
    }
  `}
  ${media.desktop} {
    padding-block: ${({ theme, $app }) => $app ? `${theme.spacing[3.5]} ${theme.space.xl}` : theme.space.xl};
    ${({ $app, $compactTop }) => ($app || $compactTop) && css`padding-block-start: 0;`}
    ${({ $app }) => $app && css`> ${Container} { padding-inline: 0; }`}
  }
  ${({ $app }) => !$app && anchorClearance}
  ${({ $dashboard }) => $dashboard && css`
    padding-block: 0 calc(var(--app-mobile-tab-height, var(--gh-size-12)) + var(--gh-size-4) + env(safe-area-inset-bottom));
    ${media.desktop} { padding-block: 0 var(--gh-spacing-6); }
  `}
  ${({ $workspace }) => $workspace && css`
    padding-block: 0 calc(var(--app-mobile-tab-height, var(--gh-size-12)) + var(--gh-size-4) + env(safe-area-inset-bottom));
    > ${Container} { max-inline-size: none; padding-inline: 0; }
    ${media.desktop} { padding-block: 0; }
  `}
`;

/** Mobile first: the phone page title, a tablet step, then the desktop size. */
export const PageHeading = styled.h1`
  font-size: ${({ theme }) => theme.typography.scale.title};
  line-height: var(--gh-leading-control);
  ${media.tablet} { font-size: var(--gh-font-page); }
  ${media.desktop} {
    font-size: ${({ theme }) => theme.typography.size.h1};
    line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  }
`;

export const SectionHeading = styled.h2`
  font-size: ${({ theme }) => theme.typography.scale.section};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  ${media.tablet} { font-size: var(--gh-font-title); }
  ${media.desktop} { font-size: ${({ theme }) => theme.typography.size.h2}; }
`;

export const BodyText = styled.p`
  max-inline-size: ${({ theme }) => theme.layout.readingMaxWidth};
`;

/** Secondary notes step down on phones and tablets; desktop keeps the surrounding size. */
export const MutedText = styled(BodyText)`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: var(--gh-leading-reading);
  ${media.desktop} { font-size: inherit; line-height: inherit; }
`;
