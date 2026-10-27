"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "@/styles/global-style";
import { lightTheme, type GoalHintTheme } from "@/styles/theme";
import palettes from "../palettes.json";

/** Theme tokens only: layout, type scale, and shared components remain identical. */
export function PreviewTheme({ children, themeId }: { children: ReactNode; themeId?: string | undefined }) {
  const palette = palettes.find((item) => String(item.id) === themeId) ?? palettes[0]!;
  const c = palette.colors;
  const market = Object.fromEntries(Object.entries(lightTheme.color.market).map(([family, colors]) => [family, {
    ...colors,
    soft: palette.marketStyle === "tinted" ? `color-mix(in srgb, ${colors.soft} 65%, ${c.surface})` : colors.soft,
    gradient: colors.solid,
  }])) as GoalHintTheme["color"]["market"];
  const performanceOutcome = palette.summaryStyle === "tinted"
    ? Object.fromEntries(Object.entries(lightTheme.color.outcome).filter(([tone]) => tone === "correct" || tone === "incorrect" || tone === "pending")
      .map(([tone, colors]) => [tone, { background: colors.background, text: colors.text }])) as GoalHintTheme["color"]["performanceOutcome"]
    : lightTheme.color.performanceOutcome;
  const theme: GoalHintTheme = {
    ...lightTheme,
    color: { ...lightTheme.color,
      page: c.page, surface: c.surface, surfaceMuted: c.surfaceMuted, text: c.text, mutedText: c.mutedText,
      border: c.border, controlBorder: c.controlBorder, buttonBorder: c.controlBorder,
      brand: c.brand, brandHover: c.brandHover, brandSoft: c.brandSoft, link: c.brand, focus: c.brand,
      onBrand: c.onBrand, onAction: c.onBrand, disabledText: c.mutedText, disabledSurface: c.surfaceMuted,
      cardHeader: c.tableHeader, rowHover: c.rowHover, market, performanceOutcome,
      accent: { ...lightTheme.color.accent, teal: { solid: c.brand, text: c.brand, soft: c.brandSoft, gradient: c.brand } },
    },
    header: { ...lightTheme.header,
      background: c.header, gradient: c.header, navigationBackground: c.header,
      text: c.headerText, mutedText: c.headerMuted, placeholder: c.headerMuted,
      accent: c.brand, onAccent: c.onBrand, border: c.headerBorder, controlBorder: c.controlBorder,
      controlFill: c.surfaceMuted, controlHover: c.brandSoft, fieldFill: c.surfaceMuted, fieldFillActive: c.brandSoft,
    },
    gradient: { action: c.brand, actionHover: c.brandHover, tableHeader: c.tableHeader, page: c.page },
    phoneCardFrame: { border: c.border, radius: "0", shadow: "none" },
  };
  return <ThemeProvider theme={theme}><GlobalStyle />
    <div data-review-theme={String(palette.id)} data-review-theme-name={palette.name}>{children}</div>
  </ThemeProvider>;
}
