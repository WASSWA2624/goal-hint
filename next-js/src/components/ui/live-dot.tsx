"use client";

import styled, { keyframes } from "styled-components";

const glow = keyframes`
  from { transform: scale(0.8); opacity: var(--gh-opacity-25); }
  to { transform: scale(1.8); opacity: var(--gh-opacity-65); }
`;

/** A steady core and a softly reversing halo, shared by live matches and slips. */
export const LiveDot = styled.span`
  position: relative; flex: none; inline-size: var(--gh-size-1_25); block-size: var(--gh-size-1_25);
  border-radius: ${({ theme }) => theme.radius.circle}; background: currentColor;
  &::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: currentColor; box-shadow: 0 0 var(--gh-size-1_25) var(--gh-size-0_5) currentColor;
    transform: scale(1.1); opacity: var(--gh-opacity-45);
    animation: ${glow} var(--gh-duration-pulse) var(--gh-easing-in-out) infinite alternate;
    @media (prefers-reduced-motion: reduce) { animation: none; }
  }
`;
