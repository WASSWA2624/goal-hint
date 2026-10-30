"use client";

import styled, { keyframes } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const shimmer = keyframes`
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
`;
const Loading = styled.div`
  display: grid; gap: 6px; min-inline-size: 0;
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.4; }
`;
const Placeholder = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) 5.75rem; align-items: center;
  gap: 12px; min-block-size: 38px; padding: 10px 12px;
  background: ${({ theme }) => theme.color.surface}; border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.radius.surface};
  > span {
    display: block; block-size: 10px; border-radius: ${({ theme }) => theme.radius.small};
    background: linear-gradient(90deg, ${({ theme }) => theme.color.surfaceMuted} 25%,
      ${({ theme }) => theme.color.border} 50%, ${({ theme }) => theme.color.surfaceMuted} 75%);
    background-size: 200% 100%; animation: ${shimmer} 2s linear infinite;
  }
  > span:first-child { inline-size: min(70%, 18rem); }
  > span[data-loading-fact] { display: none; }
  > span:last-child { block-size: 16px; }
  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr) 5rem 4rem 7rem 5.75rem;
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
