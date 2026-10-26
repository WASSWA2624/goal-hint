"use client";

import styled, { keyframes } from "styled-components";

const travel = keyframes`from { transform: translateX(-100%); } to { transform: translateX(350%); }`;
const Track = styled.div`
  position: absolute;
  inset-inline: 0;
  inset-block-end: -2px;
  block-size: 3px;
  overflow: hidden;
  pointer-events: none;
  background: ${({ theme }) => `color-mix(in srgb, ${theme.header.accent} 35%, ${theme.header.background})`};
  > span {
    display: none;
    inline-size: 30%;
    block-size: 100%;
    background: ${({ theme }) => theme.header.accent};
  }
  body:has([data-navigation-pending], main [aria-busy="true"]) & {
    > span { display: block; animation: ${travel} 1.1s linear infinite; }
  }
  @media (prefers-reduced-motion: reduce) {
    body:has([data-navigation-pending], main [aria-busy="true"]) & > span {
      animation: none;
      transform: translateX(115%);
    }
  }
`;

/** The track stays visible; only real router or content loading reveals an accessible busy indicator. */
export function NavigationProgress({ label }: { label: string }) {
  return <Track data-navigation-progress><span role="progressbar" aria-label={label} /></Track>;
}
