"use client";

import styled, { keyframes } from "styled-components";

const travel = keyframes`from { transform: translateX(-100%); } to { transform: translateX(350%); }`;
const Track = styled.div`
  position: absolute;
  inset-inline: 0;
  inset-block-end: -2px;
  block-size: 2px;
  overflow: hidden;
  pointer-events: none;
  visibility: hidden;
  background: ${({ theme }) => theme.header.background};
  &::after {
    content: "";
    display: block;
    inline-size: 30%;
    block-size: 100%;
    background: ${({ theme }) => theme.header.accent};
  }
  body:has([data-navigation-pending], main [aria-busy="true"]) & {
    visibility: visible;
    &::after { animation: ${travel} 1.1s linear infinite; }
  }
  @media (prefers-reduced-motion: reduce) {
    body:has([data-navigation-pending], main [aria-busy="true"]) &::after {
      animation: none;
      transform: translateX(115%);
    }
  }
`;

/** No polling, animation callbacks or layout changes; idle bars do not animate. */
export function NavigationProgress({ label }: { label: string }) {
  return <Track role="progressbar" aria-label={label} />;
}
