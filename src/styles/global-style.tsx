"use client";

import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    color-scheme: light;
    font-size: 100%;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  body {
    margin: 0;
    min-block-size: 100vh;
    min-block-size: 100dvh;
    background: ${({ theme }) => theme.gradient.page};
    background-repeat: no-repeat;
    background-color: ${({ theme }) => theme.color.page};
    color: ${({ theme }) => theme.color.text};
    font-family: ${({ theme }) => theme.typography.family};
    font-size: ${({ theme }) => theme.typography.size.body};
    font-weight: ${({ theme }) => theme.typography.weight.body};
    line-height: ${({ theme }) => theme.typography.lineHeight.body};
    overflow-wrap: anywhere;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p {
    margin: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  }

  h1 { font-size: ${({ theme }) => theme.typography.size.h1}; }
  h2 { font-size: ${({ theme }) => theme.typography.size.h2}; }
  h3 { font-size: ${({ theme }) => theme.typography.size.h3}; }

  /* Phones and tablets use a denser type scale; desktop keeps the base sizes. */
  @media (max-width: 63.99rem) {
    body { font-size: 0.875rem; line-height: 1.5; }
    h1 { font-size: 1.375rem; }
    h2 { font-size: 1.125rem; }
    h3 { font-size: 1rem; }
  }

  :where(a) {
    color: ${({ theme }) => theme.color.brand};
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.2em;
  }

  :where(a:hover) {
    color: ${({ theme }) => theme.color.brandHover};
  }

  button,
  input,
  select,
  textarea {
    border-radius: ${({ theme }) => theme.border.radius};
    color: inherit;
    font: inherit;
  }

  button,
  select {
    text-transform: none;
  }

  input::placeholder,
  textarea::placeholder {
    color: ${({ theme }) => theme.color.mutedText};
    opacity: 1;
  }

  img,
  video {
    display: block;
    max-inline-size: 100%;
    block-size: auto;
  }

  :focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }

  [hidden] {
    display: none !important;
  }

  ::selection {
    background: ${({ theme }) => theme.color.brand};
    color: ${({ theme }) => theme.color.onBrand};
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
