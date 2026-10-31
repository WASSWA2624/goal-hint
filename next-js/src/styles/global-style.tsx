"use client";

import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    color-scheme: ${({ theme }) => theme.mode};
    font-size: 100%;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    scrollbar-color: ${({ theme }) => theme.scrollbarColor};
  }

  /* Keep owner columns and navigation aligned when moving between short and long screens. */
  html:has([data-admin-shell]) { scrollbar-gutter: stable; }

  body {
    margin: 0;
    min-block-size: 100vh;
    min-block-size: 100dvh;
    background: ${({ theme }) => theme.gradient.page};
    background-repeat: no-repeat;
    background-color: ${({ theme }) => theme.color.page};
    color: ${({ theme }) => theme.color.text};
    font-family: ${({ theme }) => theme.typography.family};
    font-size: ${({ theme }) => theme.typography.scale.body};
    font-weight: ${({ theme }) => theme.typography.weight.body};
    line-height: 1.5;
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

  /* Zero specificity, so any styled list still sets its own spacing. */
  :where(ul, ol) {
    margin-block: 0;
    padding-inline-start: 1.25rem;
  }

  :where(dl, dd) {
    margin: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: ${({ theme }) => theme.typography.headingFamily};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: ${({ theme }) => theme.typography.lineHeight.heading};
  }

  /* Mobile first: the compact phone scale, one step up on tablets, full sizes on desktop. */
  h1 { font-size: ${({ theme }) => theme.typography.scale.title}; }
  h2 { font-size: ${({ theme }) => theme.typography.scale.section}; }
  h3 { font-size: ${({ theme }) => theme.typography.scale.emphasis}; }

  @media (min-width: ${({ theme }) => theme.breakpoint.md}) {
    body { font-size: ${({ theme }) => theme.typography.size.small}; }
    h1 { font-size: 1.375rem; }
    h2 { font-size: 1.125rem; }
    h3 { font-size: 1rem; }
  }

  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) {
    body {
      font-size: ${({ theme }) => theme.typography.size.body};
      line-height: ${({ theme }) => theme.typography.lineHeight.body};
    }
    h1 { font-size: ${({ theme }) => theme.typography.size.h1}; }
    h2 { font-size: ${({ theme }) => theme.typography.size.h2}; }
    h3 { font-size: ${({ theme }) => theme.typography.size.h3}; }
  }

  /* iOS Safari zooms the page when a focused text field is under 16px. */
  @supports (-webkit-touch-callout: none) {
    @media (max-width: 63.99rem) {
      input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"]),
      textarea {
        font-size: 16px !important;
      }
    }
  }

  :where(a) {
    color: ${({ theme }) => theme.color.link};
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.2em;
  }

  @media (hover: hover) {
    :where(a:hover) {
      color: ${({ theme }) => theme.color.brandHover};
    }
  }

  button,
  input,
  select,
  textarea {
    border-radius: ${({ theme }) => theme.radius.control};
    color: inherit;
    font: inherit;
  }

  input[type="checkbox"] { border-radius: ${({ theme }) => theme.radius.small}; }
  input[type="radio"] { border-radius: ${({ theme }) => theme.radius.circle}; }
  :where(fieldset) { border-radius: ${({ theme }) => theme.radius.surface}; }
  :where(dialog) { border-radius: ${({ theme }) => theme.radius.overlay}; }

  button,
  select {
    text-transform: none;
  }

  :where(a, button, input, select, textarea, summary) {
    transition: background-color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing},
      border-color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing},
      color ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing},
      box-shadow ${({ theme }) => theme.motion.feedback} ${({ theme }) => theme.motion.easing};
  }
  button:not(:disabled):active { filter: ${({ theme }) => theme.interaction.pressedFilter}; }

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
    background: ${({ theme }) => theme.color.selection.background};
    color: ${({ theme }) => theme.color.selection.text};
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: ${({ theme }) => theme.motion.reducedDuration} !important;
      animation-iteration-count: 1 !important;
      transition-duration: ${({ theme }) => theme.motion.reducedDuration} !important;
      scroll-behavior: auto !important;
    }
  }
`;
