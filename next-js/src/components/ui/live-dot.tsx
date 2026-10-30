"use client";

import styled, { keyframes } from "styled-components";

const glow = keyframes`
  from { transform: scale(0.8); opacity: 0.25; }
  to { transform: scale(1.8); opacity: 0.65; }
`;

/** A steady core and a softly reversing halo, shared by live matches and slips. */
export const LiveDot = styled.span`
  position: relative; flex: none; inline-size: 5px; block-size: 5px;
  border-radius: ${({ theme }) => theme.radius.circle}; background: currentColor;
  &::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: currentColor; box-shadow: 0 0 5px 2px currentColor;
    transform: scale(1.1); opacity: 0.45;
    animation: ${glow} 2s ease-in-out infinite alternate;
    @media (prefers-reduced-motion: reduce) { animation: none; }
  }
`;
