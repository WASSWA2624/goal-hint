"use client";

import styled from "styled-components";
import { inverseLogoSource } from "./brand-inline";

type BrandVariant = "primary" | "inverse" | "monochrome" | "monochrome-inverse";

const LogoSpace = styled.span`
  display: inline-flex;
  flex: none;
  padding: 12px;
  max-inline-size: 100%;
`;

const LogoImage = styled.img`
  display: block;
  inline-size: 176px;
  block-size: auto;
  aspect-ratio: 553 / 128;
`;

const MarkSpace = styled.span`
  display: inline-flex;
  flex: none;
  padding: 8px;
`;

const MarkImage = styled.img`
  display: block;
  inline-size: 32px;
  block-size: 32px;
`;

export interface BrandImageProps {
  /** Use an empty alt when surrounding text or a link already names the brand. */
  alt?: string;
  /** `primary` on white or paper; `inverse` on the navy header bars (theme.header). */
  variant?: BrandVariant;
}

export function BrandLogo({ alt = "Goal Hint", variant = "primary" }: BrandImageProps) {
  return (
    <LogoSpace>
      <LogoImage src={variant === "inverse" ? inverseLogoSource : `/brand/goal-hint-logo-${variant}.svg`}
        alt={alt} width={553} height={128} fetchPriority="high" />
    </LogoSpace>
  );
}

/** Lazy, so React does not hoist a preload for this below-the-fold footer mark. */
export function BrandMark({ alt = "Goal Hint", variant = "primary" }: BrandImageProps) {
  return (
    <MarkSpace>
      <MarkImage src={`/brand/goal-hint-mark-${variant}.svg`} alt={alt} width={160} height={160}
        loading="lazy" decoding="async" />
    </MarkSpace>
  );
}
