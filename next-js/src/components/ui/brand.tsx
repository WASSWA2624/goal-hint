"use client";

import styled, { useTheme } from "styled-components";
import { media } from "@/styles/theme";
import { inverseLogoSource } from "./brand-inline";
import { inverseHeaderBrandSource } from "./header-brand-inline";

type BrandVariant = "adaptive" | "primary" | "inverse" | "monochrome" | "monochrome-inverse";

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

const HeaderImage = styled.img<{ $height: number | undefined }>`
  --header-brand-height: ${({ $height }) => $height ?? 20}px;
  display: block;
  flex: none;
  inline-size: calc(var(--header-brand-height) * 10490 / 1500);
  block-size: var(--header-brand-height);
  aspect-ratio: 10490 / 1500;
  ${media.desktop} { --header-brand-height: ${({ $height }) => $height ?? 24}px; }
`;

export interface BrandImageProps {
  /** Use an empty alt when surrounding text or a link already names the brand. */
  alt?: string;
  /** Adapt to the active theme by default; explicit variants are for fixed brand artwork. */
  variant?: BrandVariant;
}

/** Original vector artwork with equal visible emblem and name heights, without padded clear space. */
export function HeaderBrand({ alt = "Goal Hint", height, className }: {
  alt?: string;
  /** Explicit heights are used by the design gallery; app headers follow the responsive defaults. */
  height?: number;
  className?: string;
}) {
  const theme = useTheme();
  return <HeaderImage
    src={theme.mode === "dark" ? inverseHeaderBrandSource : "/brand/goal-hint-header-primary.svg"}
    alt={alt}
    width={10490}
    height={1500}
    fetchPriority="high"
    className={className}
    $height={height}
    data-header-brand
  />;
}

export function BrandLogo({ alt = "Goal Hint", variant = "adaptive" }: BrandImageProps) {
  const theme = useTheme();
  const resolvedVariant = variant === "adaptive" ? (theme.mode === "dark" ? "inverse" : "primary") : variant;
  return (
    <LogoSpace>
      <LogoImage src={resolvedVariant === "inverse" ? inverseLogoSource : `/brand/goal-hint-logo-${resolvedVariant}.svg`}
        alt={alt} width={553} height={128} fetchPriority="high" />
    </LogoSpace>
  );
}

/** Lazy, so React does not hoist a preload for this below-the-fold footer mark. */
export function BrandMark({ alt = "Goal Hint", variant = "adaptive" }: BrandImageProps) {
  const theme = useTheme();
  const resolvedVariant = variant === "adaptive" ? (theme.mode === "dark" ? "inverse" : "primary") : variant;
  return (
    <MarkSpace>
      <MarkImage src={`/brand/goal-hint-mark-${resolvedVariant}.svg`} alt={alt} width={160} height={160}
        loading="lazy" decoding="async" />
    </MarkSpace>
  );
}
