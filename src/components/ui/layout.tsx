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
`;

/** Phones and tablets step each gap down; desktop keeps the full space tokens. */
const compactGap = { sm: "8px", md: "12px", lg: "16px", xl: "24px" } as const;

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
  border-radius: ${({ theme }) => theme.border.radius};
  ${media.tablet} { padding: ${({ theme }) => theme.space.md}; }
  ${media.desktop} { padding: ${({ theme }) => theme.space.lg}; }
`;

/** Section anchors land below the sticky header (3.5rem on phones, about 4rem on desktop). */
const anchorClearance = css`
  :where(section[id]) { scroll-margin-block-start: 4.25rem; }
  ${media.desktop} { :where(section[id]) { scroll-margin-block-start: 5rem; } }
`;

/** App screens (feeds) start close to the header; content pages keep generous spacing. */
export const PageMain = styled.main<{ $app?: boolean }>`
  padding-block: ${({ theme, $app }) => $app ? `10px ${theme.space.lg}` : `${theme.space.md} ${theme.space.lg}`};
  min-inline-size: 0;
  ${media.desktop} {
    padding-block: ${({ theme, $app }) => $app ? `14px ${theme.space.xl}` : theme.space.xl};
  }
  ${({ $app }) => !$app && anchorClearance}
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
