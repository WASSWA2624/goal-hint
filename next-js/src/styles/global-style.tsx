"use client";

import { createGlobalStyle, css } from "styled-components";
import { controlMetrics } from "@/components/ui/control-layout";
import { media } from "./theme";
import { themeCssVariables } from "./theme-css";

export const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    ${({ theme }) => themeCssVariables(theme)}
    ${controlMetrics}
    color-scheme: ${({ theme }) => theme.mode};
    font-size: 100%;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    scrollbar-color: ${({ theme }) => theme.scrollbarColor};
  }

  /* Keep owner columns and navigation aligned when moving between short and long screens. */
  html:has([data-admin-shell], [data-match-detail]) { scrollbar-gutter: stable; }
  ${media.desktop} {
    html:has([data-admin-shell]) { scrollbar-gutter: stable both-edges; scrollbar-width: thin; }
  }
  /* Match tabs reserve their own space; anchoring a visible footer would move the page instead. */
  html:has([data-match-detail]) { overflow-anchor: none; }

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
    line-height: var(--gh-leading-normal);
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
    padding-inline-start: var(--gh-size-5);
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
    h1 { font-size: var(--gh-font-page); }
    h2 { font-size: var(--gh-font-title); }
    h3 { font-size: var(--gh-font-section); }
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
    @media (max-width: ${({ theme }) => theme.viewport[63.99]}) {
      input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"]),
      textarea {
        font-size: var(--gh-font-section) !important;
      }
    }
  }

  :where(a) {
    color: ${({ theme }) => theme.color.link};
    text-decoration-thickness: var(--gh-relativeSize-0_08);
    text-underline-offset: var(--gh-relativeSize-0_2);
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

  /* Native controls also follow the contract; embedded actions can override this baseline. */
  :where(button, select, summary, input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"])) {
    min-block-size: var(--form-control-height);
  }
  :where(summary) { align-content: center; cursor: pointer; }

  input[type="checkbox"], input[type="radio"] {
    appearance: none;
    display: inline-block;
    flex: none;
    inline-size: var(--gh-size-4_5);
    block-size: var(--gh-size-4_5);
    padding: 0;
    border: 0;
    background-color: ${({ theme }) => theme.color.controlBorder};
    background-position: center;
    background-repeat: no-repeat;
    vertical-align: middle;
    cursor: pointer;
  }
  input[type="checkbox"] { border-radius: ${({ theme }) => theme.radius.small}; }
  input[type="radio"] { border-radius: ${({ theme }) => theme.radius.circle}; }
  input:is([type="checkbox"], [type="radio"]):checked,
  input[type="checkbox"]:indeterminate { background-color: ${({ theme }) => theme.gradient.action}; }
  input[type="checkbox"]:checked {
    background-image: ${({ theme }) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='m4 10 4 4 8-8' fill='none' stroke='${theme.color.onAction}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/></svg>`)}")`};
  }
  input[type="checkbox"]:indeterminate {
    background-image: linear-gradient(${({ theme }) => theme.color.onAction}, ${({ theme }) => theme.color.onAction});
    background-size: 60% var(--gh-size-0_5);
  }
  input[type="radio"]:checked {
    background-image: radial-gradient(circle, ${({ theme }) => theme.color.onAction} 35%, transparent 40%);
  }
  input:is([type="checkbox"], [type="radio"]):disabled { opacity: var(--gh-opacity-50); cursor: not-allowed; }
  @media (forced-colors: active) {
    input[type="checkbox"], input[type="radio"] { appearance: auto; }
  }
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

  ${({ theme }) => theme.mode === "light" && css`
    input:autofill {
      box-shadow: inset 0 0 0 var(--gh-size-250) ${theme.textField.background};
      -webkit-text-fill-color: ${theme.color.text};
    }
  `}

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
