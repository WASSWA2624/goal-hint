"use client";

import styled, { keyframes } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { desktopContentPadding } from "@/components/ui/layout";

const shimmer = keyframes`
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
`;
const Loading = styled.div`
  display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0;
  ${desktopContentPadding()}
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
`;
const Placeholder = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) var(--gh-size-23); align-items: center;
  gap: var(--gh-spacing-3); min-block-size: var(--gh-size-9_5); padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  background: ${({ theme }) => theme.color.surface}; border: 0; border-radius: ${({ theme }) => theme.radius.surface};
  > span {
    display: block; block-size: var(--gh-size-2_5); border-radius: ${({ theme }) => theme.radius.small};
    background: linear-gradient(90deg, ${({ theme }) => theme.color.surfaceMuted} 25%,
      ${({ theme }) => theme.color.border} 50%, ${({ theme }) => theme.color.surfaceMuted} 75%);
    background-size: 200% 100%; animation: ${shimmer} var(--gh-duration-pulse) var(--gh-easing-linear) infinite;
  }
  > span:first-child { inline-size: min(70%, var(--gh-size-72)); }
  > span[data-loading-fact] { display: none; }
  > span:last-child { block-size: var(--gh-size-4); }
  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr) var(--gh-size-20) var(--gh-size-16) var(--gh-size-28) var(--gh-size-23);
    > span[data-loading-fact] { display: block; }
  }
  @media (prefers-reduced-motion: reduce) { > span { animation: none; } }
`;

/** Preserve the shape of the shared slip list while an unseen range or first build is loading. */
export function SlipLoading({ locale, label }: { locale: string; label?: string }) {
  return <Loading role="status" aria-busy="true" data-slip-loading>
    <span>{label ?? createMessages(locale).text("bestSlips.filters.loading")}</span>
    {Array.from({ length: 4 }, (_, index) => <Placeholder key={index} aria-hidden="true" data-slip-skeleton>
      <span /><span data-loading-fact /><span data-loading-fact /><span data-loading-fact /><span />
    </Placeholder>)}
  </Loading>;
}
