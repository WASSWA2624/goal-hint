"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";

/** `$wide` suits dense tables such as the desktop match feed. */
export const Container = styled.div<{ $wide?: boolean }>`
  inline-size: 100%;
  max-inline-size: ${({ theme, $wide }) => $wide ? theme.layout.wideMaxWidth : theme.layout.maxWidth};
  margin-inline: auto;
  padding-inline: ${({ theme }) => theme.layout.gutter};
  min-inline-size: 0;
  ${media.desktop} { max-inline-size: none; }
`;

/** Phones and tablets step each gap down; desktop keeps the full space tokens. */
const compactGap = { sm: "8px", md: "12px", lg: "16px", xl: "24px" } as const;

/** Adjacent desktop sections meet at their edges; spacing inside each section stays local. */
export const joinedDesktopSections = css`
  ${media.desktop} { row-gap: 0; }
`;

/** Viewport-aligned desktop sections have straight edges; inset controls keep their own corners. */
export const desktopSectionFrame = css`
  ${media.desktop} { border-radius: ${({ theme }) => theme.radius.none}; }
`;

/** One content rail inside full-width desktop sections; account for a panel's own border. */
export const desktopContentPadding = (bordered = false) => css`
  ${media.desktop} {
    padding-inline: ${({ theme }) => bordered
      ? `calc(${theme.layout.gutter} - ${theme.border.width})` : theme.layout.gutter};
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
  gap: 6px 12px;
  min-inline-size: 0;
  ${media.desktop} { gap: ${({ theme }) => theme.space.md}; }

  > * { min-inline-size: 0; }
`;

export const Surface = styled.section`
  min-inline-size: 0;
  padding: 12px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => `${theme.border.width} solid ${theme.color.border}`};
  border-radius: ${({ theme }) => theme.radius.surface};
  ${media.tablet} { padding: ${({ theme }) => theme.space.md}; }
  ${media.desktop} { padding: ${({ theme }) => theme.space.lg}; }
  ${desktopSectionFrame}
  ${desktopContentPadding(true)}
`;

/** Section anchors land below the sticky header (3.5rem on phones, about 4rem on desktop). */
const anchorClearance = css`
  :where(section[id]) { scroll-margin-block-start: 4.25rem; }
  ${media.desktop} { :where(section[id]) { scroll-margin-block-start: 5rem; } }
`;

/** App screens (feeds) start close to the header; content pages keep generous spacing. */
export const PageMain = styled.main<{ $app?: boolean; $compact?: boolean; $compactTop?: boolean; $dashboard?: boolean }>`
  padding-block: ${({ theme, $app }) => $app ? `10px ${theme.space.lg}` : `${theme.space.md} ${theme.space.lg}`};
  min-inline-size: 0;
  ${({ $compact }) => $compact && css`
    ${media.belowDesktop} {
      padding-block: 8px 12px;
      background: ${({ theme }) => theme.color.page};
      > ${Container} { padding-inline: 8px; }
    }
  `}
  ${media.desktop} {
    padding-block: ${({ theme, $app }) => $app ? `14px ${theme.space.xl}` : theme.space.xl};
    ${({ $app, $compactTop }) => ($app || $compactTop) && css`padding-block-start: 0;`}
    ${({ $app }) => $app && css`> ${Container} { padding-inline: 0; }`}
  }
  ${({ $app }) => !$app && anchorClearance}
  ${({ $dashboard }) => $dashboard && css`
    padding-block: 0 calc(var(--app-mobile-tab-height, 3rem) + 1rem + env(safe-area-inset-bottom));
    ${media.desktop} { padding-block: 0 24px; }
  `}
`;

/** Mobile first: the phone page title, a tablet step, then the desktop size. */
export const PageHeading = styled.h1`
  font-size: ${({ theme }) => theme.typography.scale.title};
  line-height: 1.2;
  ${media.tablet} { font-size: 1.375rem; }
  ${media.desktop} {
    font-size: ${({ theme }) => theme.typography.size.h1};
    line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  }
`;

export const SectionHeading = styled.h2`
  font-size: ${({ theme }) => theme.typography.scale.section};
  line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  ${media.tablet} { font-size: 1.125rem; }
  ${media.desktop} { font-size: ${({ theme }) => theme.typography.size.h2}; }
`;

export const BodyText = styled.p`
  max-inline-size: 65ch;
`;

/** Secondary notes step down on phones and tablets; desktop keeps the surrounding size. */
export const MutedText = styled(BodyText)`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: 1.45;
  ${media.desktop} { font-size: inherit; line-height: inherit; }
`;
