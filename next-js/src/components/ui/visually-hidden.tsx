"use client";

import styled from "styled-components";

export const VisuallyHidden = styled.span`
  position: absolute;
  inline-size: var(--gh-size-0_25);
  block-size: var(--gh-size-0_25);
  padding: 0;
  margin: calc(-1 * var(--gh-spacing-0_25));
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
`;
