"use client";

import styled, { keyframes } from "styled-components";

const travel = keyframes`from { transform: translateX(-100%); } to { transform: translateX(350%); }`;
const Track = styled.div`
  position: absolute;
  inset-inline: 0;
  inset-block-end: calc(-1 * var(--gh-spacing-0_5));
  block-size: var(--gh-size-0_75);
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  background: ${({ theme }) => `color-mix(in srgb, ${theme.header.accent} 35%, ${theme.header.background})`};
  > span {
    display: none;
    inline-size: 30%;
    block-size: 100%;
    background: ${({ theme }) => theme.header.accent};
  }
  body:has([data-navigation-pending], [data-app-loading], main[aria-busy="true"], main [aria-busy="true"]:not([data-navigation-passive])) & {
    opacity: 1;
    > span { display: block; animation: ${travel} var(--gh-duration-shimmer) var(--gh-easing-linear) infinite; }
  }
  @media (prefers-reduced-motion: reduce) {
    body:has([data-navigation-pending], [data-app-loading], main[aria-busy="true"], main [aria-busy="true"]:not([data-navigation-passive])) & > span {
      animation: none;
      transform: translateX(115%);
    }
  }
`;

/** Real router or content loading reveals the track and its accessible busy indicator. */
export function NavigationProgress({ label }: { label: string }) {
  return <Track data-navigation-progress><span role="progressbar" aria-label={label} /></Track>;
}

/** Report foreground work without creating a second visible loading state. */
export function AppLoading({ active = true }: { active?: boolean }) {
  return active ? <span hidden data-app-loading /> : null;
}
