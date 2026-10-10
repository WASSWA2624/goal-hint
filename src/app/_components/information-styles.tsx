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

/** One-line report facts read as one block below desktop; desktop keeps the surrounding lg Stack gap. */
export const LineGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  min-inline-size: 0;

  ${media.desktop} { gap: ${({ theme }) => theme.space.lg}; }
`;

/** Settlement outcome terms: tight term groups on phones, the desktop Stack gap from lg. */
export const OutcomeDefinitions = styled.dl`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  min-inline-size: 0;

  ${media.desktop} { gap: ${({ theme }) => theme.space.md}; }
`;
