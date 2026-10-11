"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";

/** In-page contents: a dense wrapped link list below desktop; desktop keeps the Inline row spacing. */
export const ContentsNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  min-inline-size: 0;

  > * { min-inline-size: 0; }

  ${media.belowDesktop} {
    > a {
      min-block-size: 2rem;
      font-size: ${({ theme }) => theme.typography.scale.body};
      line-height: 1.3;
    }
  }

  ${media.desktop} { gap: ${({ theme }) => theme.space.md}; }
`;

/** Readable, compact guidance panels that share the information-page styling. */
export const HelpGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  ${media.desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
`;
export const HelpSection = styled.section`
  display: grid;
  gap: 10px;
  min-inline-size: 0;
  padding: 12px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-block-start: 2px solid ${({ theme }) => theme.color.accent.teal.solid};
  border-radius: 0;
`;
export const HelpList = styled.dl`
  display: grid;
  gap: 10px;
  margin: 0;
  font-size: ${({ theme }) => theme.typography.scale.body};
  line-height: 1.5;
  dt { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  dd { margin: 2px 0 0; color: ${({ theme }) => theme.color.mutedText}; }
`;

