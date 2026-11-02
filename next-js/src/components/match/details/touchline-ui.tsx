"use client";

import styled from "styled-components";
import { focusRing } from "./details-ui";

export const TouchlineSurface = styled.div`
  min-inline-size: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  background: ${({ theme }) => theme.color.surface};
`;
export const TouchlineHeading = styled.div`
  display: grid; gap: var(--gh-spacing-1); margin-block-end: var(--gh-spacing-4);
  > span { color: ${({ theme }) => theme.color.brand}; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-heavy); letter-spacing: var(--gh-tracking-heading); text-transform: uppercase; }
  h2 { margin: 0; font-family: ${({ theme }) => theme.typography.headingFamily}; font-size: var(--gh-font-heading); line-height: var(--gh-leading-caption); letter-spacing: var(--gh-tracking-tighter); }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-body); }
`;
export const TouchlineGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-5); align-items: start;
  > * { min-inline-size: 0; }
  @media (max-width: ${({ theme }) => theme.viewport[74.9375]}) { grid-template-columns: minmax(0, 1fr); }
`;
export const TouchlineBody = styled.div`
  display: grid; gap: var(--gh-spacing-5); min-inline-size: 0;
  [data-embedded-section] {
    display: grid; align-content: start; gap: var(--gh-spacing-3); min-inline-size: 0;
    container: details-card / inline-size;
    > h3 { margin: 0; font-size: var(--gh-font-reading); line-height: var(--gh-leading-compact); }
  }
`;
export const TouchlineEmpty = styled.div`
  display: grid; justify-items: start; gap: var(--gh-spacing-3); padding: var(--gh-spacing-7);
  background: ${({ theme }) => theme.color.surfaceMuted};
  border: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-emphasis);
  > svg { inline-size: var(--gh-size-7_5); block-size: var(--gh-size-7_5); color: ${({ theme }) => theme.color.brand}; }
  > p { margin: 0; }
`;
export const TouchlineLinkButton = styled.button`
  display: inline-flex; align-items: center; justify-content: start; gap: var(--gh-spacing-1_75);
  min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) 0; border: 0; background: none;
  color: ${({ theme }) => theme.color.link}; font: inherit; font-weight: var(--gh-weight-bold); cursor: pointer;
  ${focusRing}
`;
export function focusMatchAccess() {
  const panel = document.getElementById("match-prediction");
  panel?.scrollIntoView({ block: "center" });
  panel?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
}
