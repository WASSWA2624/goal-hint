"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";

/** Shared section chrome; callers retain their title, metadata and action layout. */
export const SectionHeader = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--gh-spacing-1) var(--gh-spacing-2);
  min-inline-size: 0;
  padding: var(--gh-spacing-2) ${({ theme }) => theme.layout.sectionPadding};
  color: ${({ theme }) => theme.color.text};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
  ${media.desktop} { font-size: var(--gh-font-body); }

  h2, h3 {
    margin: 0;
    font-size: inherit;
    font-weight: var(--gh-weight-medium);
    line-height: inherit;
  }
`;

export const sectionHeaderMetadata = css`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: var(--gh-weight-body);
  line-height: var(--gh-leading-compact);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
`;
