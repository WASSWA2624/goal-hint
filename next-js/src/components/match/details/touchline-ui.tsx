"use client";

import styled from "styled-components";
import { focusRing } from "./details-ui";

export const TouchlineSurface = styled.div`
  min-inline-size: 0;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.none};
  background: ${({ theme }) => theme.color.surface};
`;
export const TouchlineHeading = styled.div`
  display: grid; gap: 4px; margin-block-end: 16px;
  > span { color: ${({ theme }) => theme.color.brand}; font-size: 0.6875rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  h2 { margin: 0; font-family: ${({ theme }) => theme.typography.headingFamily}; font-size: 1.25rem; line-height: 1.35; letter-spacing: -.025em; }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: .8125rem; }
`;
export const TouchlineGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start;
  > * { min-inline-size: 0; }
  @media (max-width: 1199px) { grid-template-columns: minmax(0, 1fr); }
`;
export const TouchlineBody = styled.div`
  display: grid; gap: 20px; min-inline-size: 0;
  [data-embedded-section] {
    display: grid; align-content: start; gap: 12px; min-inline-size: 0;
    container: details-card / inline-size;
    > h3 { margin: 0; font-size: .9375rem; line-height: 1.4; }
  }
`;
export const TouchlineEmpty = styled.div`
  display: grid; justify-items: start; gap: 12px; padding: 28px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  border: 1px dashed ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText}; font-size: .875rem;
  > svg { inline-size: 30px; block-size: 30px; color: ${({ theme }) => theme.color.brand}; }
  > p { margin: 0; }
`;
export const TouchlineLinkButton = styled.button`
  display: inline-flex; align-items: center; justify-content: start; gap: 7px;
  min-block-size: 2.25rem; padding: 4px 0; border: 0; background: none;
  color: ${({ theme }) => theme.color.link}; font: inherit; font-weight: 700; cursor: pointer;
  ${focusRing}
`;
export function focusMatchAccess() {
  const panel = document.getElementById("match-prediction");
  panel?.scrollIntoView({ block: "center" });
  panel?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
}
