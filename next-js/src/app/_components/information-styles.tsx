"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";

/** In-page contents: a dense wrapped link list below desktop; desktop keeps the Inline row spacing. */
export const ContentsNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1) var(--gh-spacing-3);
  min-inline-size: 0;

  > * { min-inline-size: 0; }

  ${media.belowDesktop} {
    > a {
      min-block-size: var(--gh-size-8);
      font-size: ${({ theme }) => theme.typography.scale.body};
      line-height: var(--gh-leading-label);
    }
  }

  ${media.desktop} { gap: ${({ theme }) => theme.space.md}; }
`;

/** Readable, compact guidance panels that share the information-page styling. */
export const HelpGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-2);
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-3); align-items: start; }
`;
export const HelpSection = styled.section`
  display: grid;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-3);
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-block-start: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
`;
export const HelpList = styled.dl`
  display: grid;
  gap: var(--gh-spacing-2_5);
  margin: 0;
  font-size: ${({ theme }) => theme.typography.scale.body};
  line-height: var(--gh-leading-normal);
  dt { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  dd { margin: var(--gh-spacing-0_5) 0 0; color: ${({ theme }) => theme.color.mutedText}; }
`;

